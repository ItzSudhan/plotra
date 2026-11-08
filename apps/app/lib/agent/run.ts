import "server-only";
import type { AgentMode } from "@plotra/db/schema";
import { generateText, isStepCount, streamText, type LanguageModel, type StepResult, type ToolSet } from "ai";
import { approvalPolicy } from "./approval";
import { toModelMessages } from "./messages";
import { systemPrompt, type PromptInput } from "./prompt";
import { addUsage, usageOf, type Usage } from "./runs";
import { toolsFor, type ToolContext } from "./tools";
import type { AgentUIMessage } from "./types";

// Shared with the loop that runs in the browser for a local model (lib/agent/local-loop.ts).
export { toModelMessages };

// One agent run (plan.md 2.11): the model, the tools its mode allows, and the
// loop that lets it call them until it can answer. The route (app/api/agent)
// decides who may run it and on what; this file is only the run, so it can be
// tested with a mock model.

/** How many model calls one run may make. A question rarely needs ten; a runaway loop is stopped here. */
export const STEP_LIMIT: Record<AgentMode, number> = { ask: 16, suggest: 30, auto: 40 };

export type AgentRunInput = {
  model: LanguageModel;
  mode: AgentMode;
  /** Who is running it and where: handed to every tool. */
  context: ToolContext;
  prompt: Omit<PromptInput, "mode" | "boundary">;
  /** The conversation so far as stored, ending with the user's new message, or with the answer whose questions they just answered. */
  history: AgentUIMessage[];
  /** The writer already agreed to this answer going past a handful of notes (lib/agent/approval.ts). */
  bulkApproved?: boolean;
  abortSignal?: AbortSignal;
  /** Called once, however the run ends, with the tokens it used. */
  onSettled?: (outcome: { status: "done" | "stopped" | "failed"; usage: Usage; error?: unknown }) => void | Promise<void>;
};

const sumSteps = (steps: ReadonlyArray<Pick<StepResult<ToolSet>, "usage">>): Usage => steps.reduce((total, step) => addUsage(total, usageOf(step.usage)), { inputTokens: 0, outputTokens: 0 });

/**
 * Starts the run and returns the SDK's stream result together with the tools
 * it was given (the UI message stream needs the same set).
 *
 * Call this outside any `readOnly`/`transaction` scope: each tool call opens
 * its own, so it sees the project as it is at that moment and not as it was
 * when the run began.
 */
export async function streamAgent(input: AgentRunInput) {
  // The mode decides the tools, here and nowhere else (tools/index.ts).
  const tools = toolsFor(input.mode, input.context);
  let settled = false;
  const settle = async (outcome: Parameters<NonNullable<AgentRunInput["onSettled"]>>[0]) => {
    if (settled) return;
    settled = true;
    await input.onSettled?.(outcome);
  };

  const result = streamText({
    model: input.model,
    instructions: systemPrompt({ ...input.prompt, mode: input.mode, boundary: input.context.boundary }),
    messages: await toModelMessages(input.history, tools),
    tools,
    // What has to be put to the writer before it runs. Ask has no write tools, so nothing to ask about.
    toolApproval: approvalPolicy({ mode: input.mode, runId: input.context.runId, bulkApproved: input.bulkApproved ?? false }, tools),
    stopWhen: isStepCount(STEP_LIMIT[input.mode]),
    abortSignal: input.abortSignal,
    // One retry for a dropped connection; a second failure is the provider's answer.
    maxRetries: 1,
    onEnd: ({ usage }) => settle({ status: "done", usage: usageOf(usage) }),
    onAbort: ({ steps }) => settle({ status: "stopped", usage: sumSteps(steps) }),
    onError: ({ error }) => settle({ status: "failed", usage: { inputTokens: 0, outputTokens: 0 }, error }),
  });
  return { result, tools };
}

/**
 * One step of a long job (lib/agent/tasks.ts), run to the end without
 * streaming: nobody is watching it word by word, and the request returns the
 * step's outcome. Same tools, same prompt, same access as a chat run.
 */
export async function runTaskStep(input: Pick<AgentRunInput, "model" | "mode" | "context" | "prompt" | "abortSignal"> & { instruction: string }) {
  const tools = toolsFor(input.mode, input.context);
  const result = await generateText({
    model: input.model,
    instructions: systemPrompt({ ...input.prompt, mode: input.mode, boundary: input.context.boundary }),
    prompt: input.instruction,
    tools,
    toolApproval: approvalPolicy({ mode: input.mode, runId: input.context.runId, bulkApproved: true, inTask: true }, tools),
    stopWhen: isStepCount(STEP_LIMIT[input.mode]),
    abortSignal: input.abortSignal,
    maxRetries: 1,
  });
  return { text: result.text, usage: sumSteps(result.steps) };
}
