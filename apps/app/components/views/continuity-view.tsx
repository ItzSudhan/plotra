"use client";

import { Icon, type IconName } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { reached, useReached } from "@/components/onboarding/reached";
import { PropertyDisplay, useKindDefs } from "@/components/workspace/properties";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useStory } from "@/components/workflow/data";
import { useWorld } from "@/components/world/data";
import { formatDate, gregorian, GREGORIAN_ID, type Calendar } from "@/lib/calendar";
import { buildSheet, checkContinuity, rules, type ContinuityInput, type Issue, type RuleId, type Severity } from "@/lib/continuity";
import { read } from "@/lib/read";
import { relationshipMeta } from "@/lib/story";
import { flatten, type BinderNode } from "@/lib/tree";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { EmptyState, Segmented, ToolButton, Toolbar, ToolbarSelect } from "./view-ui";
import { plural } from "@/lib/plural";

// Continuity (plan.md 2.8): rule-based warnings (a character appears after
// their death, ages that don't match the timeline, someone in two places at
// once, a closed plot thread picked up again…) and a continuity sheet per
// character, built from properties, scene links and who-knows-what.

type Tab = "checks" | "sheets";
type ProjectLink = { source: string; target: string; kind: string };

const severityMeta: Record<Severity, { label: string; icon: IconName; className: string }> = {
  error: { label: "Contradictions", icon: "danger-circle-linear", className: "text-destructive" },
  warning: { label: "Worth a look", icon: "danger-triangle-linear", className: "text-gold-ink" },
  info: { label: "Notes", icon: "info-circle-linear", className: "text-muted-foreground" },
};

const dismissedKey = (projectId: string) => `plotra:continuity-dismissed:${projectId}`;
const calendarKey = (projectId: string) => `plotra:continuity-calendar:${projectId}`;

/** Everything the checks read, gathered from the workspace's own stores. */
function useContinuityInput(calendar: Calendar, tick: number): ContinuityInput | null {
  const { project, binder } = useWorkspace();
  const { index } = useStore(binder);
  const story = useStory().data;
  const world = useWorld().data;
  const [links, setLinks] = useState<ProjectLink[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    read("getProjectLinks", project.id)
      .then((l) => !cancelled && setLinks(l))
      .catch(() => !cancelled && setLinks([]));
    return () => {
      cancelled = true;
    };
  }, [project.id, tick]);

  return useMemo(() => {
    if (!story || !world || !links) return null;
    return {
      nodes: flatten(index),
      links,
      threads: story.threads,
      cells: story.cells,
      knowledge: world.knowledge,
      setups: world.setups,
      relationships: story.relationships,
      calendar,
    };
  }, [calendar, index, links, story, world]);
}

