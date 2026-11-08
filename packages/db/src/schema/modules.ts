import { bigint, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { node } from "./node";
import { project } from "./project";
import { bytea } from "./types";

// Tables for the optional modules (plan.md 2.8, Phase 7): research,
// production, interactive narrative and localization.

/**
 * A file clipped into a research note: a PDF, an image, a saved page. Stored
 * in R2 when it's configured (`r2Key`), otherwise inline in `data`.
 */
export const attachment = pgTable(
  "attachment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    nodeId: text("node_id")
      .notNull()
      .references(() => node.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    size: bigint("size", { mode: "number" }).default(0).notNull(),
    r2Key: text("r2_key"),
    data: bytea("data"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("attachment_node_idx").on(t.nodeId)],
);

export const lineStatuses = ["written", "approved", "recorded"] as const;
export type LineStatus = (typeof lineStatuses)[number];

/**
 * Recording state of one line of a voice or audio script (plan.md 2.8
 * "Voice/audio scripts"). The line itself is a dialogue block in the document;
 * this is keyed by its block id so the recording sheet can be ticked off
 * without edit access to the script.
 */
export const lineState = pgTable(
  "line_state",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    nodeId: text("node_id")
      .notNull()
      .references(() => node.id, { onDelete: "cascade" }),
    blockId: text("block_id").notNull(),
    status: text("status").$type<LineStatus>().default("written").notNull(),
    // Delivery notes for the actor or director.
    note: text("note"),
    updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.nodeId, t.blockId] }), index("line_state_project_idx").on(t.projectId)],
);

/**
 * A short text with a stable id and an optional character limit: UI text, an
 * item description, a caption, alt text (plan.md 2.8 "Short-text fields").
 * Dialogue lines get their string ids from the dialogue document instead.
 */
export const stringEntry = pgTable(
  "string_entry",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    // The stable String ID exported to the game or app.
    key: text("key").notNull(),
    category: text("category").default("ui").notNull(),
    text: text("text").default("").notNull(),
    charLimit: integer("char_limit"),
    // Where it's shown, for the writer and the translator.
    context: text("context"),
    nodeId: text("node_id").references(() => node.id, { onDelete: "set null" }),
    position: text("position").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [uniqueIndex("string_entry_project_key_idx").on(t.projectId, t.key)],
);

export const translationStatuses = ["draft", "translated", "reviewed", "approved"] as const;
export type TranslationStatus = (typeof translationStatuses)[number];

/**
 * One unit of text in one language. `unitKey` names the source: a document
 * block (`<nodeId>:<blockId>`) or a string (`str:<key>`). `sourceHash` is the
 * source text's hash when it was translated, so a changed source shows as stale.
 */
export const translation = pgTable(
  "translation",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    unitKey: text("unit_key").notNull(),
    locale: text("locale").notNull(),
    text: text("text").default("").notNull(),
    status: text("status").$type<TranslationStatus>().default("draft").notNull(),
    sourceHash: text("source_hash"),
    updatedById: text("updated_by_id").references(() => user.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.unitKey, t.locale] })],
);

export const glossaryRules = ["translate", "keep"] as const;
export type GlossaryRule = (typeof glossaryRules)[number];

/**
 * A term base entry (plan.md 2.8 "Localization"): the official spelling of a
 * name or invented word in one language, or a "do not translate" rule
 * (`locale` null = every language).
 */
export const glossaryTerm = pgTable(
  "glossary_term",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    locale: text("locale"),
    translation: text("translation"),
    rule: text("rule").$type<GlossaryRule>().default("translate").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("glossary_term_project_idx").on(t.projectId)],
);
