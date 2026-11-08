import "./stubs";
import type { AgentMode } from "@plotra/db/schema";
import { readUIMessageStream, toUIMessageStream, type LanguageModel } from "ai";
import { answerApprovals, bulkApprovedIn, pendingApprovals } from "@/lib/agent/approval";
import { loadBrief } from "@/lib/agent/brief";
import { describeModelError, describeStepError } from "@/lib/agent/providers";
import { streamAgent } from "@/lib/agent/run";
import { addUsage, type Usage } from "@/lib/agent/runs";
import type { AgentUIMessage } from "@/lib/agent/types";
import { newBoundary } from "@/lib/agent/untrusted";
import { readOnly } from "@/lib/request-cache";
import type { EvalProject } from "./project";
import { setProject } from "./stubs";

// Runs one request through the agent the way app/api/agent/route.ts does:
// the brief is loaded, `streamAgent` (lib/agent/run.ts) is given the model,
// the mode and the conversation, its stream is read as a UI message, and when
// the run stops to ask the writer something the answers are written into that
// message and the same run carries on. Only the database and the session are
// missing (./stubs.ts).

export type ToolCall = {
  name: string;
  input: unknown;
  /** The AI SDK's state for the call when the run ended: output-available, output-error, output-denied, approval-requested… */
  state: string;
  /** What the tool told the model, when it ran. */
  output: string | null;
  error: string | null;
  /** Whether the run had to ask the writer before this call, and what they said. */
  asked: boolean;
  approved: boolean | null;
};

export type Transcript = {
  mode: AgentMode;
  /** Everything the agent said, in order. */
  answer: string;
  calls: ToolCall[];
  usage: Usage;
  /** Requests to the agent: one, plus one for each time it stopped to ask. */
  rounds: number;
  durationMs: number;
  /** The run didn't finish: the provider failed, or it ran out of time. In plain words. */
  error: string | null;
  /** The token for untrusted blocks this run used. */
  boundary: string;
  /** The stored conversation, as the app would have saved it. */
  messages: AgentUIMessage[];
};

export type RunOptions = {
  model: LanguageModel;
  mode: AgentMode;
  project: EvalProject;
  prompt: string;
  /** Notes the writer pointed at with @, by id. */
  mentions?: string[];
  /** The writer's answer when the run asks first. Left out, every request is refused. */
  approve?: (call: { name: string; input: unknown }) => boolean;
  /** How long the whole run may take. */
  timeoutMs?: number;
  /** How many times the run may stop to ask before the eval stops answering. */
  maxRounds?: number;
};

type ToolPart = {
  type: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id: string; approved?: boolean };
};

const isToolPart = (part: { type: string }) => part.type.startsWith("tool-") || part.type === "dynamic-tool";
const toolName = (part: ToolPart) => (part.type === "dynamic-tool" ? (part.toolName ?? "unknown") : part.type.slice("tool-".length));

function callsOf(message: AgentUIMessage | undefined): ToolCall[] {
  return ((message?.parts ?? []) as ToolPart[]).filter(isToolPart).map((part) => {
    const output = part.output as { text?: unknown } | string | undefined;
    return {
      name: toolName(part),
      input: part.input ?? null,
      state: part.state ?? "unknown",
      output: typeof output === "string" ? output : typeof output?.text === "string" ? output.text : null,
      error: part.errorText ?? null,
      asked: part.approval !== undefined,
      approved: part.approval?.approved ?? null,
    };
  });
}

const answerOf = (message: AgentUIMessage | undefined) =>
  (message?.parts ?? [])
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .trim();

export async function runAgent(options: RunOptions): Promise<Transcript> {
  const { project, mode } = options;
  setProject(project);
  const started = Date.now();
  const boundary = newBoundary();
  const context = { projectId: project.projectId, userId: project.writer.id, userName: project.writer.name, runId: crypto.randomUUID(), mode, boundary };
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 300_000);

  const mentions = (options.mentions ?? []).map((id) => ({ id, title: project.titleOf(id) }));
  let history: AgentUIMessage[] = [
    { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: options.prompt }, ...(mentions.length ? [{ type: "data-mentions" as const, data: { notes: mentions } }] : [])] },
  ];
  let usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let error: string | null = null;
  let rounds = 0;

  try {
    const brief = await readOnly(() => loadBrief(project.projectId));
    for (; rounds < (options.maxRounds ?? 4); ) {
      rounds++;
      const last = history.at(-1);
      const continuing = last?.role === "assistant";
      let settled: { status: "done" | "stopped" | "failed"; usage: Usage; error?: unknown } | null = null;
      const { result, tools } = await streamAgent({
        model: options.model,
        mode,
        context,
        prompt: { projectTitle: project.title, projectType: project.type, userName: project.writer.name, brief },
        history,
        bulkApproved: continuing && bulkApprovedIn(last),
        abortSignal: timeout,
        onSettled: (outcome) => {
          settled = outcome;
        },
      });
      const stream = toUIMessageStream<typeof tools, AgentUIMessage>({
        stream: result.stream,
        tools,
        originalMessages: history,
        generateMessageId: () => crypto.randomUUID(),
        sendReasoning: false,
        onError: describeStepError,
      });
      let message: AgentUIMessage | undefined;
      // A run that carries on after a question adds to the answer that asked it.
      for await (const partial of readUIMessageStream<AgentUIMessage>({ stream, message: continuing ? last : undefined, onError: () => {} })) message = partial;

      const outcome = settled as { status: "done" | "stopped" | "failed"; usage: Usage; error?: unknown } | null;
      if (outcome) usage = addUsage(usage, outcome.usage);
      if (message) history = continuing ? [...history.slice(0, -1), message] : [...history, message];
      if (outcome?.status === "failed") {
        error = describeModelError(outcome.error);
        break;
      }
      if (outcome?.status === "stopped" || timeout.aborted) {
        error = "The run took too long and was stopped.";
        break;
      }

      const asking = history.at(-1);
      const waiting = new Set(pendingApprovals(asking));
      if (!asking || !waiting.size) break;
      const answers = new Map<string, boolean>();
      for (const part of asking.parts as ToolPart[]) {
        if (part.approval && waiting.has(part.approval.id)) answers.set(part.approval.id, options.approve?.({ name: toolName(part), input: part.input ?? null }) ?? false);
      }
      history = [...history.slice(0, -1), answerApprovals(asking, answers, "The writer didn't answer this one.")];
    }
  } catch (cause) {
    error = timeout.aborted ? "The run took too long and was stopped." : describeModelError(cause);
  } finally {
    setProject(project);
  }

  const answered = history.at(-1)?.role === "assistant" ? history.at(-1) : undefined;
  return { mode, answer: answerOf(answered), calls: callsOf(answered), usage, rounds, durationMs: Date.now() - started, error, boundary, messages: history };
}
