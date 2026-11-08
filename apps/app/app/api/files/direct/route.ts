import { getSession } from "@/lib/data";
import { checkRateLimit } from "@/lib/rate-limit";
import { r2Enabled } from "@/lib/r2";
import { accessFailure, beginUpload, checkCanAttach, checkRoomFor, cleanContentType, cleanName, fail, isOwnRequest, maxFileBytes } from "../store";

// POST /api/files/direct with { project, node, name, type, size }: the first
// step of sending a file straight to object storage (see "Direct uploads" in
// ../store.ts). Answers { url, token, contentType }: the browser PUTs the file
// to `url` with that content-type, then posts `token` to /api/files/direct/done.
// 501 when this server has no object storage: the file goes to POST /api/files.
export async function POST(request: Request) {
  if (!isOwnRequest(request)) return fail(403, "Forbidden.");
  if (!r2Enabled()) return fail(501, "Direct uploads need object storage.");
  const session = await getSession();
  if (!session) return fail(401, "Sign in first.");

  let input: { project?: unknown; node?: unknown; name?: unknown; type?: unknown; size?: unknown };
  try {
    input = await request.json();
  } catch {
    return fail(400, "That request couldn't be read.");
  }
  const projectId = typeof input.project === "string" ? input.project : "";
  const nodeId = typeof input.node === "string" ? input.node : "";
  const size = typeof input.size === "number" && Number.isSafeInteger(input.size) ? input.size : -1;
  if (!projectId || !nodeId) return fail(400, "Which note is this file for?");
  if (size === 0) return fail(400, "That file is empty.");
  if (size < 0) return fail(400, "The upload didn't say how large it is.");

  let workspaceId: string;
  try {
    workspaceId = await checkCanAttach(projectId, nodeId);
  } catch (error) {
    return accessFailure(error);
  }

  // The same abuse limit as uploads through the app (route.ts).
  const rate = await checkRateLimit("upload", session.user.id, { limit: 200, windowSeconds: 3600 });
  if (!rate.ok) {
    const response = fail(429, "That's a lot of files in a short time. Try again in a few minutes.");
    response.headers.set("retry-after", String(rate.retryAfterSeconds));
    return response;
  }

  const limit = await maxFileBytes(workspaceId);
  if (size > limit) return fail(413, `Files can be up to ${Math.round(limit / (1024 * 1024))} MB.`);
  const name = cleanName(typeof input.name === "string" ? input.name : null);
  const contentType = cleanContentType(typeof input.type === "string" ? input.type : null, name);
  try {
    // Checked now so a file that won't fit isn't sent at all, and again when it's recorded.
    await checkRoomFor(projectId, nodeId, size, contentType);
    const { url, token } = await beginUpload({ projectId, nodeId, userId: session.user.id, name, contentType, size });
    return Response.json({ url, token, contentType }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return accessFailure(error);
  }
}
