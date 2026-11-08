import { readJson, removeFile, writeJson } from "./files";

// Each note's live document as the phone's editor last had it (base64 Yjs
// state), so it opens at once, works offline, and what was written offline
// can be sent later (lib/outbox.tsx).

const name = (noteId: string) => `doc-${noteId}.json`;

export async function readDocState(noteId: string): Promise<string | null> {
  return (await readJson<{ state: string }>(name(noteId)))?.state ?? null;
}

export const writeDocState = (noteId: string, state: string) => writeJson(name(noteId), { state, at: Date.now() });
export const forgetDocState = (noteId: string) => removeFile(name(noteId));
