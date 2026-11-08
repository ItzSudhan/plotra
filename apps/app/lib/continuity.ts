// Continuity (plan.md 2.8): rule-based checks over what the project already
// knows (story dates, who appears where, plot threads, who knows what, setups
// and payoffs), and the per-character continuity sheet. Pure and rule-based:
// no AI, no network, the same answer every time.

import type { CanonStatus, KnowledgeLayer, NodeKind, NodeProperties } from "@plotra/db/schema";
import { parseDuration, parseStoryDate, yearMinutes, type Calendar } from "./calendar";
import { plural } from "./plural";

export type ContinuityNode = {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
  properties: NodeProperties;
  canon: CanonStatus;
};

export type ContinuityInput = {
  /** Every live node, in reading (binder) order. */
  nodes: ContinuityNode[];
  links: Array<{ source: string; target: string; kind: string }>;
  threads: Array<{ id: string; name: string; closedNodeId: string | null }>;
  cells: Array<{ nodeId: string; threadId: string }>;
  knowledge: Array<{ id: string; characterNodeId: string; factNodeId: string; learnedInNodeId: string | null; layer: KnowledgeLayer; note: string | null }>;
  setups: Array<{ id: string; title: string; setupNodeId: string | null; payoffNodeId: string | null; status: string }>;
  relationships?: Array<{ fromNodeId: string; toNodeId: string; type: string; label: string | null; directed: boolean }>;
  calendar: Calendar;
};

export const rules = {
  "after-death": { label: "Appears after death", severity: "error" },
  "before-birth": { label: "Appears before birth", severity: "warning" },
  "age-mismatch": { label: "Age doesn't match the timeline", severity: "warning" },
  "two-places": { label: "In two places at once", severity: "error" },
  "closed-thread": { label: "Closed plot thread referenced again", severity: "warning" },
  "knows-too-early": { label: "Knows something before learning it", severity: "warning" },
  "payoff-before-setup": { label: "Payoff comes before its setup", severity: "warning" },
  "open-setup": { label: "Setup still open", severity: "info" },
  "non-canon-reference": { label: "Canon scene relies on something that isn't canon", severity: "warning" },
  "unreadable-date": { label: "Story date can't be read", severity: "info" },
} as const satisfies Record<string, { label: string; severity: Severity }>;

export type Severity = "error" | "warning" | "info";
export type RuleId = keyof typeof rules;

export type Issue = {
  /** Stable across runs, so a dismissed issue stays dismissed. */
  id: string;
  rule: RuleId;
  severity: Severity;
  message: string;
  /** The notes involved; the first is the one to open. */
  nodeIds: string[];
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? [v] : []);

type Scene = ContinuityNode & { order: number; start: number | null; end: number | null; location: string | null; pov: string | null; cast: Set<string> };

/** What the checks and the sheets both need: scenes with their dates, places and cast. */
function prepare(input: ContinuityInput) {
  const byId = new Map(input.nodes.map((n) => [n.id, n]));
  const order = new Map(input.nodes.map((n, i) => [n.id, i]));
  const characters = input.nodes.filter((n) => n.kind === "character");
  const characterIds = new Set(characters.map((c) => c.id));

  const outgoing = new Map<string, Set<string>>();
  for (const l of input.links) {
    const set = outgoing.get(l.source);
    if (set) set.add(l.target);
    else outgoing.set(l.source, new Set([l.target]));
  }

  const scenes: Scene[] = input.nodes
    .filter((n) => n.kind === "scene")
    .map((n) => {
      const start = parseStoryDate(input.calendar, str(n.properties["story-date"]));
      const duration = start === null ? null : parseDuration(input.calendar, str(n.properties.duration));
      const pov = ids(n.properties.pov)[0] ?? null;
      const cast = new Set<string>();
      if (pov && characterIds.has(pov)) cast.add(pov);
      for (const target of outgoing.get(n.id) ?? []) if (characterIds.has(target)) cast.add(target);
      return { ...n, order: order.get(n.id) ?? 0, start, end: start !== null && duration ? start + duration : start, location: ids(n.properties.location)[0] ?? null, pov, cast };
    });

  return { byId, order, characters, scenes, outgoing };
}

const title = (byId: Map<string, ContinuityNode>, id: string | null) => (id ? (byId.get(id)?.title ?? "a note you can't see") : "nowhere");

/** Whole years between two story times. */
const yearsBetween = (cal: Calendar, from: number, to: number) => Math.floor((to - from) / yearMinutes(cal));

