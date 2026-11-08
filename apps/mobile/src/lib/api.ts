import type { CollabSeat, Hit, Me, NewNote, Note, NotePatch, Notifications, NoteWithText, Project, ProjectHit, Release } from "./types";

// Plotra's API (apps/app/app/api/v1), with the phone's token. Errors carry
// the server's message, which is written to be shown.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** No answer at all: offline, or the server is down. */
export class OfflineError extends Error {
  constructor() {
    super("You're offline. This will work again when you're back online.");
  }
}

export const isOffline = (error: unknown) => error instanceof OfflineError;

const TIMEOUT_MS = 20_000;

export type Client = ReturnType<typeof createClient>;

export function createClient(server: string, token: string, onUnauthorized: () => void) {
  async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(server + path, {
        method: init.method ?? "GET",
        headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(init.body !== undefined && { "content-type": "application/json" }) },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });
    } catch {
      throw new OfflineError();
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 204) return undefined as T;
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {}
    if (!response.ok) {
      if (response.status === 401) onUnauthorized();
      const message = (data as { error?: unknown } | null)?.error;
      throw new ApiError(response.status, typeof message === "string" ? message : `Something went wrong (${response.status}).`);
    }
    return data as T;
  }

  const p = (projectId: string) => `/api/v1/projects/${encodeURIComponent(projectId)}`;
  const n = (projectId: string, noteId: string) => `${p(projectId)}/notes/${encodeURIComponent(noteId)}`;

  return {
    server,
    me: () => request<Me>("/api/v1/me"),
    projects: () => request<{ projects: Project[] }>("/api/v1/projects").then((r) => r.projects),
    notes: (projectId: string) => request<{ notes: Note[] }>(`${p(projectId)}/notes`).then((r) => r.notes),
    note: (projectId: string, noteId: string, asOf?: string | null) =>
      request<{ note: NoteWithText }>(n(projectId, noteId) + (asOf ? `?${new URLSearchParams({ asOf })}` : "")).then((r) => r.note),
    /** Every note with its plain text, for searching offline. */
    notesWithText: (projectId: string) => request<{ notes: (Note & { text?: string })[] }>(`${p(projectId)}/notes?text=1`).then((r) => r.notes),
    releases: (projectId: string) => request<{ releases: Release[] }>(`${p(projectId)}/releases`).then((r) => r.releases),
    searchAll: (q: string, limit = 50) => request<{ hits: ProjectHit[] }>(`/api/v1/search?${new URLSearchParams({ q, limit: String(limit) })}`).then((r) => r.hits),
    collabSeat: (projectId: string, room: string) => request<CollabSeat>(`/api/mobile/collab-token?${new URLSearchParams({ project: projectId, room })}`),
    search: (projectId: string, q: string, limit = 30) => request<{ hits: Hit[] }>(`${p(projectId)}/search?${new URLSearchParams({ q, limit: String(limit) })}`).then((r) => r.hits),
    createNote: (projectId: string, input: NewNote) => request<{ note: Note }>(`${p(projectId)}/notes`, { method: "POST", body: input }).then((r) => r.note),
    updateNote: (projectId: string, noteId: string, patch: NotePatch) => request<{ note: Note }>(n(projectId, noteId), { method: "PATCH", body: patch }).then((r) => r.note),
    trashNote: (projectId: string, noteId: string) => request<{ note: Note }>(n(projectId, noteId), { method: "DELETE" }).then((r) => r.note),
    writeText: (projectId: string, noteId: string, mode: "append" | "update", markdown: string) =>
      request<{ markdown: string }>(`${n(projectId, noteId)}/text`, { method: "POST", body: { mode, markdown } }).then((r) => r.markdown),
    notifications: () => request<Notifications>("/api/v1/notifications"),
    markRead: (id: string | null) => request<{ ok: true }>("/api/v1/notifications", { method: "POST", body: { id } }),
    signOut: () => request<void>("/api/mobile/token", { method: "DELETE" }),
  };
}
