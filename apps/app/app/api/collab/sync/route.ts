import { isCollabServer, syncRoomState } from "@/lib/collab/sync";

const MAX_BYTES = 20 * 1024 * 1024;

// POST /api/collab/sync?room=node-<id>, body = Yjs state update: the collab server's debounced snapshot.
export async function POST(request: Request) {
  if (!isCollabServer(request)) return new Response("Unauthorized", { status: 401 });
  const room = new URL(request.url).searchParams.get("room") ?? "";
  const body = new Uint8Array(await request.arrayBuffer());
  if (!body.length || body.length > MAX_BYTES) return new Response("Bad request", { status: 400 });
  const ok = await syncRoomState(room, body);
  return new Response(null, { status: ok ? 204 : 404 });
}
