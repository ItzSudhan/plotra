import "server-only";
import { schema } from "@plotra/db";
import { and, eq } from "drizzle-orm";
import * as Y from "yjs";
import { requireNodeAccess } from "../access";
import { fetchRoomState, postRoomUpdate } from "../agent/collab-service";
import { restoreValue } from "../agent/edits";
import { roomName } from "../collab/rooms";
import { syncRoomState } from "../collab/sync";
import { requireSession } from "../data";
import { userDb } from "../db";
import type { DocNode } from "../doc-index";
import { assertUnlocked } from "../editorial-guard";
import { readOnly } from "../request-cache";
import { isDocumentKind } from "../story";
import { createVersion, deleteVersion, getVersionContent, listPeople, listVersions, renameVersion, type Person, type VersionRow } from "../workflow-actions";
import { ApiError } from "./handler";

// A note's version history for the phone app (app/api/mobile/history). It's
// the web's history panel (components/workflow/history-panel.tsx) through the
// web's own functions (lib/workflow-actions.ts), run as the token's owner, so
// who may save, rename, delete and restore is the web's rule.
//
// The one thing the web does in the browser is restoring: it saves what the
// note says now as a version ("Before restoring …"), then swaps the open
// editor's blocks for the version's. Here the same happens on the note's live
// document on the collab server (lib/agent/edits.ts restoreValue keeps the
// blocks that are the same, so comments on them stay put), and everyone with
// the note open sees it change.

const { node, version } = schema;

export type MobileVersion = {
  id: string;
  name: string | null;
  auto: boolean;
  wordCount: number;
  createdAt: Date;
  authorName: string | null;
  /** Whoever saved it, or a manager, may delete it. */
  canDelete: boolean;
};

export type MobileHistory = { versions: MobileVersion[]; canEdit: boolean; isDocument: boolean };

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const room = (nodeId: string) => roomName({ kind: "node", id: nodeId });

/** The note as it is right now, from the collab server; null when it can't be reached or has nothing yet. */
async function liveState(nodeId: string): Promise<Uint8Array | null> {
  try {
    const state = await fetchRoomState(room(nodeId));
    return state.length > 2 ? state : null;
  } catch {
    return null;
  }
}

export async function listMobileHistory(projectId: string, nodeId: string): Promise<MobileHistory> {
  const { user } = await requireSession();
  const { access } = await readOnly(() => requireNodeAccess(projectId, nodeId));
  const [rows, people, kind] = await Promise.all([
    listVersions(projectId, nodeId),
    listPeople(projectId).catch(() => []),
    readOnly(() => userDb((tx) => tx.select({ kind: node.kind }).from(node).where(eq(node.id, nodeId)).limit(1))).then((r) => r[0]?.kind),
  ]);
  return {
    canEdit: access.actions.has("edit"),
    isDocument: !!kind && isDocumentKind(kind),
    versions: toMobileVersions(rows, people, { id: user.id, name: user.name }, { edit: access.actions.has("edit"), manage: access.actions.has("manage") }),
  };
}

/** Versions as the phone shows them: who saved each, and whether the caller may delete it. */
export function toMobileVersions(rows: VersionRow[], people: Person[], me: { id: string; name: string }, may: { edit: boolean; manage: boolean }): MobileVersion[] {
  const names = new Map(people.map((p) => [p.id, p.name]));
  if (!names.has(me.id)) names.set(me.id, me.name);
  return rows.map((v) => ({
    id: v.id,
    name: v.name,
    auto: v.auto,
    wordCount: v.wordCount,
    createdAt: v.createdAt,
    authorName: v.createdById ? (names.get(v.createdById) ?? null) : null,
    canDelete: may.edit && (v.createdById === me.id || may.manage),
  }));
}

/** The change that puts a live document (its full state) back to `value`: empty when it already reads that way. */
export function restoreUpdate(state: Uint8Array, value: DocNode[]): Uint8Array {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, state);
    const before = Y.encodeStateVector(doc);
    restoreValue(doc, value);
    const update = Y.encodeStateAsUpdate(doc, before);
    // Two bytes is an update that changes nothing.
    return update.length > 2 ? update : new Uint8Array();
  } finally {
    doc.destroy();
  }
}

/** A version's text, for reading. Boards (canvases, dialogues) are looked at on the web. */
export async function readMobileVersion(projectId: string, versionId: string): Promise<{ value: DocNode[] | null }> {
  const content = await getVersionContent(projectId, versionId);
  return { value: content.kind === "document" ? content.value : null };
}

/** Names what the note says now as a version: the live document, so the last few seconds of typing are in it. */
export async function saveMobileVersion(projectId: string, nodeId: string, name: string | null): Promise<{ id: string }> {
  const state = await liveState(nodeId);
  const created = await createVersion(projectId, nodeId, name, state ? toBase64(state) : undefined);
  return { id: created.id };
}

export const renameMobileVersion = (projectId: string, versionId: string, name: string | null) => renameVersion(projectId, versionId, name);

export const deleteMobileVersion = (projectId: string, versionId: string) => deleteVersion(projectId, versionId);

/** Puts the note back to a version, keeping what it says now as a version first (as the web does). */
export async function restoreMobileVersion(projectId: string, nodeId: string, versionId: string): Promise<void> {
  const row = await readOnly(async () => {
    await requireNodeAccess(projectId, nodeId, "edit");
    // A locked stage forbids rewriting the note to all but its approvers.
    await assertUnlocked(projectId, nodeId);
    const [found] = await userDb((tx) =>
      tx
        .select({ name: version.name, kind: node.kind })
        .from(version)
        .innerJoin(node, eq(node.id, version.nodeId))
        .where(and(eq(version.id, versionId), eq(version.projectId, projectId), eq(version.nodeId, nodeId)))
        .limit(1),
    );
    return found;
  });
  if (!row) throw new ApiError(404, "That version no longer exists.");
  if (!isDocumentKind(row.kind)) throw new ApiError(400, "Restore this one on the web: the phone can only put text back.");
  const content = await getVersionContent(projectId, versionId);
  if (content.kind !== "document") throw new ApiError(400, "Restore this one on the web: the phone can only put text back.");

  // One copy of the live document: the safety version is made from it, and the restore applied to it.
  const state = await fetchRoomState(room(nodeId));
  if (state.length > 2) {
    await createVersion(projectId, nodeId, `Before restoring “${row.name ?? "automatic snapshot"}”`, toBase64(state), row.name ?? "an automatic snapshot");
  }
  const update = restoreUpdate(state, content.value);
  if (update.length) {
    await postRoomUpdate(room(nodeId), update);
    const merged = new Y.Doc();
    try {
      Y.applyUpdate(merged, state);
      Y.applyUpdate(merged, update);
      await syncRoomState(room(nodeId), Y.encodeStateAsUpdate(merged));
    } finally {
      merged.destroy();
    }
  }
}
