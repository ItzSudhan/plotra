import { readUIMessageStream } from "ai";
import { aiMessage } from "@/components/agent/response-error";
import { startAgentTurn, TurnRefused } from "@/lib/agent/answer";
import { toPhoneMessage } from "@/lib/agent/phone";
import { parseTurn, type TurnBody } from "@/lib/agent/turn";
import type { AgentUIMessage } from "@/lib/agent/types";
import { ApiError, body, withApi } from "@/lib/api/handler";

// POST /api/mobile/agent/turn: one turn with the agent from the phone app,
// the same turn as the web panel's (lib/agent/answer.ts): the body is
// app/api/agent's (threadId, projectId, mode, text, mentions, approvals,
// trigger, messageId), and the conversation is kept on the server.
//
// The answer comes back as it's written, one JSON object per line: the whole
// answer so far, as the phone shows it (lib/agent/phone.ts), a few times a
// second; then `{ "done": true }`, or `{ "error": "…" }`. Whole snapshots
// rather than the AI SDK's chunks, so the phone has nothing to assemble.
//
// The stream is read here, inside `withApi`, so every tool call the run makes
// runs as the token's owner. If the phone goes away (or presses Stop), the
// request's signal stops the run; what it said by then is kept, as on the web.

export const maxDuration = 300;

/** At most this often a new snapshot goes to the phone. */
const EVERY_MS = 150;

export function POST(request: Request) {
  return withApi(request, "write", async () => {
    const turn = parseTurn(await body<TurnBody>(request));
    if (!turn) throw new ApiError(400, "Send projectId and threadId.");
    let started: Awaited<ReturnType<typeof startAgentTurn>>;
    try {
      started = await startAgentTurn(turn, request.signal);
    } catch (error) {
      if (error instanceof TurnRefused) throw new ApiError(error.status, aiMessage(error.status, error.message, "The AI couldn't start."));
      throw error;
    }

    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    // Not awaited: a phone that stopped reading mustn't hold up the run, which still has to end and be saved.
    const send = (value: unknown) => void writer.write(encoder.encode(`${JSON.stringify(value)}\n`)).catch(() => {});

    void (async () => {
      let failure: string | null = null;
      let sentAt = 0;
      let latest: AgentUIMessage | null = null;
      let unsent = false;
      try {
        const messages = readUIMessageStream<AgentUIMessage>({
          stream: started.stream,
          message: started.continues,
          onError: (error) => {
            failure = aiMessage(0, error instanceof Error ? error.message : "", "The run stopped with an error.");
          },
        });
        for await (const message of messages) {
          latest = message;
          unsent = true;
          if (Date.now() - sentAt < EVERY_MS) continue;
          sentAt = Date.now();
          unsent = false;
          send({ message: toPhoneMessage(message) });
        }
      } catch (error) {
        failure ??= aiMessage(0, error instanceof Error ? error.message : "", "The run stopped with an error.");
      }
      if (unsent && latest) send({ message: toPhoneMessage(latest) });
      send(failure ? { error: failure } : { done: true });
      void writer.close().catch(() => {});
    })();

    return new Response(readable, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
  });
}
