import type { Client } from "./api";

// Comment threads on a note, through /api/mobile/comments (the server wraps
// apps/app/lib/workflow-actions.ts). An anchor is a pair of base64 Yjs relative
// positions into the note's live document (packages/db CommentAnchor), made
// by the editor (components/rich-editor) from the selection, as the web's
// components/editor/review.tsx does.
//
// The editor and the comments screens both use this module: keep these
// signatures stable.

export type CommentAnchor = { start: string; end: string };

export type CommentRow = { id: string; body: string; authorId: string; authorName: string | null; authorImage: string | null; createdAt: string; editedAt: string | null; mine: boolean };

export type CommentThread = {
  id: string;
  anchor: CommentAnchor | null;
  /** The passage as it read when the thread was started. */
  quote: string | null;
  resolved: boolean;
  createdAt: string;
  comments: CommentRow[];
};

const base = (projectId: string, noteId: string) => `/api/mobile/comments?${new URLSearchParams({ project: projectId, note: noteId })}`;

export const listThreads = (client: Client, projectId: string, noteId: string) =>
  client.request<{ threads: CommentThread[] }>(base(projectId, noteId)).then((r) => r.threads);

export const createThread = (client: Client, projectId: string, noteId: string, input: { anchor: CommentAnchor | null; quote: string | null; body: string }) =>
  client.request<{ id: string }>(base(projectId, noteId), { method: "POST", body: { action: "create", ...input } });

export const replyToThread = (client: Client, projectId: string, noteId: string, threadId: string, body: string) =>
  client.request<{ ok: true }>(base(projectId, noteId), { method: "POST", body: { action: "reply", threadId, body } });

export const setResolved = (client: Client, projectId: string, noteId: string, threadId: string, resolved: boolean) =>
  client.request<{ ok: true }>(base(projectId, noteId), { method: "POST", body: { action: "resolve", threadId, resolved } });

export const editComment = (client: Client, projectId: string, noteId: string, commentId: string, body: string) =>
  client.request<{ ok: true }>(base(projectId, noteId), { method: "POST", body: { action: "edit", commentId, body } });

/** `undo` puts it back with `restoreComment`, for a short while. */
export const deleteComment = (client: Client, projectId: string, noteId: string, commentId: string) =>
  client.request<{ ok: true; undo?: string }>(base(projectId, noteId), { method: "POST", body: { action: "delete", commentId } });

export const restoreComment = (client: Client, projectId: string, noteId: string, undo: string) =>
  client.request<{ ok: true }>(base(projectId, noteId), { method: "POST", body: { action: "restore", undo } });

/** Someone who can be @-mentioned: the project's people, guests included. */
export type CommentPerson = { id: string; name: string; image: string | null; guest: boolean };

/** Everything the comments screen shows: the threads, who can be mentioned, and what the caller may do. */
export type CommentsView = { threads: CommentThread[]; people: CommentPerson[]; canComment: boolean; canManage: boolean };

export const loadComments = (client: Client, projectId: string, noteId: string) => client.request<CommentsView>(base(projectId, noteId));

/** Open threads per note in a project (one-click reactions not counted), for badges. */
export const openCommentCounts = (client: Client, projectId: string) =>
  client.request<{ counts: Record<string, number> }>(`/api/mobile/comments?${new URLSearchParams({ project: projectId })}`).then((r) => r.counts);

/** Cache keys (lib/cache.ts) for what's above. `invalidate(commentKeys.project(id))` refreshes both. */
export const commentKeys = {
  project: (projectId: string) => `comments:${projectId}:`,
  note: (projectId: string, noteId: string) => `comments:${projectId}:note:${noteId}`,
  counts: (projectId: string) => `comments:${projectId}:counts`,
};

/** The comments screen for a note, opened at one thread if given. */
export const commentsRoute = (projectId: string, noteId: string, threadId?: string) =>
  ({ pathname: "/project/[projectId]/comments/[noteId]", params: { projectId, noteId, ...(threadId && { thread: threadId }) } }) as const;
