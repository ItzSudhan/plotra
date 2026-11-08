import "server-only";

import { auth } from "@plotra/auth";
import { headers } from "next/headers";
import { requireNodeAccess, requireProjectAccess, type Action } from "../access";
import { colorFor } from "../colors";
import { requireSession } from "../data";
import { lockStateFor } from "../editorial-guard";
import { readOnly } from "../request-cache";
import { COLLAB_AUDIENCE, parseRoom, type CollabRole } from "./rooms";

const TOKEN_LIFETIME = 10 * 60;

/**
 * What the signed-in user may do in a room of `projectId`; throws when they
 * can't open it at all. Presence rooms are read-only: nothing is written there.
 */
export async function collabRole(projectId: string, room: string): Promise<CollabRole> {
  const parsed = parseRoom(room);
  if (!parsed) throw new Error("Unknown room.");
  if (parsed.kind === "presence") {
    if (parsed.id !== projectId) throw new Error("Unknown room.");
    await requireProjectAccess(projectId);
    return "viewer";
  }
  // An editor without a seat, or in a project over the plan's limit, has
  // already lost `edit` here (lib/access), so they get a read-only token.
  const { access } = await requireNodeAccess(projectId, parsed.id);
  const role = roleFor(access.actions);
  // A locked note is read-only for everyone but its approvers (lib/editorial-guard).
  if (role === "editor" && (await lockStateFor(projectId, parsed.id)).readOnly) return "commenter";
  return role;
}

function roleFor(actions: Iterable<Action>): CollabRole {
  const set = new Set(actions);
  return set.has("edit") ? "editor" : set.has("comment") ? "commenter" : "viewer";
}

/**
 * A short-lived token for one collab room (plan.md 3, flow step 2). The collab
 * server checks the signature against /api/auth/jwks, then lets editors write
 * and keeps everyone else read-only. It closes connections when tokens expire,
 * so revoked access stops within TOKEN_LIFETIME.
 *
 * Served by GET /api/collab/token rather than a server action: Next runs a
 * client's server actions one at a time, so a token would wait behind every
 * other action in flight while the editor sat on "Connecting…".
 */
export async function getCollabToken(projectId: string, room: string): Promise<{ token: string; role: CollabRole }> {
  return readOnly(async () => {
    const { user } = await requireSession();
    const role = await collabRole(projectId, room);

    const now = Math.floor(Date.now() / 1000);
    const { token } = await auth.api.signJWT({
      headers: await headers(),
      body: {
        payload: {
          sub: user.id,
          aud: COLLAB_AUDIENCE,
          iat: now,
          exp: now + TOKEN_LIFETIME,
          room,
          role,
          name: user.name,
          color: colorFor(user.id),
        },
      },
    });
    return { token, role };
  });
}