export function ContinuityView({ nodeId }: { nodeId?: string }) {
  useReached("try-report");
  const { project, binder } = useWorkspace();
  const story = useStory().data;
  const [tab, setTab] = useState<Tab>(nodeId ? "sheets" : "checks");
  const [tick, setTick] = useState(0);
  const [calendarId, setCalendarId] = useState<string>(GREGORIAN_ID);

  // Story dates are read in one calendar: the one a timeline uses, unless chosen here.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(calendarKey(project.id));
    } catch {}
    const fromTimeline = binder.get().nodes.find((n) => n.kind === "timeline" && !n.deletedAt && typeof n.settings.calendarId === "string")?.settings.calendarId;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
    setCalendarId(saved ?? (typeof fromTimeline === "string" ? fromTimeline : GREGORIAN_ID));
  }, [binder, project.id]);

  const calendars = useMemo<Calendar[]>(() => [gregorian, ...(story?.calendars ?? [])], [story?.calendars]);
  const calendar = calendars.find((c) => c.id === calendarId) ?? gregorian;
  const input = useContinuityInput(calendar, tick);

  return (
    <div className="flex h-full flex-col">
      <Toolbar>
        <span className="font-medium text-foreground">Continuity</span>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "checks", label: "Checks" },
            { value: "sheets", label: "Character sheets" },
          ]}
        />
        {calendars.length > 1 && (
          <ToolbarSelect
            label="Calendar"
            value={calendar.id}
            onChange={(id) => {
              setCalendarId(id);
              try {
                localStorage.setItem(calendarKey(project.id), id);
              } catch {}
            }}
            options={calendars.map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
        <ToolButton icon="refresh-linear" label="Check again" onClick={() => setTick((t) => t + 1)} />
        <span className="ml-auto text-xs text-faint">Rule-based: reads story dates, links, plot threads and who knows what. No AI.</span>
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-auto">
        {!input ? (
          <div className="m-6 h-40 animate-pulse rounded-lg bg-muted" />
        ) : tab === "checks" ? (
          <Checks input={input} />
        ) : (
          <Sheets input={input} initialId={nodeId} />
        )}
      </div>
    </div>
  );
}

function Checks({ input }: { input: ContinuityInput }) {
  const { project, binder, openNode, openView } = useWorkspace();
  const { index } = useStore(binder);
  const issues = useMemo(() => checkContinuity(input), [input]);
  // A check that finds fewer problems than the one before: something was fixed (a sample's try-out ends on this).
  const found = useRef(issues.length);
  useEffect(() => {
    if (issues.length < found.current) reached("try-clear");
    found.current = issues.length;
  }, [issues.length]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [showDismissed, setShowDismissed] = useState(false);
  const [rule, setRule] = useState<RuleId | "all">("all");

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
      setDismissed(new Set(JSON.parse(localStorage.getItem(dismissedKey(project.id)) ?? "[]") as string[]));
    } catch {}
  }, [project.id]);

  const toggle = (id: string) =>
    setDismissed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      try {
        localStorage.setItem(dismissedKey(project.id), JSON.stringify([...next]));
      } catch {}
      return next;
    });

  const active = issues.filter((i) => !dismissed.has(i.id));
  const shown = (showDismissed ? issues : active).filter((i) => rule === "all" || i.rule === rule);
  const usedRules = [...new Set(issues.map((i) => i.rule))];
  const scenes = input.nodes.filter((n) => n.kind === "scene");
  const dated = scenes.filter((n) => typeof n.properties["story-date"] === "string" && n.properties["story-date"]).length;

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5 p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui-sm text-muted-foreground">
        <span className={cn("font-medium", active.length ? "text-foreground" : "text-teal-ink")}>
          {active.length === 0 ? "No continuity problems found." : `${active.length} ${plural(active.length, "thing")} to look at`}
        </span>
        <span>
          {dated} of {scenes.length} scenes have a story date
        </span>
        {usedRules.length > 1 && (
          <ToolbarSelect
            label="Rule"
            value={rule}
            onChange={setRule}
            options={[{ value: "all", label: "Every rule" }, ...usedRules.map((r) => ({ value: r, label: rules[r].label }))]}
          />
        )}
        {dismissed.size > 0 && (
          <label className="ml-auto flex items-center gap-1.5">
            <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} />
            Show {dismissed.size} dismissed
          </label>
        )}
      </div>

      {issues.length === 0 && (
        <EmptyState
          icon="shield-check-bold-duotone"
          title="Nothing contradicts itself"
          action={{ label: "Track secrets and setups", icon: "incognito-linear", onClick: () => openView("knowledge") }}
        >
          The checks read each scene&apos;s story date, duration, point of view and location; characters&apos; “Born” and “Died” dates; plot threads marked
          as resolved; and the secrets and setups you track. The more of those you fill in, the more they can catch.
        </EmptyState>
      )}

      {(["error", "warning", "info"] as const).map((severity) => {
        const list = shown.filter((i) => i.severity === severity);
        if (!list.length) return null;
        const meta = severityMeta[severity];
        return (
          <section key={severity}>
            <h2 className={cn("mb-2 flex items-center gap-1.5 text-meta font-medium", meta.className)}>
              <Icon name={meta.icon} className="size-4" />
              {meta.label} ({list.length})
            </h2>
            <ul className="grid gap-1.5">
              {list.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  dismissed={dismissed.has(issue.id)}
                  onDismiss={() => toggle(issue.id)}
                  nodes={issue.nodeIds.map((id) => index.byId.get(id)).filter((n): n is BinderNode => Boolean(n))}
                  onOpen={(id) => {
                    reached("try-scene");
                    openNode(id, "tab");
                  }}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function IssueRow({
  issue,
  nodes,
  dismissed,
  onDismiss,
  onOpen,
}: {
  issue: Issue;
  nodes: BinderNode[];
  dismissed: boolean;
  onDismiss: () => void;
  onOpen: (nodeId: string) => void;
}) {
  return (
    <li className={cn("group flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5", dismissed && "opacity-50")}>
      <div className="min-w-0 flex-1">
        <p className="text-meta font-medium text-faint">{rules[issue.rule].label}</p>
        <p className="mt-0.5 text-sm leading-snug">{issue.message}</p>
        <p className="mt-1.5 flex flex-wrap gap-1">
          {nodes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onOpen(n.id)}
              className="flex h-6 max-w-56 items-center gap-1 rounded-md border px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Icon name="square-arrow-right-up-linear" className="size-3 shrink-0" />
              <span className="truncate">{n.title}</span>
            </button>
          ))}
        </p>
      </div>
      <Tooltip content={dismissed ? "Bring this back" : "It's intentional: hide it (on this device)"}>
        <button
          type="button"
          onClick={onDismiss}
          className="h-8 shrink-0 rounded-md px-2 text-xs text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 pointer-coarse:opacity-100"
        >
          {dismissed ? "Restore" : "Dismiss"}
        </button>
      </Tooltip>
    </li>
  );
}

function Sheets({ input, initialId }: { input: ContinuityInput; initialId?: string }) {
  const { binder, openNode, openView, project, actions } = useWorkspace();
  const { index } = useStore(binder);
  const characters = useMemo(() => input.nodes.filter((n) => n.kind === "character").sort((a, b) => a.title.localeCompare(b.title)), [input.nodes]);
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null);
  const character = index.byId.get(selectedId ?? "") ?? index.byId.get(characters[0]?.id ?? "");
  const sheet = useMemo(() => (character ? buildSheet(input, character.id) : null), [character, input]);
  const defs = useKindDefs("character");
  const cal = input.calendar;

  if (characters.length === 0) {
    return (
      <EmptyState
        icon="user-rounded-linear"
        title="No characters yet"
        action={project.actions.includes("edit") && { label: "New character", onClick: () => void actions.create("character") }}
      >
        Create a character and their continuity sheet builds itself here.
      </EmptyState>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <nav aria-label="Characters" className="w-52 shrink-0 overflow-y-auto border-r bg-sidebar p-1.5">
        {characters.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSelectedId(c.id)}
            className={cn(
              "flex h-7 w-full items-center rounded-md px-2 text-left text-ui-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              character?.id === c.id && "bg-sidebar-accent text-foreground",
            )}
          >
            <span className="truncate">{c.title}</span>
          </button>
        ))}
      </nav>
      {character && sheet && (
        <article className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl leading-tight tracking-tight">{character.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {sheet.born !== null ? `Born ${formatDate(cal, sheet.born, "day")}` : "No birth date"}
                {sheet.died !== null && ` · died ${formatDate(cal, sheet.died, "day")}`} · in {sheet.rows.length} {plural(sheet.rows.length, "scene")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openNode(character.id, "tab")}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-ui-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Icon name="pen-linear" className="size-3.5" />
              Open note
            </button>
          </div>

          <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_16rem]">
            <section className="min-w-0">
              <h2 className="mb-2 text-meta font-medium text-muted-foreground">
                Through the story ({sheet.chronological ? "in story order" : "in reading order: not every scene is dated"})
              </h2>
              {sheet.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Not in any scene yet. A character is in a scene when they&apos;re its point of view, or the scene links to them with <kbd className="font-sans">[[</kbd>.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[36rem] border-separate border-spacing-0 text-ui-sm">
                    <thead>
                      <tr className="text-left text-meta font-medium text-muted-foreground">
                        {["Scene", "When", "Age", "Where", "Learns"].map((h) => (
                          <th key={h} className="border-b bg-sidebar px-3 py-1.5 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.rows.map((row) => {
                        const dead = sheet.died !== null && row.date !== null && row.date > sheet.died;
                        return (
                          <tr key={row.sceneId} className="align-top">
                            <td className="border-b px-3 py-1.5">
                              <button type="button" onClick={() => openNode(row.sceneId, "tab")} className="text-left font-medium hover:underline">
                                {row.title}
                              </button>
                              {row.pov && <span className="ml-1.5 rounded bg-muted px-1 text-meta text-muted-foreground">POV</span>}
                            </td>
                            <td className="border-b px-3 py-1.5 whitespace-nowrap text-muted-foreground">{row.date !== null ? formatDate(cal, row.date, "day") : "—"}</td>
                            <td className={cn("border-b px-3 py-1.5 tabular-nums", dead && "text-destructive")}>{dead ? "dead" : (row.age ?? "—")}</td>
                            <td className="border-b px-3 py-1.5">
                              {row.locationId ? (
                                <button type="button" onClick={() => openNode(row.locationId!, "tab")} className="text-left text-muted-foreground hover:text-ember-ink">
                                  {index.byId.get(row.locationId)?.title}
                                </button>
                              ) : (
                                <span className="text-faint">—</span>
                              )}
                            </td>
                            <td className="border-b px-3 py-1.5">
                              {row.learns.length === 0 ? (
                                <span className="text-faint">—</span>
                              ) : (
                                <ul className="grid gap-0.5">
                                  {row.learns.map((k) => (
                                    <li key={k.factNodeId}>
                                      <button type="button" onClick={() => openNode(k.factNodeId, "tab")} className="text-left hover:text-ember-ink">
                                        {index.byId.get(k.factNodeId)?.title}
                                      </button>
                                      {k.layer === "belief" && <span className="ml-1 text-meta text-faint">(a false version)</span>}
                                      {k.note && <span className="block text-xs text-muted-foreground">{k.note}</span>}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {sheet.knownFromStart.length > 0 && (
                <p className="mt-3 text-ui-sm text-muted-foreground">
                  Knew from the start:{" "}
                  {sheet.knownFromStart.map((k, i) => (
                    <span key={k.factNodeId}>
                      {i > 0 && ", "}
                      <button type="button" onClick={() => openNode(k.factNodeId, "tab")} className="text-foreground hover:text-ember-ink">
                        {index.byId.get(k.factNodeId)?.title}
                      </button>
                    </span>
                  ))}
                </p>
              )}
              <button type="button" onClick={() => openView("knowledge")} className="mt-2 text-xs text-ember-ink hover:underline">
                Track what {character.title} knows
              </button>
            </section>

            <aside className="grid content-start gap-5">
              <dl className="grid gap-2 rounded-lg border bg-card p-3 text-ui-sm">
                {defs.map((def) => (
                  <div key={def.id} className="grid gap-0.5">
                    <dt className="text-meta font-medium text-faint">{def.label}</dt>
                    <dd className="min-w-0">
                      <PropertyDisplay def={def} value={character.properties[def.key]} />
                    </dd>
                  </div>
                ))}
              </dl>
              {sheet.relationships.length > 0 && (
                <div>
                  <h2 className="mb-1.5 text-meta font-medium text-faint">Relationships</h2>
                  <ul className="grid gap-1 text-ui-sm">
                    {sheet.relationships.map((r, i) => {
                      const meta = relationshipMeta(r.type);
                      return (
                        <li key={i} className="flex items-center gap-1.5">
                          <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
                          <span className="text-muted-foreground">
                            {r.label || meta.label}
                            {r.directed && !r.outgoing ? " (of them)" : ""}:
                          </span>
                          <button type="button" onClick={() => setSelectedId(r.otherId)} className="truncate hover:text-ember-ink">
                            {index.byId.get(r.otherId)?.title}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </aside>
          </div>
        </article>
      )}
    </div>
  );
}
