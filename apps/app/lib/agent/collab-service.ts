import "server-only";
import { applyRoomUpdate, recheckLocalRoom, relayAwareness, roomState } from "../collab/local-hub";
import { COLLAB_PARTY } from "../collab/rooms";
import { isLocalMode } from "../local-mode";

// The app's side of the collab server's service requests (apps/collab
// `onRequest`): read a room's live document, hand it a Yjs update to merge, and
// relay an awareness update. Authenticated with COLLAB_SECRET, the same secret
// the collab server uses for its calls back to the app.
//
// This is how the agent edits (plan.md 2.11 "How it edits"): through the live
// document, so open editors see the change as it lands and a document nobody
// has open is updated just the same.
//
// In local mode there is no collab server: the same four calls go to the app's
// own room hub (lib/collab/local-hub.ts), in this process.

const UNREACHABLE = "The live document server couldn't be reached, so nothing was changed. Try again in a moment.";

/** Where the server reaches the collab server: its public address unless it has an internal one (docker compose). */
function base(): URL {
  const url = new URL(process.env.COLLAB_INTERNAL_URL || process.env.NEXT_PUBLIC_COLLAB_URL || "http://localhost:8787");
  if (url.protocol === "ws:") url.protocol = "http:";
  if (url.protocol === "wss:") url.protocol = "https:";
  return url;
}

async function call(room: string, init: RequestInit & { awareness?: boolean; recheck?: boolean }): Promise<Response> {
  const secret = process.env.COLLAB_SECRET;
  if (!secret) throw new Error("This instance has no COLLAB_SECRET, so documents can't be edited from the server.");
  const query = init.awareness ? "?awareness" : init.recheck ? "?recheck" : "";
  const url = new URL(`/parties/${COLLAB_PARTY}/${encodeURIComponent(room)}${query}`, base());
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { authorization: `Bearer ${secret}`, ...(init.body ? { "content-type": "application/octet-stream" } : {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(UNREACHABLE);
  }
  if (!response.ok) throw new Error(response.status === 404 ? "The live document server doesn't accept edits from the app yet: it needs to be redeployed." : UNREACHABLE);
  return response;
}

/** The room's document as it is right now, including what open editors haven't synced back yet. */
export async function fetchRoomState(room: string): Promise<Uint8Array> {
  if (isLocalMode) return roomState(room);
  return new Uint8Array(await (await call(room, { method: "GET" })).arrayBuffer());
}

/** Merges a Yjs update into the room's document. */
export async function postRoomUpdate(room: string, update: Uint8Array): Promise<void> {
  // Saved at once: no window holds a copy of the agent's edit to send again.
  if (isLocalMode) return applyRoomUpdate(room, update, null, true);
  await call(room, { method: "POST", body: Buffer.from(update) });
}

/** Relays an awareness update to everyone in the room. Presence is decoration: a failure is swallowed. */
export async function postAwareness(room: string, update: Uint8Array): Promise<void> {
  try {
    if (isLocalMode) return await relayAwareness(room, update);
    await call(room, { method: "POST", body: Buffer.from(update), awareness: true });
  } catch {
    // Nobody sees the agent's cursor this time.
  }
}

/**
 * Has the room close its editing connections, so open editors reconnect with a
 * fresh token and the access that goes with it. Best effort: tokens expire
 * within ten minutes anyway.
 */
export async function recheckRoom(room: string): Promise<void> {
  try {
    if (isLocalMode) return await recheckLocalRoom(room);
    await call(room, { method: "POST", recheck: true });
  } catch {
    // A worker that doesn't know the request yet, or one that can't be reached.
  }
}
