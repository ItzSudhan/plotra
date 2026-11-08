import { type AnyPgColumn, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import type { PropertyOptions, PropertyType } from "./knowledge";
import { node, type CanonStatus, type KnowledgeLayer } from "./node";
import { project } from "./project";
import { version } from "./workflow";

// Story worlds (plan.md 2.8, Phase 7): custom entity types, releases and
// reveals, character knowledge, foreshadowing and retcons.

/** One field of a custom entity type: the same shape as a `property_def` row. */
export type EntityField = { key: string; label: string; type: PropertyType; options?: PropertyOptions };

/**
 * A custom world-bible type ("Faction", "Costume", "Case"…). Its pages are
 * `entity` nodes; `schema` lists the typed properties each page shows.
 */
export const entityType = pgTable(
  "entity_type",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    plural: text("plural").notNull(),
    icon: text("icon").notNull(),
    color: text("color").notNull(),
    schema: jsonb("schema").$type<EntityField[]>().default([]).notNull(),
    // Set on types a module relies on (e.g. "quest"), so they can be found again after a rename.
    builtin: text("builtin"),
    position: text("position").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("entity_type_project_idx").on(t.projectId)],
);

export const releaseKinds = ["book", "chapter", "episode", "season", "issue", "volume", "patch", "session", "beat", "other"] as const;
export type ReleaseKind = (typeof releaseKinds)[number];

/**
 * Something the story ships in: a book, an episode, a patch, a session
 * (plan.md 2.8 "Releases"). Ordered by `position`. `nodeId` is the binder
 * folder it ships, if any: everything inside is revealed by this release.
 */
export const release = pgTable(
  "release",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind").$type<ReleaseKind>().default("book").notNull(),
    // ISO date (YYYY-MM-DD), planned or actual.
    date: text("date"),
    notes: text("notes"),
    position: text("position").notNull(),
    nodeId: text("node_id").references((): AnyPgColumn => node.id, { onDelete: "set null" }),
    // Set when the release is cut: every note is snapshotted for the changelog.
    releasedAt: timestamp("released_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("release_project_idx").on(t.projectId)],
);

/**
 * A tagged block of a document: its canon status, when it's revealed, or a
 * fact-check claim. The tags themselves live on the block in the Yjs doc;
 * these rows are rebuilt from it on every content sync (like `link`), so the
 * roadmap, sources and continuity views can query them.
 */
export const fact = pgTable(
  "fact",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    nodeId: text("node_id")
      .notNull()
      .references((): AnyPgColumn => node.id, { onDelete: "cascade" }),
    blockId: text("block_id").notNull(),
    ordinal: integer("ordinal").default(0).notNull(),
    excerpt: text("excerpt").default("").notNull(),
    canon: text("canon").$type<CanonStatus>(),
    // A release id, or "never" for something the audience is never told. No
    // foreign key: the doc is the source of truth and may name a deleted release.
    reveal: text("reveal"),
    channel: text("channel"),
    layer: text("layer").$type<KnowledgeLayer>(),
    claim: text("claim").$type<ClaimStatus>(),
    claimSourceId: text("claim_source_id"),
  },
  (t) => [index("fact_node_idx").on(t.nodeId), index("fact_project_idx").on(t.projectId)],
);

export const claimStatuses = ["unverified", "verified", "disputed"] as const;
export type ClaimStatus = (typeof claimStatuses)[number];

/** Who knows which secret, and from which scene (plan.md 2.8 "Character knowledge tracking"). */
export const knowledge = pgTable(
  "knowledge",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    characterNodeId: text("character_node_id")
      .notNull()
      .references((): AnyPgColumn => node.id, { onDelete: "cascade" }),
    // The secret: a note, or one block of it.
    factNodeId: text("fact_node_id")
      .notNull()
      .references((): AnyPgColumn => node.id, { onDelete: "cascade" }),
    factBlockId: text("fact_block_id"),
    // Null when they knew all along.
    learnedInNodeId: text("learned_in_node_id").references((): AnyPgColumn => node.id, { onDelete: "set null" }),
    // What they believe instead, when they've been lied to.
    layer: text("layer").$type<KnowledgeLayer>().default("truth").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("knowledge_project_idx").on(t.projectId)],
);

export const setupKinds = ["foreshadowing", "chekhov", "clue", "red_herring", "mystery"] as const;
export type SetupKind = (typeof setupKinds)[number];
export const setupStatuses = ["open", "paid", "dropped"] as const;
export type SetupStatus = (typeof setupStatuses)[number];

/** A setup and its payoff (plan.md 2.8 "Mystery & foreshadowing tracker"). */
export const setupPayoff = pgTable(
  "setup_payoff",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    kind: text("kind").$type<SetupKind>().default("foreshadowing").notNull(),
    title: text("title").notNull(),
    setupNodeId: text("setup_node_id").references((): AnyPgColumn => node.id, { onDelete: "set null" }),
    setupBlockId: text("setup_block_id"),
    payoffNodeId: text("payoff_node_id").references((): AnyPgColumn => node.id, { onDelete: "set null" }),
    payoffBlockId: text("payoff_block_id"),
    status: text("status").$type<SetupStatus>().default("open").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("setup_payoff_project_idx").on(t.projectId)],
);

/** Why a note stopped being canon, and what it said before (plan.md 2.8 "Retcons keep history"). */
export const retcon = pgTable(
  "retcon",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    nodeId: text("node_id")
      .notNull()
      .references((): AnyPgColumn => node.id, { onDelete: "cascade" }),
    // "Changed in Book 3 because…"
    releaseId: text("release_id").references(() => release.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    // The text as it stood before the retcon.
    versionId: text("version_id").references((): AnyPgColumn => version.id, { onDelete: "set null" }),
    previousCanon: text("previous_canon").$type<CanonStatus>(),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("retcon_node_idx").on(t.nodeId)],
);
