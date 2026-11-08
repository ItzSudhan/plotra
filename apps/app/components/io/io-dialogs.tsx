"use client";

import { useUi, useWorkspace } from "@/components/workspace/workspace-provider";
import { ExportDialog } from "./export-dialog";
import { ImportDialog } from "./import-dialog";

/** The Import… and Export… dialogs (plan.md 2.7), opened from the command palette and the binder's menus through `ui.io`. */
export function IoDialogs() {
  const { setUi } = useWorkspace();
  const { io } = useUi();
  if (!io) return null;
  const close = () => setUi({ io: null });
  return io.mode === "import" ? <ImportDialog nodeId={io.nodeId} onClose={close} /> : <ExportDialog nodeId={io.nodeId} onClose={close} />;
}
