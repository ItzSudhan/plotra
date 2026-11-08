import type { Note } from "./types";

// The pure parts of asking the AI on the phone (app/project/[projectId]/ask.tsx):
// reading the answer's stream line by line, keeping each snapshot in place,
// and pointing at notes with "@", as the web panel does
// (apps/app/components/agent/chat.tsx).

/** Splits what has arrived into whole lines, keeping the unfinished end for next time. */
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts.filter((l) => l.trim()), rest };
}

/** A message put in place of the one with its id, or added at the end. */
export function upsert<M extends { id: string }>(list: M[], message: M): M[] {
  const at = list.findIndex((m) => m.id === message.id);
  if (at < 0) return [...list, message];
  const next = list.slice();
  next[at] = message;
  return next;
}

const NOTE_MENTION = /(^|\s)@([^\s@]{0,40})$/;

/** What's typed after an "@" just before the caret, or null. */
export function noteMentionAt(text: string, caret: number): string | null {
  const found = NOTE_MENTION.exec(text.slice(0, caret));
  return found ? found[2] : null;
}

/** Up to eight notes (not folders) whose title or alias has what's typed, those starting with it first. */
export function matchNotes(notes: Note[], query: string): Note[] {
  const q = query.toLowerCase();
  return notes
    .filter((n) => n.kind !== "folder" && (n.title.toLowerCase().includes(q) || n.aliases.some((a) => a.toLowerCase().includes(q))))
    .sort((a, b) => Number(b.title.toLowerCase().startsWith(q)) - Number(a.title.toLowerCase().startsWith(q)))
    .slice(0, 8);
}

/** The text with the half-typed "@…" before the caret swapped for "@Title ", and where the caret goes. */
export function insertNote(text: string, caret: number, title: string): { text: string; caret: number } {
  const before = text.slice(0, caret).replace(NOTE_MENTION, (_, space: string) => `${space}@${title} `);
  return { text: before + text.slice(caret), caret: before.length };
}

/** Only notes whose "@Title" is still in the message count as pointed at. */
export const stillMentioned = <N extends { title: string }>(text: string, picked: N[]) => picked.filter((n) => text.includes(`@${n.title}`));
