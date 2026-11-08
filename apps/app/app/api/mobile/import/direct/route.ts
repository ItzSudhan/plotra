import { withApi } from "@/lib/api/handler";
import { beginDirectImport } from "@/lib/io/import-request";

// POST /api/mobile/import/direct { workspace, size }: starts sending a `.plotra` file
// straight to object storage, as /api/import/direct does (lib/io/import-request.ts).
// Answers { url, token, contentType }, or 501 when the server has no object storage.
export function POST(request: Request) {
  return withApi(request, "write", (caller) => beginDirectImport(request, caller.session.user.id));
}
