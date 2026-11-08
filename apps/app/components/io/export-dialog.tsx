"use client";

import { Icon, type IconName } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@plotra/ui/components/dialog";
import { cn } from "@plotra/ui/lib/utils";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { fieldClass } from "@/components/views/view-ui";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useWorld } from "@/components/world/data";
import { errorText } from "@/lib/errors";
import { isDocumentKind } from "@/lib/story";
import { containerKinds, flatten, liveChildren } from "@/lib/tree";
import { useCompilePrefs } from "@/components/workspace/shell-prefs";
import { standardManuscript, type CompileOptions } from "@/lib/io/compile";
import { defaultFormat, nodeFormat } from "@/lib/modules";
import { isScriptFormat } from "@/lib/script";
import { Ao3Panel } from "./ao3-panel";
import { CompilePanel } from "./compile-panel";
import { download } from "./download";
import { requestPrint } from "./print-request";
import { SelectField } from "@plotra/ui/components/select-field";

// Export (plan.md 2.7, beat-the-competitors.md step 6): a folder, one note or
// the whole project as Word, RTF, Markdown, plain text, Final Draft or PDF.
// Word, RTF and plain text follow a layout (lib/io/compile.ts, ./compile-panel.tsx).
// The files are built by GET /api/export; PDF is the Read view's print dialog.
// Anyone who can read the project can export it, and no quota stands in the
// way (plan.md 8.1). "Plotra project" is the whole project, for another Plotra
// to import (lib/io/plotra-file.ts): what, as of when and layout don't apply.

type Choice = "markdown" | "markdown-files" | "docx" | "rtf" | "txt" | "fdx" | "pdf" | "ao3" | "opml" | "plotra";

const choices: Array<{ id: Choice; icon: IconName; title: string; detail: string; script?: boolean }> = [
  { id: "docx", icon: "file-text-linear", title: "Word (.docx)", detail: "Laid out as you choose below: standard manuscript format to start with." },
  { id: "rtf", icon: "file-text-linear", title: "Rich text (.rtf)", detail: "The same layout, for Scrivener, Pages, LibreOffice and older word processors." },
  { id: "fdx", icon: "clapperboard-text-linear", title: "Final Draft (.fdx)", detail: "The script, element by element, for Final Draft, Fade In, Highland or WriterDuet.", script: true },
  { id: "markdown", icon: "document-text-linear", title: "Markdown (.md)", detail: "One file, with a heading for each chapter and scene." },
  { id: "markdown-files", icon: "folder-linear", title: "Markdown, a file per note (.zip)", detail: "Folders and files that mirror the binder, with [[links]] kept." },
  { id: "txt", icon: "file-text-linear", title: "Plain text (.txt)", detail: "Just the words, with * * * between scenes." },
  { id: "pdf", icon: "printer-linear", title: "PDF", detail: "Opens the Read view and your browser's print dialog: choose “Save as PDF”." },
  { id: "opml", icon: "list-linear", title: "Outline (.opml)", detail: "Titles and synopses, nested as in the binder: for Scrivener (File → Import → OPML), OmniOutliner or any outliner." },
  { id: "ao3", icon: "global-linear", title: "Archive of Our Own (AO3)", detail: "Chapter by chapter, as HTML AO3 takes: copy each chapter's title, summary and text into AO3's posting form." },
  {
    id: "plotra",
    icon: "archive-linear",
    title: "Plotra project (.plotra)",
    detail: "The whole project, to import into another Plotra (the cloud or the desktop app): notes, boards, world, timelines, version history, comments and pictures.",
  },
];

const WHOLE = "";

