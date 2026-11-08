import "server-only";
import { createHmac } from "node:crypto";
import type { AgentMode } from "@plotra/db/schema";
import { asSchema, safeValidateUIMessages, type ToolSet } from "ai";
import { approvalFor, bulkApprovedIn, toolParts, type ToolPart } from "./approval";
import { runChangedAnything } from "./changes";
import type { LocalToolAnswer, LocalToolDefinition, ToolDecision } from "./local-types";
import { describeStepError } from "./model-errors";
import { systemPrompt, type PromptInput } from "./prompt";
import type { ClosedRun } from "./runs";
import { lastMessage, saveMessage } from "./threads";
import { toolsFor, type AgentTool, type ToolContext } from "./tools";
import type { AgentMessageMetadata, AgentUIMessage, ToolResult } from "./types";

// The server's half of a run whose loop is in the browser (plan.md 2.11
// "Local model"). On the hosted version the server can't reach a model on a
// writer's laptop, so their browser calls it and runs the loop
// (lib/agent/local-loop.ts). Everything else stays here: the tools run on the
// server, as the person, through the same `toolsFor` and so the same `can()`
// and row-level security as any other run; the mode is read from the run's
// row; what must be asked about first is decided here; and the conversation
// is stored here.
//
// What the browser is trusted with is what it already has: the person's own
// session. It can't be trusted to keep the model in line, so nothing the
// model writes is ever taken as the writer's word. A call that needs a yes
// runs only once that yes is recorded in the stored conversation, and it is
// recorded only by the request the panel makes when the person presses Allow
// (lib/agent/turn.ts `openTurn`).

/**
 * This run's token for untrusted blocks (lib/agent/untrusted.ts). A run in the
 * browser is several requests (start, each tool call, finish), and the token
 * has to be the same in the system prompt and in every tool result. It is
 * derived from the run's id with a secret only the server has, so it needs no
 * column, and the browser has no say in it.
 */
export function runBoundary(runId: string): string {
  const secret = [process.env.AI_KEY_SECRET, process.env.BETTER_AUTH_SECRET].find((value) => (value ?? "").length >= 16);
  if (!secret) throw new Error("This server isn't set up for AI runs from the browser.");
  return createHmac("sha256", secret).update(`plotra/agent-boundary/v1:${runId}`).digest("hex").slice(0, 12);
}

/**
 * The tools a run in the browser may use: what its mode allows, like any run,
 * less planning a long job. A job's steps are run by the server
 * (app/api/agent/task), which can't reach this person's model.
 */
export function localTools(mode: AgentMode, context: ToolContext): Record<string, AgentTool> {
  const tools = { ...(toolsFor(mode, context) as unknown as Record<string, AgentTool>) };
  delete tools.planTask;
  return tools;
}

/** The system prompt of a run in the browser: the usual one, and a line about what it has no tool for. */
export function localInstructions(input: PromptInput): string {
  const prompt = systemPrompt(input);
  if (input.mode === "ask") return prompt;
  return `${prompt}\n\nLong jobs can't be planned on this model: there is no planTask tool. Do the work in this answer, a few notes at a time, and say what is left so the writer can ask for the rest.`;
}

/** The tools as the browser hands them to the model: name, description and the shape of the input. */
export async function toolDefinitions(tools: Record<string, AgentTool>): Promise<LocalToolDefinition[]> {
  return Promise.all(
    Object.entries(tools).map(async ([name, built]) => ({
      name,
      description: typeof built.description === "string" ? built.description : "",
      inputSchema: (await asSchema(built.inputSchema).jsonSchema) as Record<string, unknown>,
      access: built.access,
    })),
  );
}

/** Key order doesn't make two inputs different. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : inner,
  );
}

const nameOf = (part: ToolPart) => (part.type === "dynamic-tool" ? (part.toolName ?? "") : part.type.slice("tool-".length));

/** Whether the stored answer records the writer's yes to exactly this call: same id, same tool, same input. */
function approvedIn(asking: AgentUIMessage | null, call: { toolCallId: string; toolName: string; input: unknown }): boolean {
  return toolParts(asking ?? undefined).some(
    (part) =>
      part.toolCallId === call.toolCallId &&
      part.state === "approval-responded" &&
      part.approval?.approved === true &&
      nameOf(part) === call.toolName &&
      canonical(part.input) === canonical(call.input),
  );
}

export type ToolCallRequest = {
  /** From the run's row, never from the request. */
  mode: AgentMode;
  runId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
};

/**
 * Whether one tool call of a run in the browser may run now. The same rules
 * as a run on the server (lib/agent/approval.ts), enforced here because the
 * loop that would normally stop and ask is out of the server's hands.
 *
 * `tools` is what the run's mode allows. `asking` loads the newest stored
 * message of the run's conversation: the writer's answers live there, put in
 * by the server when the panel sent them. `touched` is for tests.
 */
export async function decideToolCall(
  call: ToolCallRequest,
  tools: Record<string, Pick<AgentTool, "access">>,
  asking: () => Promise<AgentUIMessage | null>,
  touched?: (runId: string) => Promise<number>,
): Promise<ToolDecision> {
  const built = Object.hasOwn(tools, call.toolName) ? tools[call.toolName] : undefined;
  if (!built) return { kind: "unknown" };
  // Looking never asks: only the tools that write can need a yes.
  if (built.access !== "write") return { kind: "run" };
  const stored = await asking();
  // Only the answer this run is writing counts: a yes given to an earlier run says nothing about this one.
  const mine = stored?.role === "assistant" && stored.metadata?.runId === call.runId ? stored : null;
  const status = await approvalFor({ mode: call.mode, runId: call.runId, bulkApproved: bulkApprovedIn(mine ?? undefined) }, call.toolName, built, touched);
  const type = typeof status === "object" ? status.type : status;
  const reason = (typeof status === "object" && status.reason) || "This waits for the writer.";
  if (type === "denied") return { kind: "denied", reason };
  if (type !== "user-approval") return { kind: "run" };
  return approvedIn(mine, call) ? { kind: "run" } : { kind: "ask", reason };
}

