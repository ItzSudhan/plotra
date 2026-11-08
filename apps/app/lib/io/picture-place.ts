import * as Y from "yjs";
import { isPendingPicture, pendingPath } from "./vault-pictures";

// A note's pictures, still waiting for their files after a vault import
// (./vault-pictures.ts), pointed at the files they were uploaded as. Pure Yjs:
// ./picture-actions.ts runs it on the live document.

/** Points a document's waiting pictures at their files (or takes them out). Returns how many it changed. */
export function placeInDoc(doc: Y.Doc, files: ReadonlyMap<string, string | null>): number {
  let changed = 0;
  doc.transact(() => {
    const walk = (parent: Y.XmlText) => {
      const gone: number[] = [];
      let offset = 0;
      for (const op of parent.toDelta() as Array<{ insert: unknown }>) {
        const length = typeof op.insert === "string" ? op.insert.length : 1;
        if (op.insert instanceof Y.XmlText) {
          const url = op.insert.getAttribute("url");
          if (op.insert.getAttribute("type") === "img" && isPendingPicture(url) && files.has(pendingPath(url))) {
            const file = files.get(pendingPath(url));
            if (file) op.insert.setAttribute("url", `/api/files/${file}`);
            else gone.push(offset);
            changed++;
          } else walk(op.insert);
        }
        offset += length;
      }
      // From the end, so the offsets before stay right.
      for (const at of gone.reverse()) parent.delete(at, 1);
    };
    walk(doc.get("content", Y.XmlText));
  });
  return changed;
}