export function ExportDialog({ nodeId, onClose }: { nodeId: string | null; onClose: () => void }) {
  const { project, binder, horizon, openView } = useWorkspace();
  const { index } = useStore(binder);
  const horizonId = useStore(horizon);
  const asOf = useWorld().data?.releases.find((r) => r.id === horizonId);
  const [rootId, setRootId] = useState(nodeId ?? WHOLE);
  const [choice, setChoice] = useState<Choice>("docx");
  const [busy, setBusy] = useState(false);
  const compile = useCompilePrefs();
  const [options, setOptions] = useState<CompileOptions>(() => compile.last ?? standardManuscript);
  // Final Draft is offered where something is written in a script format.
  const hasScript = useMemo(() => flatten(index).some((n) => isScriptFormat(nodeFormat(n.settings))) || isScriptFormat(defaultFormat(project.type, project.settings)), [index, project.settings, project.type]);
  const laidOut = choice === "docx" || choice === "rtf" || choice === "txt";
  const whole = choice === "plotra";
  // AO3's chapters are shown here, to copy one by one, instead of downloaded.
  const [ao3, setAo3] = useState<URLSearchParams | null>(null);

  // Folders and chapters can always be picked; the note the dialog was opened on too.
  const roots = useMemo(
    () => flatten(index).filter((n) => isDocumentKind(n.kind) && (containerKinds.includes(n.kind) || n.id === nodeId || liveChildren(index, n.id).length > 0)),
    [index, nodeId],
  );
  const root = roots.find((n) => n.id === rootId);

  const run = async () => {
    if (choice === "ao3") {
      const params = new URLSearchParams({ project: project.id, format: "ao3" });
      if (root) params.set("root", root.id);
      if (asOf) params.set("horizon", asOf.id);
      setAo3(params);
      return;
    }
    if (choice === "pdf") {
      openView("read", root ? { nodeId: root.id } : {});
      requestPrint(root?.id ?? null);
      onClose();
      return;
    }
    const params = new URLSearchParams({ project: project.id, format: choice === "markdown-files" ? "markdown" : choice });
    if (choice === "markdown-files") params.set("layout", "files");
    if (root && !whole) params.set("root", root.id);
    if (asOf && !whole) params.set("horizon", asOf.id);
    if (laidOut) {
      params.set("compile", JSON.stringify(options));
      compile.remember(options);
    }
    setBusy(true);
    try {
      toast.success(`Saved ${await download(`/api/export?${params}`)}.`);
      onClose();
    } catch (error) {
      toast.error(errorText(error, "The export failed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="export-linear" className="size-5 text-ember-ink" />
            Export
          </DialogTitle>
          <DialogDescription className="text-ui-sm">Your text, in a file you can open anywhere.</DialogDescription>
        </DialogHeader>

        <label className="grid gap-1 text-ui-sm">
          <span className="text-muted-foreground">What</span>
          <SelectField value={root && !whole ? root.id : WHOLE} disabled={whole} onValueChange={(v) => setRootId(v)} className={cn(fieldClass, "h-8")}>
            <option value={WHOLE}>The whole project: {project.title}</option>
            {roots.map((n) => (
              <option key={n.id} value={n.id}>
                {n.title}
              </option>
            ))}
          </SelectField>
        </label>

        {ao3 ? (
          <Ao3Panel key={ao3.toString()} query={ao3} />
        ) : (
          <div role="radiogroup" aria-label="Format" className="grid gap-1">
            {choices.filter((c) => !c.script || hasScript).map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={choice === c.id}
                onClick={() => setChoice(c.id)}
                className={cn("flex items-start gap-3 rounded-md border border-transparent px-3 py-2 text-left hover:bg-accent", choice === c.id && "border-border bg-accent")}
              >
                <Icon name={c.icon} className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground", choice === c.id && "text-ember-ink")} />
                <span className="grid gap-0.5">
                  <span className="text-ui-sm font-medium">{c.title}</span>
                  <span className="text-xs text-muted-foreground">{c.detail}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {laidOut && <CompilePanel options={options} onChange={setOptions} plain={choice === "txt"} />}

        <p className="text-xs text-faint">
          {whole ? (
            <>
              Everything as last saved (a few seconds behind){project.worldId ? ", with the world it shares" : ""}. Who it&apos;s shared with, chats, agent conversations and statistics stay here. Importing it makes a new project.
            </>
          ) : (
            <>
              {asOf && <>As of {asOf.title}: only what&apos;s revealed by then is exported. </>}
              The text is as last saved (a few seconds behind). Comments are left out, and suggestions nobody has accepted aren&apos;t applied.
            </>
          )}
        </p>

        <DialogFooter>
          {ao3 ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setAo3(null)}>
                Back
              </Button>
              <Button size="sm" onClick={onClose}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void run()}>
                {choice === "pdf" ? "Open print preview" : choice === "ao3" ? "Show the chapters" : busy ? "Exporting…" : "Export"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
