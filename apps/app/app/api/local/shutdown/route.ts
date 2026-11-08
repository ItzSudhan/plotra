import { isLocalMode } from "@/lib/local-mode";
import { closeLibrary } from "@/lib/library";
import { mayOpenLocalSession } from "@/lib/local-person";

// POST /api/local/shutdown: the desktop app is quitting (or opening another
// library). Saves what open editors hold, brings the Markdown copy up to date
// and closes the database cleanly; the app stops this server after.
export async function POST(request: Request) {
  if (!isLocalMode) return new Response("Not found", { status: 404 });
  if (!mayOpenLocalSession(request)) return new Response("Forbidden", { status: 403 });
  await closeLibrary();
  return new Response(null, { status: 204 });
}
