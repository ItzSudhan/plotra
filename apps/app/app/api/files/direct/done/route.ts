import { getSession } from "@/lib/data";
import { encode } from "@/lib/read-codec";
import { accessFailure, fail, finishUpload, isOwnRequest, readUploadToken } from "../../store";

// POST /api/files/direct/done with { token }: the second step of a direct
// upload (../route.ts). Checks the file arrived as announced and records it;
// answers with the new attachment's row, as POST /api/files does.
export async function POST(request: Request) {
  if (!isOwnRequest(request)) return fail(403, "Forbidden.");
  const session = await getSession();
  if (!session) return fail(401, "Sign in first.");
  let token: unknown;
  try {
    ({ token } = await request.json());
  } catch {
    return fail(400, "That request couldn't be read.");
  }
  const claims = typeof token === "string" ? readUploadToken(token) : null;
  // Only the person who started the upload can finish it, and only while it's fresh.
  if (!claims || claims.userId !== session.user.id) return fail(400, "That upload has expired. Try again.");
  try {
    const row = await finishUpload(claims);
    return new Response(encode(row), { status: 201, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (error) {
    return accessFailure(error);
  }
}
