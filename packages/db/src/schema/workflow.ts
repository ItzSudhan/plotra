import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { node } from "./node";
import { project } from "./project";
import { bytea } from "./types";
import { release } from "./world";

// Writer workflow (plan.md 2.6, Phase 5): comment threads and version history.

/**
 * Where a comment thread sits in a document: Yjs relative positions (base64),
 * which keep pointing at the same characters as people edit around them.
 * They're stored here rather than as marks in the document, so commenters, who
 * can't write to the document, can still comment.
 */
export type CommentAnchor = { start: string; end: string };

export const commentThread = pgTable(
  "comment_thread",
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
    // Null for a comment on the whole note.
    anchor: jsonb("anchor").$type<CommentAnchor>(),
    // The text that was selected, shown when the anchor no longer resolves.
    quote: text("quote"),
    // An emoji when the thread is a beta reader's inline reaction rather than a discussion.
    reaction: text("reaction"),
    resolvedAt: timestamp("resolved_at"),
    resolvedById: text("resolved_by_id").references(() => user.id, { onDelete: "set null" }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("comment_thread_node_idx").on(t.nodeId)],
);

export const comment = pgTable(
  "comment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => commentThread.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    editedAt: timestamp("edited_at"),
  },
  (t) => [index("comment_thread_idx").on(t.threadId)],
);

/**
 * A snapshot of a document (its whole Yjs state). Stored in R2 when it's
 * configured (`r2Key`), otherwise inline in `snapshot`.
 */
export const version = pgTable(
  "version",
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
    // Null for automatic snapshots.
    name: text("name"),
    auto: boolean("auto").default(false).notNull(),
    // Set on the snapshots taken when a release is cut, for the changelog per release.
    releaseId: text("release_id").references(() => release.id, { onDelete: "set null" }),
    // The note's title when a release snapshot was taken, so the changelog can tell a rename. Null on other versions.
    title: text("title"),
    r2Key: text("r2_key"),
    snapshot: bytea("snapshot"),
    size: bigint("size", { mode: "number" }).default(0).notNull(),
    wordCount: integer("word_count").default(0).notNull(),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("version_node_idx").on(t.nodeId, t.createdAt)],
);

/**
 * A message in a project's chat (beat-the-competitors.md step 8): talk beside
 * the page, apart from comments, which are about the words they're anchored
 * to. `nodeId` null is the whole project's chat; a note's id is that note's own.
 */
export const chatMessage = pgTable(
  "chat_message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    nodeId: text("node_id").references(() => node.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("chat_message_project_idx").on(t.projectId, t.createdAt), index("chat_message_node_idx").on(t.nodeId, t.createdAt)],
);
