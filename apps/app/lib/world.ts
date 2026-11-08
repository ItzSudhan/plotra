import type { CanonStatus, ClaimStatus, EntityField, KnowledgeLayer, ReleaseKind, SetupKind, SetupStatus } from "@plotra/db/schema";
import type { IconName } from "@plotra/icons";
import { QUEST_STATE_KEY, QUEST_STATES } from "./interactive/quests";

// Shared vocabulary for story worlds (plan.md 2.8): canon status, knowledge
// layers, releases, reveal channels and the entity types a new world starts with.

export const canonMeta: Record<CanonStatus, { label: string; color: string; description: string }> = {
  canon: { label: "Canon", color: "#109a82", description: "Established: it's true in the story." },
  draft: { label: "Draft", color: "#9a938a", description: "Still being worked out." },
  speculative: { label: "Speculative", color: "#1971c2", description: "An idea that may or may not make it in." },
  retconned: { label: "Retconned", color: "#c2255c", description: "Was canon, then changed. The old version is kept." },
  non_canon: { label: "Non-canon", color: "#868e96", description: "Outside the story's continuity." },
};

export const layerMeta: Record<KnowledgeLayer, { label: string; description: string }> = {
  truth: { label: "Truth", description: "What's actually true." },
  belief: { label: "Belief", description: "What people are led to believe: a lie, propaganda, an unreliable narrator." },
};

export const releaseKindMeta: Record<ReleaseKind, { label: string }> = {
  book: { label: "Book" },
  chapter: { label: "Chapter" },
  episode: { label: "Episode" },
  season: { label: "Season" },
  issue: { label: "Issue" },
  volume: { label: "Volume" },
  patch: { label: "Patch" },
  session: { label: "Session" },
  beat: { label: "Marketing beat" },
  other: { label: "Release" },
};

/** Where a reveal can happen, until the project names its own channels. */
export const defaultChannels = ["Main text", "Trailer", "Interview", "Social post", "Supplementary story"];

/** Block-level reveal: "the audience is never told this". */
export const NEVER = "never";

export const claimMeta: Record<ClaimStatus, { label: string; color: string }> = {
  unverified: { label: "Unverified", color: "#b98021" },
  verified: { label: "Verified", color: "#109a82" },
  disputed: { label: "Disputed", color: "#c2255c" },
};

export const setupKindMeta: Record<SetupKind, { label: string }> = {
  foreshadowing: { label: "Foreshadowing" },
  chekhov: { label: "Chekhov's gun" },
  clue: { label: "Clue" },
  red_herring: { label: "Red herring" },
  mystery: { label: "Mystery" },
};

export const setupStatusMeta: Record<SetupStatus, { label: string; color: string }> = {
  open: { label: "Open", color: "#b98021" },
  paid: { label: "Paid off", color: "#109a82" },
  dropped: { label: "Dropped", color: "#868e96" },
};

/** Icons an entity type can use. */
export const entityIcons: IconName[] = [
  "users-group-rounded-linear",
  "buildings-linear",
  "box-linear",
  "flag-2-linear",
  "paw-linear",
  "leaf-linear",
  "global-linear",
  "chat-dots-linear",
  "stars-linear",
  "magic-stick-3-linear",
  "atom-linear",
  "lightbulb-linear",
  "crown-linear",
  "bolt-linear",
  "ghost-linear",
  "t-shirt-linear",
  "case-linear",
  "key-minimalistic-linear",
  "target-linear",
  "cup-star-linear",
  "fire-linear",
  "compass-linear",
  "music-note-linear",
  "book-2-linear",
];

export const isEntityIcon = (icon: string): icon is IconName => (entityIcons as string[]).includes(icon);

export type EntityTypeTemplate = { name: string; plural: string; icon: IconName; color: string; schema: EntityField[]; builtin?: string };

/**
 * The entity types a world bible starts with (plan.md 2.8). Characters and
 * places are binder kinds of their own; these are the rest. Every one can be
 * renamed, reshaped or deleted, and writers add their own.
 */