/**
 * Runs one tool for a run in the browser and answers with what the model is
 * to be told. The input comes from the model by way of the browser, so it is
 * checked against the tool's own schema first, as the SDK would have.
 */
export async function runToolCall(built: AgentTool, call: Pick<ToolCallRequest, "toolCallId" | "toolName" | "input">, abortSignal?: AbortSignal): Promise<LocalToolAnswer> {
  const checked = await asSchema(built.inputSchema).validate?.(call.input);
  if (checked && !checked.success) return { ok: false, error: `The input for ${call.toolName} isn't valid: ${checked.error.message.replace(/\s+/g, " ").slice(0, 500)}` };
  const execute = built.execute as ((input: unknown, options: { toolCallId: string; messages: []; abortSignal?: AbortSignal; context: unknown }) => PromiseLike<ToolResult>) | undefined;
  if (!execute) return { ok: false, error: `${call.toolName} can't be run.` };
  try {
    const output = await execute(checked ? checked.value : call.input, { toolCallId: call.toolCallId, messages: [], abortSignal, context: undefined });
    return { ok: true, output: { text: String(output.text ?? ""), notes: Array.isArray(output.notes) ? output.notes : [] } };
  } catch (error) {
    // A tool's own message ("No note with id…") is for the model; anything else isn't written for anyone.
    return { ok: false, error: describeStepError(error) };
  }
}

const MAX_ANSWER = 1_500_000;

/**
 * The answer a browser's loop produced, made fit to store. The browser called
 * the model, so the words and the tool results are its to report: there is no
 * server copy to check them against. What it may not report is the writer's
 * yes. An approval the stored copy of the answer doesn't already hold is put
 * back to "asked", so the only way a yes gets into a conversation is the
 * panel's own request (lib/agent/turn.ts). Who ran it, on what and in which
 * mode is written here, from the run.
 *
 * Null when what was sent isn't an answer that can be stored.
 */
export async function storableAnswer(
  sent: unknown,
  run: { runId: string; mode: AgentMode; model: string; inputTokens: number; outputTokens: number },
  stored: AgentUIMessage | null,
  tools: Record<string, AgentTool>,
): Promise<AgentUIMessage | null> {
  const message = (sent && typeof sent === "object" ? sent : {}) as { id?: unknown; role?: unknown; parts?: unknown };
  if (message.role !== "assistant" || typeof message.id !== "string" || !message.id || message.id.length > 100 || !Array.isArray(message.parts)) return null;
  // Carrying on after a question appends to the answer that asked: the same message, under the id it was stored with.
  const earlier = stored?.role === "assistant" && stored.metadata?.runId === run.runId ? stored : null;
  const agreed = new Set(toolParts(earlier ?? undefined).flatMap((part) => (part.approval?.approved === true ? [part.approval.id] : [])));

  const parts = (message.parts as unknown[]).flatMap((raw): unknown[] => {
    const part = (raw && typeof raw === "object" ? raw : {}) as ToolPart & { text?: unknown };
    if (part.type === "step-start") return [{ type: "step-start" }];
    if (part.type === "text") return typeof part.text === "string" ? [{ type: "text", text: part.text, state: "done" }] : [];
    const isTool = part.type === "dynamic-tool" || (typeof part.type === "string" && part.type.startsWith("tool-") && Object.hasOwn(tools, nameOf(part)));
    if (!isTool) return [];
    if (part.approval?.approved !== true || agreed.has(part.approval.id)) return [part];
    // A yes the server never recorded. Waiting to be asked again, if it hadn't run; otherwise just not marked as agreed.
    const asked: Partial<NonNullable<ToolPart["approval"]>> = { ...part.approval };
    delete asked.approved;
    delete asked.reason;
    return part.state === "approval-responded" ? [{ ...part, state: "approval-requested", approval: asked }] : [{ ...part, approval: undefined }];
  });
  if (!parts.length) return null;

  const metadata: AgentMessageMetadata = { runId: run.runId, model: run.model, mode: run.mode, inputTokens: run.inputTokens, outputTokens: run.outputTokens };
  const answer = { id: earlier?.id ?? message.id, role: "assistant" as const, parts, metadata };
  if (JSON.stringify(answer).length > MAX_ANSWER) return null;
  const checked = await safeValidateUIMessages<AgentUIMessage>({ messages: [answer], tools: tools as unknown as ToolSet as never });
  return checked.success ? checked.data[0] : null;
}

/**
 * A run in the browser can end without its answer ever reaching the server:
 * the tab was closed, the connection went. What it had changed by then is
 * still changed, and "Undo run" hangs under an answer (components/agent/chat.tsx).
 * So a run that changed something and left no answer gets a line in the
 * conversation to hang it under. A run on the server never needs this: it
 * carries on to its end whether or not anyone is watching.
 */
export async function noteInterruptedRun(userId: string, run: ClosedRun): Promise<void> {
  if (run.mode === "ask" || !run.threadId) return;
  // Its answer, as far as it got, is already there (it stopped to ask, and was carried on).
  if ((await lastMessage(userId, run.threadId))?.metadata?.runId === run.id) return;
  if (!(await runChangedAnything(userId, run.id))) return;
  await saveMessage(userId, run.projectId, run.threadId, {
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [{ type: "text", text: "This run was interrupted before it could answer. What it had changed by then is listed here, and can be undone." }],
    metadata: { runId: run.id, mode: run.mode, model: run.model },
  });
}
