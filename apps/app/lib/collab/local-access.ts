import "server-only";
import { isLocalMode } from "../local-mode";
import { readOnly } from "../request-cache";
import { collabRole } from "./token";
import type { CollabRole } from "./rooms";

/**
 * Checks a request to /api/collab/local: local mode only, and a room the
 * signed-in person may open. Null when they may not (or it isn't local mode),
 * which the routes answer with a 404 or 403.
 */
export async function localRoomAccess(request: Request): Promise<{ room: string; role: CollabRole; client: string | null } | null> {
  if (!isLocalMode) return null;
  const params = new URL(request.url).searchParams;
  const projectId = params.get("project") ?? "";
  const room = params.get("room") ?? "";
  try {
    const role = await readOnly(() => collabRole(projectId, room));
    // The window's own id, so its changes aren't sent back to it.
    const client = params.get("client");
    return { room, role, client: client && /^[A-Za-z0-9-]{1,64}$/.test(client) ? client : null };
  } catch {
    return null;
  }
}

export const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
export const fromBase64 = (text: string) => new Uint8Array(Buffer.from(text, "base64"));
