import { AppState } from "react-native";
import type { Client } from "./api";
import { keys, onInvalidate, readCache } from "./cache";
import { keptAt, refreshTextIndex } from "./text-index";
import type { Project } from "./types";

// Keeps the text kept for offline search (lib/text-index.ts) close to what's on
// the server: after the phone changes a note (anything that invalidates a
// project's notes, the editor, Quick note and the outbox included), when the
// app comes back to the front, and when the person asks.

/** Typing invalidates often; wait for a pause before fetching the project's text again. */
const AFTER_EDIT_MS = 8_000;
/** Coming back to the app checks at most this often (each project still waits half an hour between fetches). */
const FOREGROUND_EVERY_MS = 5 * 60_000;

// "notes:<projectId>" and "note:<projectId>:<noteId>" (lib/cache.ts keys).
const projectOf = (prefix: string) => /^notes?:([^:@]+)/.exec(prefix)?.[1] ?? null;

async function knownProjects(client: Client, fetch: boolean): Promise<Project[]> {
  if (fetch) {
    try {
      return await client.projects();
    } catch {}
  }
  return (await readCache<Project[]>(keys.projects)) ?? [];
}

/** Starts listening; returns what stops it. Mounted once while signed in (components/push-listener.tsx). */
export function startSearchFreshness(client: Client): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const stopWatching = onInvalidate((prefix) => {
    const projectId = projectOf(prefix);
    if (!projectId) return;
    clearTimeout(timers.get(projectId));
    timers.set(
      projectId,
      setTimeout(() => {
        timers.delete(projectId);
        void refreshTextIndex(client, projectId, true);
      }, AFTER_EDIT_MS),
    );
  });

  let lastForeground = Date.now();
  const appState = AppState.addEventListener("change", (state) => {
    if (state !== "active" || Date.now() - lastForeground < FOREGROUND_EVERY_MS) return;
    lastForeground = Date.now();
    void refreshAll(client, false);
  });

  return () => {
    stopWatching();
    appState.remove();
    for (const timer of timers.values()) clearTimeout(timer);
  };
}

/** Every project's text, one at a time. `force` fetches even what was kept a moment ago (Search's pull to refresh, the Account row). */
export async function refreshAll(client: Client, force: boolean): Promise<void> {
  for (const p of await knownProjects(client, force)) await refreshTextIndex(client, p.id, force);
}

/** When the stalest project's text was kept, for "updated 5 min ago". Null when nothing is kept yet. */
export async function oldestKept(): Promise<number | null> {
  const projects = (await readCache<Project[]>(keys.projects)) ?? [];
  const times = await Promise.all(projects.map((p) => keptAt(p.id)));
  if (!times.length || times.some((t) => t === null)) return null;
  return Math.min(...(times as number[]));
}
