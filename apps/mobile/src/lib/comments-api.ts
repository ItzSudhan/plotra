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

export const deleteComment = (client: Client, projectId: string, noteId: string, commentId: string) =>
  client.request<{ ok: true }>(base(projectId, noteId), { method: "POST", body: { action: "delete", commentId } });

/** The comments screen for a note, opened at one thread if given. */
export const commentsRoute = (projectId: string, noteId: string, threadId?: string) =>
  ({ pathname: "/project/[projectId]/comments/[noteId]", params: { projectId, noteId, ...(threadId && { thread: threadId }) } }) as const;
