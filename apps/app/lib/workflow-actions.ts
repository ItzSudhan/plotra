"use server";

import { schema } from "@plotra/db";
import type { CommentAnchor, ScriptFormat } from "@plotra/db/schema";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import * as Y from "yjs";
import { getNodeAccess, requireNodeAccess, requireProjectAccess } from "./access";
import { indexCanvas, canvasMaps, type CardData, type EdgeData, type MapMeta, type MarkData } from "./canvas";
import { ydocToValue } from "./collab/ydoc";
import { requireSession } from "./data";
import { userDb } from "./db";
import { blockTags, indexDocument, type DocNode } from "./doc-index";
import { computeHorizon } from "./horizon";
import { dialogueGraphFromUpdate, indexDialogue, type DialogueGraph } from "./interactive/model";
import { isDocumentKind } from "./story";
import { isReaction } from "./editorial";
import { nodeFormat } from "./modules";
import { logActivity, mentionedIn, notify, projectPeople, titleOf, type ProjectPerson } from "./notify";
import { assertStorage } from "./quotas";
import { rateLimit } from "./rate-limit";
import { readOnly, transaction } from "./request-cache";
import { flatten, indexNodes } from "./tree";
import { listNodes } from "./binder";
import { deleteSnapshots, insertVersion, loadSnapshot, makeRoom } from "./versions";
import { assertUnlocked } from "./editorial-guard";
import { readRestoreToken, restoreToken } from "./comment-restore";

// Writer workflow (plan.md 2.6, Phase 5): comment threads, version history,
// and the stitched-together manuscript for the Read view.

const { comment, commentThread, node, version, release } = schema;

const MAX_COMMENT = 5000;
const MAX_QUOTE = 500;
const MAX_ANCHOR = 2000;
const MAX_SNAPSHOT = 20 * 1024 * 1024;
// Abuse limits (plan.md 8.2), far above what a review pass or a day of saving
// versions comes to. Reactions count as comments.
const COMMENT_LIMIT = { limit: 600, windowSeconds: 3600 };
const VERSION_LIMIT = { limit: 120, windowSeconds: 3600 };

// ---- People -------------------------------------------------------------------

export type Person = ProjectPerson;

/** The project's people, guests included: names for comment authors, suggestions and versions, and who can be @-mentioned. */
export async function listPeople(projectId: string): Promise<Person[]> {
  return readOnly(async () => {
    const { project: found } = await requireProjectAccess(projectId);
    return projectPeople(projectId, found.organizationId);
  });
}

/**
 * Tells the authors of suggestions the signed-in user just accepted or
 * rejected. The decision itself is a document edit, made in the editor and
 * synced like any other; this only sends word of it. Authors must be people of
 * the project, so the call can't be used to message anyone else.
 */
export async function suggestionsResolved(projectId: string, nodeId: string, authorIds: string[], accepted: boolean): Promise<void> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    const { project } = await requireNodeAccess(projectId, nodeId, "edit");
    await rateLimit("suggestion-notice", me.id, COMMENT_LIMIT);
    const people = new Set((await projectPeople(projectId, project.organizationId)).map((p) => p.id));
    const authors = [...new Set(authorIds)].filter((id) => people.has(id)).slice(0, 50);
    if (!authors.length) return;
    await notify(projectId, authors, "suggestion_decided", { nodeId, payload: { title: await titleOf(nodeId), decision: accepted ? "accepted" : "rejected" } });
  });
}

// ---- Comments -------------------------------------------------------------------

export type CommentRow = { id: string; authorId: string | null; body: string; createdAt: Date; editedAt: Date | null };
export type CommentThreadRow = {
  id: string;
  anchor: CommentAnchor | null;
  quote: string | null;
  /** An emoji when the thread is a one-click reaction to the passage rather than a discussion. */
  reaction: string | null;
  resolvedAt: Date | null;
  resolvedById: string | null;
  createdById: string | null;
  createdAt: Date;
  comments: CommentRow[];
};

