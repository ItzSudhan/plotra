import { boolean, doublePrecision, index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { node } from "./node";
import { project } from "./project";

// Story tools (plan.md 2.5, Phase 4): plot threads for the plot grid and
// timeline lanes, typed character relationships, custom calendars and
// timeline events.

/** A plot thread (subplot, arc): a column in the plot grid and a timeline lane. */
export const plotThread = pgTable(
  "plot_thread",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    position: text("position").notNull(),
    // The scene that resolves the thread; later scenes in it are a continuity warning.
    closedNodeId: text("closed_node_id").references(() => node.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("plot_thread_project_idx").on(t.projectId)],
);

/** A plot grid cell: what happens to a thread in a scene. Its existence puts the scene in the thread. */
export const sceneThread = pgTable(
  "scene_thread",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    nodeId: text("node_id")
      .notNull()
      .references(() => node.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => plotThread.id, { onDelete: "cascade" }),
    note: text("note").default("").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.nodeId, t.threadId] }), index("scene_thread_project_idx").on(t.projectId)],
);

/** A typed, labelled edge between two characters, for the relationship map. */
export const relationship = pgTable(
  "relationship",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    fromNodeId: text("from_node_id")
      .notNull()
      .references(() => node.id, { onDelete: "cascade" }),
    toNodeId: text("to_node_id")
      .notNull()
      .references(() => node.id, { onDelete: "cascade" }),
    // ally, rival, family… (see lib/story.ts), or anything the writer types.
    type: text("type").notNull(),
    label: text("label"),
    // One-way ("mentor of", "loves") or mutual ("siblings").
    directed: boolean("directed").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("relationship_project_idx").on(t.projectId)],
);

export type CalendarMonth = { name: string; days: number };
export type CalendarEra = { name: string; startYear: number };

/**
 * How a custom calendar counts time. Gregorian calendars have no definition;
 * custom ones list their months and how long a day is, and may name eras.
 */
export type CalendarDefinition = {
  months: CalendarMonth[];
  hoursPerDay: number;
  eras?: CalendarEra[];
};

/** A calendar for fantasy or historical timelines (plan.md 2.5). */
export const calendar = pgTable(
  "calendar",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    definition: jsonb("definition").$type<CalendarDefinition>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("calendar_project_idx").on(t.projectId)],
);

/**
 * An event on a timeline that isn't a scene (scenes appear by their story
 * date). Times are minutes since the epoch of the timeline's calendar, so one
 * representation covers every calendar.
 */
export const timelineEvent = pgTable(
  "timeline_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    timelineNodeId: text("timeline_node_id")
      .notNull()
      .references(() => node.id, { onDelete: "cascade" }),
    // An optional note the event is about (a character's birth, a battle's location).
    nodeId: text("node_id").references(() => node.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    start: doublePrecision("start").notNull(),
    end: doublePrecision("end"),
    // Lane key under the timeline's grouping, e.g. a thread id; null = no lane.
    lane: text("lane"),
    color: text("color"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("timeline_event_timeline_idx").on(t.timelineNodeId)],
);
