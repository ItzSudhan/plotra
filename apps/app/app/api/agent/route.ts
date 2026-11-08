import { consumeStream, createUIMessageStreamResponse, toUIMessageStream } from "ai";
import { unstable_rethrow } from "next/navigation";
import { bulkApprovedIn } from "@/lib/agent/approval";
import { requireAi } from "@/lib/agent/availability";
import { describeModelError, describeStepError, modelFor, modelLabel } from "@/lib/agent/providers";
import { streamAgent } from "@/lib/agent/run";
import { versionRunResults } from "@/lib/agent/changes";
import type { Run } from "@/lib/agent/runs";
import { saveMessage } from "@/lib/agent/threads";
import { openTurn, parseTurn, prepareTurn, type TurnBody } from "@/lib/agent/turn";
import type { AgentUIMessage } from "@/lib/agent/types";
import { newBoundary } from "@/lib/agent/untrusted";
import { clearPresence, showPresence } from "@/lib/agent/write";
import { publicMessage } from "@/lib/errors";
import { readOnly } from "@/lib/request-cache";

// POST /api/agent: one turn of a conversation with the agent (plan.md 2.11).
//
// The body is the thread's id, the project, the mode and the user's new
// message: never the conversation itself. History is read from the database,
// so the browser can't put words in the agent's mouth or forge a tool result.
// The answer streams back as AI SDK UI messages (`useChat` on the other end)
// and is saved when it ends.
//
// A run in Suggest or Auto can stop to ask the writer something
// (lib/agent/approval.ts). Their answers come back here as `approvals`, with no
// new message; they are written into the stored answer, and the same run
// carries on from where it stopped.
//
// A model on the writer's own machine can't be called from here: their browser
// runs the loop instead, and asks app/api/agent/local for each tool call.

// A run can take a while: several model calls with tool calls between them.
export const maxDuration = 300;

const fail = (message: string, status = 400) => new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function POST(request: Request) {
  // JSON only, so a cross-site form can't post here without a CORS preflight.
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("Not found", 404);
  let body: TurnBody;
  try {
    body = (await request.json()) as TurnBody;
  } catch {
    return fail("Bad request");
  }
  const turn = parseTurn(body);
  if (!turn) return fail("Bad request");
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
        abortSignal: request.signal,
        onSettled: ({ status, usage, error }) => settle(status, usage, error ? describeModelError(error) : undefined),
      });
    } catch (error) {
      await settle("failed", undefined, describeModelError(error));
      return fail(describeModelError(error));
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
    return createUIMessageStreamResponse({ stream, consumeSseStream: consumeStream, headers: { "cache-control": "no-store" } });
  } catch (error) {
    // notFound() and the sign-in redirect become plain answers for the caller.
    try {
      unstable_rethrow(error);
    } catch {
      return fail("Sign in again to use AI here.", 401);
    }
    return fail(publicMessage(error));
  }
}
