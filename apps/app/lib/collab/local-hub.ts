import "server-only";
import { applyAwarenessUpdate, Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { parseRoom } from "./rooms";
import { loadRoomState, syncRoomState } from "./sync";

/**
 * The collab server's job, done inside the app (local-mode-plan.md, phase 3).
 * In local mode there is nobody to share with, so there is no collab server:
 * the editor posts its changes to /api/collab/local, and this keeps each open
 * document in memory, merges the changes in, hands them on to every other
 * window (and the agent) that has the document open, and saves it.
 *
 * Saving is what the collab server's debounced snapshot does: `syncRoomState`
 * stores the Yjs state and rebuilds the text, links and word counts. It waits
 * for a pause in typing (at most MAX_WAIT_MS), and `flushLocalRooms` saves
 * whatever is still waiting when the app is about to quit.
 *
 * This only works in one long-lived server process, which is what local mode
 * is: the desktop app's own Next.js server.
 */

const SAVE_AFTER_MS = 1500;
const MAX_WAIT_MS = 8000;

export type HubEvent =
  | { type: "update"; data: Uint8Array; from: string | null }
  | { type: "awareness"; data: Uint8Array }
  | { type: "message"; data: string; from: string | null }
  | { type: "recheck" };

type Listener = { id: string; send: (event: HubEvent) => void };

type Room = {
  name: string;
  /** The document; null for a presence room, which only relays. */
  doc: Y.Doc | null;
  awareness: Awareness | null;
  listeners: Set<Listener>;
  save: { timer: ReturnType<typeof setTimeout> | null; since: number | null; running: Promise<void> | null };
};

const globalForHub = globalThis as unknown as { plotraHub?: { rooms: Map<string, Promise<Room>> } };
const hub = (globalForHub.plotraHub ??= { rooms: new Map() });

async function openRoom(name: string): Promise<Room> {
  const parsed = parseRoom(name);
  if (!parsed) throw new Error("Unknown room.");
  let doc: Y.Doc | null = null;
  if (parsed.kind === "node") {
    const state = await loadRoomState(name);
    if (!state) throw new Error("Unknown room.");
    doc = new Y.Doc();
    Y.applyUpdate(doc, state);
  }
  const room: Room = {
    name,
    doc,
    awareness: doc ? new Awareness(doc) : null,
    listeners: new Set(),
    save: { timer: null, since: null, running: null },
  };
  // The hub has no cursor of its own.
  room.awareness?.setLocalState(null);
  return room;
}

function room(name: string): Promise<Room> {
  let found = hub.rooms.get(name);
  if (!found) {
    found = openRoom(name);
    found.catch(() => hub.rooms.get(name) === found && hub.rooms.delete(name));
    hub.rooms.set(name, found);
  }
  return found;
}

function emit(target: Room, event: HubEvent, except?: string | null) {
  for (const listener of target.listeners) {
    if (listener.id === except) continue;
    try {
      listener.send(event);
    } catch {
      target.listeners.delete(listener);
    }
  }
}

async function save(target: Room) {
  const { save } = target;
  if (save.timer) clearTimeout(save.timer);
  save.timer = null;
  save.since = null;
  if (!target.doc) return;
  // One save at a time per document; a change made during one is saved by the next.
  await save.running;
  const state = Y.encodeStateAsUpdate(target.doc);
  save.running = syncRoomState(target.name, state)
    .then(() => undefined)
    .catch((error) => console.error(`[plotra] saving ${target.name} failed`, error))
    .finally(() => {
      target.save.running = null;
      forgetIfIdle(target);
    });
  await save.running;
}

function scheduleSave(target: Room) {
  const { save: pending } = target;
  const now = Date.now();
  pending.since ??= now;
  if (pending.timer) clearTimeout(pending.timer);
  const wait = Math.max(0, Math.min(SAVE_AFTER_MS, pending.since + MAX_WAIT_MS - now));
  pending.timer = setTimeout(() => void save(target), wait);
}

/** A document nobody has open and with nothing left to save leaves memory. */
function forgetIfIdle(target: Room) {
  if (target.listeners.size || target.save.timer || target.save.running) return;
  void hub.rooms.get(target.name)?.then((current: Room) => {
    if (current === target && !target.listeners.size && !target.save.timer && !target.save.running) {
      hub.rooms.delete(target.name);
      target.awareness?.destroy();
      target.doc?.destroy();
    }
  });
}

/** The document as it is now, open changes included. */
export async function roomState(name: string): Promise<Uint8Array> {
  const target = await room(name);
  if (!target.doc) throw new Error("Unknown room.");
  const state = Y.encodeStateAsUpdate(target.doc);
  forgetIfIdle(target);
  return state;
}

/** What a copy with `stateVector` lacks, and the hub's own state vector (for what the copy has that the hub lacks). */
export async function roomDiff(name: string, stateVector?: Uint8Array): Promise<{ update: Uint8Array; stateVector: Uint8Array }> {
  const target = await room(name);
  if (!target.doc) return { update: new Uint8Array(), stateVector: new Uint8Array() };
  return { update: Y.encodeStateAsUpdate(target.doc, stateVector), stateVector: Y.encodeStateVector(target.doc) };
}

/**
 * Merges a change into the document and hands it to everyone else with it
 * open. `from` is the window that made it (it has it already); `now` saves at
 * once instead of after a pause, for changes made by the app itself (the agent,
 * the API), which no window holds a copy of.
 */
export async function applyRoomUpdate(name: string, update: Uint8Array, from: string | null, now = false): Promise<void> {
  const target = await room(name);
  if (!target.doc) throw new Error("Unknown room.");
  Y.applyUpdate(target.doc, update, from ?? "app");
  emit(target, { type: "update", data: update, from }, from);
  if (now) await save(target);
  else scheduleSave(target);
}

/** Relays an awareness update (the agent's cursor) to every open window. */
export async function relayAwareness(name: string, update: Uint8Array): Promise<void> {
  const target = await room(name);
  if (target.awareness) applyAwarenessUpdate(target.awareness, update, "app");
  emit(target, { type: "awareness", data: update });
  forgetIfIdle(target);
}

/** Relays a notice ("binder changed") to every other window in a presence room. */
export async function relayMessage(name: string, message: string, from: string | null): Promise<void> {
  const target = await room(name);
  emit(target, { type: "message", data: message, from }, from);
  forgetIfIdle(target);
}

/** Tells open editors to ask again what they may do (the note was locked or unlocked). */
export async function recheckLocalRoom(name: string): Promise<void> {
  const found = hub.rooms.get(name);
  if (found) emit(await found, { type: "recheck" });
}

/** Listens to a room until the returned function is called. */
export async function listenToRoom(name: string, listener: Listener): Promise<() => void> {
  const target = await room(name);
  target.listeners.add(listener);
  return () => {
    target.listeners.delete(listener);
    forgetIfIdle(target);
  };
}

/** Saves every document with changes still waiting: the app is about to quit. */
export async function flushLocalRooms(): Promise<void> {
  const rooms = await Promise.allSettled([...hub.rooms.values()]);
  await Promise.all(
    rooms.map(async (result) => {
      if (result.status !== "fulfilled") return;
      const target = result.value;
      if (target.save.timer) await save(target);
      else await target.save.running;
    }),
  );
}
