import "server-only";
import { schema } from "@plotra/db";
import { eq } from "drizzle-orm";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";
import { requireNodeAccess } from "../access";
import { roomName } from "../collab/rooms";
import { syncRoomState } from "../collab/sync";
import { ydocToValue } from "../collab/ydoc";
import { colorFor } from "../colors";
import { userDb } from "../db";
import type { DocNode } from "../doc-index";
import { assertUnlocked } from "../editorial-guard";
import { nodeFormat } from "../modules";
import { isDocumentKind } from "../story";
import { checkpoint } from "./changes";
import { fetchRoomState, postAwareness, postRoomUpdate } from "./collab-service";
import { cursorAt, ensureBlockIds, restoreValue, type EditOptions, type EditResult } from "./edits";

// Changing a document for the agent (plan.md 2.11 "How it edits"): check the
// person may edit it, take the live document from the collab server, keep a
// checkpoint, apply the change, and hand the difference back to merge. What
// the change is lives in lib/agent/edits.ts; this file is who, where and when.

const { node } = schema;

/** What an edit needs to know about the run it belongs to (a tool's context has all of it). */
export type WriteContext = {
  projectId: string;
  userId: string;
  userName: string;
  runId: string;
};

/** The author recorded on the agent's suggestions, so they read "AI, for Sam" and not as Sam's own. */
export const AGENT_PREFIX = "agent:";
export const agentAuthor = (userId: string) => `${AGENT_PREFIX}${userId}`;

type Target = { kind: "document" | "board"; format: string };

/** Throws unless the person running the agent may change this note's content right now. */
async function requireWritable(projectId: string, nodeId: string): Promise<Target> {
  await requireNodeAccess(projectId, nodeId, "edit");
  const [row] = await userDb((tx) => tx.select({ kind: node.kind, deletedAt: node.deletedAt, settings: node.settings }).from(node).where(eq(node.id, nodeId)).limit(1));
  if (!row) throw new Error("That note no longer exists.");
  if (row.deletedAt) throw new Error("That note is in the trash.");
  // A locked note is read-only for everyone but its approvers, the agent included (lib/editorial-guard).
  await assertUnlocked(projectId, nodeId);
  return { kind: isDocumentKind(row.kind) ? "document" : "board", format: nodeFormat(row.settings) };
}

/**
 * Opens a note's live document, lets `change` edit it, and merges the result
 * back. `change` returns what it wants the caller to have; returning without
 * touching the doc sends nothing. The first change a run makes to a note keeps
 * a checkpoint of it first.
 */
async function withLiveDoc<T>(context: WriteContext, nodeId: string, expected: Target["kind"], change: (doc: Y.Doc, target: Target) => T): Promise<{ result: T; doc: Y.Doc; changed: boolean }> {
  const target = await requireWritable(context.projectId, nodeId);
  if (target.kind !== expected) throw new Error(expected === "document" ? "That is a board, not a text document: its text can't be edited this way." : "That note is a text document, not a board.");
  const room = roomName({ kind: "node", id: nodeId });
  const state = await fetchRoomState(room);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  const before = Y.encodeStateVector(doc);

  const result = change(doc, target);
  const update = Y.encodeStateAsUpdate(doc, before);
  // An update that changes nothing is two bytes: an empty struct list and an empty delete set.
  const changed = update.length > 2;
  if (changed) {
    // Before anything is sent: no checkpoint, no edit ("Undo run" must always have something to restore).
    await checkpoint(context, nodeId, state);
    await postRoomUpdate(room, update);
    // The collab server pushes text and links back on its own a few seconds
    // later; doing it here too means the agent's next read already sees its edit.
    await syncRoomState(room, Y.encodeStateAsUpdate(doc));
  }
  return { result, doc, changed };
}

export type DocumentEdit = EditResult & { value: DocNode[] };

