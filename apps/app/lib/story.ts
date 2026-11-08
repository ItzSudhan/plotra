import type { NodeKind } from "@plotra/db/schema";

// Shared vocabulary for the story tools (plan.md 2.5): relationship types,
// colours for threads and cards, and which kinds are documents vs. boards.

/** Kinds whose body is a text document (opened in the editor). */
export const documentKinds: NodeKind[] = ["folder", "chapter", "scene", "note", "character", "location", "research", "entity"];

/** Kinds that open in their own view instead of the editor. Their kind can't change. */
export const boardKinds: NodeKind[] = ["canvas", "timeline", "dialogue"];

/** Document kinds a note can be turned into from a plain menu; a custom entity also needs its type. */
export const plainKinds: NodeKind[] = documentKinds.filter((kind) => kind !== "entity");

export const isDocumentKind = (kind: NodeKind) => documentKinds.includes(kind);

/** Built-in relationship types. Writers can type any other. */
/**
 * The relationship map's types. `among`: whether a type is offered between
 * people (characters), between powers (factions, nations, places: the
 * diplomacy web), or both. "Parent of", "Married to" and "Sibling of" draw
 * the family tree (lib/family-tree.ts).
 */
export const relationshipTypes = [
  { id: "ally", label: "Ally", color: "#2b8a3e", among: "both" },
  { id: "friend", label: "Friend", color: "#0c8599", among: "people" },
  { id: "family", label: "Family", color: "#1971c2", among: "people" },
  { id: "parent", label: "Parent of", color: "#5f3dc4", directed: true, among: "people" },
  { id: "spouse", label: "Married to", color: "#9c36b5", among: "people" },
  { id: "sibling", label: "Sibling of", color: "#3b5bdb", among: "people" },
  { id: "love", label: "Love interest", color: "#c2255c", among: "people" },
  { id: "mentor", label: "Mentor of", color: "#e67700", directed: true, among: "people" },
  { id: "rival", label: "Rival", color: "#d9480f", among: "both" },
  { id: "enemy", label: "Enemy", color: "#c92a2a", among: "both" },
  { id: "works-for", label: "Works for", color: "#868e96", directed: true, among: "both" },
  { id: "war", label: "At war with", color: "#a61e4d", among: "powers" },
  { id: "trade", label: "Trades with", color: "#b98021", among: "powers" },
  { id: "vassal", label: "Vassal of", color: "#495057", directed: true, among: "powers" },
  { id: "peace", label: "At peace with", color: "#109a82", among: "powers" },
] as const;

export type RelationshipAmong = "people" | "powers";

/** The types offered between people, or between powers. */
export const relationshipTypesFor = (among: RelationshipAmong) => relationshipTypes.filter((t) => t.among === "both" || t.among === among);

export function relationshipMeta(type: string) {
  const known = relationshipTypes.find((t) => t.id === type);
  return {
    label: known?.label ?? type,
    color: known?.color ?? "#868e96",
    directed: known && "directed" in known ? known.directed : false,
  };
}

/** Colours for plot threads, timeline events and canvas cards: readable in light and dark. */
export const swatches = ["#e2602a", "#b98021", "#2b8a3e", "#109a82", "#1971c2", "#5f3dc4", "#9c36b5", "#c2255c", "#868e96"];

export const nextSwatch = (used: string[]) => swatches.find((c) => !used.includes(c)) ?? swatches[used.length % swatches.length];
