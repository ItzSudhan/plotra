import { unstable_rethrow } from "next/navigation";
import { requireBrowserAi } from "@/lib/agent/availability";
import { inlineOutputTokens, inlinePrompt, parseInlineRequest } from "@/lib/agent/inline";
import { runBoundary } from "@/lib/agent/local-run";
import type { LocalInlineStart } from "@/lib/agent/local-types";
import { startRun } from "@/lib/agent/runs";
import { prepareInline } from "@/lib/agent/turn";
import { publicMessage } from "@/lib/errors";
import { readOnly } from "@/lib/request-cache";

// POST /api/agent/local/inline: an inline editor action (continue, rewrite,
// shorten, expand, change tone) on a model the browser calls (plan.md 2.11
// "Local model"). The same checks and the same prompt as app/api/agent/inline,
// which is built here because it holds the note's title and the story brief.
// The browser then calls the model itself and reports the end to ../finish.
// Like the other route, this one changes nothing in the project.

const fail = (message: string, status = 400) => new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function POST(request: Request) {
  // JSON only, so a cross-site form can't post here without a CORS preflight.
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("Not found", 404);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail("Bad request");
  }

  try {
    const input = parseInlineRequest(raw);
    // Who may run it, and that they can edit this note now (lib/agent/turn.ts).
    const { user, access, model, title, brief } = await readOnly(() => prepareInline(input, requireBrowserAi));
    const run = await startRun({
      workspaceId: access.project.organizationId,
      projectId: input.projectId,
      threadId: null,
      userId: user.id,
      kind: "inline",
      // The text is offered to the writer, who accepts or discards it.
      mode: "suggest",
      model: `${model.provider}:${model.fastModel}`.slice(0, 200),
      hosted: false,
    });
    const started: LocalInlineStart = {
      runId: run.id,
      model,
      ...inlinePrompt(input, { title, brief: brief?.text ?? null, boundary: runBoundary(run.id) }),
      maxOutputTokens: inlineOutputTokens(input),
    };
    return Response.json(started, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    // notFound() and the sign-in redirect become plain answers for the caller.
    try {
      unstable_rethrow(error);
    } catch {
      return fail("That note doesn't exist, or you can't edit it.", 404);
    }
    return fail(publicMessage(error));
  }
}
