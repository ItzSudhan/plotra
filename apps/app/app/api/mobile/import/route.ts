import { withApi } from "@/lib/api/handler";
import { importRequest } from "@/lib/io/import-request";

// POST /api/mobile/import?…: the web's import (lib/io/import-request.ts), for the
// phone app's token: files into a project (multipart, `file` fields), or a `.plotra`
// file as a new project (`format=plotra&workspace=<slug>`). Same limits, rate limits
// and answers as /api/import; a failure is a short plain-text message (or JSON
// `{ error }` from the token check).
export function POST(request: Request) {
  return withApi(request, "write", (caller) => importRequest(request, caller.session.user.id));
}
