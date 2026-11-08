import { consumeStream, createUIMessageStreamResponse } from "ai";
import { startAgentTurn, TurnRefused } from "@/lib/agent/answer";
import { parseTurn, type TurnBody } from "@/lib/agent/turn";

// POST /api/agent: one turn of a conversation with the agent (plan.md 2.11).
//
// The body is the thread's id, the project, the mode and the user's new
// message: never the conversation itself. History is read from the database,
// so the browser can't put words in the agent's mouth or forge a tool result.
// The answer streams back as AI SDK UI messages (`useChat` on the other end)
// and is saved when it ends. The turn itself is lib/agent/answer.ts, which
// the phone app's route (app/api/mobile/agent/turn) runs too.
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
  try {
    const { stream } = await startAgentTurn(turn, request.signal);
    return createUIMessageStreamResponse({ stream, consumeSseStream: consumeStream, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof TurnRefused) return fail(error.message, error.status);
    throw error;
  }
}
