import "server-only";
import { slateNodesToInsertDelta, yTextToSlateElement } from "@slate-yjs/core";
import * as Y from "yjs";
import type { DocNode } from "../doc-index";
import { emptyDocument } from "../templates";

// Converts between Plate values and Yjs docs, using the same shared root
// (`content`, a Y.XmlText) as Plate's YjsPlugin.

export { emptyDocument };

export function valueToYdoc(value: DocNode[]): Uint8Array {
  const doc = new Y.Doc();
  const nodes: unknown[] = Array.isArray(value) && value.length ? value : emptyDocument;
  // slate-yjs types are Slate's; Plate values are structurally the same.
  doc.get("content", Y.XmlText).applyDelta(slateNodesToInsertDelta(nodes as never));
  return Y.encodeStateAsUpdate(doc);
}

export function ydocToValue(update: Uint8Array): DocNode[] {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  const root = doc.get("content", Y.XmlText);
  return (yTextToSlateElement(root).children ?? []) as unknown as DocNode[];
}
