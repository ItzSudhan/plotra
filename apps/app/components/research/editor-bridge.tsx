"use client";

import { KEYS, type TElement } from "platejs";
import { createPlatePlugin, useEditorReadOnly, useEditorRef } from "platejs/react";
import { useEffect } from "react";
import { useCurrentDocument } from "@/components/editor/current-document";
import { scrollBehavior } from "@/lib/motion";

// Lets the sources view put an attached image into a note's document. The
// shell only knows editors through their handles, which can't insert blocks,
// so each open editor listens here under its note's id.

type Insert = (url: string, alt: string) => void;

const inserters = new Map<string, Set<Insert>>();

/** Appends an image block to an open note. False when no editor for the note can be edited right now. */
export function insertImageIntoNote(nodeId: string, url: string, alt: string) {
  const insert = [...(inserters.get(nodeId) ?? [])][0];
  if (!insert) return false;
  insert(url, alt);
  return true;
}

function Bridge() {
  const editor = useEditorRef();
  const readOnly = useEditorReadOnly();
  const nodeId = useCurrentDocument()?.nodeId;

  useEffect(() => {
    if (!nodeId || readOnly) return;
    const insert: Insert = (url, alt) => {
      const at = [editor.children.length];
      editor.tf.insertNodes({ type: editor.getType(KEYS.img), url, alt, children: [{ text: "" }] } as TElement, { at });
      const added = editor.api.node(at);
      if (added) editor.api.toDOMNode(added[0])?.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    };
    const set = inserters.get(nodeId) ?? new Set<Insert>();
    inserters.set(nodeId, set.add(insert));
    return () => {
      set.delete(insert);
      if (!set.size && inserters.get(nodeId) === set) inserters.delete(nodeId);
    };
  }, [editor, nodeId, readOnly]);

  return null;
}

export const AttachmentInsertPlugin = createPlatePlugin({
  key: "attachment_insert",
  render: { afterEditable: () => <Bridge /> },
});
