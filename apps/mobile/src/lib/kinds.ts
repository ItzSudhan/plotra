import type { NodeKind } from "./types";
import type { IconName } from "../components/icon";

// How each kind of note is named and drawn.

export const kindLabel: Record<NodeKind, string> = {
  folder: "Folder",
  chapter: "Chapter",
  scene: "Scene",
  note: "Note",
  character: "Character",
  location: "Place",
  research: "Research",
  canvas: "Board",
  timeline: "Timeline",
  entity: "World page",
  dialogue: "Dialogue",
};

export const kindIcon: Record<NodeKind, IconName> = {
  folder: "folder",
  chapter: "book",
  scene: "scene",
  note: "note",
  character: "person",
  location: "place",
  research: "research",
  canvas: "board",
  timeline: "timeline",
  entity: "globe",
  dialogue: "dialogue",
};

/** Kinds whose text the phone can read and write. Boards, timelines and dialogues open on the web. */
export const hasText = (kind: NodeKind) => kind !== "canvas" && kind !== "timeline" && kind !== "dialogue" && kind !== "folder";

export const statusLabel = (status: string | null) => (status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/[-_]/g, " ") : null);

/** The default editorial stages (packages/db nodeStatuses). A project can have its own; those show as they are. */
export const defaultStatuses = ["draft", "revised", "final"] as const;

/** Project types (packages/db/src/schema/project.ts), named as the app names them (apps/app/lib/project-types.ts). */
const projectTypes: Record<string, string> = {
  novel: "Novel / series",
  web_serial: "Web serial",
  short_story: "Short story",
  screenplay: "Screenplay / TV",
  stage_play: "Stage play",
  comic: "Comic / manga",
  game: "Game / interactive",
  ttrpg: "Tabletop RPG",
  podcast: "Podcast / audio drama",
  nonfiction: "Non-fiction / research",
  franchise: "Franchise / IP bible",
};

export const projectTypeLabel = (type: string) => projectTypes[type] ?? "Project";
