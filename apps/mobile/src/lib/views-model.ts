import { formatDate, formatDuration, GREGORIAN_ID, gregorian, parseDuration, parseStoryDate, type Calendar } from "./story-calendar";
import type { NodeKind } from "./types";
import type { CalendarRow, CanonStatus, EntityType, PlotThread, PropertyDef, PropertyType, PropertyValue, SceneThreadCell, TimelineEvent, ViewNode } from "./views-api";

// How the phone's story views lay out what the server sends: the same rules
// as the web's views (apps/app/components/views/timeline-view.tsx,
// corkboard-view.tsx, plot-grid-view.tsx, codex-view.tsx), shaped for a
// narrow screen. Pure, so it's tested without a phone.

// ---- Fields -------------------------------------------------------------------------

/** A field's value as a few words (apps/app/lib/property-text.ts). Empty for nothing. */
export function propertyText(type: PropertyType, value: PropertyValue | undefined, titleOf: (id: string) => string | undefined): string {
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) return "";
  if (type === "checkbox") return value ? "Yes" : "No";
  if (type === "node") return (Array.isArray(value) ? value : [String(value)]).flatMap((id) => titleOf(id) ?? []).join(", ");
  if (type === "url") return String(value).replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
  return Array.isArray(value) ? value.join(", ") : String(value);
}

/** The fields a note shows: its world-bible type's, or its kind's template (components/workspace/properties.tsx). */
export function defsFor(node: Pick<ViewNode, "kind" | "entityTypeId">, defs: PropertyDef[], types: EntityType[]): PropertyDef[] {
  if (node.kind === "entity") {
    const type = types.find((t) => t.id === node.entityTypeId);
    return (type?.schema ?? []).map((f, i) => ({ id: `${type!.id}:${f.key}`, nodeKind: "entity", key: f.key, label: f.label, type: f.type, options: f.options ?? {}, position: String(i).padStart(4, "0") }));
  }
  return defs.filter((d) => d.nodeKind === node.kind);
}

/** Field types the phone can edit; links to notes and multiple choices are edited on the web. */
export const editableField = (type: PropertyType) => type !== "node" && type !== "multi_select";

export const canonLabel: Record<CanonStatus, { label: string; color: string; description: string }> = {
  canon: { label: "Canon", color: "#109a82", description: "Established: it's true in the story." },
  draft: { label: "Draft", color: "#9a938a", description: "Still being worked out." },
  speculative: { label: "Speculative", color: "#1971c2", description: "An idea that may or may not make it in." },
  retconned: { label: "Retconned", color: "#c2255c", description: "Was canon, then changed. The old version is kept." },
  non_canon: { label: "Non-canon", color: "#868e96", description: "Outside the story's continuity." },
};

/** The colours plot threads and events pick from (apps/app/lib/story.ts). */
export const swatches = ["#e2602a", "#b98021", "#2b8a3e", "#109a82", "#1971c2", "#5f3dc4", "#9c36b5", "#c2255c", "#868e96"];

// ---- Timeline -----------------------------------------------------------------------

export type LaneMode = "none" | "thread" | "pov" | "location";
export const NONE = "__none";
export const ALL = "__all";

export const laneModeLabel: Record<LaneMode, string> = { none: "No lanes", thread: "Plot threads", pov: "POV character", location: "Location" };

export type TimelineItem = {
  key: string;
  type: "scene" | "event";
  id: string;
  title: string;
  start: number;
  end: number | null;
  /** Null: the app's ember. */
  color: string | null;
  lanes: string[];
  node?: ViewNode;
  event?: TimelineEvent;
};

export type Lane = { key: string; label: string; color?: string };

const str = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) ? String(v[0] ?? "") : v == null ? "" : String(v));

/** The calendars a timeline can use: Gregorian, then the project's own. */
export const calendarsOf = (rows: CalendarRow[]): Calendar[] => [gregorian, ...rows.map((c) => ({ id: c.id, name: c.name, definition: c.definition }))];

