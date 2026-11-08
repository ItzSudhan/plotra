import type { Client } from "./api";
import type { NodeKind, Note } from "./types";

// The binder's own calls (apps/app/lib/api/binder.ts): moving notes, the
// trash, copies, the kinds a project can make, and a note's details (custom
// fields, canon, reveal, label). The server works out positions with the
// web's rules, so the phone only says where.

const p = (projectId: string) => `/api/v1/projects/${encodeURIComponent(projectId)}`;
const n = (projectId: string, noteId: string) => `${p(projectId)}/notes/${encodeURIComponent(noteId)}`;

/** Cache keys for these (lib/cache.ts useResource). */
export const binderKeys = {
  options: (projectId: string) => `binder:${projectId}`,
  trash: (projectId: string) => `trash:${projectId}`,
  details: (projectId: string, noteId: string) => `details:${projectId}:${noteId}`,
};

// ---- What a project can make --------------------------------------------------

export type Stage = { id: string; label: string; color: string };
export type Label = { id: string; name: string; color: string };

export type BinderOptions = {
  /** The kinds "New note" offers, in the project's own words ("Session" for a chapter in a campaign…). */
  kinds: { kind: NodeKind; label: string }[];
  /** World page types (Faction, Spell…), when the project has a world. */
  entityTypes: { id: string; name: string; color: string }[];
  stages: Stage[];
  labels: Label[];
};

export const binderOptions = (client: Client, projectId: string) => client.request<BinderOptions>(`${p(projectId)}/binder`);

// ---- Moving and copying -------------------------------------------------------

export type MoveTo = { step: "up" | "down" | "in" | "out" } | { parentId: string | null } | { before: string } | { after: string };

export const moveNote = (client: Client, projectId: string, noteId: string, to: MoveTo) =>
  client.request<{ note: Note }>(`${n(projectId, noteId)}/move`, { method: "POST", body: to }).then((r) => r.note);

/** A copy of the note and what's inside it, just after it; the copy first. */
export const duplicateNote = (client: Client, projectId: string, noteId: string) =>
  client.request<{ notes: Note[] }>(`${n(projectId, noteId)}/duplicate`, { method: "POST", body: {} }).then((r) => r.notes);

// ---- The trash ------------------------------------------------------------------

export type Trashed = Note & { trashedAt: string; trashedBy: string | null; inside: number };
export type Trash = { notes: Trashed[]; canEmpty: boolean };

export const listTrash = (client: Client, projectId: string) => client.request<Trash>(`${p(projectId)}/trash`);
export const restoreNote = (client: Client, projectId: string, noteId: string) =>
  client.request<{ note: Note }>(`${p(projectId)}/trash/${encodeURIComponent(noteId)}`, { method: "POST", body: {} }).then((r) => r.note);
export const deleteForever = (client: Client, projectId: string, noteId: string) =>
  client.request<{ ok: true }>(`${p(projectId)}/trash/${encodeURIComponent(noteId)}`, { method: "DELETE" });
export const emptyTrash = (client: Client, projectId: string) => client.request<{ deleted: number }>(`${p(projectId)}/trash`, { method: "DELETE" }).then((r) => r.deleted);

// ---- A note's details -----------------------------------------------------------

export type FieldType = "text" | "number" | "date" | "select" | "multi_select" | "node" | "checkbox" | "url";
export type Field = { key: string; label: string; type: FieldType; choices?: string[]; nodeKinds?: string[]; multiple?: boolean };
export type FieldValue = string | number | boolean | string[] | null;

export type CanonStatus = "canon" | "draft" | "speculative" | "retconned" | "non_canon";
export type Layer = "truth" | "belief";

export type NoteDetails = {
  note: Note;
  fields: Field[];
  values: Record<string, FieldValue>;
  stages: Stage[];
  /** Null when the project doesn't track canon. */
  canon: CanonStatus | null;
  /** Null when the project has no releases. */
  reveal: { releaseId: string | null; channel: string | null; layer: Layer; inheritedFrom: { id: string; title: string } | null; channels: string[] } | null;
  label: string | null;
  labels: Label[];
  entityTypeId: string | null;
  entityTypes: { id: string; name: string }[];
};

export type DetailsPatch = {
  properties?: Record<string, FieldValue>;
  canon?: CanonStatus;
  canonReason?: string;
  canonReleaseId?: string | null;
  reveal?: { releaseId?: string | null; channel?: string | null; layer?: Layer };
  label?: string | null;
  entityTypeId?: string;
};

export const noteDetails = (client: Client, projectId: string, noteId: string) => client.request<{ details: NoteDetails }>(`${n(projectId, noteId)}/details`).then((r) => r.details);
export const updateDetails = (client: Client, projectId: string, noteId: string, patch: DetailsPatch) =>
  client.request<{ details: NoteDetails }>(`${n(projectId, noteId)}/details`, { method: "PATCH", body: patch }).then((r) => r.details);

/** The web's names for canon statuses (apps/app/lib/world.ts canonMeta). */
export const canonMeta: Record<CanonStatus, { label: string; color: string; description: string }> = {
  canon: { label: "Canon", color: "#109a82", description: "Established: it's true in the story." },
  draft: { label: "Draft", color: "#9a938a", description: "Still being worked out." },
  speculative: { label: "Speculative", color: "#1971c2", description: "An idea that may or may not make it in." },
  retconned: { label: "Retconned", color: "#c2255c", description: "Was canon, then changed. The old version is kept." },
  non_canon: { label: "Non-canon", color: "#868e96", description: "Outside the story's continuity." },
};
export const canonStatuses = Object.keys(canonMeta) as CanonStatus[];

export const layerMeta: Record<Layer, { label: string; description: string }> = {
  truth: { label: "Truth", description: "What's actually true." },
  belief: { label: "Belief", description: "What people are led to believe: a lie, propaganda, an unreliable narrator." },
};
