import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { node } from "./node";
import { project } from "./project";

// Review, editorial and approval (plan.md 2.8, Phase 7): required reviewers,
// approvals, and questionnaires for beta readers.

/**
 * A required reviewer: `reviewerId` must approve anything inside `nodeId`
 * (a folder), or anything tagged `tag`, before it enters an approval stage.
 * With neither set, the rule covers the whole project.
 */
export const reviewRule = pgTable(
  "review_rule",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    nodeId: text("node_id").references(() => node.id, { onDelete: "cascade" }),
    tag: text("tag"),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("review_rule_project_idx").on(t.projectId)],
);

export const approvalStatuses = ["pending", "approved", "changes"] as const;
export type ApprovalStatus = (typeof approvalStatuses)[number];

/** One reviewer's decision on one note. Asking again resets it to pending. */
export const approval = pgTable(
  "approval",
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
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").$type<ApprovalStatus>().default("pending").notNull(),
    // The stage the note moves to once everyone has approved.
    targetStage: text("target_stage"),
    note: text("note"),
    requestedById: text("requested_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    decidedAt: timestamp("decided_at"),
  },
  (t) => [uniqueIndex("approval_node_reviewer_idx").on(t.nodeId, t.reviewerId), index("approval_project_idx").on(t.projectId)],
);

export type Question = {
  id: string;
  prompt: string;
  type: "text" | "rating" | "choice";
  choices?: string[];
};

export type Answer = string | number | null;

/** Questions for beta readers about a chapter, a folder or the whole project. */
export const questionnaire = pgTable(
  "questionnaire",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    nodeId: text("node_id").references(() => node.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    intro: text("intro"),
    questions: jsonb("questions").$type<Question[]>().default([]).notNull(),
    open: boolean("open").default(true).notNull(),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("questionnaire_project_idx").on(t.projectId)],
);

export const questionnaireResponse = pgTable(
  "questionnaire_response",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    questionnaireId: text("questionnaire_id")
      .notNull()
      .references(() => questionnaire.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    answers: jsonb("answers").$type<Record<string, Answer>>().default({}).notNull(),
    submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("questionnaire_response_user_idx").on(t.questionnaireId, t.userId)],
);
