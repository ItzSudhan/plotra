"use client";

import type { ModuleId } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@plotra/ui/components/dialog";
import { useState } from "react";
import { toast } from "sonner";
import { Store, useStore } from "@/components/workspace/stores";
import { viewMeta } from "@/components/workspace/view-meta";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { errorText } from "@/lib/errors";
import { moduleMeta } from "@/lib/modules";
import { updateProjectSettings } from "@/lib/project-actions";

// A new project starts with few modules (lib/modules.ts). The rest are offered
// where they become useful (onboarding-plan.md 3): a "Getting started" step
// that needs one, or the ribbon's "More" menu. Either way the offer is this
// one prompt, which says what the module is and what it adds before anything
// is switched on.

const offered = new Store<ModuleId | null>(null);

/** Opens the prompt for a module. It only has an effect for someone who manages the project. */
export const offerModule = (id: ModuleId) => offered.set(id);

/** The views a module adds, by their titles. */
const viewsOf = (id: ModuleId) => viewMeta.filter((view) => "module" in view && view.module === id).map((view) => view.title);

/** The prompt. Mounted once, by the shell. */
export function ModulePrompt() {
  const { project, modules, projectChanged } = useWorkspace();
  const id = useStore(offered);
  const [busy, setBusy] = useState(false);
  if (!id || modules.has(id) || !project.actions.includes("manage")) return null;
  const meta = moduleMeta[id];
  const views = viewsOf(id);

  const turnOn = async () => {
    setBusy(true);
    try {
      await updateProjectSettings(project.id, { modules: { [id]: true } });
      projectChanged();
      toast.success(`${meta.label} is on.`);
      offered.set(null);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && offered.set(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name={meta.icon} className="size-5 text-ember-ink" />
            Turn on {meta.label}?
          </DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 text-sm text-muted-foreground">
          {views.length > 0 && (
            <p>
              Adds {views.length === 1 ? "the view" : "the views"} <span className="text-foreground">{views.join(", ")}</span>, under More in the ribbon.
            </p>
          )}
          <p>It is switched on for everyone in this project, and nothing you&apos;ve written changes. You can turn it off again in project settings.</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => offered.set(null)}>
            Not now
          </Button>
          <Button type="button" disabled={busy} onClick={() => void turnOn()}>
            Turn on
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
