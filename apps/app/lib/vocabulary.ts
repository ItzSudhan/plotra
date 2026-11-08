import { moduleIds, type ModuleId, type NodeKind, type ProjectLabel, type ProjectSettings } from "@plotra/db/schema";
import { viewMeta, type ViewMeta } from "@/components/workspace/view-meta";
import { moduleMeta } from "./modules";
import type { TrackId } from "./onboarding/tracks";
import { nodeKindMeta } from "./tree";
import { pluralOf } from "./plural";

// What belongs to a project rather than a person (onboarding-plan.md 4.2): the
// words it uses for the kinds of note, and its colour labels. Everyone in the
// project sees the same ones. Pure: the shell and the server share it.

// ---- Vocabulary ---------------------------------------------------------------

/** The kinds a project can rename. Boards and world entries are named by what they are, or by their own type. */
export const renameableKinds: NodeKind[] = ["folder", "chapter", "scene", "note", "character", "location", "research"];

const MAX_WORD = 30;

/** What this project calls a kind of note: its own word, or the app's. */
export const kindLabel = (kind: NodeKind, settings: ProjectSettings | null | undefined): string => settings?.vocabulary?.[kind] || nodeKindMeta[kind].label;

/** The same, for more than one. Plain English plurals: "Scenes", "Stories", "Classes". */
export function kindPlural(kind: NodeKind, settings: ProjectSettings | null | undefined): string {
  const word = kindLabel(kind, settings);
  return pluralOf(word);
}

/** The words a track starts a project with, where its medium has its own (onboarding-plan.md 2.2). */
export const trackVocabulary: Record<TrackId, Record<string, string>> = {
  novel: {},
  ttrpg: { chapter: "Session" },
  screenplay: { chapter: "Sequence" },
  other: {},
};

// Views and modules are renamed the same way, under `view:<id>` and
// `module:<id>`: "Codex" → "Wiki", "Release roadmap" → "Campaign".

/** The views a project can rename: the ones the ribbon offers. A note's own editor is named by the note. */
export const renameableViews = (viewMeta as readonly ViewMeta[]).filter((view) => view.ribbon);

/** What this project calls a view, in full. */
export const viewLabel = (view: Pick<ViewMeta, "id" | "title">, settings: ProjectSettings | null | undefined): string => settings?.vocabulary?.[`view:${view.id}`] || view.title;

/** The short form under its ribbon button: the project's own word, else the view's short label. */
export const viewShort = (view: Pick<ViewMeta, "id" | "title" | "short">, settings: ProjectSettings | null | undefined): string =>
  settings?.vocabulary?.[`view:${view.id}`] || view.short || view.title;

/** What this project calls a module. */
export const moduleLabel = (id: ModuleId, settings: ProjectSettings | null | undefined): string => settings?.vocabulary?.[`module:${id}`] || moduleMeta[id].label;

/** A vocabulary as it arrives from the browser: known kinds, views and modules only, trimmed, and nothing stored for one left as it is. */
export function cleanVocabulary(input: unknown): Record<string, string> {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const words: Record<string, string> = {};
  const take = (key: string, original: string) => {
    const word = typeof raw[key] === "string" ? raw[key].replace(/\s+/g, " ").trim().slice(0, MAX_WORD) : "";
    if (word && word !== original) words[key] = word;
  };
  for (const kind of renameableKinds) take(kind, nodeKindMeta[kind].label);
  for (const view of renameableViews) take(`view:${view.id}`, view.title);
  for (const id of moduleIds) take(`module:${id}`, moduleMeta[id].label);
  return words;
}

// ---- Labels ---------------------------------------------------------------------

/** The colours a label can have: the same ones plot threads and entity types use. */
export const labelColors = ["#e2602a", "#b98021", "#2b8a3e", "#1971c2", "#7048e8", "#c2255c", "#868e96"] as const;

const MAX_LABELS = 24;
const MAX_LABEL = 40;

/** Labels as they arrive from the browser: named, coloured from the palette, ids kept so notes keep their label. */
export function cleanLabels(input: unknown, newId: () => string): ProjectLabel[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const labels: ProjectLabel[] = [];
  for (const item of input.slice(0, MAX_LABELS)) {
    const raw = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const name = typeof raw.name === "string" ? raw.name.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL) : "";
    if (!name) continue;
    let id = typeof raw.id === "string" && /^[\w-]{1,64}$/.test(raw.id) ? raw.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    const color = (labelColors as readonly string[]).includes(raw.color as string) ? (raw.color as string) : labelColors[labels.length % labelColors.length];
    labels.push({ id, name, color });
  }
  return labels;
}

/** The label a note carries, if the project still has it. */
export const labelOf = (node: { settings: Record<string, unknown> }, settings: ProjectSettings | null | undefined): ProjectLabel | undefined =>
  settings?.labels?.find((label) => label.id === node.settings.label);
