import { fromBase64, localRoomAccess, toBase64 } from "@/lib/collab/local-access";
import { applyRoomUpdate, relayAwareness, relayMessage, roomDiff } from "@/lib/collab/local-hub";
import { isLocalMode } from "@/lib/local-mode";

// Local mode's stand-in for the collab server (local-mode-plan.md, phase 3;
// lib/collab/local-hub.ts). Not there at all outside local mode.
//
//   GET  ?project&room&sv=<state vector>   what the window's copy lacks; the role and the
//                                          hub's state vector in headers
//   POST ?project&room&client              a Yjs update to merge (editors only)
//   POST ?project&room&client&awareness    an awareness update to relay
//   POST ?project&room&client&message      a notice to relay to the other windows (presence rooms)

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_AWARENESS = 16 * 1024;

const notFound = () => new Response("Not found", { status: 404 });

export async function GET(request: Request) {
  if (!isLocalMode) return notFound();
  const access = await localRoomAccess(request);
  if (!access) return new Response("Forbidden", { status: 403 });
  const sv = new URL(request.url).searchParams.get("sv");
  try {
    const { update, stateVector } = await roomDiff(access.room, sv ? fromBase64(sv) : undefined);
    return new Response(Buffer.from(update), {
      headers: {
        "content-type": "application/octet-stream",
        "cache-control": "no-store",
        "x-plotra-role": access.role,
        "x-plotra-sv": toBase64(stateVector),
      },
    });
  } catch {
    return notFound();
  }
}

export async function POST(request: Request) {
  if (!isLocalMode) return notFound();
  const access = await localRoomAccess(request);
  if (!access) return new Response("Forbidden", { status: 403 });
  const params = new URL(request.url).searchParams;
  const body = new Uint8Array(await request.arrayBuffer());
  try {
    if (params.has("message")) {
      if (!access.room.startsWith("presence-") || body.length > 200) return new Response("Bad request", { status: 400 });
      await relayMessage(access.room, new TextDecoder().decode(body), access.client);
      return new Response(null, { status: 204 });
    }
    if (params.has("awareness")) {
      if (!body.length || body.length > MAX_AWARENESS) return new Response("Bad request", { status: 400 });
      await relayAwareness(access.room, body);
      return new Response(null, { status: 204 });
    }
    if (access.role !== "editor") return new Response("Read-only", { status: 403 });
    if (!body.length || body.length > MAX_BYTES) return new Response("Bad request", { status: 400 });
    await applyRoomUpdate(access.room, body, access.client);
    return new Response(null, { status: 204 });
  } catch {
    return new Response("Bad request", { status: 400 });
  }
}
