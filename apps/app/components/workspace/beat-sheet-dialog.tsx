"use client";

import { Icon } from "@plotra/icons";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@plotra/ui/components/dialog";
import { IconButton } from "@plotra/ui/components/icon-button";
import { undoToast } from "@plotra/ui/components/sonner";
import { cn } from "@plotra/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { beatSheetGroups, beatSheets, type BeatSheet, type BeatSheetGroup } from "@/lib/beat-sheets";
import { applyBeatSheet } from "@/lib/story-actions";
import { containerKinds, lastPosition } from "@/lib/tree";
import { useOwnSheets } from "./shell-prefs";
import { useStore } from "./stores";
import { useUi, useWorkspace } from "./workspace-provider";
import { errorText } from "@/lib/errors";
import { reached } from "@/components/onboarding/reached";

/**
 * Picks a beat sheet and builds it in the binder (plan.md Phase 5): the
 * built-in structures by the kind of writing they're for, then the person's
 * own, saved from folders with "Save as a beat sheet" (components/workspace/binder.tsx).
 */
export function BeatSheetDialog() {
  const { project, binder, setUi, announce, open } = useWorkspace();
  const { beatSheets: isOpen, selectedId } = useUi();
  const { index } = useStore(binder);
  const [picked, setPicked] = useState(beatSheets[0].id);
  const [busy, setBusy] = useState(false);
  const own = useOwnSheets();
  // Undo runs after the removal has re-rendered: it must add to the list as it is then, not as it was.
  const latestOwn = useRef(own);
  useEffect(() => {
    latestOwn.current = own;
  });
  if (!isOpen) return null;

  const removeOwn = (removed: BeatSheet) => {
    own.remove(removed.id);
    undoToast(`Removed ‘${removed.title}’ from your beat sheets`, () => latestOwn.current.add(removed));
  };
  const all = [...beatSheets, ...own.sheets];

  const selected = selectedId ? index.byId.get(selectedId) : undefined;
  const parent = selected && !selected.deletedAt && containerKinds.includes(selected.kind) && selected.actions.includes("edit") ? selected : undefined;
  // A sheet of the person's own that was just removed falls back to the first.
  const sheet = all.find((s) => s.id === picked) ?? beatSheets[0];
  const groups = (Object.keys(beatSheetGroups) as BeatSheetGroup[])
    .map((group) => ({ group, sheets: all.filter((s) => (s.group ?? "yours") === group) }))
    .filter((g) => g.sheets.length > 0);

  const apply = async () => {
    setBusy(true);
    try {
      // A built-in sheet goes by id; one of the person's own is sent whole, and cleaned by the server.
      const nodes = await applyBeatSheet(project.id, parent?.id ?? null, sheet.group === "yours" ? sheet : sheet.id, lastPosition(binder.get().index, parent?.id ?? null));
      binder.upsert(...nodes);
      announce();
      reached("beats");
      const folder = nodes.find((n) => n.kind === "folder");
      if (folder) setUi({ selectedId: folder.id, left: true, leftTab: "binder" });
      const first = nodes.find((n) => n.kind === "scene");
      if (first) open(first.id, "tab");
      setUi({ beatSheets: false });
      toast.success(`${sheet.title} added to the binder.`);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && setUi({ beatSheets: false })}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start from a beat sheet</DialogTitle>
          <DialogDescription>
            Builds a folder with an act per chapter and a scene card per beat, each with a synopsis of what the beat does
            {parent ? `, inside ${parent.title}` : ""}. Rename, reorder and fill them in as you go.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[13rem_1fr]">
          <div className="grid max-h-[26rem] content-start gap-1 overflow-y-auto pr-1">
            {groups.map(({ group, sheets }) => (
              <section key={group} aria-label={beatSheetGroups[group]} className="grid gap-1">
                <h3 className="px-3 pt-2 text-ui-sm font-medium text-muted-foreground">{beatSheetGroups[group]}</h3>
                {sheets.map((s) => (
                  <div key={s.id} className="group/sheet relative">
                    <button
                      type="button"
                      aria-pressed={sheet.id === s.id}
                      onClick={() => setPicked(s.id)}
                      className={cn(
                        "grid w-full gap-0.5 rounded-md px-3 py-2 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        sheet.id === s.id && "bg-accent",
                      )}
                    >
                      <span className="pr-6 text-sm font-medium">{s.title}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{s.description}</span>
                    </button>
                    {group === "yours" && (
                      <IconButton
                        icon="trash-bin-minimalistic-linear"
                        label={`Remove ${s.title} from your beat sheets`}
                        size="xs"
                        onClick={() => removeOwn(s as BeatSheet)}
                        className="absolute top-1.5 right-1.5 opacity-0 group-focus-within/sheet:opacity-100 group-hover/sheet:opacity-100 hover:bg-background focus-visible:opacity-100 pointer-coarse:opacity-100"
                      />
                    )}
                  </div>
                ))}
              </section>
            ))}
            {!own.sheets.length && (
              <p className="px-3 pt-2 text-xs text-muted-foreground">To keep a structure of your own, right-click a folder or chapter in the binder and choose Save as a beat sheet.</p>
            )}
          </div>
          <ol className="max-h-[26rem] overflow-y-auto rounded-md border p-3 text-ui-sm">
            {sheet.acts.map((act, i) => (
              <li key={i} className="mb-3 last:mb-0">
                <p className="flex items-center gap-1.5 font-medium">
                  <Icon name="book-bookmark-linear" className="size-3.5 text-muted-foreground" />
                  {act.title}
                </p>
                <ol className="mt-1 grid gap-1 pl-5">
                  {act.beats.map((b, j) => (
                    <li key={j}>
                      <span className="font-medium">{b.title}</span> <span className="text-xs text-muted-foreground">
                        <span aria-hidden>≈</span>
                        <span className="sr-only">at about </span>
                        {b.at}%<span className="sr-only"> of the story</span>
                      </span>
                      <p className="text-xs text-muted-foreground">{b.synopsis}</p>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setUi({ beatSheets: false })} className="h-9 rounded-md px-3 text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => void apply()} className="h-9 rounded-md bg-foreground px-4 text-sm text-background outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50">
            Add {sheet.title}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