/** Every comment thread on a note, oldest first. */
export async function listComments(projectId: string, nodeId: string): Promise<CommentThreadRow[]> {
  return readOnly(async () => {
    await requireNodeAccess(projectId, nodeId);
    const [threads, comments] = await userDb((tx) =>
      Promise.all([
        tx
          .select({
            id: commentThread.id,
            anchor: commentThread.anchor,
            quote: commentThread.quote,
            reaction: commentThread.reaction,
            resolvedAt: commentThread.resolvedAt,
            resolvedById: commentThread.resolvedById,
            createdById: commentThread.createdById,
            createdAt: commentThread.createdAt,
          })
          .from(commentThread)
          .where(eq(commentThread.nodeId, nodeId))
          .orderBy(asc(commentThread.createdAt)),
        tx
          .select({
            id: comment.id,
            threadId: comment.threadId,
            authorId: comment.authorId,
            body: comment.body,
            createdAt: comment.createdAt,
            editedAt: comment.editedAt,
          })
          .from(comment)
          .innerJoin(commentThread, eq(commentThread.id, comment.threadId))
          .where(eq(commentThread.nodeId, nodeId))
          .orderBy(asc(comment.createdAt)),
      ]),
    );
    const byThread = new Map<string, CommentRow[]>();
    for (const { threadId, ...c } of comments) byThread.set(threadId, [...(byThread.get(threadId) ?? []), c]);
    return threads.map((t) => ({ ...t, comments: byThread.get(t.id) ?? [] }));
  });
}

function cleanBody(body: string) {
  const clean = body.trim().slice(0, MAX_COMMENT);
  if (!clean) throw new Error("Write something first.");
  return clean;
}

function cleanAnchor(anchor: CommentAnchor | null | undefined): CommentAnchor | null {
  if (!anchor) return null;
  const ok = (s: unknown) => typeof s === "string" && s.length > 0 && s.length <= MAX_ANCHOR && /^[A-Za-z0-9+/=]+$/.test(s);
  if (!ok(anchor.start) || !ok(anchor.end)) throw new Error("Invalid comment position.");
  return { start: anchor.start, end: anchor.end };
}

async function threadFor(projectId: string, threadId: string) {
  const [row] = await userDb((tx) =>
    tx
      .select({ id: commentThread.id, nodeId: commentThread.nodeId, createdById: commentThread.createdById })
      .from(commentThread)
      .where(and(eq(commentThread.id, threadId), eq(commentThread.projectId, projectId))),
  );
  if (!row) throw new Error("That comment no longer exists.");
  return row;
}

/**
 * Starts a thread on a passage (or the whole note when `anchor` is null). Needs
 * `comment`. With `reaction` (one of lib/editorial's emojis) the thread is a
 * reader's one-click reaction: its only comment is the emoji, and reacting the
 * same way to the same passage twice keeps the first.
 */
export async function createCommentThread(
  projectId: string,
  nodeId: string,
  input: { anchor: CommentAnchor | null; quote?: string | null; body: string; reaction?: string | null },
): Promise<{ id: string }> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    const { project } = await requireNodeAccess(projectId, nodeId, "comment");
    await rateLimit("comment", me.id, COMMENT_LIMIT);
    const reaction = input.reaction || null;
    if (reaction && !isReaction(reaction)) throw new Error("Unknown reaction.");
    const body = reaction ?? cleanBody(input.body);
    const anchor = cleanAnchor(input.anchor);
    const created = await userDb(async (tx) => {
      if (reaction) {
        const mine = await tx
          .select({ id: commentThread.id, anchor: commentThread.anchor })
          .from(commentThread)
          .where(and(eq(commentThread.nodeId, nodeId), eq(commentThread.createdById, me.id), eq(commentThread.reaction, reaction)));
        const same = mine.find((t) => t.anchor?.start === anchor?.start && t.anchor?.end === anchor?.end);
        if (same) return { id: same.id, fresh: false };
      }
      const [thread] = await tx
        .insert(commentThread)
        .values({ projectId, nodeId, anchor, quote: input.quote?.slice(0, MAX_QUOTE) || null, reaction, createdById: me.id })
        .returning({ id: commentThread.id });
      await tx.insert(comment).values({ projectId, threadId: thread.id, authorId: me.id, body });
      return { id: thread.id, fresh: true };
    });
    // A one-click reaction isn't a conversation: it's counted in the Reviews view, not announced.
    if (created.fresh && !reaction) {
      const title = await titleOf(nodeId);
      await logActivity(projectId, "comment_added", { nodeId, payload: { title } });
      await notify(projectId, await mentionedIn(projectId, project.organizationId, body), "mention", { nodeId, payload: { title, threadId: created.id } });
    }
    return { id: created.id };
  });
}