export function calendarFor(timeline: Pick<ViewNode, "settings"> | null, rows: CalendarRow[]): Calendar {
  const id = timeline?.settings.calendarId;
  return calendarsOf(rows).find((c) => c.id === id) ?? calendarsOf(rows).find((c) => c.id === GREGORIAN_ID)!;
}

export function laneModeOf(timeline: Pick<ViewNode, "settings"> | null): LaneMode {
  const m = timeline?.settings.lanes;
  return m === "thread" || m === "pov" || m === "location" ? m : "none";
}

/**
 * The timeline's items, as the web lays them out: scenes (and any note) with a
 * Story date, for their Duration; the timeline's own events; each in its
 * lanes. `knows` is the spoiler horizon: only what the audience knows by then.
 */
export function buildTimeline({
  nodes,
  events,
  threads,
  cells,
  calendar,
  laneMode,
  knows,
}: {
  nodes: ViewNode[];
  events: TimelineEvent[];
  threads: PlotThread[];
  cells: SceneThreadCell[];
  calendar: Calendar;
  laneMode: LaneMode;
  knows?: (id: string) => boolean;
}): { items: TimelineItem[]; undated: ViewNode[]; lanes: Lane[] } {
  const visible = knows ? nodes.filter((n) => knows(n.id)) : nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const threadColor = new Map(threads.map((t) => [t.id, t.color]));
  const threadsOf = new Map<string, string[]>();
  for (const c of cells) threadsOf.set(c.nodeId, [...(threadsOf.get(c.nodeId) ?? []), c.threadId]);

  const sceneLanes = (n: ViewNode): string[] => {
    if (laneMode === "none") return [ALL];
    if (laneMode === "thread") {
      const t = (threadsOf.get(n.id) ?? []).filter((id) => threadColor.has(id));
      return t.length ? t : [NONE];
    }
    const target = str(n.properties[laneMode]);
    return [target && byId.has(target) ? target : NONE];
  };

  const items: TimelineItem[] = [];
  const undated: ViewNode[] = [];
  for (const n of visible) {
    if (n.kind === "folder" || n.kind === "canvas" || n.kind === "timeline") continue;
    const date = parseStoryDate(calendar, str(n.properties["story-date"]));
    if (date === null) {
      if (n.kind === "scene") undated.push(n);
      continue;
    }
    const duration = parseDuration(calendar, str(n.properties.duration));
    const lanes = sceneLanes(n);
    items.push({
      key: `scene:${n.id}`,
      type: "scene",
      id: n.id,
      title: n.title,
      start: date,
      end: duration ? date + duration : null,
      color: laneMode === "thread" && lanes[0] !== NONE ? (threadColor.get(lanes[0]) ?? null) : null,
      lanes,
      node: n,
    });
  }
  for (const e of events) {
    items.push({ key: `event:${e.id}`, type: "event", id: e.id, title: e.title, start: e.start, end: e.end, color: e.color ?? "#868e96", lanes: [laneMode === "none" ? ALL : (e.lane ?? NONE)], event: e });
  }

  if (laneMode === "none") return { items: sortItems(items), undated, lanes: [] };
  const used = new Set(items.flatMap((i) => i.lanes));
  let list: Lane[];
  if (laneMode === "thread") list = threads.map((t) => ({ key: t.id, label: t.name, color: t.color }));
  else {
    const kind = laneMode === "pov" ? "character" : "location";
    list = visible.filter((n) => n.kind === kind && used.has(n.id)).map((n) => ({ key: n.id, label: n.title || "Untitled" }));
  }
  // Items whose lane no longer exists (a deleted thread) fall into "Unassigned".
  const known = new Set(list.map((l) => l.key));
  return {
    items: sortItems(items.map((i) => ({ ...i, lanes: [...new Set(i.lanes.map((l) => (known.has(l) ? l : NONE)))] }))),
    undated,
    lanes: [...list, { key: NONE, label: laneMode === "thread" ? "No thread" : "Unassigned" }],
  };
}

const sortItems = (items: TimelineItem[]) => items.sort((a, b) => a.start - b.start || (a.end ?? a.start) - (b.end ?? b.start) || a.title.localeCompare(b.title));

export type DayGroup = { key: string; label: string; items: TimelineItem[] };

