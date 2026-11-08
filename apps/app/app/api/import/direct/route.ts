import { fail, isOwnRequest } from "@/app/api/files/store";
import { getSession } from "@/lib/data";
import { beginDirectImport } from "@/lib/io/import-request";

// POST /api/import/direct with { workspace, size }: the first step of importing
// a `.plotra` file sent straight to object storage (lib/io/import-request.ts
// beginDirectImport, shared with the phone's /api/mobile/import/direct).
export async function POST(request: Request) {
  if (!isOwnRequest(request)) return fail(403, "Forbidden.");
  const session = await getSession();
  if (!session) return fail(401, "Sign in first.");
  return beginDirectImport(request, session.user.id);
}