export const defaultEntityTypes: EntityTypeTemplate[] = [
  {
    name: "Faction",
    plural: "Factions",
    icon: "flag-2-linear",
    color: "#c2255c",
    schema: [
      { key: "kind", label: "Kind", type: "select", options: { choices: ["Nation", "Organisation", "Guild", "Family", "Cult", "Company"] } },
      { key: "leader", label: "Leader", type: "node", options: { nodeKinds: ["character"] } },
      { key: "base", label: "Based in", type: "node", options: { nodeKinds: ["location"] } },
      { key: "goal", label: "Goal", type: "text" },
    ],
  },
  {
    name: "Object",
    plural: "Objects",
    icon: "box-linear",
    color: "#b98021",
    schema: [
      { key: "owner", label: "Owner", type: "node", options: { nodeKinds: ["character"] } },
      { key: "location", label: "Kept at", type: "node", options: { nodeKinds: ["location"] } },
      { key: "significance", label: "Significance", type: "text" },
    ],
  },
  {
    name: "Event",
    plural: "Events",
    icon: "bolt-linear",
    color: "#e2602a",
    schema: [
      { key: "story-date", label: "Story date", type: "text" },
      { key: "location", label: "Location", type: "node", options: { nodeKinds: ["location"] } },
      { key: "participants", label: "Participants", type: "node", options: { nodeKinds: ["character"], multiple: true } },
    ],
  },
  {
    name: "Species",
    plural: "Species & creatures",
    icon: "paw-linear",
    color: "#2b8a3e",
    schema: [
      { key: "habitat", label: "Habitat", type: "text" },
      { key: "lifespan", label: "Lifespan", type: "text" },
      { key: "sapient", label: "Sapient", type: "checkbox" },
    ],
  },
  {
    name: "Culture",
    plural: "Cultures",
    icon: "global-linear",
    color: "#109a82",
    schema: [
      { key: "homeland", label: "Homeland", type: "node", options: { nodeKinds: ["location"] } },
      { key: "values", label: "Values", type: "text" },
    ],
  },
  {
    name: "Language",
    plural: "Languages",
    icon: "chat-dots-linear",
    color: "#1971c2",
    schema: [
      { key: "family", label: "Family", type: "text" },
      { key: "script", label: "Script", type: "text" },
    ],
  },
  {
    name: "Religion",
    plural: "Religions",
    icon: "stars-linear",
    color: "#5f3dc4",
    schema: [
      { key: "deities", label: "Deities", type: "text" },
      { key: "tenets", label: "Tenets", type: "text" },
    ],
  },
  {
    name: "System",
    plural: "Magic & tech systems",
    icon: "magic-stick-3-linear",
    color: "#9c36b5",
    schema: [
      { key: "source", label: "Source", type: "text" },
      { key: "limits", label: "Limits & costs", type: "text" },
    ],
  },
  {
    name: "Theme",
    plural: "Themes",
    icon: "lightbulb-linear",
    color: "#868e96",
    schema: [{ key: "statement", label: "Statement", type: "text" }],
  },
];

/** A quest's state: campaign progress for a GM, design status for a game writer (lib/interactive/quests.ts). */
export const questStateField: EntityField = {
  key: QUEST_STATE_KEY,
  label: "State",
  type: "select",
  options: { choices: QUEST_STATES.map((s) => s.label) },
};

/** The quest type the interactive module relies on (`entity_type.builtin = "quest"`). */
export const questEntityType: EntityTypeTemplate = {
  name: "Quest",
  plural: "Quests",
  icon: "target-linear",
  color: "#e2602a",
  builtin: "quest",
  schema: [
    { key: "giver", label: "Given by", type: "node", options: { nodeKinds: ["character"] } },
    { key: "prerequisites", label: "Prerequisites", type: "node", options: { nodeKinds: ["entity"], multiple: true } },
    { key: "objectives", label: "Objectives", type: "multi_select", options: { choices: [] } },
    { key: "reward", label: "Reward", type: "text" },
    { key: "reveals", label: "Reveals", type: "node", options: { multiple: true } },
    questStateField,
  ],
};
