import { fail, isOwnRequest } from "@/app/api/files/store";
import { getSession } from "@/lib/data";
import { importRequest } from "@/lib/io/import-request";

// POST /api/import: Markdown, Word, RTF, plain text, Scrivener, Plottr and World Anvil
// files into a project, or a `.plotra` file as a new project. What it takes and
// answers is described in lib/io/import-request.ts, shared with the phone's
// /api/mobile/import.
//
// Carries the same `x-plotra-request` header as file uploads (app/api/files/store.ts),
// which a page on another site can't send.
export async function POST(request: Request) {
  if (!isOwnRequest(request)) return fail(403, "Forbidden.");
  const session = await getSession();
  if (!session) return fail(401, "Sign in first.");
  return importRequest(request, session.user.id);
}
