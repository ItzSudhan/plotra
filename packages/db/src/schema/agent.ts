import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { node } from "./node";
import { project } from "./project";
import { version } from "./workflow";

// The AI agent (plan.md 2.11, Phase 9): whose model it runs on, conversations,
// one row per run for the run log, what each run changed (for "Undo run"), and
// long jobs that resume instead of starting over.

export const agentModes = ["ask", "suggest", "auto"] as const;
export type AgentMode = (typeof agentModes)[number];

export const aiProviders = ["anthropic", "openai", "openrouter", "compatible", "ollama"] as const;
export type AiProvider = (typeof aiProviders)[number];

/**
 * A user's own model: the project never pays for a model call (plan.md 2.11
 * "Whose model"). The key is encrypted with a server secret, used only on the
 * server for that user's runs, and never sent back to the browser.
 */
export const aiKey = pgTable("ai_key", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").$type<AiProvider>().notNull(),
  // For an OpenAI-compatible endpoint or a local model (Ollama).
  baseUrl: text("base_url"),
  // Null for a local model that needs none.
  encryptedKey: text("encrypted_key"),
  // The model for agent runs, and a cheaper one for inline editor actions.
  agentModel: text("agent_model").notNull(),
  fastModel: text("fast_model").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/** A conversation with the agent. Private to the person who started it. */
export const agentThread = pgTable(
  "agent_thread",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").default("New chat").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("agent_thread_project_user_idx").on(t.projectId, t.userId, t.updatedAt)],
);

/** One message, in the AI SDK's UI-message shape (`parts`). */
export const agentMessage = pgTable(
  "agent_message",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => agentThread.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant" | "system">().notNull(),
    parts: jsonb("parts").$type<unknown[]>().default([]).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("agent_message_thread_idx").on(t.threadId, t.createdAt)],
);

export const agentRunStatuses = ["running", "done", "failed", "stopped", "undone"] as const;
export type AgentRunStatus = (typeof agentRunStatuses)[number];

/** One call to a model on someone's behalf: the run log, and the tokens it used (on their own bill, or the workspace's credits). */
export const agentRun = pgTable(
  "agent_run",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    threadId: text("thread_id").references(() => agentThread.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    // `agent`: a chat turn. `inline`: an editor action (continue, rewrite…). `task`: one step of a long job.
    kind: text("kind").$type<"agent" | "inline" | "task">().default("agent").notNull(),
    mode: text("mode").$type<AgentMode>().default("ask").notNull(),
    status: text("status").$type<AgentRunStatus>().default("running").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    // Set for a run on the model Plotra provides to Pro workspaces: what it cost the workspace's
    // monthly allowance (apps/app/lib/billing/credits.ts). Null for a run on someone's own model.
    credits: integer("credits"),
    error: text("error"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [
    index("agent_run_workspace_idx").on(t.workspaceId, t.startedAt),
    index("agent_run_thread_idx").on(t.threadId),
  ],
);

/** What a run touched, and the snapshot to restore for "Undo run". */
export const agentChange = pgTable(
  "agent_change",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => agentRun.id, { onDelete: "cascade" }),
    // Null once the note is gone for good.
    nodeId: text("node_id").references(() => node.id, { onDelete: "set null" }),
    // `create`, `update`, `content`, `move`, `trash`… and anything else a tool reports.
    action: text("action").notNull(),
    // The document as it was before the run first touched it.
    beforeVersionId: text("before_version_id").references(() => version.id, { onDelete: "set null" }),
    // The row as it was (title, parent, properties…), for changes that aren't document text.
    before: jsonb("before").$type<Record<string, unknown>>(),
    summary: text("summary"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("agent_change_run_idx").on(t.runId)],
);

export type AgentTaskStep = {
  id: string;
  title: string;
  /** What the agent is asked to do for this step. */
  prompt: string;
  status: "pending" | "running" | "done" | "failed";
  runId?: string;
  /** The note the step produced or changed, to open from the list. */
  nodeId?: string;
  error?: string;
};

/** A long job (drafting an act) as a saved list of steps, run one request each (plan.md Phase 9d). */
export const agentTask = pgTable(
  "agent_task",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    threadId: text("thread_id").references(() => agentThread.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    mode: text("mode").$type<AgentMode>().default("suggest").notNull(),
    status: text("status").$type<"pending" | "running" | "paused" | "done" | "failed">().default("pending").notNull(),
    steps: jsonb("steps").$type<AgentTaskStep[]>().default([]).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("agent_task_project_user_idx").on(t.projectId, t.userId, t.updatedAt)],
);