export function checkContinuity(input: ContinuityInput): Issue[] {
  const { byId, order, characters, scenes, outgoing } = prepare(input);
  const cal = input.calendar;
  const issues: Issue[] = [];
  const add = (rule: RuleId, key: string, message: string, nodeIds: string[]) =>
    issues.push({ id: `${rule}:${key}`, rule, severity: rules[rule].severity, message, nodeIds });

  // Dates the timeline can't place.
  for (const n of input.nodes) {
    const raw = str(n.properties["story-date"]);
    if (raw && n.kind === "scene" && parseStoryDate(cal, raw) === null) {
      add("unreadable-date", n.id, `“${n.title}” has the story date “${raw}”, which isn't a date in the ${cal.name} calendar. Write it as YYYY-MM-DD.`, [n.id]);
    }
  }

  for (const c of characters) {
    const born = parseStoryDate(cal, str(c.properties["birth-date"]));
    const died = parseStoryDate(cal, str(c.properties["death-date"]));
    const theirs = scenes.filter((s) => s.cast.has(c.id));

    if (born !== null && died !== null && died < born) {
      add("age-mismatch", `${c.id}:order`, `${c.title} dies before being born: check the “Born” and “Died” dates.`, [c.id]);
    }
    for (const s of theirs) {
      if (s.start === null) continue;
      if (died !== null && s.start > died) {
        add("after-death", `${c.id}:${s.id}`, `${c.title} appears in “${s.title}”, which is set after their death.`, [s.id, c.id]);
      }
      if (born !== null && (s.end ?? s.start) < born) {
        add("before-birth", `${c.id}:${s.id}`, `${c.title} appears in “${s.title}”, which is set before they were born.`, [s.id, c.id]);
      }
    }

    // The age on the character sheet against the first dated scene they're in.
    const stated = Number(str(c.properties.age) ?? NaN);
    if (born !== null && Number.isFinite(stated)) {
      const first = ids(c.properties["first-appearance"])[0];
      const anchor = scenes.find((s) => s.id === first && s.start !== null) ?? theirs.filter((s) => s.start !== null && s.start >= born).sort((a, b) => a.start! - b.start!)[0];
      if (anchor) {
        const actual = yearsBetween(cal, born, anchor.start!);
        if (actual !== stated) {
          add("age-mismatch", `${c.id}:age`, `${c.title}'s age is given as ${stated}, but going by their birth date they're ${actual} in “${anchor.title}”.`, [c.id, anchor.id]);
        }
      }
    }

    // Two dated scenes that overlap, in different places.
    const placed = theirs.filter((s) => s.start !== null && s.location).sort((a, b) => a.start! - b.start!);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        // Sorted by start, so nothing later can overlap `a` either.
        if (b.start! > a.end! || (b.start === a.end && a.end !== a.start)) break;
        if (a.location !== b.location) {
          add(
            "two-places",
            `${c.id}:${a.id}:${b.id}`,
            `${c.title} is in ${title(byId, a.location)} (“${a.title}”) and ${title(byId, b.location)} (“${b.title}”) at the same time.`,
            [a.id, b.id, c.id],
          );
        }
      }
    }
  }

  // A thread that has been resolved, picked up again later in the telling.
  for (const t of input.threads) {
    if (!t.closedNodeId || !order.has(t.closedNodeId)) continue;
    const closedAt = order.get(t.closedNodeId)!;
    for (const cell of input.cells) {
      if (cell.threadId !== t.id || (order.get(cell.nodeId) ?? -1) <= closedAt) continue;
      add("closed-thread", `${t.id}:${cell.nodeId}`, `“${title(byId, cell.nodeId)}” is in the thread “${t.name}”, which was resolved in “${title(byId, t.closedNodeId)}”.`, [
        cell.nodeId,
        t.closedNodeId,
      ]);
    }
  }

  // "How does she know that?": a POV scene that leans on a secret before the scene where they learn it.
  for (const k of input.knowledge) {
    if (!k.learnedInNodeId) continue;
    const learned = scenes.find((s) => s.id === k.learnedInNodeId);
    const learnedOrder = order.get(k.learnedInNodeId);
    if (learnedOrder === undefined) continue;
    for (const s of scenes) {
      if (s.pov !== k.characterNodeId || s.id === k.learnedInNodeId || !outgoing.get(s.id)?.has(k.factNodeId)) continue;
      // In story time when both scenes are dated, otherwise in the order they're told.
      const earlier = learned && learned.start !== null && s.start !== null ? s.start < learned.start : s.order < learnedOrder;
      if (earlier) {
        add(
          "knows-too-early",
          `${k.id}:${s.id}`,
          `${title(byId, k.characterNodeId)} is the point of view of “${s.title}”, which refers to “${title(byId, k.factNodeId)}”, but they only learn it in “${title(byId, k.learnedInNodeId)}”.`,
          [s.id, k.learnedInNodeId, k.factNodeId],
        );
      }
    }
  }

  const lastScene = scenes.at(-1);
  for (const s of input.setups) {
    const setupAt = s.setupNodeId ? order.get(s.setupNodeId) : undefined;
    const payoffAt = s.payoffNodeId ? order.get(s.payoffNodeId) : undefined;
    if (setupAt !== undefined && payoffAt !== undefined && payoffAt < setupAt) {
      add("payoff-before-setup", s.id, `“${s.title}” pays off in “${title(byId, s.payoffNodeId)}”, before it's set up in “${title(byId, s.setupNodeId)}”.`, [s.payoffNodeId!, s.setupNodeId!]);
    }
    if (s.status === "open" && setupAt !== undefined) {
      const since = scenes.filter((x) => x.order > setupAt).length;
      const where = lastScene && since ? `${since} ${plural(since, "scene")} later it still hasn't paid off` : "it hasn't paid off yet";
      add("open-setup", s.id, `“${s.title}” is set up in “${title(byId, s.setupNodeId)}”; ${where}.`, [s.setupNodeId!]);
    }
  }

  // Canon scenes that link to something retconned or outside canon.
  for (const s of scenes) {
    if (s.canon !== "canon") continue;
    for (const target of outgoing.get(s.id) ?? []) {
      const t = byId.get(target);
      if (t && (t.canon === "retconned" || t.canon === "non_canon")) {
        add("non-canon-reference", `${s.id}:${t.id}`, `“${s.title}” is canon but links to “${t.title}”, which is ${t.canon === "retconned" ? "retconned" : "non-canon"}.`, [s.id, t.id]);
      }
    }
  }

  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// ---- Continuity sheets ------------------------------------------------------------

