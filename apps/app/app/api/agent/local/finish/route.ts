import { unstable_rethrow } from "next/navigation";
import { versionRunResults } from "@/lib/agent/changes";
import { localTools, noteInterruptedRun, runBoundary, storableAnswer } from "@/lib/agent/local-run";
import { openRun } from "@/lib/agent/runs";
import { loadBrowserModel } from "@/lib/agent/settings";
import { lastMessage, saveMessage, UUID } from "@/lib/agent/threads";
import { clearPresence } from "@/lib/agent/write";
import { requireSession } from "@/lib/data";
import { publicMessage } from "@/lib/errors";
import { readOnly } from "@/lib/request-cache";

// POST /api/agent/local/finish: the end of a run whose model the browser
// called (plan.md 2.11 "Local model"): a chat turn (../start) or an inline
// action (../inline). What app/api/agent does itself when its stream ends
// happens here: the answer is saved in the conversation, the run's row gets
// its outcome and the tokens it used, each note it wrote gets its "AI, for
// Sam" version, and the agent leaves the project's presence list.
//
// The tokens are what the browser says the model reported. They are the
// person's own to know (plan.md 2.11 "Trust") and count against nothing.

const MAX_BODY = 2_000_000;
const statuses = ["done", "stopped", "failed"] as const;

const fail = (message: string, status = 400) => new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(0, Math.round(value)), 1_000_000_000) : 0);

export async function POST(request: Request) {
  // JSON only, so a cross-site form can't post here without a CORS preflight.
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("Not found", 404);
  let body: { runId?: unknown; status?: unknown; inputTokens?: unknown; outputTokens?: unknown; error?: unknown; message?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return fail("That answer is too long to save.", 413);
    body = JSON.parse(raw) as typeof body;
  } catch {
    return fail("Bad request");
  }
  const runId = typeof body.runId === "string" && UUID.test(body.runId) ? body.runId : "";
  const status = statuses.find((s) => s === body.status);
  if (!runId || !status) return fail("Bad request");
  const usage = { inputTokens: count(body.inputTokens), outputTokens: count(body.outputTokens) };

  try {
    const { user, run, browser } = await readOnly(async () => {
      const { user } = await requireSession();
      // An answer is only taken from the browser of someone whose model the browser calls. A run on the
      // server writes its own (app/api/agent), and nothing sent here can stand in for it.
      return { user, run: await openRun(user.id, runId), browser: (await loadBrowserModel()) !== null };
    });
    // Already closed (a second report of the same end, or a run the next message closed): nothing to do.
    if (!run) return Response.json({ saved: false }, { headers: { "cache-control": "no-store" } });

    const context = { projectId: run.projectId, userId: user.id, userName: user.name, runId, mode: run.mode, boundary: runBoundary(runId), threadId: run.threadId };
    let saved = false;
    if (browser && run.kind === "agent" && run.threadId && body.message) {
      // A stopped answer is kept as far as it got; one that failed before saying anything isn't.
      const message = await storableAnswer(body.message, { runId, mode: run.mode, model: run.model, ...usage }, await lastMessage(user.id, run.threadId), localTools(run.mode, context));
      if (message) {
        try {
          await saveMessage(user.id, run.projectId, run.threadId, message);
          saved = true;
        } catch (error) {
          console.error("[plotra] couldn't save an agent message", error);
        }
      }
    }

    // The error is the browser's plain description of what the model said: the person's own words to themselves.
    await run.finish(status, usage, status === "failed" && typeof body.error === "string" ? body.error : undefined);
    if (run.kind === "agent" && run.mode !== "ask") {
      try {
        // No answer came with it (the page was closing): what the run changed still has to be somewhere it can be undone from.
        if (!saved) await noteInterruptedRun(user.id, { id: runId, projectId: run.projectId, threadId: run.threadId, mode: run.mode, model: run.model });
        // "AI, for Sam" in the history of every note whose text the run changed, and the agent out of the room.
        await clearPresence(context, await versionRunResults(context));
      } catch (cause) {
        console.error("[plotra] couldn't close an agent run's changes", cause);
      }
    }
    return Response.json({ saved }, { headers: { "cache-control": "no-store" } });
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
