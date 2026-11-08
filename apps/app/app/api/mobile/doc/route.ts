import { ApiError, body, json, withApi } from "@/lib/api/handler";
import { MAX_DOC_UPDATE, mergeApiNoteState } from "@/lib/api/notes";

// POST /api/mobile/doc { projectId, noteId, update }: what the phone app wrote
// in a note while offline, as a base64 Yjs update, merged into the live
// document (lib/api/notes.ts mergeApiNoteState).
export function POST(request: Request) {
  return withApi(request, "write", async () => {
    const { projectId, noteId, update } = await body<{ projectId?: unknown; noteId?: unknown; update?: unknown }>(request);
    if (typeof projectId !== "string" || typeof noteId !== "string" || typeof update !== "string") throw new ApiError(400, "Send projectId, noteId and update.");
    if (update.length > (MAX_DOC_UPDATE * 4) / 3 + 4) throw new ApiError(413, "That's too much to send at once.");
    await mergeApiNoteState(projectId, noteId, new Uint8Array(Buffer.from(update, "base64")));
    return json({ ok: true });
  });
}