/** Items under a heading for each day, earliest first: the phone's timeline reads top to bottom. */
export function groupByDay(items: TimelineItem[], calendar: Calendar): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of [...items].sort((a, b) => a.start - b.start)) {
    const label = formatDate(calendar, item.start, "day");
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ key: `${label}:${item.start}`, label, items: [item] });
  }
  return groups;
}

/** "14:00 · for 2d 4h", the line under an item's title. */
export function itemWhen(item: Pick<TimelineItem, "start" | "end">, calendar: Calendar): string {
  const full = formatDate(calendar, item.start, "minute");
  const day = formatDate(calendar, item.start, "day");
  const time = full !== day ? full.slice(day.length + 2) : "";
  const length = item.end !== null && item.end > item.start ? `for ${formatDuration(calendar, item.end - item.start)}` : "";
  return [time, length].filter(Boolean).join(" · ");
}

// ---- Corkboard ----------------------------------------------------------------------

/** A folder's index cards: its children, without boards (canvases and timelines aren't cards). */
export const cardsIn = (nodes: ViewNode[], parentId: string | null) => nodes.filter((n) => n.parentId === parentId && n.kind !== "canvas" && n.kind !== "timeline");

/** Where a card goes when it moves one place: the card to put it after (null: first), or undefined when it can't move. */
export function stepTarget(cards: Pick<ViewNode, "id">[], id: string, by: -1 | 1): string | null | undefined {
  const at = cards.findIndex((c) => c.id === id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= cards.length) return undefined;
  const rest = cards.filter((c) => c.id !== id);
  return to === 0 ? null : rest[to - 1].id;
}

/** The folders above a note, from the top. */
export function trailOf(nodes: ViewNode[], id: string | null): ViewNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: ViewNode[] = [];
  for (let n = id ? byId.get(id) : undefined, depth = 0; n && depth < 200; n = n.parentId ? byId.get(n.parentId) : undefined, depth++) out.unshift(n);
  return out;
}

// ---- Plot grid ----------------------------------------------------------------------

/** The grid's rows: chapters and scenes in reading order, with how deep each sits. */
export function gridRows(nodes: ViewNode[]): { node: ViewNode; depth: number }[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depth = (n: ViewNode) => {
    let d = 0;
    for (let p = n.parentId ? byId.get(n.parentId) : undefined; p && d < 200; p = p.parentId ? byId.get(p.parentId) : undefined) if (p.kind === "chapter") d++;
    return d;
  };
  return nodes.filter((n) => n.kind === "scene" || n.kind === "chapter").map((node) => ({ node, depth: depth(node) }));
}

export const cellKey = (nodeId: string, threadId: string) => `${nodeId}:${threadId}`;

// ---- Codex --------------------------------------------------------------------------

export const codexKinds: NodeKind[] = ["character", "location", "research", "note"];

export type Section = { key: string; label: string; singular: string; kind: NodeKind; type?: EntityType };

export const sectionOf = (n: Pick<ViewNode, "kind" | "entityTypeId">) => (n.kind === "entity" ? `type:${n.entityTypeId ?? ""}` : n.kind);

const builtIn: Record<string, [string, string]> = { character: ["Characters", "Character"], location: ["Places", "Place"], research: ["Research", "Research"], note: ["Notes", "Note"] };

export function codexSections(types: EntityType[]): Section[] {
  return [
    ...codexKinds.map((kind) => ({ key: kind as string, label: builtIn[kind][0], singular: builtIn[kind][1], kind })),
    ...types.map((type) => ({ key: `type:${type.id}`, label: type.plural, singular: type.name, kind: "entity" as const, type })),
  ];
}

/** A section's entries, filtered by name or alias and sorted by title. */
export function codexEntries(nodes: ViewNode[], section: string, query: string): ViewNode[] {
  const q = query.trim().toLowerCase();
  return nodes
    .filter((n) => sectionOf(n) === section)
    .filter((n) => !q || [n.title, ...n.aliases].some((name) => name.toLowerCase().includes(q)))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export const isCodexEntry = (n: Pick<ViewNode, "kind">) => codexKinds.includes(n.kind) || n.kind === "entity";
