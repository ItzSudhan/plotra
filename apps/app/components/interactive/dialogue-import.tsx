"use client";

import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@plotra/ui/components/dialog";
import { toast } from "sonner";
import type { BinderStore } from "@/components/workspace/stores";
import { errorText } from "@/lib/errors";
import { importDialogueFile } from "@/lib/interactive-actions";
import { extractTwineStory, IMPORT_ACCEPT, MAX_IMPORT_SOURCE, type ImportWarning } from "@/lib/interactive/import";
import { lastPosition } from "@/lib/tree";

// Bringing a dialogue in from Ink, Yarn Spinner or Twine (plan.md 2.8): the
// file picker, the "new dialogue" import, and the report of what was skipped.
// The file is read on the server (lib/interactive-actions.ts); replacing an
// open dialogue's content is done by its editor (components/views/dialogue-view.tsx).

export type ImportReport = { fileName: string; warnings: ImportWarning[] };

/** Reports for dialogues just imported, shown when their editor opens. */
const pending = new Map<string, ImportReport>();

/** The report waiting for a dialogue's editor. */
export const peekImportReport = (nodeId: string): ImportReport | null => pending.get(nodeId) ?? null;

/** Once the editor has it, it isn't shown again. */
export const forgetImportReport = (nodeId: string) => void pending.delete(nodeId);

// A Twine 2 HTML story carries its story format's code (hundreds of KB); only its story is sent.
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Asks for a dialogue file and reads it, cut down to its story when it's Twine HTML. Null when cancelled or unreadable. */
export async function pickDialogueFile(): Promise<{ fileName: string; source: string } | null> {
  const file = await new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = IMPORT_ACCEPT;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
  if (!file) return null;
  if (file.size > MAX_FILE_BYTES) {
    toast.error("That file is too large to import.");
    return null;
  }
  let source = await file.text();
  if (/\.html?$/i.test(file.name) || /<tw-storydata\b/i.test(source.slice(0, 200_000))) {
    const story = extractTwineStory(source);
    if (!story) {
      toast.error("That HTML file isn't a Twine 2 story: it has no story data in it.");
      return null;
    }
    source = story;
  }
  if (source.length > MAX_IMPORT_SOURCE) {
    toast.error("That file is too large to import. Split it into several files.");
    return null;
  }
  return { fileName: file.name, source };
}

/**
 * Asks for a file and imports it as a new dialogue at the end of `parentId`
 * (the top of the binder when null). Returns the new dialogue's id; its report
 * is waiting for its editor (`peekImportReport`).
 */
export async function importDialogueAsNew({
  projectId,
  parentId,
  binder,
  track,
  announce,
}: {
  projectId: string;
  parentId: string | null;
  binder: BinderStore;
  track: <T>(write: Promise<T>) => Promise<T>;
  announce: () => void;
}): Promise<string | undefined> {
  const picked = await pickDialogueFile();
  if (!picked) return;
  try {
    const position = lastPosition(binder.get().index, parentId);
    const { nodes, warnings } = await track(importDialogueFile(projectId, { parentId, position, ...picked }));
    binder.upsert(...nodes);
    announce();
    const created = nodes[0];
    if (!created) return;
    if (warnings.length) pending.set(created.id, { fileName: picked.fileName, warnings });
    else toast.success(`Imported “${created.title}”.`);
    return created.id;
  } catch (error) {
    toast.error(errorText(error, "The import failed."));
  }
}

/** What an import skipped, line by line. */
export function ImportReportDialog({ report, onClose }: { report: ImportReport; onClose: () => void }) {
  const count = report.warnings.length;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="import-linear" className="size-5 text-ember-ink" />
            Imported {report.fileName}
          </DialogTitle>
          <DialogDescription className="text-ui-sm">
            {`${count === 1 ? "One thing" : `${count.toLocaleString()} things`} in the file couldn't be brought in as written. The rest is here, laid out from Start.`}
          </DialogDescription>
        </DialogHeader>
        <ul className="grid max-h-72 gap-1 overflow-y-auto rounded-md bg-muted/60 px-3 py-2 text-ui-sm">
          {report.warnings.map((warning, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-16 shrink-0 text-xs leading-5 text-muted-foreground tabular-nums">{warning.line ? `Line ${warning.line}` : "File"}</span>
              <span className="min-w-0 flex-1">{warning.text}</span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button size="sm" onClick={onClose}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
