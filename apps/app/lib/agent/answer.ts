import "server-only";
import { toUIMessageStream, type UIMessageChunk } from "ai";
import { unstable_rethrow } from "next/navigation";
import { publicMessage } from "../errors";
import { readOnly } from "../request-cache";
import { bulkApprovedIn } from "./approval";
import { requireAi } from "./availability";
import { versionRunResults } from "./changes";
import { describeModelError, describeStepError, modelFor, modelLabel } from "./providers";
import { streamAgent } from "./run";
import type { Run } from "./runs";
import { saveMessage } from "./threads";
import { openTurn, prepareTurn, type Turn } from "./turn";
import type { AgentUIMessage } from "./types";
import { newBoundary } from "./untrusted";
import { clearPresence, showPresence } from "./write";

// One turn of a conversation with the agent, run on the server (plan.md 2.11):
// who may run, the message saved, the run opened, and the answer as a stream
// of UI message chunks that is saved when it ends. The web's panel gets it
// through app/api/agent; the phone app through app/api/mobile/agent/turn.
// Same rules, same model, same tools for both.

/** Why a turn didn't start, in words fit to show, and the HTTP status that goes with it. */
export class TurnRefused extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export type StartedTurn = {
  stream: ReadableStream<UIMessageChunk>;
  /** The answer this turn carries on (after the writer answered its questions), which the stream adds to; undefined for a new answer. */
  continues: AgentUIMessage | undefined;
};

/**
 * Starts the turn. Throws `TurnRefused` when it can't: AI off, no model, a
 * limit, nothing to answer. `signal` stops the run (the person pressed Stop,
 * or went away); what it said by then is kept.
 */
export async function startAgentTurn(turn: Turn, signal: AbortSignal): Promise<StartedTurn> {
  const { projectId, threadId, continuing } = turn;
  try {
    // Who may run, on what model; then the message saved and the run opened (lib/agent/turn.ts).
    const { user, access, settings, mentions, brief } = await readOnly(() => prepareTurn(turn, requireAi));
    const project = access.project;
    const label = modelLabel(settings, "agent");
    const { history, run, mode: runMode } = await openTurn(turn, { userId: user.id, mentions }, { workspaceId: project.organizationId, model: label, hosted: settings.source === "hosted" });

    const context = { projectId, userId: user.id, userName: user.name, runId: run.id, mode: runMode, boundary: newBoundary() };
    // While it can write, the agent is in the project like anyone else who is (plan.md 2.11 "Presence").
    if (runMode !== "ask") void showPresence(context, null);
    const settle = async (status: "done" | "stopped" | "failed", usage?: Parameters<Run["finish"]>[1], error?: string) => {
      await run.finish(status, usage, error);
      if (runMode === "ask") return;
      try {
        // "AI, for Sam" in the history of every note whose text the run changed, and the agent out of the room.
        await clearPresence(context, await versionRunResults(context));
      } catch (cause) {
        console.error("[plotra] couldn't close an agent run's changes", cause);
      }
    };

    let started: Awaited<ReturnType<typeof streamAgent>>;
    try {
      // Outside the scope above on purpose: each tool call opens its own (lib/agent/run.ts).
      started = await streamAgent({
        model: modelFor(settings, "agent"),
        mode: runMode,
        context,
        prompt: { projectTitle: project.title, projectType: project.type, userName: user.name, brief },
        history,
        bulkApproved: continuing && bulkApprovedIn(history.at(-1)),
        abortSignal: signal,
        onSettled: ({ status, usage, error }) => settle(status, usage, error ? describeModelError(error) : undefined),
      });
    } catch (error) {
      await settle("failed", undefined, describeModelError(error));
      throw new TurnRefused(describeModelError(error));
    }

    const stream = toUIMessageStream<typeof started.tools, AgentUIMessage>({
      stream: started.result.stream,
      tools: started.tools,
      originalMessages: history,
      // The answer's id is made here, so the copy in the browser and the saved one are the same message.
      generateMessageId: () => crypto.randomUUID(),
      sendReasoning: false,
      messageMetadata: ({ part }) => {
        if (part.type === "start") return { runId: run.id, model: label, mode: runMode };
        // What the run cost, on the person's own bill (plan.md 2.11 "Trust").
        if (part.type === "finish") return { runId: run.id, model: label, mode: runMode, inputTokens: part.totalUsage.inputTokens ?? 0, outputTokens: part.totalUsage.outputTokens ?? 0 };
      },
      // The provider's error in plain words; never its raw message, which can quote the request.
      onError: describeStepError,
      onEnd: async ({ responseMessage, isAborted, isCancelled }) => {
        // A stopped answer is kept as far as it got; one that failed before saying anything isn't.
        if (responseMessage.role === "assistant" && responseMessage.parts.length) {
          try {
            await saveMessage(user.id, projectId, threadId, responseMessage);
          } catch (error) {
            console.error("[plotra] couldn't save an agent message", error);
          }
        }
        // The run is normally settled by the SDK's own callbacks, with the tokens used; this is for a stream that ended without them.
        if (isAborted || isCancelled) setTimeout(() => void settle("stopped"), 2000);
      },
    });
    const last = history.at(-1);
    return { stream, continues: continuing && last?.role === "assistant" ? last : undefined };
  } catch (error) {
    if (error instanceof TurnRefused) throw error;
    // notFound() and the sign-in redirect become plain answers for the caller.
    try {
      unstable_rethrow(error);
    } catch {
      throw new TurnRefused("Sign in again to use AI here.", 401);
    }
    throw new TurnRefused(publicMessage(error));
  }
}
