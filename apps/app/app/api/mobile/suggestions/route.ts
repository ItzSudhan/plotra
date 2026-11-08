import { ApiError, body, json, withApi } from "@/lib/api/handler";
import { suggestionsResolved } from "@/lib/workflow-actions";

// POST /api/mobile/suggestions { projectId, noteId, authorIds, accepted }: the
// phone's editor accepted or rejected suggestions (a document edit, synced
// like any other); this tells the people who made them, as the web editor
// does (lib/workflow-actions.ts suggestionsResolved, which checks the caller
// may edit the note and that the authors are people of the project).
export function POST(request: Request) {
  return withApi(request, "write", async () => {
    const { projectId, noteId, authorIds, accepted } = await body<{ projectId?: unknown; noteId?: unknown; authorIds?: unknown; accepted?: unknown }>(request);
    if (typeof projectId !== "string" || typeof noteId !== "string" || typeof accepted !== "boolean" || !Array.isArray(authorIds) || !authorIds.every((a) => typeof a === "string")) {
      throw new ApiError(400, "Send projectId, noteId, authorIds and accepted.");
    }
    await suggestionsResolved(projectId, noteId, authorIds.slice(0, 50) as string[], accepted);
    return json({ ok: true });
  });
}