export async function replyToThread(projectId: string, threadId: string, body: string): Promise<void> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    const thread = await threadFor(projectId, threadId);
    const { project } = await requireNodeAccess(projectId, thread.nodeId, "comment");
    await rateLimit("comment", me.id, COMMENT_LIMIT);
    const clean = cleanBody(body);
    const earlier = await userDb(async (tx) => {
      const authors = await tx.selectDistinct({ id: comment.authorId }).from(comment).where(eq(comment.threadId, threadId));
      await tx.insert(comment).values({ projectId, threadId, authorId: me.id, body: clean });
      // Replying reopens a resolved thread, like most review tools.
      await tx.update(commentThread).set({ resolvedAt: null, resolvedById: null }).where(eq(commentThread.id, threadId));
      return authors.map((a) => a.id);
    });
    const title = await titleOf(thread.nodeId);
    const payload = { title, threadId };
    await logActivity(projectId, "comment_added", { nodeId: thread.nodeId, payload: { title } });
    // Someone named in the reply hears that, not also that their thread was answered.
    const mentioned = await mentionedIn(projectId, project.organizationId, clean);
    await notify(projectId, mentioned, "mention", { nodeId: thread.nodeId, payload });
    await notify(projectId, [thread.createdById, ...earlier].filter((id) => !id || !mentioned.includes(id)), "reply", { nodeId: thread.nodeId, payload });
  });
}

export async function setThreadResolved(projectId: string, threadId: string, resolved: boolean): Promise<void> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    const thread = await threadFor(projectId, threadId);
    await requireNodeAccess(projectId, thread.nodeId, "comment");
    await userDb((tx) =>
      tx
        .update(commentThread)
        .set(resolved ? { resolvedAt: new Date(), resolvedById: me.id } : { resolvedAt: null, resolvedById: null })
        .where(eq(commentThread.id, threadId)),
    );
  });
}

async function commentFor(projectId: string, commentId: string) {
  const [row] = await userDb((tx) =>
    tx
      .select({ id: comment.id, threadId: comment.threadId, authorId: comment.authorId, nodeId: commentThread.nodeId })
      .from(comment)
      .innerJoin(commentThread, eq(commentThread.id, comment.threadId))
      .where(and(eq(comment.id, commentId), eq(comment.projectId, projectId))),
  );
  if (!row) throw new Error("That comment no longer exists.");
  return row;
}

/** Edits your own comment. */
export async function editComment(projectId: string, commentId: string, body: string): Promise<void> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    const row = await commentFor(projectId, commentId);
    await requireNodeAccess(projectId, row.nodeId, "comment");
    if (row.authorId !== me.id) throw new Error("You can only edit your own comments.");
    await userDb((tx) => tx.update(comment).set({ body: cleanBody(body), editedAt: new Date() }).where(eq(comment.id, commentId)));
  });
}

/**
 * Deletes your own comment, or anyone's with `manage`. A thread with no comments
 * left goes too. Returns a short-lived token that `restoreComment` takes to put
 * it all back (lib/comment-restore.ts), so the panel can offer Undo.
 */
