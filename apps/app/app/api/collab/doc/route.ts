import { isCollabServer, loadRoomState } from "@/lib/collab/sync";

// GET /api/collab/doc?room=node-<id>: seed state for a room the collab server hasn't stored yet.
export async function GET(request: Request) {
  if (!isCollabServer(request)) return new Response("Unauthorized", { status: 401 });
  const room = new URL(request.url).searchParams.get("room") ?? "";
  const state = await loadRoomState(room);
  if (!state) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(state), { headers: { "content-type": "application/octet-stream" } });
}
