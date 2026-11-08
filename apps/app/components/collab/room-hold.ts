"use client";

// Rooms whose note this window created optimistically: nothing connects to
// one until the app has the note.
const pendingRooms = new Map<string, Promise<unknown>>();

/** Holds back connecting to `room` until `created` settles, e.g. a node still being inserted. */
export function holdRoom(room: string, created: Promise<unknown>) {
  const settled = created.catch(() => {}).finally(() => pendingRooms.get(room) === settled && pendingRooms.delete(room));
  pendingRooms.set(room, settled);
}

/** Resolves once `room` may be connected to. */
export const roomHeld = (room: string) => pendingRooms.get(room);
