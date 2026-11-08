"use client";

import { lineStatuses, type LineStatus } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { breakdownCategories, categoryMeta, csv, elementReport, formatSeconds, type BreakdownScene, type ScriptLine } from "@/lib/production";
import { setLineState, type LineStateRow, type RecordingSheet, type Storyboard } from "@/lib/production-actions";
import { breakdownByElementSheet, breakdownBySceneSheet, recordingSheet, shotListSheet } from "@/lib/production-print";
import { read } from "@/lib/read";
import { safeUrl } from "@/lib/publish/html";
import { isScriptFormat } from "@/lib/script";
import { defaultFormat } from "@/lib/modules";
import { containerKinds, flatten } from "@/lib/tree";
import { printDate, usePrintSheet } from "./production-print";
import { CommitInput, Divider, EmptyState, errorText, Segmented, ToolButton, Toolbar, ToolbarSelect } from "./view-ui";
import { SelectField } from "@plotra/ui/components/select-field";
import { plural } from "@/lib/plural";

// Production (plan.md 2.8 "Module: Production"): what a script needs, scene by
// scene and element by element; recording sheets for voice and audio scripts,
// with the state of every line; and shot lists read off the storyboards.

type Tab = "breakdown" | "recording" | "shots";

const ALL = "__all";

const lineStatusMeta: Record<LineStatus, { label: string; className: string }> = {
  written: { label: "Written", className: "text-muted-foreground" },
  approved: { label: "Approved", className: "text-gold-ink" },
  recorded: { label: "Recorded", className: "text-teal-ink" },
};

/** A new scene in the project's script format, or a screenplay when the project writes prose. */
function useNewScriptScene() {
  const { project, actions } = useWorkspace();
  const projectFormat = defaultFormat(project.type, project.settings);
  const format = isScriptFormat(projectFormat) ? projectFormat : "screenplay";
  return project.actions.includes("edit") ? () => void actions.create("scene", undefined, undefined, { format }) : null;
}

function save(name: string, text: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "script";

/**
 * Loads a read again whenever its inputs change (Reload bumps one of them).
 * The last result stays on screen while the next one loads.
 */
function useLoaded<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    load()
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(errorText(e));
        toast.error(errorText(e));
      });
    return () => {
      cancelled = true;
    };
    // The loader is tied to the listed inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, retry]);
  return { data, setData, error, retry: () => setRetry((r) => r + 1) };
}

/** The skeleton while a part loads, or what went wrong with a way to try again. */
function Loading({ error, retry }: { error: string | null; retry: () => void }) {
  if (!error) return <div className="m-6 h-40 animate-pulse rounded-lg bg-muted" />;
  return (
    <EmptyState icon="danger-triangle-linear" title="Couldn't load this" action={{ label: "Try again", icon: "refresh-linear", onClick: retry }}>
      {error}
    </EmptyState>
  );
}

const exportButtonClass = "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground";

/** Beside each CSV button: the same rows as a printed sheet, through the browser's print dialog. */
function PrintButton({ onClick, disabled, className }: { onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(exportButtonClass, "disabled:pointer-events-none disabled:opacity-50", className)}>
      <Icon name="printer-linear" className="size-4" />
      Print or save as PDF
    </button>
  );
}

export function ProductionView({ nodeId }: { nodeId?: string }) {
  const { project, binder } = useWorkspace();
  const { index } = useStore(binder);
  const [tab, setTab] = useState<Tab>("breakdown");
  const [scopeId, setScopeId] = useState(nodeId ?? ALL);
  const [tick, setTick] = useState(0);
  const folders = useMemo(() => flatten(index).filter((n) => containerKinds.includes(n.kind)), [index]);
  const rootId = scopeId !== ALL && index.byId.has(scopeId) ? scopeId : null;
  const scope = rootId ? index.byId.get(rootId)!.title : null;
  const name = slug(scope ?? project.title);

  return (
    <div className="flex h-full flex-col">
      <Toolbar>
        <span className="font-medium text-foreground">Production</span>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "breakdown", label: "Breakdown" },
            { value: "recording", label: "Recording sheets" },
            { value: "shots", label: "Shot lists" },
          ]}
        />
        {tab !== "shots" && (
          <ToolbarSelect
            label="Script"
            value={rootId ?? ALL}
            onChange={setScopeId}
            options={[{ value: ALL, label: "The whole project" }, ...folders.map((f) => ({ value: f.id, label: f.title }))]}
          />
        )}
        <ToolButton icon="refresh-linear" label="Reload" onClick={() => setTick((t) => t + 1)} />
        <span className="ml-auto hidden shrink-0 text-xs text-faint md:inline">Read from the scripts and storyboards as last synced.</span>
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "breakdown" ? (
          <Breakdown key={rootId} rootId={rootId} name={name} scope={scope} tick={tick} />
        ) : tab === "recording" ? (
          <Recording key={rootId} rootId={rootId} name={name} scope={scope} tick={tick} />
        ) : (
          <Shots tick={tick} />
        )}
      </div>
    </div>
  );
}

