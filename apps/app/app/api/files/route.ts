import { getSession } from "@/lib/data";
import { functionBodyCap } from "@/lib/quotas";
import { checkRateLimit } from "@/lib/rate-limit";
import { encode } from "@/lib/read-codec";
import { accessFailure, checkCanAttach, cleanContentType, cleanName, fail, isOwnRequest, maxFileBytes, readLimited, saveAttachment } from "./store";

// POST /api/files?project=<id>&node=<id>&name=<file name>: attaches a file to a
// research note. The body is the file itself (its type in content-type), or a
// multipart form with a `file` field. Answers with the new attachment's row.
// Used where there's no object storage, or the bucket won't take uploads from
// the browser; otherwise files go straight to storage (./direct).
export async function POST(request: Request) {
  if (!isOwnRequest(request)) return fail(403, "Forbidden.");
  const session = await getSession();
  if (!session) return fail(401, "Sign in first.");
  const params = new URL(request.url).searchParams;
  const projectId = params.get("project") ?? "";
  const nodeId = params.get("node") ?? "";
  if (!projectId || !nodeId) return fail(400, "Which note is this file for?");

  // Before reading a byte: nobody without edit access gets to upload megabytes.
  let workspaceId: string;
  try {
    workspaceId = await checkCanAttach(projectId, nodeId);
  } catch (error) {
    return accessFailure(error);
  }

  // Still before reading a byte. An abuse limit (plan.md 8.2): 200 files an
  // hour is a folder of reference images dropped in at once, several times over.
  const rate = await checkRateLimit("upload", session.user.id, { limit: 200, windowSeconds: 3600 });
  if (!rate.ok) {
    const response = fail(429, "That's a lot of files in a short time. Try again in a few minutes.");
    response.headers.set("retry-after", String(rate.retryAfterSeconds));
    return response;
  }

  // Through a function, the body is capped by the platform too; larger files go straight to storage (./direct).
  const limit = Math.min(await maxFileBytes(workspaceId), functionBodyCap());
  const tooLarge = () => fail(413, `Files can be up to ${Math.round(limit / (1024 * 1024))} MB.`);
  let bytes: Uint8Array;
  let name = params.get("name");
  let type = request.headers.get("content-type");
  if (type?.toLowerCase().startsWith("multipart/form-data")) {
    // A form is parsed whole, so its declared size has to be known and within bounds first.
    const declared = Number(request.headers.get("content-length") ?? NaN);
    if (!Number.isFinite(declared)) return fail(411, "The upload didn't say how large it is.");
    if (declared > limit + 64 * 1024) return tooLarge();
    let file: FormDataEntryValue | null;
    try {
      file = (await request.formData()).get("file");
    } catch {
      return fail(400, "That upload couldn't be read.");
    }
    if (!(file instanceof File)) return fail(400, "No file in the upload.");
    if (file.size > limit) return tooLarge();
    bytes = new Uint8Array(await file.arrayBuffer());
    name ||= file.name;
    type = file.type;
  } else {
    const body = await readLimited(request, limit).catch(() => undefined);
    if (body === undefined) return fail(400, "That upload couldn't be read.");
    if (body === null) return tooLarge();
    bytes = body;
  }
  if (!bytes.length) return fail(400, "That file is empty.");

  const cleaned = cleanName(name);
  try {
    const row = await saveAttachment({ projectId, nodeId, name: cleaned, contentType: cleanContentType(type, cleaned), bytes });
    return new Response(encode(row), { status: 201, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (error) {
    return accessFailure(error);
  }
}
