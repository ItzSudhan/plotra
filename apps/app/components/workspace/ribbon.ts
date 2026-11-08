"use client";

import type { RibbonPrefs } from "@plotra/db/schema";
import { effectiveRibbon, hasRibbon } from "@/lib/shell-defaults";
import { useEffect, useMemo } from "react";
import { usePrefs } from "@/components/notify/data";
import { updateRibbon } from "@/lib/notify-actions";
import { moved, ribbonLayout, setInRibbon } from "@/lib/ribbon";
import { Store, useStore } from "./stores";
import { ribbonViews } from "./view-registry";
import { useWorkspace } from "./workspace-provider";

// The person's arrangement of the ribbon (lib/ribbon.ts), as the shell uses
// it: which of the project's views are in the ribbon, which are under "More",
// and how to move one across. Saved with their own settings, so it is the same
// in every project and on every device.

/** A change made in this tab, shown at once and kept until the saved copy has caught up. */
const changedHere = new Store<RibbonPrefs | null>(null);
let saving = 0;

export function useRibbon() {
  const { project, modules } = useWorkspace();
  const { data: prefs, refresh } = usePrefs();
  const here = useStore(changedHere);
  const saved = prefs?.ribbon;
  // A fresh copy from the server (after a save, or a view pinned by the checklist) replaces what was changed here.
  useEffect(() => {
    if (saved && !saving) changedHere.set(null);
  }, [saved]);

  const { workspace } = useWorkspace();
  // The person's own, or where they haven't arranged it, their project's or workspace's default (lib/shell-defaults.ts).
  const projectDefaults = project.settings.shellDefaults;
  const own = useMemo(() => here ?? saved ?? {}, [here, saved]);
  const ribbon = useMemo(() => effectiveRibbon(own, projectDefaults, workspace.defaults), [own, projectDefaults, workspace.defaults]);
  const track = project.settings.track;
  const views = useMemo(() => ribbonViews(modules), [modules]);
  const { shown, more } = useMemo(() => ribbonLayout(views, track, ribbon), [ribbon, track, views]);

  const save = (next: RibbonPrefs) => {
    changedHere.set(next);
    saving++;
    void updateRibbon(next)
      .catch(() => {
        // Offline: the ribbon stays as arranged in this tab and is saved with the next change.
      })
      .finally(() => {
        saving--;
        refresh();
      });
  };

  return {
    /** Every view the project offers, in the order the ribbon lists them. */
    views,
    shown,
    more,
    all: ribbon.all === true,
    /** Puts a view in the ribbon, or takes it off. */
    setShown: (viewId: string, on: boolean) => save(setInRibbon(ribbon, track, viewId, on)),
    setAll: (all: boolean) => save({ ...ribbon, all }),
    /** Moves a view up (-1) or down (1) among the ones in the ribbon. */
    move: (viewId: string, by: -1 | 1) => save({ ...ribbon, order: moved(shown.map((view) => view.id), viewId, by) }),
    /** Whether the person arranged it themselves, rather than it being the track's or a default. */
    changed: hasRibbon(own),
    reset: () => save({}),
    /** The arrangement as saved, for writing it to a file. */
    prefs: ribbon,
    /** Replaces the whole arrangement: a preset's, or one loaded from a file. */
    replace: (next: RibbonPrefs) => save(next),
  };
}
