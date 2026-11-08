import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { entityType, release } from "./world";
import { user } from "./auth";
import { project } from "./project";
import { bytea } from "./types";

// Binder node kinds (plan.md 2.2). Canvases, timelines (plan.md 2.5) and
// branching dialogues (plan.md 2.8) live in the binder like any note, but
// aren't text documents: a canvas or dialogue is a Yjs doc of cards and edges,
// a timeline is rows in `timeline_event`. An `entity` is a world-bible page of
// a custom type (`entityTypeId`).
export const nodeKinds = [
  "folder",
  "chapter",
  "scene",
  "note",
  "character",
  "location",
  "research",
  "canvas",
  "timeline",
  "entity",
  "dialogue",
] as const;
export type NodeKind = (typeof nodeKinds)[number];
export const nodeKind = pgEnum("node_kind", nodeKinds);

// A node's status is a stage id of the project's editorial workflow
// (`ProjectSettings.stages`); these three are the default workflow.
export const nodeStatuses = ["draft", "revised", "final"] as const;
export type NodeStatus = string;

export const canonStatuses = ["canon", "draft", "speculative", "retconned", "non_canon"] as const;
export type CanonStatus = (typeof canonStatuses)[number];

/** Knowledge layers (plan.md 2.8): what's true, or what people are led to believe. */
export const knowledgeLayers = ["truth", "belief"] as const;
export type KnowledgeLayer = (typeof knowledgeLayers)[number];

/** A heading in a document, kept so links and previews don't need the whole document. */
export type NodeHeading = { id: string; level: number; text: string };

/** Typed property values (plan.md 2.4), keyed by `property_def.key`. */
export type PropertyValue = string | number | boolean | string[] | null;
export type NodeProperties = Record<string, PropertyValue>;

/** View settings for boards (canvas, timeline): which calendar, how lanes are grouped… */
export type NodeSettings = Record<string, string | number | boolean | null>;

/**
 * What project search matches against. Queries must use this same expression
 * for Postgres to use the index (`nodeSearchVector(node)`).
 */
export const nodeSearchVector = (t: { title: AnyPgColumn; synopsis: AnyPgColumn; text: AnyPgColumn }) =>
  sql`(setweight(to_tsvector('english', ${t.title}), 'A') || setweight(to_tsvector('english', coalesce(${t.synopsis}, '')), 'B') || setweight(to_tsvector('english', ${t.text}), 'C'))`;

/**
 * One entry in a project's binder. Siblings are ordered by `position`, a
 * fractional index (compare as plain strings, not with the database collation).
 *
 * The document itself lives in a Yjs doc on the collab server (one per node).
 * `ydoc` is the latest snapshot it pushed back, and `text`, `headings`,
 * `contentTags` and `wordCount` are derived from it for search, links and stats.
 */
export const node = pgTable(
  "node",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnyPgColumn => node.id, { onDelete: "cascade" }),
    kind: nodeKind("kind").default("note").notNull(),
    title: text("title").notNull(),
    aliases: text("aliases").array().default([]).notNull(),
    position: text("position").notNull(),
    status: text("status").$type<NodeStatus>().default("draft").notNull(),
    // World bible (plan.md 2.8): the custom type of an `entity`, canon status,
    // and when and where the audience learns this (null release = not revealed yet).
    entityTypeId: text("entity_type_id").references((): AnyPgColumn => entityType.id, { onDelete: "set null" }),
    canon: text("canon").$type<CanonStatus>().default("draft").notNull(),
    revealReleaseId: text("reveal_release_id").references((): AnyPgColumn => release.id, { onDelete: "set null" }),
    revealChannel: text("reveal_channel"),
    layer: text("layer").$type<KnowledgeLayer>().default("truth").notNull(),
    synopsis: text("synopsis"),
    tags: text("tags").array().default([]).notNull(),
    properties: jsonb("properties").$type<NodeProperties>().default({}).notNull(),
    settings: jsonb("settings").$type<NodeSettings>().default({}).notNull(),
    // Phase 1 stored the Plate value here. It is only read now, to seed a node's
    // Yjs doc the first time the collab server opens it.
    content: jsonb("content"),
    ydoc: bytea("ydoc"),
    text: text("text").default("").notNull(),
    headings: jsonb("headings").$type<NodeHeading[]>().default([]).notNull(),
    contentTags: text("content_tags").array().default([]).notNull(),
    wordCount: integer("word_count").default(0).notNull(),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    // Set when the node is moved to the trash; descendants of a trashed node are hidden with it.
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("node_project_id_idx").on(t.projectId),
    index("node_parent_id_idx").on(t.parentId),
    // Project search (plan.md Phase 9a): title first, then synopsis, then the text.
    index("node_search_idx").using("gin", nodeSearchVector(t)),
  ],
);
