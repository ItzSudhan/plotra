import "server-only";
import type { CommentAnchor } from "@plotra/db/schema";
import { readToken, signToken } from "./signed-token";

// Undo for a deleted comment. Deleting returns a token this server signs,
// holding everything needed to put the comment back as it was: same id, author,
// body and times, and its thread too when the comment was the thread's last.
// Restoring takes back only a token it signed, for the same project and the
// same person who deleted, within a few minutes, so it can't be used to write
// a comment in someone else's name. Anchors are Yjs relative positions kept on
// the thread row (nothing is marked in the document), so restoring the row puts
// the comment back on its passage.

const PURPOSE = "comment-restore";
/** Long enough for any Undo toast, short enough that an old token is useless. */
export const RESTORE_SECONDS = 10 * 60;

export type DeletedCommentRow = { id: string; threadId: string; authorId: string | null; body: string; createdAt: Date; editedAt: Date | null };
export type DeletedThreadRow = {
  id: string;
  nodeId: string;
  anchor: CommentAnchor | null;
  quote: string | null;
  reaction: string | null;
  resolvedAt: Date | null;
  resolvedById: string | null;
  createdById: string | null;
  createdAt: Date;
};

type Claims = {
  exp: number;
  projectId: string;
  nodeId: string;
  by: string;
  comment: Omit<DeletedCommentRow, "createdAt" | "editedAt"> & { createdAt: string; editedAt: string | null };
  thread: (Omit<DeletedThreadRow, "createdAt" | "resolvedAt"> & { createdAt: string; resolvedAt: string | null }) | null;
};

export type Restorable = { projectId: string; nodeId: string; by: string; comment: DeletedCommentRow; thread: DeletedThreadRow | null };

const iso = (d: Date | string) => new Date(d).toISOString();
const isoOrNull = (d: Date | string | null) => (d ? iso(d) : null);

/** A token that lets `by` put this comment (and, if it went too, its thread) back. */
export function restoreToken(input: Restorable, now = Date.now()): string {
  const { comment, thread } = input;
  const claims: Claims = {
    exp: Math.floor(now / 1000) + RESTORE_SECONDS,
    projectId: input.projectId,
    nodeId: input.nodeId,
    by: input.by,
    comment: { ...comment, createdAt: iso(comment.createdAt), editedAt: isoOrNull(comment.editedAt) },
    thread: thread ? { ...thread, createdAt: iso(thread.createdAt), resolvedAt: isoOrNull(thread.resolvedAt) } : null,
  };
  return signToken(PURPOSE, claims);
}

/** What a restore token holds, if this server signed it for `projectId` and `userId` and it's still fresh; otherwise null. */
export function readRestoreToken(token: string, projectId: string, userId: string): Restorable | null {
  if (typeof token !== "string" || token.length > 64 * 1024) return null;
  const claims = readToken<Claims>(PURPOSE, token);
  if (!claims || claims.projectId !== projectId || claims.by !== userId) return null;
  const { comment, thread } = claims;
  if (thread && (thread.id !== comment.threadId || thread.nodeId !== claims.nodeId)) return null;
  return {
    projectId: claims.projectId,
    nodeId: claims.nodeId,
    by: claims.by,
    comment: { ...comment, createdAt: new Date(comment.createdAt), editedAt: comment.editedAt ? new Date(comment.editedAt) : null },
    thread: thread ? { ...thread, createdAt: new Date(thread.createdAt), resolvedAt: thread.resolvedAt ? new Date(thread.resolvedAt) : null } : null,
  };
}