// ---- Breakdown ----------------------------------------------------------------------

function Breakdown({ rootId, name, scope, tick }: { rootId: string | null; name: string; scope: string | null; tick: number }) {
  const { project, openNode } = useWorkspace();
  const printer = usePrintSheet();
  const { data: scenes, error, retry } = useLoaded<BreakdownScene[]>(() => read("getBreakdown", project.id, rootId), [project.id, rootId, tick]);
  const [by, setBy] = useState<"scene" | "element">("scene");
  const report = useMemo(() => elementReport(scenes ?? []), [scenes]);
  const newScene = useNewScriptScene();
  const used = breakdownCategories.filter((c) => (scenes ?? []).some((s) => s.elements[c.id]?.length));

  if (!scenes) return <Loading error={error} retry={retry} />;
  if (scenes.length === 0) {
    return (
      <EmptyState icon="clapperboard-bold-duotone" title="No script to break down" action={newScene ? { label: "New script scene", onClick: newScene } : false}>
        Write scenes in a script format (the format switch is at the top of a note). Then select a prop, a costume or a vehicle in the text and tag it from
        the toolbar: it shows up here against its scene. Everyone with a line is listed as cast automatically.
      </EmptyState>
    );
  }

  const exportCsv = () =>
    save(
      `${name}-breakdown.csv`,
      by === "scene"
        ? csv([
            ["Scene", "Heading", "Int/Ext", "Location", "Time", "Words", ...used.map((c) => c.label)],
            ...scenes.map((s) => [s.number, s.heading, s.setting, s.location, s.time, s.words, ...used.map((c) => (s.elements[c.id] ?? []).join("; "))]),
          ])
        : csv([["Category", "Element", "Scenes", "Count"], ...report.map((r) => [categoryMeta(r.category).label, r.name, r.scenes.join(", "), r.scenes.length])]),
    );

  const printSheet = () => {
    const header = { project: project.title, scope, date: printDate() };
    printer.print(
      by === "scene"
        ? breakdownBySceneSheet(
            scenes,
            used.map((c) => c.id),
            header,
          )
        : breakdownByElementSheet(report, header),
    );
  };

  return (
    <div className="p-4">
      {printer.portal}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-ui-sm">
        <Segmented
          value={by}
          onChange={setBy}
          options={[
            { value: "scene", label: `By scene (${scenes.length})` },
            { value: "element", label: `By element (${report.length})` },
          ]}
        />
        <button type="button" onClick={exportCsv} className={exportButtonClass}>
          <Icon name="download-linear" className="size-4" />
          CSV
        </button>
        <PrintButton onClick={printSheet} disabled={by === "element" && report.length === 0} />
        <span className="ml-auto text-xs text-muted-foreground">
          {new Set(scenes.map((s) => s.location).filter(Boolean)).size} locations · {report.filter((r) => r.category === "cast").length} speaking parts
        </span>
      </div>
      {by === "scene" ? (
        <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-ui-sm">
          <thead className="sticky top-0 z-10">
            <tr className="text-left text-meta font-medium text-muted-foreground">
              <th className="w-10 border-b bg-sidebar px-2 py-1.5 font-medium">#</th>
              <th className="min-w-56 border-b bg-sidebar px-2 py-1.5 font-medium">Scene</th>
              {used.map((c) => (
                <th key={c.id} className="min-w-32 border-b bg-sidebar px-2 py-1.5 font-medium">
                  <span className="mr-1.5 inline-block size-2 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scenes.map((s) => (
              <tr key={s.key} className="align-top">
                <td className="border-b px-2 py-1.5 text-muted-foreground tabular-nums">{s.number}</td>
                <td className="border-b px-2 py-1.5">
                  <button type="button" onClick={() => openNode(s.nodeId, "tab")} className="text-left font-medium uppercase hover:underline">
                    {s.heading}
                  </button>
                  <p className="text-xs text-faint">
                    {[s.setting, s.time].filter(Boolean).join(" · ")}
                    {s.setting || s.time ? " · " : ""}
                    {s.words.toLocaleString()} words
                  </p>
                </td>
                {used.map((c) => (
                  <td key={c.id} className="border-b px-2 py-1.5">
                    {(s.elements[c.id] ?? []).join(", ") || <span className="text-faint">·</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : used.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nothing to list yet: no one has a line and nothing is tagged. Select words in a scene and tag them from the toolbar.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {used.map((c) => (
            <section key={c.id}>
              <h2 className="mb-1.5 flex items-center gap-2 text-meta font-medium text-foreground">
                <span className="size-2 rounded-full" style={{ backgroundColor: c.color }} />
                {c.label}
              </h2>
              <ul className="divide-y rounded-lg border">
                {report
                  .filter((r) => r.category === c.id)
                  .map((r) => (
                    <li key={r.name.toLowerCase()} className="flex items-baseline gap-3 px-3 py-1.5 text-ui-sm">
                      <span className="font-medium">{r.name}</span>
                      <span className="ml-auto text-right text-xs text-muted-foreground">
                        {plural(r.scenes.length, "scene")} {r.scenes.join(", ")}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Recording sheets -----------------------------------------------------------------

function Recording({ rootId, name, scope, tick }: { rootId: string | null; name: string; scope: string | null; tick: number }) {
  const { project, binder, openNode } = useWorkspace();
  const printer = usePrintSheet();
  const { index } = useStore(binder);
  const { data: sheet, setData: setSheet, error, retry } = useLoaded<RecordingSheet>(() => read("getRecordingSheet", project.id, rootId), [project.id, rootId, tick]);
  const [character, setCharacter] = useState(ALL);
  const [status, setStatus] = useState<LineStatus | typeof ALL>(ALL);
  const newScene = useNewScriptScene();

  const states = useMemo(() => new Map((sheet?.states ?? []).map((s) => [`${s.nodeId}:${s.blockId}`, s])), [sheet?.states]);
  const stateOf = (line: ScriptLine): LineStateRow => states.get(`${line.nodeId}:${line.blockId}`) ?? { nodeId: line.nodeId, blockId: line.blockId, status: "written", note: null };
  const characters = useMemo(() => {
    const counts = new Map<string, number>();
    for (const line of sheet?.lines ?? []) counts.set(line.character, (counts.get(line.character) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [sheet?.lines]);
  // The actor comes from a character note's "Played by" property, matched by title or alias.
  const actors = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of flatten(index)) {
      const actor = n.kind === "character" ? n.properties.actor : null;
      if (typeof actor !== "string" || !actor.trim()) continue;
      for (const name of [n.title, ...n.aliases]) if (!map.has(name.toLowerCase())) map.set(name.toLowerCase(), actor.trim());
    }
    return map;
  }, [index]);
  const actorOf = (cue: string) => actors.get(cue.toLowerCase()) ?? null;
  // Statuses and notes take comment access on the line's note.
  const canComment = (nodeId: string) => index.byId.get(nodeId)?.actions.includes("comment") ?? false;

  if (!sheet) return <Loading error={error} retry={retry} />;
  if (sheet.lines.length === 0) {
    return (
      <EmptyState icon="microphone-3-bold-duotone" title="No lines to record" action={newScene ? { label: "New script scene", onClick: newScene } : false}>
        Recording sheets list every dialogue line of scenes written in a script format, by character, with a parenthetical before a line as its delivery
        note.
      </EmptyState>
    );
  }

  const update = async (line: ScriptLine, patch: { status?: LineStatus; note?: string | null }) => {
    const before = stateOf(line);
    // Shown at once; put back if the server refuses.
    const apply = (row: LineStateRow) => setSheet((prev) => prev && { ...prev, states: [...prev.states.filter((s) => !(s.nodeId === row.nodeId && s.blockId === row.blockId)), row] });
    apply({ ...before, ...patch });
    try {
      apply(await setLineState(project.id, line.nodeId, line.blockId, patch));
    } catch (error) {
      apply(before);
      toast.error(errorText(error));
    }
  };

  const shown = sheet.lines.filter((l) => (character === ALL || l.character === character) && (status === ALL || stateOf(l).status === status));
  const recorded = sheet.lines.filter((l) => stateOf(l).status === "recorded").length;
  const filtered = character !== ALL || status !== ALL;

  const exportCsv = () =>
    save(
      `${name}-${character === ALL ? "lines" : slug(character)}.csv`,
      csv([
        ["#", "Character", "Actor", "Scene", "Direction", "Line", "Status", "Notes"],
        ...shown.map((l) => [l.order + 1, l.character, actorOf(l.character), l.scene, l.direction, l.text, lineStatusMeta[stateOf(l).status].label, stateOf(l).note]),
      ]),
    );

  // The sheet prints the lines shown, as the CSV saves them.
  const printSheet = () =>
    printer.print(
      recordingSheet(
        shown.map((line) => ({ line, status: lineStatusMeta[stateOf(line).status].label, note: stateOf(line).note, actor: actorOf(line.character) })),
        {
          character: character === ALL ? null : character,
          status: status === ALL ? null : lineStatusMeta[status].label,
          actor: character === ALL ? null : actorOf(character),
          total: sheet.lines.length,
          recorded,
        },
        { project: project.title, scope, date: printDate() },
      ),
    );

  return (
    <div className="p-4">
      {printer.portal}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-ui-sm">
        <ToolbarSelect
          label="Character"
          value={character}
          onChange={setCharacter}
          options={[{ value: ALL, label: `Everyone (${sheet.lines.length} lines)` }, ...characters.map(([c, n]) => ({ value: c, label: `${c} (${n})` }))]}
        />
        <ToolbarSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[{ value: ALL, label: "Any status" }, ...lineStatuses.map((s) => ({ value: s, label: lineStatusMeta[s].label }))]}
        />
        <button type="button" onClick={exportCsv} disabled={shown.length === 0} className={cn(exportButtonClass, "disabled:pointer-events-none disabled:opacity-50")}>
          <Icon name="download-linear" className="size-4" />
          CSV
        </button>
        <PrintButton onClick={printSheet} disabled={shown.length === 0} />
        <Divider />
        <span className="text-xs text-muted-foreground tabular-nums">
          {recorded} of {sheet.lines.length} recorded
        </span>
        <span className="h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-muted">
          <span className="block h-full bg-teal" style={{ width: `${(recorded / sheet.lines.length) * 100}%` }} />
        </span>
        {character !== ALL && actorOf(character) && <span className="ml-auto text-xs text-muted-foreground">Played by {actorOf(character)}</span>}
      </div>
      <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-ui-sm">
        <thead className="sticky top-0 z-10">
          <tr className="text-left text-meta font-medium text-muted-foreground">
            {["#", "Character", "Line", "Status", "Notes for the session"].map((h) => (
              <th key={h} className="border-b bg-sidebar px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && filtered && (
            <tr>
              <td colSpan={5} className="px-2 py-10 text-center text-muted-foreground">
                No lines match.{" "}
                <button
                  type="button"
                  onClick={() => {
                    setCharacter(ALL);
                    setStatus(ALL);
                  }}
                  className="text-foreground underline underline-offset-2"
                >
                  Show every line
                </button>
              </td>
            </tr>
          )}
          {shown.map((line, i) => {
            const state = stateOf(line);
            const editable = canComment(line.nodeId);
            const newScene = line.sceneKey !== shown[i - 1]?.sceneKey;
            return [
              newScene && (
                <tr key={`scene-${line.sceneKey}-${line.order}`}>
                  <td colSpan={5} className="border-b bg-muted/60 px-2 py-1 text-xs font-medium uppercase">
                    <button type="button" onClick={() => openNode(line.nodeId, "tab")} className="hover:underline">
                      {line.scene}
                    </button>
                  </td>
                </tr>
              ),
              <tr key={`${line.nodeId}:${line.blockId}`} className={cn("align-top", state.status === "recorded" && "text-muted-foreground")}>
                <td className="w-10 border-b px-2 py-1.5 text-faint tabular-nums">{line.order + 1}</td>
                <td className="w-40 border-b px-2 py-1.5 font-medium uppercase">{line.character}</td>
                <td className="border-b px-2 py-1.5">
                  {line.direction && <p className="text-xs text-muted-foreground italic">({line.direction})</p>}
                  <p className="leading-snug whitespace-pre-wrap">{line.text}</p>
                </td>
                <td className="w-32 border-b px-1 py-1">
                  <SelectField
                    value={state.status}
                    aria-label="Status"
                    disabled={!editable}
                    title={editable ? undefined : "Needs comment access to the note"}
                    onValueChange={(v) => void update(line, { status: v as LineStatus })}
                    className={cn(
                      "h-7 w-full rounded-md border border-transparent bg-transparent px-1 font-medium enabled:hover:border-input disabled:opacity-70",
                      lineStatusMeta[state.status].className,
                    )}
                  >
                    {lineStatuses.map((s) => (
                      <option key={s} value={s}>
                        {lineStatusMeta[s].label}
                      </option>
                    ))}
                  </SelectField>
                </td>
                <td className="w-72 border-b px-1 py-1">
                  <CommitInput
                    value={state.note ?? ""}
                    placeholder={editable ? "Take, pickup, pronunciation…" : ""}
                    maxLength={1000}
                    disabled={!editable}
                    className="border-transparent enabled:hover:border-input"
                    onCommit={(note) => void update(line, { note })}
                  />
                </td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- Shot lists -------------------------------------------------------------------------

function Shots({ tick }: { tick: number }) {
  const { project, openNode, actions } = useWorkspace();
  const { data: boards, error, retry } = useLoaded<Storyboard[]>(() => read("getShotLists", project.id), [project.id, tick]);
  const printer = usePrintSheet();

  if (!boards) return <Loading error={error} retry={retry} />;
  if (boards.length === 0) {
    return (
      <EmptyState
        icon="video-frame-linear"
        title="No shots yet"
        action={project.actions.includes("edit") && { label: "New canvas", onClick: () => void actions.create("canvas") }}
      >
        Add image or shot panels to a canvas and give them a shot type, a camera move and a duration. Each canvas becomes a shot list here, in the order the
        panels are laid out.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-6 p-4">
      {printer.portal}
      {boards.map((board) => {
        const total = board.shots.reduce((sum, s) => sum + (s.duration ?? 0), 0);
        return (
          <section key={board.nodeId}>
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <button type="button" onClick={() => openNode(board.nodeId, "tab")} className="text-left font-display text-xl hover:underline">
                {board.title}
              </button>
              <span className="text-xs text-muted-foreground">
                {board.shots.length} {plural(board.shots.length, "shot")}
                {total > 0 && ` · ${formatSeconds(total)}`}
              </span>
              <button
                type="button"
                onClick={() =>
                  save(
                    `${slug(board.title)}-shot-list.csv`,
                    csv([["#", "Sequence", "Shot", "Move", "Seconds", "Description"], ...board.shots.map((s) => [s.number, s.sequence, s.shot, s.move, s.duration, s.caption])]),
                  )
                }
                className={cn(exportButtonClass, "ml-auto text-ui-sm")}
              >
                <Icon name="download-linear" className="size-4" />
                CSV
              </button>
              <PrintButton
                className="text-ui-sm"
                onClick={() => printer.print(shotListSheet(board.shots, { project: project.title, scope: board.title, date: printDate() }))}
              />
            </div>
            <table className="w-full min-w-[44rem] border-separate border-spacing-0 rounded-lg border text-ui-sm">
              <thead>
                <tr className="text-left text-meta font-medium text-muted-foreground">
                  {["#", "Frame", "Sequence", "Shot", "Move", "Time", "Description"].map((h, i) => (
                    <th key={i} className="border-b bg-sidebar px-2 py-1.5 font-medium">
                      {h === "Frame" ? <span className="sr-only">{h}</span> : h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {board.shots.map((s) => {
                  const src = safeUrl(s.url);
                  return (
                    <tr key={s.id} className="align-middle">
                      <td className="w-10 border-b px-2 py-1.5 text-muted-foreground tabular-nums">{s.number}</td>
                      <td className="w-20 border-b px-2 py-1">
                        {/* eslint-disable-next-line @next/next/no-img-element -- user-supplied storyboard frames from any host */}
                        {src ? <img src={src} alt="" className="h-10 w-16 rounded object-cover" /> : <span className="block h-10 w-16 rounded bg-muted" />}
                      </td>
                      <td className="w-40 border-b px-2 py-1.5 text-muted-foreground">{s.sequence ?? "—"}</td>
                      <td className="w-32 border-b px-2 py-1.5 font-medium">{s.shot ?? "—"}</td>
                      <td className="w-32 border-b px-2 py-1.5">{s.move ?? "—"}</td>
                      <td className="w-16 border-b px-2 py-1.5 tabular-nums">{s.duration !== null ? `${s.duration}s` : "—"}</td>
                      <td className="border-b px-2 py-1.5">{s.caption || <span className="text-faint">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
