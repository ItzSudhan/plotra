"use client";

import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { useMemo } from "react";
import { usePrefs } from "@/components/notify/data";
import { useSession } from "@/components/stats/session";
import { formatHotkey } from "@/components/workspace/hotkeys";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useEffectiveShell } from "@/components/workspace/shell-prefs";
import { homeLayout, type HomeBlock } from "@/lib/shell-prefs";
import { boardKinds } from "@/lib/story";
import { isTrashed, nodeKindMeta } from "@/lib/tree";
import { moduleMeta } from "@/lib/modules";
import { pointAt, useGettingStarted } from "./getting-started";
import { offerModule } from "./module-prompt";
import { plural } from "@/lib/plural";

const RECENT = 4;

/**
 * What the panes show when nothing is open (onboarding-plan.md 3): the notes
 * last worked on, to carry on with; how far the session has got; the next
 * "Getting started" step, while there is one; and the shortcuts. A project
 * with nothing in it offers its first scene instead. Which of these blocks
 * are shown, and in what order, is each person's own (lib/shell-prefs.ts).
 */
export function ProjectHome() {
  const { project, commands, actions, binder, openNode, openView, modules } = useWorkspace();
  const { nodes, index } = useStore(binder);
  const canEdit = project.actions.includes("edit");
  const hotkey = (id: string) => commands.find((c) => c.id === id)?.hotkey;

  // The notes changed most recently. Folders aren't something to carry on writing in.
  const recent = useMemo(
    () =>
      nodes
        .filter((n) => n.kind !== "folder" && !isTrashed(index, n.id))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, RECENT),
    [index, nodes],
  );

  const shell = useEffectiveShell();
  const started = useGettingStarted();
  const next = started && !started.dismissed ? started.steps.find((step) => !started.done.has(step.id)) : undefined;

  const { words } = useSession();
  const goal = usePrefs().data?.sessionGoal ?? null;
  const written = Math.max(words, 0);
  const projectWords = nodes.reduce((sum, n) => sum + (n.deletedAt ? 0 : n.wordCount), 0);

  const quickNew = commands.find((c) => c.id === "binder.new-note");
  const shortcuts = [
    // The quick New makes the project's main kind ("New scene", "New session").
    ...(canEdit && quickNew ? [{ id: "binder.new-note", label: quickNew.title, run: quickNew.run }] : []),
    { id: "palette.files", label: "Open a note" },
    { id: "palette.commands", label: "All commands" },
  ];

  // Each block of the home; which are shown, and in what order, is the person's choice (Customize).
  const row = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent";
  const heading = "text-ui-sm font-medium text-muted-foreground";
  const blocks: Record<HomeBlock, React.ReactNode> = {
    recent: (
      <section key="recent" aria-label={recent.length ? "Carry on" : "Start"} className="rounded-lg border bg-card p-1.5">
        {recent.length === 0 ? (
          canEdit ? (
            <button type="button" onClick={() => void actions.create("scene")} className={row}>
              <Icon name="pen-new-square-linear" className="size-4 shrink-0 text-ember-ink" />
              Write the first scene
            </button>
          ) : (
            <p className="px-2.5 py-2 text-sm text-muted-foreground">Nothing has been written here yet.</p>
          )
        ) : (
          <>
            <h2 className={cn(heading, "px-2.5 pt-1.5 pb-1")}>Carry on</h2>
            <ul>
              {recent.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => openNode(n.id, "tab")} className={row}>
                    <Icon name={nodeKindMeta[n.kind].icon} className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{n.title}</span>
                    {!boardKinds.includes(n.kind) && <span className="shrink-0 text-xs text-faint tabular-nums">{n.wordCount.toLocaleString()} words</span>}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    ),
    goal: (
      <section key="goal" aria-label="This session" className="rounded-lg border bg-card px-4 py-3">
        <h2 className={heading}>This session</h2>
        <p className="mt-1 text-sm">
          <span className="font-medium tabular-nums">{written.toLocaleString()}</span> {plural(written, "word")}
          {goal ? <span className="text-muted-foreground"> of {goal.toLocaleString()}</span> : null}
        </p>
        {goal ? (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(written, goal)}>
            <div className={cn("h-full rounded-full", written >= goal ? "bg-teal" : "bg-ember")} style={{ width: `${Math.min(100, (written / goal) * 100)}%` }} />
          </div>
        ) : (
          <button type="button" onClick={() => openView("stats")} className="mt-1 text-xs text-ember-ink underline-offset-4 hover:underline">
            Set a goal for each sitting
          </button>
        )}
      </section>
    ),
    next: next ? (
      <section key="next" aria-label="Getting started" className="rounded-lg border bg-card px-4 py-3">
        <h2 className={heading}>Next, when you want it</h2>
        <p className="mt-1 text-sm font-medium">{next.label}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{next.how}</p>
        {next.module && !modules.has(next.module) ? (
          <button type="button" onClick={() => offerModule(next.module!)} className="mt-2 text-xs text-ember-ink underline-offset-4 hover:underline">
            Turn on {moduleMeta[next.module].label}
          </button>
        ) : (
          next.guide && (
            <button type="button" onClick={() => pointAt(next.guide!)} className="mt-2 text-xs text-ember-ink underline-offset-4 hover:underline">
              Show me where
            </button>
          )
        )}
      </section>
    ) : null,
    shortcuts: (
      <ul key="shortcuts" className="grid gap-0.5 text-sm">
        {shortcuts.map((s) => {
          const key = hotkey(s.id);
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => (s.run ? s.run() : commands.find((c) => c.id === s.id)?.run())}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {s.label}
                {key && <kbd className="font-sans text-xs text-faint">{formatHotkey(key)}</kbd>}
              </button>
            </li>
          );
        })}
        <li>
          <button type="button" onClick={() => openView("stats")} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground">
            Writing stats and goals
          </button>
        </li>
      </ul>
    ),
  };

  return (
    <div className="grid h-full place-items-center overflow-y-auto bg-background p-6 dot-grid">
      <div className="w-full max-w-md">
        <p className="text-center font-display text-3xl tracking-tight">{project.title}</p>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {projectWords.toLocaleString()} {plural(projectWords, "word")}
        </p>
        <div className="mt-6 grid gap-3">{homeLayout(shell).map((block) => blocks[block])}</div>
      </div>
    </div>
  );
}
