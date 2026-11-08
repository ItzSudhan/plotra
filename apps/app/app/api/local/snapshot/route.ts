import { isLocalMode } from "@/lib/local-mode";
import { takeSnapshot } from "@/lib/library";
import { mayOpenLocalSession } from "@/lib/local-person";

// POST /api/local/snapshot: File → Take a Snapshot Now in the desktop app. A
// dated copy of the whole database in the library's Snapshots folder.
export async function POST(request: Request) {
  if (!isLocalMode) return new Response("Not found", { status: 404 });
  if (!mayOpenLocalSession(request)) return new Response("Forbidden", { status: 403 });
  try {
    return Response.json({ file: await takeSnapshot() });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Couldn't take a snapshot.", { status: 500 });
  }
}
