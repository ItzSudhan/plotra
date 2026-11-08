import { checkCanAttach, cleanContentType, cleanName, loadAttachment, maxFileBytes, readLimited, saveAttachment } from "@/app/api/files/store";
import { ApiError, json, withApi } from "@/lib/api/handler";
import { requireSession } from "@/lib/data";
import { functionBodyCap } from "@/lib/quotas";
import { checkRateLimit } from "@/lib/rate-limit";

// Pictures from the phone app's editor, with its token: the same storage,
// checks and quotas as uploads on the web (app/api/files/store.ts), which
// work as the token's owner here.

/** Types a picture may be (store.ts takes no others in a text note). */
const pictures = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

// POST /api/mobile/upload?project=<id>&node=<id>&name=<file name>, the
// picture itself as the body (its type in content-type): stores it against
// the note. Answers { id, url }, `url` being what the editor's picture points at.
export function POST(request: Request) {
  return withApi(request, "write", async () => {
    const params = new URL(request.url).searchParams;
    const projectId = params.get("project") ?? "";
    const nodeId = params.get("node") ?? "";
    if (!projectId || !nodeId) throw new ApiError(400, "Which note is this picture for?");

    // Before reading a byte: nobody without edit access gets to upload megabytes.
    const workspaceId = await checkCanAttach(projectId, nodeId);
    const { user } = await requireSession();
    // The same abuse limit as uploads on the web.
    const rate = await checkRateLimit("upload", user.id, { limit: 200, windowSeconds: 3600 });
    if (!rate.ok) throw new ApiError(429, "That's a lot of files in a short time. Try again in a few minutes.");

    const limit = Math.min(await maxFileBytes(workspaceId), functionBodyCap());
    const bytes = await readLimited(request, limit).catch(() => undefined);
    if (bytes === undefined) throw new ApiError(400, "That picture couldn't be read.");
    if (bytes === null) throw new ApiError(413, `Pictures can be up to ${Math.round(limit / (1024 * 1024))} MB.`);
    if (!bytes.length) throw new ApiError(400, "That picture is empty.");

    const name = cleanName(params.get("name"));
    const contentType = cleanContentType(request.headers.get("content-type"), name);
    if (!pictures.has(contentType)) throw new ApiError(415, "Only pictures (PNG, JPEG, GIF, WebP or AVIF) can go in a note.");
    // Checks the storage quota and the project's and note's limits, as on the web.
    const row = await saveAttachment({ projectId, nodeId, name, contentType, bytes });
    return json({ id: row.id, url: `/api/files/${row.id}` }, 201);
  });
}

// GET /api/mobile/upload?file=<id>: a picture in a note, for the phone's
// editor to show (it can't send the web's cookie). Only pictures, for anyone
// who can read the note it's in.
export function GET(request: Request) {
  return withApi(request, "read", async () => {
    const id = new URL(request.url).searchParams.get("file") ?? "";
    if (!id) throw new ApiError(400, "Which picture?");
    const file = await loadAttachment(id);
    if (!file || !pictures.has(file.contentType)) throw new ApiError(404, "Not found.");
    return new Response(Buffer.from(file.bytes), {
      headers: { "content-type": file.contentType, "content-length": String(file.bytes.length), "x-content-type-options": "nosniff", "cache-control": "private, max-age=600" },
    });
  });
}
