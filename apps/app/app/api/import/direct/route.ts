import { accessFailure, fail, isOwnRequest } from "@/app/api/files/store";
import { getSession, requireWorkspace } from "@/lib/data";
import { publicMessage } from "@/lib/errors";
import { beginPlotraUpload, plotraUploadCap } from "@/lib/io/plotra-upload";
import { limitsFor } from "@/lib/quotas";
import { r2Enabled } from "@/lib/r2";
import { rateLimit } from "@/lib/rate-limit";
import { readOnly } from "@/lib/request-cache";

// POST /api/import/direct with { workspace, size }: the first step of importing
// a `.plotra` file sent straight to object storage (lib/io/plotra-upload.ts).
// Answers { url, token, contentType }: the browser PUTs the file to `url` with
// that content-type, then posts `token` to /api/import?format=plotra.
// 501 when this server has no object storage: the file goes to /api/import itself.
export async function POST(request: Request) {
  if (!isOwnRequest(request)) return fail(403, "Forbidden.");
  if (!r2Enabled()) return fail(501, "Direct uploads need object storage.");
  const session = await getSession();
  if (!session) return fail(401, "Sign in first.");

  let input: { workspace?: unknown; size?: unknown };
  try {
    input = await request.json();
  } catch {
    return fail(400, "That request couldn't be read.");
  }
  const slug = typeof input.workspace === "string" ? input.workspace : "";
  const size = typeof input.size === "number" && Number.isSafeInteger(input.size) ? input.size : -1;
  if (!slug) return fail(400, "Which workspace is this for?");
  if (size === 0) return fail(400, "That file is empty.");
  if (size < 0) return fail(400, "The upload didn't say how large it is.");

  let workspaceId: string;
  try {
    // 404s for anyone who isn't a member of the workspace.
    workspaceId = (await readOnly(() => requireWorkspace(slug))).id;
  } catch (error) {
    return accessFailure(error);
  }
  try {
    await rateLimit("import-project-upload", session.user.id, { limit: 20, windowSeconds: 600 });
  } catch (error) {
    return fail(429, publicMessage(error, "Try again in a few minutes."));
  }

  const { storageBytes } = await limitsFor(workspaceId);
  const limit = plotraUploadCap({ storageBytes, hosted: Boolean(process.env.VERCEL) });
  if (size > limit) return fail(413, `A project file can be up to ${Math.floor(limit / (1024 * 1024))} MB here.`);
  try {
    const upload = await beginPlotraUpload({ userId: session.user.id, workspace: slug, size });
    return Response.json(upload, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return fail(500, publicMessage(error, "The upload couldn't be started."));
  }
}