/** Edits a note's text. `change` gets the options every edit shares (the script's default element). */
export async function editDocument(context: WriteContext, nodeId: string, change: (doc: Y.Doc, defaults: Pick<EditOptions, "defaultType">) => EditResult): Promise<DocumentEdit> {
  const { result, doc, changed } = await withLiveDoc(context, nodeId, "document", (live, target) => {
    // Notes nobody has opened yet have blocks without ids; the edits address blocks by id.
    ensureBlockIds(live);
    return change(live, { defaultType: target.format === "prose" ? "p" : "action" });
  });
  const value = ydocToValue(Y.encodeStateAsUpdate(doc));
  const last = result.touched.at(-1);
  if (changed && last) void showCursor(context, nodeId, cursorAt(doc, last));
  doc.destroy();
  return { ...result, value };
}

/** Puts a note's text back to a saved value ("Undo run"). */
export async function restoreDocument(context: WriteContext, nodeId: string, value: DocNode[]): Promise<void> {
  const { doc } = await withLiveDoc(context, nodeId, "document", (live) => restoreValue(live, value));
  doc.destroy();
}

/** Changes a board's shared maps (a canvas's cards). */
export async function editBoard<T>(context: WriteContext, nodeId: string, change: (doc: Y.Doc) => T): Promise<T> {
  const { result, doc } = await withLiveDoc(context, nodeId, "board", (live) => change(live));
  doc.destroy();
  return result;
}

// ---- Presence (plan.md 2.11 "Presence") -----------------------------------------------------------
//
// While it works, the agent shows up like another collaborator: in the project
// (the presence room) and, in the document it is writing, as a cursor. Both are
// awareness states relayed by the collab server. They are sent with a made-up
// client id per run, and cleared when the run ends; if that never happens,
// browsers drop a silent client's state on their own after 30 seconds.

/** A stable awareness client id for a run. */
function clientIdOf(runId: string): number {
  let hash = 0;
  for (let i = 0; i < runId.length; i++) hash = (hash * 31 + runId.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 2147483646) + 1;
}

/** One client's awareness state as an update. The clock only has to grow from one call to the next. */
function awarenessUpdate(runId: string, state: Record<string, unknown> | null): Uint8Array {
  const doc = new Y.Doc();
  doc.clientID = clientIdOf(runId);
  const awareness = new Awareness(doc);
  awareness.setLocalState(state);
  awareness.meta.set(doc.clientID, { clock: Math.floor(Date.now() / 100), lastUpdated: Date.now() });
  const update = encodeAwarenessUpdate(awareness, [doc.clientID]);
  awareness.destroy();
  doc.destroy();
  return update;
}

const agentName = (context: WriteContext) => `AI · for ${context.userName}`;

/** Shows the agent in the project's presence list, in the note it is working on. */
export async function showPresence(context: WriteContext, nodeId: string | null): Promise<void> {
  const user = { id: agentAuthor(context.userId), name: agentName(context), color: colorFor(agentAuthor(context.userId)), image: null };
  await postAwareness(roomName({ kind: "presence", id: context.projectId }), awarenessUpdate(context.runId, { user, nodeId }));
}

async function showCursor(context: WriteContext, nodeId: string, selection: { anchor: unknown; focus: unknown } | null): Promise<void> {
  const data = { name: agentName(context), color: colorFor(agentAuthor(context.userId)) };
  await Promise.all([
    showPresence(context, nodeId),
    selection ? postAwareness(roomName({ kind: "node", id: nodeId }), awarenessUpdate(context.runId, { selection, data })) : Promise.resolve(),
  ]);
}

/** Takes the agent out of the presence list and out of every document it wrote in. */
export async function clearPresence(context: WriteContext, nodeIds: Iterable<string>): Promise<void> {
  const gone = awarenessUpdate(context.runId, null);
  await Promise.all([
    postAwareness(roomName({ kind: "presence", id: context.projectId }), gone),
    ...[...nodeIds].map((id) => postAwareness(roomName({ kind: "node", id }), gone)),
  ]);
}
