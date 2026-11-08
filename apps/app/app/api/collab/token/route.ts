import { getCollabToken } from "@/lib/collab/token";

// GET /api/collab/token?project=<id>&room=<room>: a short-lived token for one collab room.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const token = await getCollabToken(params.get("project") ?? "", params.get("room") ?? "");
    return Response.json(token, { headers: { "cache-control": "no-store" } });
  } catch {
    // Signed out, no access, or an unknown room: the client keeps retrying with backoff.
    return new Response("Forbidden", { status: 403 });
  }
}
