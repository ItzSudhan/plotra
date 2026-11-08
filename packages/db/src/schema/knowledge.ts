import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { node, nodeKind } from "./node";
import { project } from "./project";

// Linked knowledge (plan.md 2.4, Phase 2).

export const linkKinds = ["wiki", "embed", "property"] as const;
export type LinkKind = (typeof linkKinds)[number];
export const linkKind = pgEnum("link_kind", linkKinds);

/**
 * One link from a document (or a node-valued property) to another node. Rebuilt
 * from the source document every time its content syncs. Powers backlinks,
 * outgoing links and the graph.
 */
export const link = pgTable(
  "link",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    sourceNodeId: text("source_node_id")
      .notNull()
      .references(() => node.id, { onDelete: "cascade" }),
    targetNodeId: text("target_node_id")
      .notNull()
      .references(() => node.id, { onDelete: "cascade" }),
    targetHeading: text("target_heading"),
    kind: linkKind("kind").default("wiki").notNull(),
    // The text of the block the link sits in, for backlink previews.
    context: text("context"),
    // Order within the source document.
    ordinal: integer("ordinal").default(0).notNull(),
  },
  (t) => [
    index("link_source_idx").on(t.sourceNodeId),
    index("link_target_idx").on(t.targetNodeId),
    index("link_project_idx").on(t.projectId),
  ],
);

export const propertyTypes = ["text", "number", "date", "select", "multi_select", "node", "checkbox", "url"] as const;
export type PropertyType = (typeof propertyTypes)[number];
export const propertyType = pgEnum("property_type", propertyTypes);

export type PropertyOptions = {
  /** Choices for select / multi-select. */
  choices?: string[];
  /** Which node kinds a `node` property may point at (empty = any). */
  nodeKinds?: string[];
  /** A `node` property that holds several nodes. */
  multiple?: boolean;
};

/**
 * A typed property shown on every node of one kind: the template for that kind
 * (plan.md 2.4 "templates define default properties per kind").
 */
export const propertyDef = pgTable(
  "property_def",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    nodeKind: nodeKind("node_kind").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: propertyType("type").default("text").notNull(),
    options: jsonb("options").$type<PropertyOptions>().default({}).notNull(),
    position: text("position").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("property_def_kind_key_idx").on(t.projectId, t.nodeKind, t.key)],
);

/** A saved dockview arrangement ("Drafting", "Plotting"…), per user per project. */
export const layout = pgTable(
  "layout",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    state: jsonb("state").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [uniqueIndex("layout_user_project_name_idx").on(t.userId, t.projectId, t.name)],
);
