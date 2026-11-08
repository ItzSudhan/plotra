"use client";

import { moduleIds, type ModuleId } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePrefs } from "@/components/notify/data";
import { useSession } from "@/components/stats/session";
import { Store, useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useWorld } from "@/components/world/data";
import { updateGettingStarted } from "@/lib/notify-actions";
import { checklistFor, isStepId, isTryout, WORDS_TO_START, type Step, type StepId } from "@/lib/onboarding/steps";
import { NEVER } from "@/lib/world";
import { moduleMeta } from "@/lib/modules";
import { offerModule } from "./module-prompt";
import { reached, reachedHere } from "./reached";

// The "Getting started" checklist (onboarding-plan.md 2.3): a small card over
// the panes of a project started from the Cold Open. A step is ticked when the
// person does the thing, which is noticed here or reported by the view that
// did it (./reached.ts), and saved with their own settings, so it is ticked on
// every device and in their next project too.

const allModules: ReadonlySet<ModuleId> = new Set(moduleIds);

/** Closing or reopening the card, until the server's copy says the same. */
const dismissedHere = new Store<boolean | null>(null);

/**
 * The open project's checklist and where its reader is in it, or null when
 * there is none: the project has no track, they can't edit it, or their
 * settings haven't loaded.
 */
export function useGettingStarted() {
  const { project, modules } = useWorkspace();
  const { data: prefs, refresh } = usePrefs();
  const here = useStore(reachedHere);
  const dismissedNow = useStore(dismissedHere);
  const canEdit = project.actions.includes("edit");
  const track = project.settings.track;
  // A step whose module is off is kept for someone who can switch it on: the step is where it is offered.
  const canManage = project.actions.includes("manage");
  const checklist = useMemo(() => (canEdit ? checklistFor(track, canManage ? allModules : modules) : null), [canEdit, canManage, modules, track]);

  const saved = prefs?.gettingStarted;
  const done = useMemo(() => new Set<StepId>([...(saved?.done ?? []).filter(isStepId), ...here]), [here, saved]);
  if (!checklist?.steps.length || !saved) return null;

  // "Getting started" and a sample's try-out are closed separately: someone done with one may still want the other.
  const flag = isTryout(track) ? "dismissedTryout" : "dismissed";
  const setDismissed = (dismissed: boolean) => {
    dismissedHere.set(dismissed);
    void updateGettingStarted({ [flag]: dismissed })
      .then(refresh)
      .catch(() => dismissedHere.set(null));
  };
  return { ...checklist, done, saved: saved.done ?? [], dismissed: dismissedNow ?? saved[flag] ?? false, setDismissed, refresh };
}

/** Draws the eye to the control a step is about: a few rings around the ribbon button, then nothing. */
export function pointAt(guide: string) {
  // A view that isn't in the ribbon is under "More", so that is where to look.
  const target = document.querySelector<HTMLElement>(`[data-guide="${guide}"]`) ?? document.querySelector<HTMLElement>('[data-guide="more"]');
  if (!target) return;
  const ember = getComputedStyle(target).getPropertyValue("--ember").trim() || "currentColor";
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.animate(
    still
      ? [{ boxShadow: `0 0 0 2px ${ember}` }, { boxShadow: `0 0 0 2px ${ember}` }]
      : [{ boxShadow: `0 0 0 0 ${ember}` }, { boxShadow: `0 0 0 10px transparent` }],
    still ? { duration: 2400 } : { duration: 800, iterations: 3 },
  );
}

/** Notices the steps that are done by changing something, rather than by opening a view. */
function Detect({ wanted }: { wanted: ReadonlySet<StepId> }) {
  const { docs, horizon } = useWorkspace();
  const allDocs = useStore(docs);
  const releaseId = useStore(horizon);
  const { words } = useSession();
  // Only fetched while a step needs it; the views that show it share the same copy.
  const world = useWorld().data;

  useEffect(() => {
    if (wanted.has("write") && words >= WORDS_TO_START) reached("write");
  }, [wanted, words]);

  useEffect(() => {
    if (wanted.has("horizon") && releaseId) reached("horizon");
  }, [releaseId, wanted]);

  // A link, a secret and a GM-only line are counted against what was there when
  // the project opened: the Cold Open starts a project with some of each.
  const seen = useRef(new Map<string, { links: number; characters: number }>());
  useEffect(() => {
    for (const [nodeId, stats] of Object.entries(allDocs)) {
      // Until the editor has indexed the note, its numbers are placeholders.
      if (stats.links === undefined) continue;
      const before = seen.current.get(nodeId);
      if (before === undefined) {
        seen.current.set(nodeId, { links: stats.links, characters: stats.characters });
        continue;
      }
      if (stats.links > before.links && wanted.has("link")) reached("link");
      // A sample's try-out: the text of a note was changed.
      if (stats.characters !== before.characters && wanted.has("try-fix")) reached("try-fix");
    }
  }, [allDocs, wanted]);

  const counts = useRef<{ knowledge: number; hidden: number } | null>(null);
  useEffect(() => {
    if (!world) return;
    const now = { knowledge: world.knowledge.length, hidden: world.facts.filter((fact) => fact.reveal === NEVER).length };
    counts.current ??= now;
    if (wanted.has("secret") && now.knowledge > counts.current.knowledge) reached("secret");
    if (wanted.has("gm-note") && now.hidden > counts.current.hidden) reached("gm-note");
  }, [wanted, world]);

  return null;
}