export async function deleteComment(projectId: string, commentId: string): Promise<{ undo: string }> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    const row = await commentFor(projectId, commentId);
    const { access } = await requireNodeAccess(projectId, row.nodeId, "comment");
    if (row.authorId !== me.id && !access.actions.has("manage")) throw new Error("You can only delete your own comments.");
    const removed = await userDb(async (tx) => {
      const [gone] = await tx
        .delete(comment)
        .where(eq(comment.id, commentId))
        .returning({ id: comment.id, threadId: comment.threadId, authorId: comment.authorId, body: comment.body, createdAt: comment.createdAt, editedAt: comment.editedAt });
      const [left] = await tx.select({ id: comment.id }).from(comment).where(eq(comment.threadId, row.threadId)).limit(1);
      if (left) return { gone, thread: null };
      const [thread] = await tx.delete(commentThread).where(eq(commentThread.id, row.threadId)).returning({
        id: commentThread.id,
        nodeId: commentThread.nodeId,
        anchor: commentThread.anchor,
        quote: commentThread.quote,
        reaction: commentThread.reaction,
        resolvedAt: commentThread.resolvedAt,
        resolvedById: commentThread.resolvedById,
        createdById: commentThread.createdById,
        createdAt: commentThread.createdAt,
      });
      return { gone, thread: thread ?? null };
    });
    if (!removed.gone) throw new Error("That comment no longer exists.");
    return { undo: restoreToken({ projectId, nodeId: row.nodeId, by: me.id, comment: removed.gone, thread: removed.thread }) };
  });
}

/**
 * Puts back a comment you just deleted, with its id, author, words, times and
 * (if it went too) its thread and anchor, from the token `deleteComment` gave.
 */
export async function restoreComment(projectId: string, token: string): Promise<void> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    const saved = readRestoreToken(token, projectId, me.id);
    if (!saved) throw new Error("That comment can't be brought back any more.");
    const { access } = await requireNodeAccess(projectId, saved.nodeId, "comment");
    // Whoever deleted it could; check they still can.
    if (saved.comment.authorId !== me.id && !access.actions.has("manage")) throw new Error("You can only restore your own comments.");
    await userDb(async (tx) => {
      if (saved.thread) {
        await tx
          .insert(commentThread)
          .values({ ...saved.thread, projectId })
          .onConflictDoNothing({ target: commentThread.id });
      }
      const [thread] = await tx
        .select({ id: commentThread.id })
        .from(commentThread)
        .where(and(eq(commentThread.id, saved.comment.threadId), eq(commentThread.projectId, projectId), eq(commentThread.nodeId, saved.nodeId)));
      if (!thread) throw new Error("That comment's thread has gone, so it can't be brought back.");
      await tx.insert(comment).values({ ...saved.comment, projectId }).onConflictDoNothing({ target: comment.id });
    });
  });
}

// ---- Version history ---------------------------------------------------------------

export type VersionRow = {
  id: string;
  name: string | null;
  auto: boolean;
  wordCount: number;
  size: number;
  createdById: string | null;
  createdAt: Date;
};

export async function listVersions(projectId: string, nodeId: string): Promise<VersionRow[]> {
  return readOnly(async () => {
    await requireNodeAccess(projectId, nodeId);
    return userDb((tx) =>
      tx
        .select({
          id: version.id,
          name: version.name,
          auto: version.auto,
          wordCount: version.wordCount,
          size: version.size,
          createdById: version.createdById,
          createdAt: version.createdAt,
        })
        .from(version)
        .where(eq(version.nodeId, nodeId))
        .orderBy(desc(version.createdAt))
        .limit(200),
    );
  });
}

function decodeState(base64: string) {
  const state = new Uint8Array(Buffer.from(base64, "base64"));
  if (!state.length || state.length > MAX_SNAPSHOT) throw new Error("That snapshot is too large.");
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, state);
  } catch {
    throw new Error("That snapshot is unreadable.");
  }
  return { state, doc };
}

/**
 * Saves a named snapshot of a note. The client sends its live Yjs state (more
 * recent than the server's copy, which lags by a few seconds); without one, the
 * last state the collab server synced is used.
 */
