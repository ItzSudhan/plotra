// The graph view's List mode: each note it shows, with the notes it links to
// and the notes that link to it, so the graph can be read without the canvas.

export type ListLink = { source: string; target: string; kind: string };
export type ListNote = { id: string; label: string };
export type ListedNote = ListNote & { linksTo: ListNote[]; linkedFrom: ListNote[] };

/**
 * One entry per shown note, by title, with its links in both directions among
 * the shown notes. `skipKind` leaves out a kind of link (fields, when they're
 * switched off). Pure.
 */
export function linkList(notes: Iterable<ListNote>, links: readonly ListLink[], skipKind?: string): ListedNote[] {
  const byId = new Map<string, ListNote>();
  for (const n of notes) byId.set(n.id, n);
  const out = new Map<string, { note: ListNote; to: Set<string>; from: Set<string> }>();
  for (const n of byId.values()) out.set(n.id, { note: n, to: new Set(), from: new Set() });
  for (const l of links) {
    if (l.source === l.target || l.kind === skipKind) continue;
    const source = out.get(l.source);
    const target = out.get(l.target);
    if (!source || !target) continue;
    source.to.add(l.target);
    target.from.add(l.source);
  }
  const byTitle = (a: ListNote, b: ListNote) => a.label.localeCompare(b.label);
  const notesOf = (ids: Set<string>) => [...ids].map((id) => byId.get(id)!).sort(byTitle);
  return [...out.values()]
    .map(({ note, to, from }) => ({ ...note, linksTo: notesOf(to), linkedFrom: notesOf(from) }))
    .sort(byTitle);
}
