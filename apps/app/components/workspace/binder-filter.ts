import { flatten, type BinderNode, type NodeIndex } from "@/lib/tree";

// The binder's "Filter…" box and first-letter type-ahead. Pure, so the tests can check it.

/** Lower case with accents taken off, so "écrit" finds "Ecrit" and the other way round. */
export const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export type BinderFilter = {
  /** Notes whose title matches. */
  matches: Set<string>;
  /** Those and every note above them, so the path stays in view. */
  shown: Set<string>;
  /** Notes above a match: opened while filtering. */
  open: Set<string>;
};

/** What a filter shows: live notes whose title contains the text, with their ancestors. Null when the text is blank. */
export function filterBinder(index: NodeIndex, query: string): BinderFilter | null {
  const q = fold(query.trim());
  if (!q) return null;
  const matches = new Set<string>();
  const shown = new Set<string>();
  const open = new Set<string>();
  for (const node of flatten(index)) {
    if (!fold(node.title).includes(q)) continue;
    matches.add(node.id);
    shown.add(node.id);
    for (let p = node.parentId ? index.byId.get(node.parentId) : undefined; p; p = p.parentId ? index.byId.get(p.parentId) : undefined) {
      open.add(p.id);
      if (shown.has(p.id)) break;
      shown.add(p.id);
    }
  }
  return { matches, shown, open };
}

/** A title cut into plain and matching parts, for highlighting. Accents and case are ignored, as in the filter. */
export function highlightParts(title: string, query: string): Array<{ text: string; match: boolean }> {
  const q = fold(query.trim());
  if (!q) return [{ text: title, match: false }];
  // The folded title, with where each of its characters came from in the original.
  let folded = "";
  const from: number[] = [];
  let at = 0;
  for (const char of title) {
    const f = fold(char);
    for (let i = 0; i < f.length; i++) from.push(at);
    folded += f;
    at += char.length;
  }
  from.push(title.length);
  const parts: Array<{ text: string; match: boolean }> = [];
  let last = 0;
  for (let hit = folded.indexOf(q); hit !== -1; hit = folded.indexOf(q, hit + q.length)) {
    const start = from[hit];
    // The end is the start of the first character after the match.
    let endAt = hit + q.length;
    while (endAt < from.length - 1 && from[endAt] === from[endAt - 1]) endAt++;
    const end = from[endAt];
    if (start > last) parts.push({ text: title.slice(last, start), match: false });
    parts.push({ text: title.slice(start, end), match: true });
    last = end;
  }
  if (last < title.length) parts.push({ text: title.slice(last), match: false });
  return parts.length ? parts : [{ text: title, match: false }];
}

/** Type-ahead: the next row after `currentId` whose title starts with the letter, going round to the top. */
export function typeAhead(rows: readonly BinderNode[], currentId: string | null, letter: string): BinderNode | undefined {
  const key = fold(letter);
  if (!key) return undefined;
  const start = rows.findIndex((r) => r.id === currentId);
  for (let step = 1; step <= rows.length; step++) {
    const row = rows[(start + step + rows.length) % rows.length];
    if (fold(row.title.trimStart()).startsWith(key)) return row;
  }
  return undefined;
}
