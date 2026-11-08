import type { Hit, NodeKind } from "./types";

// Searching the text kept on the phone (lib/text-index.ts). Pure.

export type Entry = { id: string; title: string; kind: NodeKind; aliases: string[]; tags: string[]; synopsis: string | null; text: string };

export function matchIndex(notes: Entry[], query: string, limit = 30): Hit[] {
  const { all, none } = parseQuery(query);
  if (!all.length) return [];
  const hits: (Hit & { score: number })[] = [];
  for (const n of notes) {
    const name = [n.title, ...n.aliases, ...n.tags].join(" ").toLowerCase();
    const body = `${n.synopsis ?? ""} ${n.text}`.toLowerCase();
    const hay = `${name} ${body}`;
    if (!all.every((w) => hay.includes(w)) || none.some((w) => hay.includes(w))) continue;
    const score = all.filter((w) => name.includes(w)).length * 10 + all.reduce((s, w) => s + count(body, w), 0);
    hits.push({ id: n.id, title: n.title, kind: n.kind, snippet: snippet(n.text || n.synopsis || "", all[0]), score });
  }
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...hit }) => hit);
}

export function parseQuery(query: string): { all: string[]; none: string[] } {
  const all: string[] = [];
  const none: string[] = [];
  for (const m of query.toLowerCase().matchAll(/(-?)"([^"]+)"|(-?)(\S+)/g)) {
    const negative = (m[1] ?? m[3]) === "-";
    const term = (m[2] ?? m[4] ?? "").trim();
    if (!term || term === "or") continue;
    (negative ? none : all).push(term);
  }
  return { all, none };
}

function count(text: string, word: string): number {
  let n = 0;
  for (let at = text.indexOf(word); at >= 0 && n < 50; at = text.indexOf(word, at + word.length)) n++;
  return n;
}

/** About twenty words around the first match. */
function snippet(text: string, word: string): string {
  const at = text.toLowerCase().indexOf(word);
  if (at < 0) return text.slice(0, 140).replace(/\s+/g, " ").trim();
  const start = Math.max(0, text.lastIndexOf(" ", Math.max(0, at - 60)));
  const end = Math.min(text.length, at + word.length + 80);
  return `${start > 0 ? "… " : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? " …" : ""}`;
}
