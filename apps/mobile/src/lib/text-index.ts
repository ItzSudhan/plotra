import type { Client } from "./api";
import { readJson, writeJson } from "./files";
import { matchIndex, type Entry } from "./text-match";
import type { Hit } from "./types";

// Each project's notes with their plain text, kept on the phone so Search
// finds words inside notes with no connection. Fetched when a project is
// opened (or Library refreshes), at most every so often.

type Index = { at: number; notes: Entry[] };

const EVERY_MS = 30 * 60 * 1000;
const fileName = (projectId: string) => `text-${projectId}.json`;
const busy = new Set<string>();
// Asked to refresh by force while a refresh was running: what it fetched may be from before the change.
const again = new Set<string>();

/** Fetches the project's text again if what's kept is older than half an hour (or `force`). */
export async function refreshTextIndex(client: Client, projectId: string, force = false): Promise<void> {
  if (busy.has(projectId)) {
    if (force) again.add(projectId);
    return;
  }
  busy.add(projectId);
  try {
    if (!force) {
      const kept = await readJson<Index>(fileName(projectId));
      if (kept && Date.now() - kept.at < EVERY_MS) return;
    }
    const notes = await client.notesWithText(projectId);
    await writeJson(fileName(projectId), {
      at: Date.now(),
      notes: notes.map((n) => ({ id: n.id, title: n.title, kind: n.kind, aliases: n.aliases, tags: n.tags, synopsis: n.synopsis, text: n.text ?? "" })),
    } satisfies Index);
  } catch {
    // Offline or not allowed: keep what's there.
  } finally {
    busy.delete(projectId);
    if (again.delete(projectId)) void refreshTextIndex(client, projectId, true);
  }
}

/** Notes kept on the phone that contain every word, titles first. Quotes and `-word` work roughly as online. */
export async function searchOffline(projectId: string, query: string, limit = 30): Promise<Hit[]> {
  const index = await readJson<Index>(fileName(projectId));
  return index ? matchIndex(index.notes, query, limit) : [];
}

/** When the project's text was last kept on the phone, or null if it never was. */
export async function keptAt(projectId: string): Promise<number | null> {
  return (await readJson<Index>(fileName(projectId)))?.at ?? null;
}
