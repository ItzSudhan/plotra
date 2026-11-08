import { withApi } from "@/lib/api/handler";
import { exportRequest } from "@/lib/io/export-request";

// GET /api/mobile/export?project=<id>&format=…: the web's export (lib/io/export-request.ts),
// for the phone app's token. The same query and the same file come back as a download;
// a failure is a short plain-text message (or JSON `{ error }` from the token check).
export function GET(request: Request) {
  return withApi(request, "read", () => exportRequest(request));
}
