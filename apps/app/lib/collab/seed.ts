import { slateNodesToInsertDelta } from "@slate-yjs/core";
import * as Y from "yjs";
import { isScriptFormat, scriptStarters } from "../script";
import { bodyTemplates, emptyDocument } from "../templates";
import type { NodeKind, ScriptFormat } from "@plotra/db/schema";

/**
 * The body a new note of `kind` starts with. The browser that creates a note
 * and the collab server both call this, so it must depend on nothing but the
 * kind and the note's format (`node.settings.format`).
 */
export function starterBody(kind: NodeKind, format: ScriptFormat = "prose") {
  // A script opens on its first element (a scene heading; a comic's first page and panel).
  if (isScriptFormat(format) && !bodyTemplates[kind]) return scriptStarters[format];
  return bodyTemplates[kind] ?? emptyDocument;
}

/**
 * A room's first state, written by a fixed Yjs client id derived from the room
 * and the value. The browser seeds a note it just created with this, so the
 * writer can start typing before the server has the note; the server seeds the
 * room with the same bytes, and Yjs merges the two copies into one.
 */
export async function seedUpdate(room: string, value: unknown[]): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${room}-${JSON.stringify(value)}`));
  const doc = new Y.Doc();
  doc.clientID = (Math.abs(new DataView(digest).getInt32(0, false)) % 2147483647) + 1;
  // slate-yjs types are Slate's; Plate values are structurally the same.
  doc.get("content", Y.XmlText).applyDelta(slateNodesToInsertDelta(value as never));
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}
