import { isOffline, type Client } from "./api";
import { keys } from "./cache";

// The reader's and version history's calls (apps/app/app/api/mobile/note-value
// and app/api/mobile/history, which wrap the web's own functions).

/** A note's document as Plate nodes: plain data the reader (components/rich-editor/note-reader.tsx) draws. */
export type DocValue = Record<string, unknown>[];

/**
 * A note's document, kept under the note's own key so that whatever refreshes
 * the note (`invalidate(keys.note(…))`, after editing) refreshes this too.
 * Null for boards, which have no text.
 */
export const noteValueKey = (projectId: string, noteId: string, asOf?: string | null) => `${keys.note(projectId, noteId, asOf)}#value`;

export const noteValue = (client: Client, projectId: string, noteId: string, asOf?: string | null) =>
  client
    .request<{ value: DocValue | null; revealed?: boolean }>(`/api/mobile/note-value?${new URLSearchParams({ project: projectId, note: noteId, ...(asOf && { asOf }) })}`)
    .then((r) => r.value);

// ---- Version history ------------------------------------------------------------------------

export type Version = {
  id: string;
  /** Null for an automatic snapshot (one every half hour while people write). */
  name: string | null;
  auto: boolean;
  wordCount: number;
  createdAt: string;
  authorName: string | null;
  canDelete: boolean;
};

export type History = { versions: Version[]; canEdit: boolean; isDocument: boolean };

export const historyKey = (projectId: string, noteId: string) => `history:${projectId}:${noteId}`;
/** A saved version never changes, so it reads offline once opened. */
export const versionKey = (projectId: string, versionId: string) => `version:${projectId}:${versionId}`;

const base = (projectId: string, noteId: string) => `/api/mobile/history?${new URLSearchParams({ project: projectId, note: noteId })}`;

export const history = (client: Client, projectId: string, noteId: string) => client.request<History>(base(projectId, noteId));

export const versionValue = (client: Client, projectId: string, versionId: string) =>
  client.request<{ value: DocValue | null }>(`/api/mobile/history/version?${new URLSearchParams({ project: projectId, version: versionId })}`).then((r) => r.value);

/** Names what the note says now as a version. */
export const saveVersion = (client: Client, projectId: string, noteId: string, name: string | null) =>
  client.request<{ id: string }>(base(projectId, noteId), { method: "POST", body: { action: "save", name } });

export const renameVersion = (client: Client, projectId: string, noteId: string, versionId: string, name: string | null) =>
  client.request<{ ok: true }>(base(projectId, noteId), { method: "POST", body: { action: "rename", versionId, name } });

export const deleteVersion = (client: Client, projectId: string, noteId: string, versionId: string) =>
  client.request<{ ok: true }>(base(projectId, noteId), { method: "POST", body: { action: "delete", versionId } });

/** Puts the note back to a version, through its live document; what it said is kept as a version first. */
export const restoreVersion = (client: Client, projectId: string, noteId: string, versionId: string) =>
  client.request<{ ok: true }>(base(projectId, noteId), { method: "POST", body: { action: "restore", versionId } });

/** "Automatic snapshot" for unnamed ones. */
export const versionTitle = (v: Pick<Version, "name">) => v.name ?? "Automatic snapshot";

/** What to say when a history action didn't go through. */
export const historyProblem = (e: unknown) => (isOffline(e) ? "You're offline. Try again when you're back online." : e instanceof Error ? e.message : "Something went wrong.");
