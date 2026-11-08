import { bigserial, boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import type { ProjectSettings } from "./project";

// Workspace-wide switches, and operational tables with no owner in the
// product: usage events and rate limits, which only the server's own
// connection reads or writes.

/** Switches a workspace owner or admin sets for the whole workspace. */
export const workspaceSettings = pgTable("workspace_settings", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  // The AI agent is off until someone turns it on (plan.md 2.11 "Trust").
  aiEnabled: boolean("ai_enabled").default(false).notNull(),
  // A promise of no AI (beat-the-competitors.md, 14): while it stands nobody
  // can switch AI on, and everyone in the workspace is shown it. Only the
  // owner makes it or lifts it (apps/app/lib/agent/no-ai.ts).
  noAiSince: timestamp("no_ai_since"),
  noAiById: text("no_ai_by_id").references(() => user.id, { onDelete: "set null" }),
  // When the owner lifted it. AI stays off for a week after, and the workspace is shown who lifted it and when.
  noAiLiftedAt: timestamp("no_ai_lifted_at"),
  noAiLiftedById: text("no_ai_lifted_by_id").references(() => user.id, { onDelete: "set null" }),
  // The setup every project of the workspace starts from where neither the
  // project nor the person chose one (apps/app/lib/shell-defaults.ts).
  defaults: jsonb("defaults").$type<NonNullable<ProjectSettings["shellDefaults"]>>(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Usage as plain rows (plan.md 1 "Product analytics"): sign-ups, first scene
 * written, invitations, so "who uses this?" has an honest answer. No foreign keys,
 * so deleting an account doesn't rewrite history; no content is ever stored.
 */
export const event = pgTable(
  "event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    userId: text("user_id"),
    workspaceId: text("workspace_id"),
    projectId: text("project_id"),
    properties: jsonb("properties").$type<Record<string, string | number | boolean | null>>(),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("event_name_at_idx").on(t.name, t.at), index("event_user_idx").on(t.userId)],
);

/** Fixed-window counters for rate limits (lib/rate-limit.ts): `key` is "<what>:<who>". */
export const throttle = pgTable("throttle", {
  key: text("key").primaryKey(),
  count: integer("count").default(0).notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
