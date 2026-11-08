import { unstable_rethrow } from "next/navigation";
import { requireBrowserAi } from "@/lib/agent/availability";
import { localInstructions, localTools, runBoundary, toolDefinitions } from "@/lib/agent/local-run";
import type { LocalStart } from "@/lib/agent/local-types";
import { STEP_LIMIT } from "@/lib/agent/run";
import { openTurn, parseTurn, prepareTurn, type TurnBody } from "@/lib/agent/turn";
import { showPresence } from "@/lib/agent/write";
import { publicMessage } from "@/lib/errors";
import { readOnly } from "@/lib/request-cache";

// POST /api/agent/local/start: opens one turn of a conversation whose model
// the browser calls (plan.md 2.11 "Local model"). On the hosted version the
// server can't reach a model on a writer's laptop, so the loop runs in their
// browser (lib/agent/local-loop.ts) and this route only does what
// app/api/agent does before it calls a model: the same checks, the message
// saved, the run opened. It answers with what the loop needs: the system
// prompt, the tools the run's mode allows, and the conversation as stored.
//
// The model is never called from here. Each tool call then comes back to
// ../tool, and the answer to ../finish.

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
    // Both switches on, the person can edit, and their model is one their browser calls (lib/agent/availability.ts).
    const { user, access, model, mentions, brief } = await readOnly(() => prepareTurn(turn, requireBrowserAi));
    const project = access.project;
    const label = `${model.provider}:${model.agentModel}`.slice(0, 200);
    // The person's own model: never the hosted one, so nothing is counted in credits.
    const { history, run, mode } = await openTurn(turn, { userId: user.id, mentions }, { workspaceId: project.organizationId, model: label, hosted: false }, { browser: true });

    try {
      const context = { projectId: turn.projectId, userId: user.id, userName: user.name, runId: run.id, mode, boundary: runBoundary(run.id), threadId: turn.threadId };
      const started: LocalStart = {
        runId: run.id,
        mode,
        model,
        label,
        instructions: localInstructions({ projectTitle: project.title, projectType: project.type, userName: user.name, brief, mode, boundary: context.boundary }),
        tools: await toolDefinitions(localTools(mode, context)),
        history,
        stepLimit: STEP_LIMIT[mode],
      };
      // While it can write, the agent is in the project like anyone else who is (plan.md 2.11 "Presence").
      if (mode !== "ask") void showPresence(context, null);
      return Response.json(started, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      // The run was opened and nothing will ever finish it: close it here.
      await run.finish("failed", undefined, publicMessage(error, "The run couldn't be started."));
      throw error;
    }
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
