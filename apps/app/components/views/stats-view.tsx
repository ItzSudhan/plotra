"use client";

import { Icon, type IconName } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PREFS_NOTICE, usePrefs } from "@/components/notify/data";
import { useSession } from "@/components/stats/session";
import { sharedResource } from "@/components/workflow/data";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { errorText } from "@/lib/errors";
import { updateUserPrefs } from "@/lib/notify-actions";
import { updateProjectSettings } from "@/lib/project-actions";
import { read } from "@/lib/read";
import { fillDays, streaks, TARGET_KEY, type WritingDay } from "@/lib/stats";
import type { StatsScope, WritingStats } from "@/lib/stats-actions";
import type { BinderNode, NodeIndex } from "@/lib/tree";
import { CommitInput, Segmented, Toolbar } from "./view-ui";
import { plural } from "@/lib/plural";

// Stats (plan.md 2.3 "session goals", Phase 10 "Writing goals/stats
// dashboard"): words written per day, the streak, the project against its
// target, and notes against theirs.
//
// Two different counts meet here and the labels keep them apart. "Project"
// is the project's words, whoever wrote them, as notes are saved; "You" is
// what you typed, as your browser reported it (pastes left out). "Today", the
// streak and the chart follow the switch. "This session" is what you typed in
// this tab.

const useStatsResource = sharedResource<WritingStats>();

const dayLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const longDay = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
const n = (value: number) => value.toLocaleString("en");

/** Words in a note and everything under it that isn't in the trash. */
function wordsUnder(index: NodeIndex, node: BinderNode): number {
  let words = node.wordCount;
  for (const child of index.children.get(node.id) ?? []) if (!child.deletedAt) words += wordsUnder(index, child);
  return words;
}

