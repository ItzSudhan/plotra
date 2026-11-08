// Quest chains (plan.md 2.8 "Quest/mission designer"): a quest lists the
// quests that must be done before it. Pure helpers for the designer's graph.

export type QuestLink = { id: string; prerequisites: string[] };

/** A quest's prerequisites that are quests we know about, without repeats. */
const known = (quests: Map<string, QuestLink>, id: string) => [...new Set(quests.get(id)?.prerequisites ?? [])].filter((p) => p !== id && quests.has(p));

/**
 * Where each quest sits in its chain: tier 1 needs nothing, and every other
 * quest is one past its deepest prerequisite. Safe on data that already loops.
 */
export function questTiers(list: QuestLink[]): Map<string, number> {
  const quests = new Map(list.map((q) => [q.id, q]));
  const tiers = new Map<string, number>();
  const visiting = new Set<string>();
  const tierOf = (id: string): number => {
    const done = tiers.get(id);
    if (done) return done;
    // Back at a quest we're in the middle of: a loop. Count it as a start.
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const tier = 1 + Math.max(0, ...known(quests, id).map(tierOf));
    visiting.delete(id);
    tiers.set(id, tier);
    return tier;
  };
  for (const quest of list) tierOf(quest.id);
  return tiers;
}

/**
 * Whether making `before` a prerequisite of `after` would close a loop: it
 * would when `before` already needs `after`, directly or down the chain.
 */
export function wouldLoop(list: QuestLink[], before: string, after: string): boolean {
  if (before === after) return true;
  const quests = new Map(list.map((q) => [q.id, q]));
  const seen = new Set<string>();
  const stack = [before];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === after) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...known(quests, id));
  }
  return false;
}

/** A tidy starting place for each quest: a column per tier, in the order given. */
export function tierLayout(list: QuestLink[], tiers: Map<string, number>, gap = { x: 300, y: 120 }): Map<string, { x: number; y: number }> {
  const rows = new Map<number, number>();
  const places = new Map<string, { x: number; y: number }>();
  for (const quest of list) {
    const tier = tiers.get(quest.id) ?? 1;
    const row = rows.get(tier) ?? 0;
    rows.set(tier, row + 1);
    places.set(quest.id, { x: (tier - 1) * gap.x, y: row * gap.y });
  }
  return places;
}

// ---- States -------------------------------------------------------------------------
// A quest's state (`properties.state`) is one of the choices of the Quest type's
// "State" select, so the inspector and the published bible show it like any other
// property. Its done objectives (`properties["objectives-done"]`) are the texts of
// the objectives ticked off. GMs use both to track a campaign; game writers can
// read them as design status ("active" = being written).

export const QUEST_STATES = [
  { id: "not-started", label: "Not started", color: "var(--muted-foreground)" },
  { id: "active", label: "Active", color: "#1971c2" },
  { id: "done", label: "Done", color: "#2b8a3e" },
  { id: "failed", label: "Failed", color: "#c92a2a" },
] as const;

export type QuestState = (typeof QUEST_STATES)[number]["id"];

/** The property keys quest progress is kept under. */
export const QUEST_STATE_KEY = "state";
export const QUEST_DONE_KEY = "objectives-done";

export const MAX_QUEST_OBJECTIVE = 80;
export const MAX_QUEST_OBJECTIVES = 50;

export const questStateMeta = (state: QuestState) => QUEST_STATES.find((s) => s.id === state)!;

/** Reads a stored state: its label (what the select stores) or its id, any case. Anything else is "not started". */
export function questState(value: unknown): QuestState {
  if (typeof value !== "string") return "not-started";
  const clean = value.trim().toLowerCase();
  return QUEST_STATES.find((s) => s.id === clean || s.label.toLowerCase() === clean)?.id ?? "not-started";
}

/** The value to store for a state: its label, or nothing for "not started". */
export const storedQuestState = (state: QuestState): string | null => (state === "not-started" ? null : questStateMeta(state).label);

/** Cleans a list of ticked objectives from outside: strings, trimmed, capped, without repeats. */
export function cleanDone(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const clean = item.trim().slice(0, MAX_QUEST_OBJECTIVE);
    if (clean && !out.includes(clean)) out.push(clean);
    if (out.length >= MAX_QUEST_OBJECTIVES) break;
  }
  return out;
}

/** The objectives that are ticked off, in the objectives' order. A tick for an objective that's gone doesn't count. */
export const doneObjectives = (objectives: string[], done: string[]) => objectives.filter((o) => done.includes(o));

/** Ticks or unticks one objective, dropping ticks for objectives that are gone. */
export function toggleDone(objectives: string[], done: string[], objective: string, on: boolean): string[] {
  const kept = doneObjectives(objectives, done).filter((o) => o !== objective);
  return on && objectives.includes(objective) ? doneObjectives(objectives, [...kept, objective]) : kept;
}

/** The ticks after an objective is renamed (or removed, with `to` null). */
export function renameDone(done: string[], from: string, to: string | null): string[] {
  if (!done.includes(from)) return done;
  return to === null ? done.filter((o) => o !== from) : [...new Set(done.map((o) => (o === from ? to : o)))];
}

/**
 * Whether a quest is ready to start: not started, and every prerequisite we
 * know about is done. A quest that needs nothing is ready from the start.
 */
export function questReady(list: QuestLink[], states: Map<string, QuestState>, id: string): boolean {
  if ((states.get(id) ?? "not-started") !== "not-started") return false;
  const quests = new Map(list.map((q) => [q.id, q]));
  return known(quests, id).every((p) => states.get(p) === "done");
}

/** How many quests are in each state. */
export function countStates(states: Iterable<QuestState>): Record<QuestState, number> {
  const counts = Object.fromEntries(QUEST_STATES.map((s) => [s.id, 0])) as Record<QuestState, number>;
  for (const state of states) counts[state]++;
  return counts;
}
