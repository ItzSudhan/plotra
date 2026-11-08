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

/** A note and everything under it. */
export function subtreeOf(notes: Note[], id: string): Set<string> {
  const children = childrenOf(notes);
  const out = new Set<string>([id]);
  const walk = (parent: string) => {
    for (const n of children.get(parent) ?? []) {
      out.add(n.id);
      walk(n.id);
    }
  };
  walk(id);
  return out;
}

/** Where "Move to…" can send a note: folders, chapters and notes holding others, outside it, in binder order. */
export function moveTargets(notes: Note[], id: string): { note: Note; depth: number }[] {
  const children = childrenOf(notes);
  const out: { note: Note; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const n of children.get(parent) ?? []) {
      if (n.id === id) continue;
      if (n.kind === "folder" || n.kind === "chapter" || (children.get(n.id)?.length ?? 0) > 0) out.push({ note: n, depth });
      walk(n.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** The notes beside it, itself included, in order. */
export function siblingsOf(notes: Note[], id: string): Note[] {
  const note = notes.find((n) => n.id === id);
  if (!note) return [];
  const parent = note.parentId && notes.some((n) => n.id === note.parentId) ? note.parentId : null;
  return childrenOf(notes).get(parent) ?? [];
}

export type Step = "up" | "down" | "in" | "out";
export type Placement = { step: Step } | { parentId: string | null } | { before: string } | { after: string };

/** Whether a step can be taken: not up from the top, into nothing, or out of the top level. */
export function canStep(notes: Note[], id: string, step: Step): boolean {
  const siblings = siblingsOf(notes, id);
  const at = siblings.findIndex((n) => n.id === id);
  if (at < 0) return false;
  if (step === "up" || step === "in") return at > 0;
  if (step === "down") return at < siblings.length - 1;
  const parent = siblings[at].parentId;
  return !!parent && notes.some((n) => n.id === parent);
}

/**
 * The binder as it will be once a move is done, to show at once while the
 * server does it (the server's order then replaces it). Null when the move
 * can't be made. Pure.
 */
export function applyMove(notes: Note[], id: string, to: Placement): Note[] | null {
  const note = notes.find((n) => n.id === id);
  if (!note) return null;
  const moving = subtreeOf(notes, id);
  // Turn a step into a placement next to a sibling or at the end of a folder.
  let place: Exclude<Placement, { step: Step }>;
  if (!("step" in to)) place = to;
  else {
    if (!canStep(notes, id, to.step)) return null;
    const siblings = siblingsOf(notes, id);
    const at = siblings.findIndex((n) => n.id === id);
    if (to.step === "up") place = { before: siblings[at - 1].id };
    else if (to.step === "down") place = { after: siblings[at + 1].id };
    else if (to.step === "in") place = { parentId: siblings[at - 1].id };
    else place = { after: note.parentId! };
  }
  const target = "before" in place ? place.before : "after" in place ? place.after : place.parentId;
  if (target && moving.has(target)) return null;
  const block = notes.filter((n) => moving.has(n.id));
  const rest = notes.filter((n) => !moving.has(n.id));
  let parentId: string | null;
  let at: number;
  if ("before" in place) {
    const t = rest.find((n) => n.id === place.before);
    if (!t) return null;
    parentId = t.parentId;
    at = rest.indexOf(t);
  } else {
    const anchor = "after" in place ? place.after : place.parentId;
    if (anchor === null) {
      parentId = null;
      at = rest.length;
    } else {
      const t = rest.find((n) => n.id === anchor);
      if (!t) return null;
      parentId = "after" in place ? t.parentId : t.id;
      // After the anchor and everything under it.
      const under = subtreeOf(rest, t.id);
      at = rest.indexOf(t) + 1;
      while (at < rest.length && under.has(rest[at].id)) at++;
    }
  }
  block[0] = { ...block[0], parentId };
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}
