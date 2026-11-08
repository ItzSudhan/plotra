// Collab server room names. One Yjs doc per node, and one awareness-only room
// per project for presence (plan.md 2.6).

export type Room = { kind: "node"; id: string } | { kind: "presence"; id: string };

export const roomName = (room: Room) => `${room.kind}-${room.id}`;

export function parseRoom(name: string): Room | null {
  const match = /^(node|presence)-([A-Za-z0-9-]{1,64})$/.exec(name);
  return match ? { kind: match[1] as Room["kind"], id: match[2] } : null;
}

/** The party (Durable Object binding) every room lives in. */
export const COLLAB_PARTY = "document";

/** Token role: what the collab server lets a connection do. */
export type CollabRole = "editor" | "commenter" | "viewer";

/** JWT audience for collab tokens, so ordinary session tokens never open a room. */
export const COLLAB_AUDIENCE = "plotra-collab";
