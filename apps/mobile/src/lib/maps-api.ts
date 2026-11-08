import type { DialogueGraph } from "@/components/maps/dialogue/model";
import type { Client } from "./api";
import type { NodeKind } from "./types";

// The phone's graph, relationship map, boards and dialogues, through
// /api/mobile/maps (apps/app/app/api/mobile/maps). The server reads boards and
// dialogues from their live rooms, and changes relationships with the web's
// own story actions.

export type ProjectLink = { source: string; target: string; kind: "wiki" | "embed" | "property" };

export type Relationship = { id: string; fromNodeId: string; toNodeId: string; type: string; label: string | null; directed: boolean };

// ---- Boards (apps/app/lib/canvas.ts) ----

export type CardData = {
  type: "note" | "text" | "image" | "group" | "sticky" | "shape" | "stroke";
  x: number;
  y: number;
  w?: number;
  h?: number;
  parentId?: string;
  color?: string;
  nodeId?: string;
  text?: string;
  url?: string;
  caption?: string;
  shape?: "rect" | "ellipse" | "diamond";
  shot?: string;
  move?: string;
  duration?: number;
};
export type EdgeData = { source: string; target: string; label?: string };
export type MarkData = { type: "pin" | "region" | "path"; nodeId?: string; label?: string; layer?: string };
export type Board = { map: boolean; cards: Record<string, CardData>; edges: Record<string, EdgeData>; marks: Record<string, MarkData> };

// ---- Dialogues (apps/app/lib/interactive/model.ts) ----

export type { DialogueGraph };

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

export const mapKeys = {
  links: (projectId: string) => `maps:links:${projectId}`,
  relationships: (projectId: string) => `maps:relationships:${projectId}`,
  board: (projectId: string, noteId: string) => `maps:board:${projectId}:${noteId}`,
  dialogue: (projectId: string, noteId: string) => `maps:dialogue:${projectId}:${noteId}`,
};

export const getLinks = (client: Client, projectId: string) => client.request<{ links: ProjectLink[] }>(`/api/mobile/maps/links?${q({ project: projectId })}`).then((r) => r.links);

export const getRelationships = (client: Client, projectId: string) =>
  client.request<{ relationships: Relationship[] }>(`/api/mobile/maps/relationships?${q({ project: projectId })}`).then((r) => r.relationships);

export const createRelationship = (client: Client, projectId: string, input: { fromNodeId: string; toNodeId: string; type: string; label?: string | null }) =>
  client.request<{ relationship: Relationship }>("/api/mobile/maps/relationships", { method: "POST", body: { project: projectId, action: "create", ...input } }).then((r) => r.relationship);

export const updateRelationship = (client: Client, projectId: string, id: string, patch: { type?: string; label?: string | null; reverse?: boolean }) =>
  client.request<{ relationship: Relationship }>("/api/mobile/maps/relationships", { method: "POST", body: { project: projectId, action: "update", id, ...patch } }).then((r) => r.relationship);

export const deleteRelationship = (client: Client, projectId: string, id: string) =>
  client.request<{ ok: true }>("/api/mobile/maps/relationships", { method: "POST", body: { project: projectId, action: "delete", id } });

export const getBoard = (client: Client, projectId: string, noteId: string) => client.request<{ board: Board }>(`/api/mobile/maps/board?${q({ project: projectId, note: noteId })}`).then((r) => r.board);

export type BoardChange = { action: "move"; id: string; x: number; y: number } | { action: "add-text"; text: string; x: number; y: number } | { action: "set-text"; id: string; text: string };

export const changeBoard = (client: Client, projectId: string, noteId: string, change: BoardChange) =>
  client.request<{ id: string }>("/api/mobile/maps/board", { method: "POST", body: { project: projectId, note: noteId, ...change } });

export const getDialogue = (client: Client, projectId: string, noteId: string) =>
  client.request<{ dialogue: DialogueGraph }>(`/api/mobile/maps/dialogue?${q({ project: projectId, note: noteId })}`).then((r) => r.dialogue);

// ---- The web's relationship types (apps/app/lib/story.ts relationshipTypes) ----

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

export const relationshipTypesFor = (among: RelationshipAmong) => relationshipTypes.filter((t) => t.among === "both" || t.among === among);

export function relationshipMeta(type: string) {
  const known = relationshipTypes.find((t) => t.id === type);
  return { label: known?.label ?? type, color: known?.color ?? "#868e96", directed: known && "directed" in known ? known.directed : false };
}

/** "Ana — Sister of — Ben". */
export const relationshipLabel = (rel: Relationship, title: (id: string) => string | undefined) =>
  `${title(rel.fromNodeId) || "Untitled"} — ${rel.label || relationshipMeta(rel.type).label} — ${title(rel.toNodeId) || "Untitled"}`;

/** The graph's colours for each kind (apps/app/components/views/graph-view.tsx), readable in light and dark. */
export const kindColor: Record<NodeKind, string> = {
  character: "#d5467f",
  location: "#109a82",
  scene: "#e2602a",
  chapter: "#b98021",
  research: "#7556d6",
  note: "#4f8ce0",
  folder: "#9b968e",
  canvas: "#9b968e",
  timeline: "#9b968e",
  entity: "#5f3dc4",
  dialogue: "#9b968e",
};

/** Where a note of a kind opens on the phone: boards and dialogues in their own screens, the rest in the reader. */
export function noteRoute(projectId: string, note: { id: string; kind: NodeKind }) {
  if (note.kind === "canvas") return { pathname: "/project/[projectId]/board/[noteId]", params: { projectId, noteId: note.id } } as const;
  if (note.kind === "dialogue") return { pathname: "/project/[projectId]/dialogue/[noteId]", params: { projectId, noteId: note.id } } as const;
  if (note.kind === "timeline") return { pathname: "/project/[projectId]/views/timeline", params: { projectId, timelineId: note.id } } as const;
  return { pathname: "/project/[projectId]/note/[noteId]", params: { projectId, noteId: note.id } } as const;
}

/** Boards, dialogues and timelines have a screen of their own on the phone. */
export const hasOwnScreen = (kind: NodeKind) => kind === "canvas" || kind === "dialogue" || kind === "timeline";