export function StatsView() {
  const { project, binder, openNode, notify, projectChanged } = useWorkspace();
  const { nodes, index } = useStore(binder);
  const { data: prefs, refresh: refreshPrefs } = usePrefs();
  const session = useSession();
  const [range, setRange] = useState<"30" | "90">("30");
  const [scope, setScope] = useState<StatsScope>("project");
  const [table, setTable] = useState(false);
  const canEdit = project.actions.includes("edit");

  const timeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "UTC";
    }
  }, []);
  const { data: stats, refresh } = useStatsResource(`${project.id}/${timeZone}/${scope}`, () => read("getWritingStats", project.id, timeZone, scope), null);
  const whose = scope === "me" ? "typed by you" : "project-wide";

  // The binder's word counts move when a save lands; the day's total moved with it.
  const projectWords = nodes.reduce((sum, node) => sum + (node.deletedAt ? 0 : node.wordCount), 0);
  useEffect(() => {
    const soon = setTimeout(refresh, 1500);
    return () => clearTimeout(soon);
  }, [projectWords, refresh]);

  const dailyGoal = prefs?.dailyGoal ?? null;
  const sessionGoal = prefs?.sessionGoal ?? null;
  const target = project.settings.wordTarget ?? null;
  const today = stats?.days.find((d) => d.day === stats.today)?.added ?? 0;
  const streak = stats ? streaks(stats.days, stats.today, dailyGoal) : { current: 0, longest: 0 };
  const shown = stats ? fillDays(stats.days, stats.today, Number(range)) : [];
  const total = shown.reduce((sum, d) => sum + d.added, 0);
  const active = shown.filter((d) => d.added > 0).length;

  const withTargets = nodes
    .filter((node) => !node.deletedAt && typeof node.properties[TARGET_KEY] === "number" && (node.properties[TARGET_KEY] as number) > 0)
    .map((node) => ({ node, words: wordsUnder(index, node), target: node.properties[TARGET_KEY] as number }));

  const saveGoal = async (field: "dailyGoal" | "sessionGoal", text: string) => {
    try {
      await updateUserPrefs({ [field]: text.trim() ? Number(text) : null });
      refreshPrefs();
      notify(PREFS_NOTICE);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const saveTarget = async (text: string) => {
    try {
      await updateProjectSettings(project.id, { wordTarget: text.trim() ? Number(text) : null });
      projectChanged();
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <Toolbar>
        <span className="font-medium">Stats</span>
        <span className="truncate text-muted-foreground">for {project.title}</span>
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-3xl gap-6 px-4 py-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon="pen-linear" label="Today" value={n(today)} goal={dailyGoal} note={dailyGoal ? `of ${n(dailyGoal)} words, ${whose}` : `words added, ${whose}`} />
            <Tile
              icon="fire-linear"
              label="Streak"
              value={`${n(streak.current)} ${plural(streak.current, "day")}`}
              note={streak.longest > streak.current ? `Longest: ${n(streak.longest)} days` : dailyGoal ? "Days in a row at your goal" : "Days in a row with writing"}
            />
            <Tile icon="target-linear" label="Project" value={n(projectWords)} goal={target} note={target ? `of ${n(target)} words` : "words in the project"} />
            <Tile
              icon="clock-circle-linear"
              label="This session"
              value={n(Math.max(session.words, 0))}
              goal={sessionGoal}
              note={sessionGoal ? `of ${n(sessionGoal)} words, typed by you` : "words typed by you"}
              action={
                <button type="button" onClick={session.reset} className="rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                  Start over
                </button>
              }
            />
          </div>

          <section aria-labelledby="stats-chart-title" className="grid gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 id="stats-chart-title" className="text-sm font-medium">
                Words added per day
              </h2>
              <span className="text-ui-sm text-muted-foreground">
                {n(total)} in {range} days, on {active} of them
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Segmented
                  value={scope}
                  onChange={setScope}
                  options={[
                    { value: "project", label: "Project" },
                    { value: "me", label: "You" },
                  ]}
                />
                <Segmented
                  value={range}
                  onChange={setRange}
                  options={[
                    { value: "30", label: "30 days" },
                    { value: "90", label: "90 days" },
                  ]}
                />
                <button
                  type="button"
                  aria-pressed={table}
                  onClick={() => setTable(!table)}
                  className={cn("h-7 rounded-md border border-input px-2 text-meta text-muted-foreground hover:text-foreground", table && "bg-accent text-foreground")}
                >
                  Table
                </button>
              </div>
            </div>
            {!stats ? (
              <div className="h-44 animate-pulse rounded-lg bg-muted" />
            ) : table ? (
              <DayTable days={shown} goal={dailyGoal} />
            ) : (
              <DayChart days={shown} goal={dailyGoal} today={stats.today} />
            )}
            <p className="text-xs text-muted-foreground">
              {scope === "me"
                ? "What you typed, in any browser, as it reported it. Pasting, dropping text in and restoring a version don't count. Only you see this."
                : "Everyone\u2019s typing in this project added up, so a co-writer\u2019s words are in here too. Pasting, importing, restoring a version and the AI\u2019s edits don\u2019t count."}{" "}
              Days end at midnight in {stats?.timeZone.replaceAll("_", " ") ?? "your time zone"}.
            </p>
          </section>

          <section aria-labelledby="stats-goals-title" className="grid gap-3">
            <h2 id="stats-goals-title" className="text-sm font-medium">
              Goals
            </h2>
            <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-3">
              <GoalField label="Daily goal" hint="Yours, in every project. Words a day." value={dailyGoal} disabled={!prefs} onCommit={(v) => void saveGoal("dailyGoal", v)} />
              <GoalField label="Session goal" hint="Yours. Shown in the status bar." value={sessionGoal} disabled={!prefs} onCommit={(v) => void saveGoal("sessionGoal", v)} />
              <GoalField
                label="Project target"
                hint={canEdit ? "For everyone. The finished length." : "Set by the project's editors."}
                value={target}
                disabled={!canEdit}
                onCommit={(v) => void saveTarget(v)}
              />
            </div>
          </section>

          <section aria-labelledby="stats-notes-title" className="grid gap-3">
            <h2 id="stats-notes-title" className="text-sm font-medium">
              Notes with a target
            </h2>
            {withTargets.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-5 text-ui-sm text-muted-foreground">
                None yet. Open a chapter, and in the inspector&apos;s Properties set <span className="text-foreground">Target words</span>. A chapter counts the scenes inside it.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border bg-card">
                {withTargets.map(({ node, words, target: goal }) => (
                  <li key={node.id}>
                    <button type="button" onClick={() => openNode(node.id, "tab")} className="grid w-full gap-1.5 px-4 py-2.5 text-left hover:bg-accent/50">
                      <span className="flex items-baseline gap-3 text-ui-sm">
                        <span className="min-w-0 flex-1 truncate font-medium">{node.title}</span>
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          {n(words)} of {n(goal)}
                        </span>
                      </span>
                      <Progress value={words} goal={goal} label={`${node.title}: ${n(words)} of ${n(goal)} words`} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** A bar towards a goal. Past the goal it stays full, and says so in its label. */
function Progress({ value, goal, label }: { value: number; goal: number; label: string }) {
  const done = Math.min(Math.max(value, 0) / goal, 1);
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(Math.max(value, 0), goal)} className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full", done >= 1 ? "bg-teal" : "bg-ember")} style={{ width: `${done * 100}%` }} />
    </div>
  );
}

function Tile({ icon, label, value, note, goal, action }: { icon: IconName; label: string; value: string; note: string; goal?: number | null; action?: React.ReactNode }) {
  const numeric = Number(value.replace(/[^\d.-]/g, ""));
  return (
    <div className="grid content-start gap-1.5 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-meta font-medium text-muted-foreground">
        <Icon name={icon} className="size-3.5" />
        {label}
        {goal && numeric >= goal ? (
          <span className="ml-auto flex items-center gap-1 text-foreground">
            <Icon name="check-read-linear" className="size-3.5 text-teal-ink" />
            Reached
          </span>
        ) : null}
      </div>
      <p className="font-display text-3xl leading-none tabular-nums">{value}</p>
      {goal ? <Progress value={numeric} goal={goal} label={`${label}: ${value} of ${n(goal)}`} /> : null}
      <p className="flex flex-wrap items-center justify-between gap-x-2 text-xs text-muted-foreground">
        {note}
        {action}
      </p>
    </div>
  );
}

function GoalField({ label, hint, value, disabled, onCommit }: { label: string; hint: string; value: number | null; disabled?: boolean; onCommit: (value: string) => void }) {
  return (
    <label className="grid content-start gap-1">
      <span className="text-ui-sm font-medium">{label}</span>
      <CommitInput type="number" value={value ? String(value) : ""} placeholder="No goal" disabled={disabled} onCommit={onCommit} className="h-8 tabular-nums" />
      <span className="text-xs text-muted-foreground">{hint}</span>
    </label>
  );
}

/**
 * One bar per day, one colour: there is a single series, so the heading names
 * it and no legend is needed. The goal is a labelled line rather than a second
 * colour, and the Table button gives the same numbers as text.
 */
function DayChart({ days, goal, today }: { days: WritingDay[]; goal: number | null; today: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const top = Math.max(...days.map((d) => d.added), goal ?? 0, 1);
  // A round number at or above the tallest bar, so the one gridline has a sensible label.
  const step = 10 ** Math.floor(Math.log10(top));
  const max = Math.ceil(top / step) * step;
  const dense = days.length > 45;
  const ticks = [0, Math.floor((days.length - 1) / 2), days.length - 1];
  const hovered = hover === null ? null : days[hover];

  return (
    <div className="rounded-lg border bg-card p-3 pt-6">
      <div
        role="img"
        aria-label={`Bar chart of words added per day over the last ${days.length} days. The most in one day was ${n(Math.max(...days.map((d) => d.added)))}. Use the Table button for each day's number.`}
        className="relative h-40"
        onMouseLeave={() => setHover(null)}
      >
        <span className="absolute -top-4 left-0 text-meta text-muted-foreground tabular-nums">{n(max)} words</span>
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-border" />
        <div className="absolute inset-x-0 bottom-0 border-t border-border" />
        {goal ? (
          <div className="pointer-events-none absolute inset-x-0 z-10 border-t border-foreground/40" style={{ bottom: `${(goal / max) * 100}%` }}>
            <span className="absolute right-0 -top-4 rounded-sm bg-card px-1 text-meta text-muted-foreground tabular-nums">Goal {n(goal)}</span>
          </div>
        ) : null}
        <div className={cn("absolute inset-0 flex items-end", dense ? "gap-px" : "gap-0.5")}>
          {days.map((d, i) => (
            // The whole column is the hover target, so a short bar is as easy to hit as a tall one.
            <div key={d.day} className="relative flex h-full min-w-0 flex-1 items-end" onMouseEnter={() => setHover(i)}>
              <div
                className={cn("w-full bg-ember", dense ? "rounded-t-xs" : "rounded-t-sm", hover !== null && hover !== i && "opacity-45", d.day === today && d.added === 0 && "bg-border")}
                style={{ height: d.added > 0 ? `max(2px, ${(d.added / max) * 100}%)` : d.day === today ? "2px" : 0 }}
              />
            </div>
          ))}
        </div>
        {hovered && hover !== null && (
          <div
            className="pointer-events-none absolute -top-5 z-20 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md"
            style={{ left: `clamp(4.5rem, ${((hover + 0.5) / days.length) * 100}%, calc(100% - 4.5rem))` }}
          >
            <span className="font-medium tabular-nums">{n(hovered.added)} words</span>
            <span className="text-muted-foreground"> · {longDay.format(asDate(hovered.day))}</span>
            {hovered.removed > 0 && <span className="text-muted-foreground"> · {n(hovered.removed)} cut</span>}
          </div>
        )}
      </div>
      <div className="relative mt-1 h-4 text-meta text-muted-foreground">
        {ticks.map((i, at) => (
          <span key={i} className={cn("absolute", at === 0 ? "left-0" : at === 2 ? "right-0" : "left-1/2 -translate-x-1/2")}>
            {i === days.length - 1 ? "Today" : dayLabel.format(asDate(days[i].day))}
          </span>
        ))}
      </div>
    </div>
  );
}

function DayTable({ days, goal }: { days: WritingDay[]; goal: number | null }) {
  return (
    <div className="max-h-72 overflow-y-auto rounded-lg border bg-card">
      <table className="w-full text-ui-sm">
        <thead className="sticky top-0 bg-card text-left text-meta text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Day
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Added
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Cut
            </th>
            {goal ? (
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Goal
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y">
          {[...days].reverse().map((d) => (
            <tr key={d.day}>
              <th scope="row" className="px-3 py-1.5 text-left font-normal">
                {longDay.format(asDate(d.day))}
              </th>
              <td className="px-3 py-1.5 text-right tabular-nums">{n(d.added)}</td>
              <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">{n(d.removed)}</td>
              {goal ? <td className="px-3 py-1.5 text-right text-muted-foreground">{d.added >= goal ? "Reached" : "Not reached"}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
