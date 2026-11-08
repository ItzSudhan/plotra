"use client";

import { insertImage } from "@platejs/media";
import { KEYS } from "platejs";
import { createPlatePlugin, useEditorReadOnly, useEditorRef, type PlateEditor } from "platejs/react";
import { useEffect, useState } from "react";
import { ImagePickerDialog } from "@/components/views/image-picker";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useCurrentDocument } from "./current-document";

// "Image" in the slash menu and the insert menu opens the image picker; each
// editor renders its own and registers how to open it here.

const openers = new WeakMap<PlateEditor, () => void>();

/** Opens the image picker for this editor; the picture goes where the cursor was. */
export function insertImageFromPicker(editor: PlateEditor) {
  openers.get(editor)?.();
}

function ImagePicker() {
  const editor = useEditorRef();
  const readOnly = useEditorReadOnly();
  const { project } = useWorkspace();
  const nodeId = useCurrentDocument()?.nodeId;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (readOnly) return;
    openers.set(editor, () => setOpen(true));
    return () => {
      openers.delete(editor);
    };
  }, [editor, readOnly]);

  return (
    <ImagePickerDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) requestAnimationFrame(() => editor.tf.focus());
      }}
      projectId={project.id}
      nodeId={nodeId}
      onPick={({ url, alt }) => {
        editor.tf.focus();
        insertImage(editor, url, { select: true });
        if (alt) editor.tf.setNodes({ alt }, { match: { type: editor.getType(KEYS.img) } });
      }}
    />
  );
}

export const ImagePickerPlugin = createPlatePlugin({
  key: "image_picker",
  render: { afterEditable: () => <ImagePicker /> },
});
