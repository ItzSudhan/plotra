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

  /**
   * A call whose body or answer isn't JSON (a file sent or fetched: lib/io-api.ts), with the
   * phone's token. `fetcher` is the caller's fetch: expo/fetch reads and sends bytes, which
   * React Native's own fetch can't. Fails as `request` does, keeping the server's message
   * whether it came as JSON `{ error }` or plain text.
   */
  async function raw<R extends Response>(
    path: string,
    init: { method?: string; body?: BodyInit | null; headers?: Record<string, string>; timeoutMs?: number },
    fetcher: (url: string, init: { method: string; headers: Record<string, string>; body?: BodyInit | null; signal: AbortSignal }) => Promise<R>,
  ): Promise<R> {
    const controller = new AbortController();
    // Building or reading a whole project takes longer than an ordinary call.
    const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 120_000);
    let response: R;
    try {
      response = await fetcher(server + path, { method: init.method ?? "GET", headers: { authorization: `Bearer ${token}`, ...init.headers }, body: init.body, signal: controller.signal });
    } catch {
      throw new OfflineError();
    } finally {
      clearTimeout(timer);
    }
    if (response.ok) return response;
    if (response.status === 401) onUnauthorized();
    const text = await response.text().catch(() => "");
    let message: unknown = null;
    try {
      message = (JSON.parse(text) as { error?: unknown }).error;
    } catch {
      // A plain-text answer is a message meant to be shown, when it's short; a page of HTML isn't.
      if (text && text.length < 300 && !text.trimStart().startsWith("<")) message = text.trim();
    }
    throw new ApiError(response.status, typeof message === "string" && message ? message : `Something went wrong (${response.status}).`);
  }

  const p = (projectId: string) => `/api/v1/projects/${encodeURIComponent(projectId)}`;
  const n = (projectId: string, noteId: string) => `${p(projectId)}/notes/${encodeURIComponent(noteId)}`;

  return {
    server,
    /** Any API call, for features that keep their own calls in their own module (lib/*-api.ts). */
    request,
    /** A file up or down, with the token (see `raw`). */
    raw,
    /** Sends a file on the phone (its uri) as the body of a POST, reporting progress from 0 to 1. */
    upload: <T,>(path: string, file: { uri: string; type: string }, onProgress?: (fraction: number) => void) =>
      new Promise<T>((resolve, reject) => {
        void (async () => {
          let blob: Blob;
          try {
            blob = await (await fetch(file.uri)).blob();
          } catch {
            return reject(new ApiError(400, "That file couldn't be read."));
          }
          const xhr = new XMLHttpRequest();
          xhr.open("POST", server + path);
          xhr.setRequestHeader("authorization", `Bearer ${token}`);
          xhr.setRequestHeader("accept", "application/json");
          xhr.setRequestHeader("content-type", file.type);
          xhr.timeout = 120_000;
          xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
          xhr.onerror = xhr.ontimeout = () => reject(new OfflineError());
          xhr.onload = () => {
            let data: unknown = null;
            try {
              data = JSON.parse(xhr.responseText);
            } catch {}
            if (xhr.status >= 200 && xhr.status < 300) return resolve(data as T);
            if (xhr.status === 401) onUnauthorized();
            const message = (data as { error?: unknown } | null)?.error;
            reject(new ApiError(xhr.status, typeof message === "string" ? message : `Something went wrong (${xhr.status}).`));
          };
          xhr.send(blob);
        })();
      }),
    /** A file from the API as a data: URL, for a web view that can't send the token itself; null if it can't be had. */
    dataUrl: async (path: string): Promise<string | null> => {
      try {
        const response = await fetch(server + path, { headers: { authorization: `Bearer ${token}` } });
        if (!response.ok) return null;
        const blob = await response.blob();
        return await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    },
    me: () => request<Me>("/api/v1/me"),
    projects: () => request<{ projects: Project[] }>("/api/v1/projects").then((r) => r.projects),
    notes: (projectId: string) => request<{ notes: Note[] }>(`${p(projectId)}/notes`).then((r) => r.notes),
    note: (projectId: string, noteId: string, asOf?: string | null) =>
      request<{ note: NoteWithText }>(n(projectId, noteId) + (asOf ? `?${new URLSearchParams({ asOf })}` : "")).then((r) => r.note),
    /** Every note with its plain text, for searching offline. */
    notesWithText: (projectId: string) => request<{ notes: (Note & { text?: string })[] }>(`${p(projectId)}/notes?text=1`).then((r) => r.notes),
    releases: (projectId: string) => request<{ releases: Release[] }>(`${p(projectId)}/releases`).then((r) => r.releases),
    searchAll: (q: string, limit = 50) => request<{ hits: ProjectHit[] }>(`/api/v1/search?${new URLSearchParams({ q, limit: String(limit) })}`).then((r) => r.hits),
    /** What the editor wrote in a note while offline: its kept document, merged on the server. */
    pushDoc: (projectId: string, noteId: string, update: string) => request<{ ok: true }>("/api/mobile/doc", { method: "POST", body: { projectId, noteId, update } }),
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