export async function createVersion(
  projectId: string,
  nodeId: string,
  name: string | null,
  stateBase64?: string,
  /** Set when this is the safety copy taken before restoring a version: that version's name, for the activity feed. */
  restoring?: string,
): Promise<VersionRow> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    const { project } = await requireNodeAccess(projectId, nodeId, "edit");
    // Restoring rewrites the note, which a locked stage forbids to all but its approvers. Naming a version doesn't.
    if (restoring !== undefined) await assertUnlocked(projectId, nodeId);
    await rateLimit("version", me.id, VERSION_LIMIT);
    const [row] = await userDb((tx) => tx.select({ ydoc: node.ydoc, kind: node.kind }).from(node).where(eq(node.id, nodeId)));
    let state: Uint8Array;
    let words: number;
    if (stateBase64) {
      const decoded = decodeState(stateBase64);
      state = decoded.state;
      words =
        row.kind === "canvas" ? indexCanvas(decoded.doc).words : row.kind === "dialogue" ? indexDialogue(decoded.doc).words : indexDocument(ydocToValue(state)).words;
      decoded.doc.destroy();
    } else {
      if (!row.ydoc?.length) throw new Error("Nothing to snapshot yet.");
      state = row.ydoc;
      words = isDocumentKind(row.kind) ? indexDocument(ydocToValue(state)).words : 0;
    }
    const clean = name?.trim().slice(0, 80) || null;
    // A version counts against the workspace's storage (plan.md 8.2). Old
    // automatic snapshots give way to it; past them, this one isn't added.
    await makeRoom(project.organizationId, state.length);
    await assertStorage(project.organizationId, state.length);
    const created = await userDb((tx) =>
      insertVersion(tx, { projectId, nodeId, name: clean, auto: false, state, wordCount: words, createdById: me.id }),
    );
    if (restoring !== undefined) {
      await logActivity(projectId, "version_restored", { nodeId, payload: { title: await titleOf(nodeId), name: String(restoring).slice(0, 80) } });
    } else if (clean) {
      await logActivity(projectId, "version_named", { nodeId, payload: { title: await titleOf(nodeId), name: clean } });
    }
    return { id: created.id, name: clean, auto: false, wordCount: words, size: state.length, createdById: me.id, createdAt: created.createdAt };
  });
}

export type VersionContent =
  | { kind: "document"; value: DocNode[] }
  | { kind: "canvas"; cards: Record<string, CardData>; edges: Record<string, EdgeData>; /** A map's pins, regions and paths, and its picture. */ marks: Record<string, MarkData>; map: MapMeta }
  | ({ kind: "dialogue" } & DialogueGraph);

/** A version's content, to preview, compare and restore. */
export async function getVersionContent(projectId: string, versionId: string): Promise<VersionContent> {
  return readOnly(async () => {
    const [row] = await userDb((tx) =>
      tx
        .select({ nodeId: version.nodeId, snapshot: version.snapshot, r2Key: version.r2Key, kind: node.kind })
        .from(version)
        .innerJoin(node, eq(node.id, version.nodeId))
        .where(and(eq(version.id, versionId), eq(version.projectId, projectId))),
    );
    if (!row) throw new Error("That version no longer exists.");
    await requireNodeAccess(projectId, row.nodeId);
    const state = await loadSnapshot(row);
    if (row.kind === "canvas") {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, state);
      const { cards, edges, marks, meta } = canvasMaps(doc);
      const content = {
        kind: "canvas" as const,
        cards: cards.toJSON() as Record<string, CardData>,
        edges: edges.toJSON() as Record<string, EdgeData>,
        marks: marks.toJSON() as Record<string, MarkData>,
        map: meta.toJSON() as MapMeta,
      };
      doc.destroy();
      return content;
    }
    if (row.kind === "dialogue") return { kind: "dialogue", ...dialogueGraphFromUpdate(state) };
    return { kind: "document", value: ydocToValue(state) };
  });
}

export async function renameVersion(projectId: string, versionId: string, name: string | null): Promise<void> {
  return transaction(async () => {
    const [row] = await userDb((tx) =>
      tx.select({ nodeId: version.nodeId }).from(version).where(and(eq(version.id, versionId), eq(version.projectId, projectId))),
    );
    if (!row) throw new Error("That version no longer exists.");
    await requireNodeAccess(projectId, row.nodeId, "edit");
    const clean = name?.trim().slice(0, 80) || null;
    // Naming an automatic snapshot keeps it from being pruned.
    await userDb((tx) => tx.update(version).set({ name: clean, ...(clean && { auto: false }) }).where(eq(version.id, versionId)));
    if (clean) await logActivity(projectId, "version_named", { nodeId: row.nodeId, payload: { title: await titleOf(row.nodeId), name: clean } });
  });
}

