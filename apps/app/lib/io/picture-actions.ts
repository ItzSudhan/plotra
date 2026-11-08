"use server";

import { schema } from "@plotra/db";
import { and, eq, inArray } from "drizzle-orm";
import * as Y from "yjs";
import { requireNodeAccess, requireProjectAccess } from "../access";
import { fetchRoomState, postRoomUpdate } from "../agent/collab-service";
import { roomName } from "../collab/rooms";
import { syncRoomState } from "../collab/sync";
import { requireSession } from "../data";
import { userDb } from "../db";
import { rateLimit } from "../rate-limit";
import { readOnly } from "../request-cache";
import { placeInDoc } from "./picture-place";

// The last step of bringing a vault's pictures in (./vault-pictures.ts): the
// notes came in with a placeholder where each picture goes, the dialog has
// uploaded the pictures as files of those notes, and this points each
// placeholder at its file. Through the live document, as the agent edits
// (lib/agent/write.ts), so a note someone opened meanwhile changes in front
// of them. A picture that couldn't be uploaded is taken out.

const { attachment } = schema;

export type PicturePlacement = {
  /** The picture's path in the vault, as the import named it. */
  path: string;
  /** The file it was uploaded as; null when it couldn't be, and the placeholder goes. */
  fileId: string | null;
  /** The notes that show it. */
  nodeIds: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PLACEMENTS = 3200;
const MAX_NOTES = 1500;

/**
 * Puts the uploaded pictures in the notes that show them. For people who can
 * edit those notes; a file has to be one of this project's.
 */
export async function placeImportedPictures(projectId: string, placements: PicturePlacement[]): Promise<{ placed: number }> {
  const byNote = await readOnly(async () => {
    const { user } = await requireSession();
    await requireProjectAccess(projectId, "edit");
    await rateLimit("import-pictures", user.id, { limit: 60, windowSeconds: 600 });
    if (!Array.isArray(placements) || placements.length > MAX_PLACEMENTS) throw new Error("Too many pictures at once.");
    const clean = placements.filter(
      (p): p is PicturePlacement =>
        typeof p?.path === "string" &&
        p.path.length < 1200 &&
        (p.fileId === null || (typeof p.fileId === "string" && UUID.test(p.fileId))) &&
        Array.isArray(p.nodeIds) &&
        p.nodeIds.every((id) => typeof id === "string" && UUID.test(id)),
    );
    const fileIds = [...new Set(clean.flatMap((p) => (p.fileId ? [p.fileId] : [])))];
    const known = new Set(
      fileIds.length ? (await userDb((tx) => tx.select({ id: attachment.id }).from(attachment).where(and(eq(attachment.projectId, projectId), inArray(attachment.id, fileIds))))).map((row) => row.id) : [],
    );
    const out = new Map<string, Map<string, string | null>>();
    for (const p of clean) {
      for (const nodeId of p.nodeIds.slice(0, 200)) {
        if (!out.has(nodeId)) out.set(nodeId, new Map());
        out.get(nodeId)!.set(p.path, p.fileId && known.has(p.fileId) ? p.fileId : null);
      }
    }
    if (out.size > MAX_NOTES) throw new Error("Too many notes at once.");
    for (const nodeId of out.keys()) await requireNodeAccess(projectId, nodeId, "edit");
    return out;
  });

  // Outside the scope above: each note is a round trip to the live document server.
  let placed = 0;
  for (const [nodeId, files] of byNote) {
    const room = roomName({ kind: "node", id: nodeId });
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, await fetchRoomState(room));
      const before = Y.encodeStateVector(doc);
      placed += placeInDoc(doc, files);
      const update = Y.encodeStateAsUpdate(doc, before);
      // Two bytes is an update that changes nothing.
      if (update.length > 2) {
        await postRoomUpdate(room, update);
        await syncRoomState(room, Y.encodeStateAsUpdate(doc));
      }
    } finally {
      doc.destroy();
    }
  }
  return { placed };
}