export type SheetRow = {
  sceneId: string;
  title: string;
  /** Story time, when the scene has a date the calendar can read. */
  date: number | null;
  /** Their age then, when they have a birth date. */
  age: number | null;
  locationId: string | null;
  pov: boolean;
  /** What they learn in this scene. */
  learns: Array<{ factNodeId: string; layer: KnowledgeLayer; note: string | null }>;
};

export type Sheet = {
  characterId: string;
  born: number | null;
  died: number | null;
  /** Scenes they're in: by story date when every one is dated, else in reading order. */
  rows: SheetRow[];
  chronological: boolean;
  /** What they knew from the start. */
  knownFromStart: Array<{ factNodeId: string; layer: KnowledgeLayer; note: string | null }>;
  relationships: Array<{ otherId: string; type: string; label: string | null; outgoing: boolean; directed: boolean }>;
};

/** A character's continuity sheet (plan.md 2.8), built from properties, scene links and knowledge. */
export function buildSheet(input: ContinuityInput, characterId: string): Sheet | null {
  const { byId, scenes } = prepare(input);
  const character = byId.get(characterId);
  if (!character) return null;
  const cal = input.calendar;
  const born = parseStoryDate(cal, str(character.properties["birth-date"]));
  const died = parseStoryDate(cal, str(character.properties["death-date"]));
  const known = input.knowledge.filter((k) => k.characterNodeId === characterId && byId.has(k.factNodeId));

  const theirs = scenes.filter((s) => s.cast.has(characterId) || known.some((k) => k.learnedInNodeId === s.id));
  const chronological = theirs.length > 0 && theirs.every((s) => s.start !== null);
  const sorted = chronological ? [...theirs].sort((a, b) => a.start! - b.start! || a.order - b.order) : theirs;

  return {
    characterId,
    born,
    died,
    chronological,
    rows: sorted.map((s) => ({
      sceneId: s.id,
      title: s.title,
      date: s.start,
      age: born !== null && s.start !== null ? yearsBetween(cal, born, s.start) : null,
      locationId: s.location && byId.has(s.location) ? s.location : null,
      pov: s.pov === characterId,
      learns: known.filter((k) => k.learnedInNodeId === s.id).map((k) => ({ factNodeId: k.factNodeId, layer: k.layer, note: k.note })),
    })),
    knownFromStart: known.filter((k) => !k.learnedInNodeId).map((k) => ({ factNodeId: k.factNodeId, layer: k.layer, note: k.note })),
    relationships: (input.relationships ?? [])
      .filter((r) => (r.fromNodeId === characterId || r.toNodeId === characterId) && byId.has(r.fromNodeId) && byId.has(r.toNodeId))
      .map((r) => ({
        otherId: r.fromNodeId === characterId ? r.toNodeId : r.fromNodeId,
        type: r.type,
        label: r.label,
        outgoing: r.fromNodeId === characterId,
        directed: r.directed,
      })),
  };
}
