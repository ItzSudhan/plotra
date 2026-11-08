import type { Note } from "./types";

// The binder as rows on a phone: notes come from the API in binder order,
// each with its parent, and folders open and close. Pure.

export type Row = { note: Note; depth: number; hasChildren: boolean; open: boolean };

/** Children of each note (null for the top level), keeping binder order. */
export function childrenOf(notes: Note[]): Map<string | null, Note[]> {
  const ids = new Set(notes.map((n) => n.id));
  const map = new Map<string | null, Note[]>();
  for (const n of notes) {
    // A note whose parent isn't in the list (the parent is in the trash) shows at the top.
    const parent = n.parentId && ids.has(n.parentId) ? n.parentId : null;
    const list = map.get(parent);
    if (list) list.push(n);
    else map.set(parent, [n]);
  }
  return map;
}

/** The rows to draw: everything under an open note, nothing under a closed one. */
export function visibleRows(notes: Note[], open: ReadonlySet<string>): Row[] {
  const children = childrenOf(notes);
  const rows: Row[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const note of children.get(parent) ?? []) {
      const hasChildren = (children.get(note.id)?.length ?? 0) > 0;
      const isOpen = hasChildren && open.has(note.id);
      rows.push({ note, depth, hasChildren, open: isOpen });
      if (isOpen) walk(note.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/** The folders, chapters and other notes with something inside, for "open everything". */
export const parentsIn = (notes: Note[]) => new Set(notes.map((n) => n.parentId).filter((p): p is string => !!p));

/** The words in a note and everything under it. */
export function totalWords(notes: Note[], id: string | null): number {
  const children = childrenOf(notes);
  let total = 0;
  const walk = (parent: string | null) => {
    for (const n of children.get(parent) ?? []) {
      total += n.wordCount;
      walk(n.id);
    }
  };
  if (id) total += notes.find((n) => n.id === id)?.wordCount ?? 0;
  walk(id);
  return total;
}

/** "Part One › Chapter 3": where a note sits. */
export function pathOf(notes: Note[], id: string): string[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const path: string[] = [];
  let at = byId.get(id)?.parentId ?? null;
  const seen = new Set<string>();
  while (at && byId.has(at) && !seen.has(at)) {
    seen.add(at);
    const n = byId.get(at)!;
    path.unshift(n.title);
    at = n.parentId;
  }
  return path;
}

/** The note a `[[Title]]` link means: by title, then alias, ignoring case. */
export function resolveLink(notes: Note[], title: string): Note | undefined {
  const want = title.trim().toLowerCase();
  return notes.find((n) => n.title.trim().toLowerCase() === want) ?? notes.find((n) => n.aliases.some((a) => a.trim().toLowerCase() === want));
}

/** Folders and chapters: where a new note can go. */
export const containers = (notes: Note[]) => notes.filter((n) => n.kind === "folder" || n.kind === "chapter");
