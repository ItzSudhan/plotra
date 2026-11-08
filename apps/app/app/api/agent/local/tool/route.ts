import { unstable_rethrow } from "next/navigation";
import { requireBrowserAi } from "@/lib/agent/availability";
import { decideToolCall, localTools, runBoundary, runToolCall } from "@/lib/agent/local-run";
import type { LocalToolAnswer } from "@/lib/agent/local-types";
import { openRun } from "@/lib/agent/runs";
import { lastMessage, UUID } from "@/lib/agent/threads";
import { requireSession } from "@/lib/data";
import { publicMessage } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { readOnly } from "@/lib/request-cache";

// POST /api/agent/local/tool: one tool call of a run whose loop is in the
// browser (plan.md 2.11 "Local model"). The model asked for the tool; the
// browser passes the call on; the tool runs here, as the person, exactly as it
// would in a run on the server.
//
// The request says which run, which tool and with what input. Everything else
// is the server's: whose run it is and whether it is still going, the mode it
// began in (so Ask can't write, whatever is asked for), whether AI is still on
// and the person can still edit, and whether the call has to wait for the
// writer's yes (lib/agent/local-run.ts `decideToolCall`). A call that has to
// wait is refused until that yes is in the stored conversation, where only the
// panel's own request puts it. Nothing the model writes can stand in for it.
//
// With `check`, nothing runs: the answer is only whether it may, which is how
// the loop in the browser knows to stop and ask.

// A tool call is one request to the database or the collab server, not a model call.
export const maxDuration = 60;

const MAX_INPUT = 400_000;

const fail = (message: string, status = 400) => new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
const answer = (body: LocalToolAnswer) => Response.json(body, { headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  // JSON only, so a cross-site form can't post here without a CORS preflight.
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("Not found", 404);
  let body: { runId?: unknown; toolCallId?: unknown; toolName?: unknown; input?: unknown; check?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > MAX_INPUT) return fail("That is too much for one tool call.", 413);
    body = JSON.parse(raw) as typeof body;
  } catch {
    return fail("Bad request");
  }
  const runId = typeof body.runId === "string" && UUID.test(body.runId) ? body.runId : "";
  const toolCallId = typeof body.toolCallId === "string" ? body.toolCallId.slice(0, 200) : "";
  const toolName = typeof body.toolName === "string" ? body.toolName.slice(0, 100) : "";
  if (!runId || !toolCallId || !toolName) return fail("Bad request");

  try {
    const { user, run } = await readOnly(async () => {
      const { user } = await requireSession();
      // The run has to be this person's and still going. Its row says what it may do.
      const run = await openRun(user.id, runId);
      if (!run || run.kind !== "agent") throw new Error("That run has ended. Send a new message instead.");
      // Checked afresh on every call: AI still on here, the person can still edit, their model is still theirs to call.
      await requireBrowserAi(run.projectId);
      // Far more than a run's steps allow (lib/agent/run.ts `STEP_LIMIT`): this only stops a loop that has run away.
      await rateLimit("agent-tool", user.id, { limit: 900, windowSeconds: 600 });
      return { user, run };
    });

    const context = { projectId: run.projectId, userId: user.id, userName: user.name, runId, mode: run.mode, boundary: runBoundary(runId), threadId: run.threadId };
    const tools = localTools(run.mode, context);
    const call = { mode: run.mode, runId, toolCallId, toolName, input: body.input };
    const decision = await decideToolCall(call, tools, async () => (run.threadId ? lastMessage(user.id, run.threadId) : null));
    if (body.check === true) return answer({ decision });

    if (decision.kind === "unknown") return answer({ ok: false, error: `There is no tool called ${toolName} in this mode.` });
    if (decision.kind === "denied") return answer({ ok: false, error: decision.reason });
    if (decision.kind === "ask") return answer({ ok: false, error: `${decision.reason} It hasn't been done: it needs the writer's yes first. Ask them, or call the tool again so they are asked.` });
    // Outside the scope above on purpose: each tool opens its own, and sees the project as it is now.
    return answer(await runToolCall(tools[toolName], call, request.signal));
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