const COLLAPSED_KEY = "plotra:getting-started:collapsed";

/** The card. Mounted once, by the shell, over the panes. */
export function GettingStarted() {
  const state = useGettingStarted();
  const [collapsed, setCollapsed] = useState(false);
  const [openId, setOpenId] = useState<StepId | null>(null);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
      if (localStorage.getItem(COLLAPSED_KEY) === "1") setCollapsed(true);
    } catch {}
  }, []);
  const collapse = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {}
  };

  const steps = state?.steps;
  const done = state?.done;
  const wanted = useMemo(() => new Set((steps ?? []).filter((step) => !done?.has(step.id)).map((step) => step.id)), [done, steps]);

  // Saves what was done here and isn't saved yet. One request at a time; whatever arrives meanwhile goes in the next.
  const saving = useRef(false);
  const savedKey = state?.saved.join(",");
  const refresh = state?.refresh;
  useEffect(() => {
    if (!done || !refresh || saving.current) return;
    const saved = new Set(savedKey ? savedKey.split(",") : []);
    // Only this checklist's steps: a step of another one, done in passing, is that one's to tick.
    const unsaved = (steps ?? []).map((step) => step.id).filter((id) => done.has(id) && !saved.has(id));
    if (!unsaved.length) return;
    saving.current = true;
    void updateGettingStarted({ done: unsaved })
      .then(refresh)
      .catch(() => {
        // Offline: it stays ticked here and is sent again when something else is done.
      })
      .finally(() => (saving.current = false));
  }, [done, refresh, savedKey, steps]);

  if (!state || !steps || !done || state.dismissed) return null;
  const count = steps.filter((step) => done.has(step.id)).length;
  const finished = count === steps.length;
  // The step to do next is open unless another was chosen.
  const shown = openId ?? steps.find((step) => !done.has(step.id))?.id ?? null;

  return (
    <section aria-label={state.title} className="absolute right-4 bottom-4 z-30 w-[min(19rem,calc(100%-2rem))] rounded-lg border bg-popover text-popover-foreground shadow-lg">
      {wanted.size > 0 && <Detect wanted={wanted} />}
      <header className="flex h-10 items-center gap-2 pr-1.5 pl-3">
        <button type="button" aria-expanded={!collapsed} onClick={() => collapse(!collapsed)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-ui-sm font-medium">
          <Icon name={collapsed ? "alt-arrow-right-linear" : "alt-arrow-down-linear"} className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{state.title}</span>
          <span className="shrink-0 font-normal text-muted-foreground tabular-nums">
            {count} of {steps.length}
          </span>
        </button>
        <button
          type="button"
          aria-label={`Close “${state.title}” for good`}
          title="Close for good. You can bring it back from the account menu."
          onClick={() => state.setDismissed(true)}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Icon name="close-linear" className="size-3.5" />
        </button>
      </header>
      {!collapsed && (
        <div className="border-t px-1.5 py-1.5">
          <ol>
            {steps.map((step) => (
              <Row key={step.id} step={step} done={done.has(step.id)} open={shown === step.id} onOpen={() => setOpenId(step.id)} />
            ))}
          </ol>
          {finished && (
            <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">
              {state.finished}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ step, done, open, onOpen }: { step: Step; done: boolean; open: boolean; onOpen: () => void }) {
  const { modules } = useWorkspace();
  // The step needs a module this project hasn't switched on yet.
  const missing = step.module && !modules.has(step.module) ? step.module : null;
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          onOpen();
          if (step.guide) pointAt(step.guide);
        }}
        className="flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left text-ui-sm hover:bg-accent"
      >
        <span
          className={cn("mt-px grid size-4 shrink-0 place-items-center rounded-full border", done ? "border-teal bg-teal text-background" : "border-input")}
        >
          {done && <Icon name="check-read-linear" className="size-3" />}
        </span>
        <span className="min-w-0">
          <span className={cn("block", done && "text-muted-foreground line-through decoration-border")}>
            {step.label}
            <span className="sr-only">{done ? " (done)" : " (not done yet)"}</span>
          </span>
          {open && !done && <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{step.how}</span>}
        </span>
      </button>
      {open && !done && missing && (
        <button type="button" onClick={() => offerModule(missing)} className="mb-1.5 ml-[30px] flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs hover:bg-accent">
          <Icon name={moduleMeta[missing].icon} className="size-3.5" />
          Turn on {moduleMeta[missing].label}
        </button>
      )}
    </li>
  );
}