export async function deleteVersion(projectId: string, versionId: string): Promise<void> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    const [row] = await userDb((tx) =>
      tx
        .select({ nodeId: version.nodeId, createdById: version.createdById, r2Key: version.r2Key, name: version.name })
        .from(version)
        .where(and(eq(version.id, versionId), eq(version.projectId, projectId))),
    );
    if (!row) return;
    const { access } = await requireNodeAccess(projectId, row.nodeId, "edit");
    if (row.createdById !== me.id && !access.actions.has("manage")) throw new Error("Only whoever saved it, or a manager, can delete a version.");
    await userDb((tx) => tx.delete(version).where(eq(version.id, versionId)));
    await deleteSnapshots([row.r2Key]);
  });
}

// ---- Manuscript ---------------------------------------------------------------------

export type ManuscriptSection = {
  id: string;
  title: string;
  kind: string;
  depth: number;
  /** The format the section is written in (`node.settings.format`). */
  format: ScriptFormat;
  value: DocNode[];
};

const MAX_SECTIONS = 400;

/**
 * Every document under `rootId` (or the whole project) in binder order, as
 * last synced, for the Read view.
 */
export async function getManuscript(projectId: string, rootId: string | null, horizonId?: string | null): Promise<ManuscriptSection[]> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    if (rootId) await requireNodeAccess(projectId, rootId);
    const nodes = await listNodes(projectId);
    const index = indexNodes(nodes);
    const root = rootId ? index.byId.get(rootId) : undefined;
    // "World as of release X" (plan.md 2.8): only what the audience knows by then, and the folders holding it.
    const horizon = horizonId
      ? computeHorizon(
          nodes,
          await userDb((tx) => tx.select({ id: release.id, position: release.position, nodeId: release.nodeId }).from(release).where(eq(release.projectId, projectId))),
          horizonId,
        )
      : null;
    const ordered = (root ? [root, ...flatten(index, root.id)] : flatten(index)).filter(
      (n) => isDocumentKind(n.kind) && (!horizon || horizon.shows(n.id)),
    );
    const depthOf = (id: string) => {
      let depth = 0;
      for (let n = index.byId.get(id); n?.parentId && n.id !== rootId; n = index.byId.get(n.parentId)) depth++;
      return depth;
    };
    const picked = ordered.slice(0, MAX_SECTIONS);
    const ids = picked.map((n) => n.id);
    const rows = ids.length
      ? await userDb((tx) =>
          tx.select({ id: node.id, ydoc: node.ydoc, content: node.content }).from(node).where(inArray(node.id, ids)),
        )
      : [];
    const bodies = new Map(rows.map((r) => [r.id, r]));

    // Passages tagged for a later release (or never revealed) are left out, wherever they're nested.
    const revealed = (list: DocNode[]): DocNode[] =>
      list.flatMap((b) => {
        if (!horizon!.knowsBlock(blockTags(b)?.reveal)) return [];
        return Array.isArray(b.children) && b.children.some((c) => typeof c.text !== "string") ? [{ ...b, children: revealed(b.children) }] : [b];
      });

    const sections = picked.map((n) => {
      const row = bodies.get(n.id);
      const stored = row?.ydoc?.length ? ydocToValue(row.ydoc) : Array.isArray(row?.content) ? (row.content as DocNode[]) : [];
      // A folder shown only for what's inside it keeps its title, not its own text.
      const value = horizon ? (horizon.knows(n.id) ? revealed(stored) : []) : stored;
      return { id: n.id, title: n.title, kind: n.kind, depth: depthOf(n.id), format: nodeFormat(n.settings), value };
    });

    return sections;
  });
}

/** Comment threads still open in a project, per note, for badges. */
export async function getOpenCommentCounts(projectId: string): Promise<Record<string, number>> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    const access = await getNodeAccess(projectId);
    const rows = await userDb((tx) =>
      tx
        .select({ nodeId: commentThread.nodeId })
        .from(commentThread)
        // Reactions aren't discussions waiting for an answer.
        .where(and(eq(commentThread.projectId, projectId), isNull(commentThread.resolvedAt), isNull(commentThread.reaction))),
    );
    const counts: Record<string, number> = {};
    for (const r of rows) if (access.has(r.nodeId)) counts[r.nodeId] = (counts[r.nodeId] ?? 0) + 1;
    return counts;
  });
}

