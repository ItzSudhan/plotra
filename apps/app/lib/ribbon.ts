import type { RibbonPrefs } from "@plotra/db/schema";
import { trackIds, type TrackId } from "./onboarding/tracks";

// Which views the ribbon shows (onboarding-plan.md 3). A project has twenty or
// more; the ribbon starts with the five its track is written in, and the rest
// are one click away under "More". From there it is the person's own: they pin
// what they use and take off what they don't, or ask for every view at once.
// Pure, so the shell, the server and the tests agree.

/** The views a project's ribbon starts with, by track; a project without one (an import, a plain blank project) gets the novel's. */
export const coreViews: Record<TrackId, string[]> = {
  novel: ["manuscript", "outline", "codex", "graph", "read"],
  ttrpg: ["outline", "codex", "graph", "roadmap", "read"],
  screenplay: ["manuscript", "corkboard", "outline", "codex", "read"],
  other: ["manuscript", "outline", "codex", "graph", "read"],
};

/** A sample is there to show the world tools, so those are what its ribbon starts with. */
const sampleViews = ["codex", "graph", "roadmap", "knowledge", "continuity"];

const isTrackId = (id: unknown): id is TrackId => trackIds.includes(id as TrackId);
export const coreViewsFor = (track: string | undefined) => (track?.startsWith("sample:") ? sampleViews : coreViews[isTrackId(track) ? track : "novel"]);

/**
 * Splits the views a project offers into the ones in the ribbon and the ones
 * under "More", keeping the order they came in.
 */
export function ribbonLayout<V extends { id: string }>(views: V[], track: string | undefined, prefs: RibbonPrefs): { shown: V[]; more: V[] } {
  if (prefs.all) return { shown: views, more: [] };
  const core = new Set(coreViewsFor(track));
  const pinned = new Set(prefs.pinned ?? []);
  const hidden = new Set(prefs.hidden ?? []);
  const inRibbon = (view: V) => (core.has(view.id) ? !hidden.has(view.id) : pinned.has(view.id));
  // Where the person moved them; a view they haven't moved keeps its usual place after those.
  const order = prefs.order ?? [];
  const place = (view: V) => (order.includes(view.id) ? order.indexOf(view.id) : order.length + views.indexOf(view));
  return { shown: views.filter(inRibbon).sort((a, b) => place(a) - place(b)), more: views.filter((view) => !inRibbon(view)) };
}

/** A list with one of its items moved up (-1) or down (1) a place. */
export function moved(list: string[], id: string, by: -1 | 1): string[] {
  const from = list.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** The preferences after putting a view in the ribbon or taking it off. */
export function setInRibbon(prefs: RibbonPrefs, track: string | undefined, viewId: string, shown: boolean): RibbonPrefs {
  const without = (list: string[] | undefined) => (list ?? []).filter((id) => id !== viewId);
  // A view the track starts with is in unless hidden; any other is out unless pinned.
  if (coreViewsFor(track).includes(viewId)) return { ...prefs, hidden: shown ? without(prefs.hidden) : [...without(prefs.hidden), viewId] };
  return { ...prefs, pinned: shown ? [...without(prefs.pinned), viewId] : without(prefs.pinned) };
}

const MAX_IDS = 80;
export const ids = (value: unknown) => (Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 120))].slice(0, MAX_IDS) : []);

/** Preferences as they arrive from the browser, made safe to store. */
export const cleanRibbon = (input: unknown): RibbonPrefs => {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return { pinned: ids(raw.pinned), hidden: ids(raw.hidden), all: raw.all === true, order: ids(raw.order) };
};
