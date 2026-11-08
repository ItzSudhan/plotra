import type { DocNode } from "../doc-index";

// Rewriting a note from Markdown without touching what didn't change
// (the phone app's editor saves this way: POST …/text { mode: "update" }).
// The note's Markdown is cut into the same pieces it was written in, one per
// block; pieces still there word for word keep their block as it is, with its
// comments, suggestions and anything Markdown can't hold. Only new or changed
// pieces become new blocks. Pure, so it can be tested.

/** Pieces of Markdown the way blocksToMarkdown writes them: paragraphs apart, list items a line each. */
export function markdownUnits(markdown: string): string[] {
  const units: string[] = [];
  for (const para of markdown.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/)) {
    const lines = para.split("\n").map((l) => l.replace(/\s+$/, ""));
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.length) continue;
    if (lines.every((l) => LIST_ITEM.test(l))) units.push(...lines);
    else units.push(lines.join("\n"));
  }
  return units;
}

const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s/;

/** Ordered lists are numbered by where they are: "3. Go" and "1. Go" are the same item. */
const comparable = (unit: string) => unit.replace(/^(\s*)\d+([.)]) /, "$11$2 ");

/** Pairs of (old index, new index) in a longest common subsequence of equal strings. */
export function commonPairs(a: string[], b: string[]): Array<[number, number]> {
  // Same start and same end first: an edit usually touches a little in the middle.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < start; i++) pairs.push([i, i]);
  const n = endA - start;
  const m = endB - start;
  if (n > 0 && m > 0 && n * m <= 4_000_000) {
    const width = m + 1;
    const table = new Int32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        table[i * width + j] = a[start + i] === b[start + j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[start + i] === b[start + j]) {
        pairs.push([start + i, start + j]);
        i++;
        j++;
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i++;
      else j++;
    }
  }
  for (let k = 0; endA + k < a.length; k++) pairs.push([endA + k, endB + k]);
  return pairs;
}

/**
 * The note's new blocks: its current ones where their Markdown is unchanged,
 * new ones (from `toBlocks`) for the rest. Empty blocks (spacing) stay when
 * the block after them does.
 */
export function planUpdate(current: DocNode[], markdown: string, toMarkdown: (block: DocNode) => string, toBlocks: (text: string) => DocNode[]): DocNode[] {
  const oldUnits = current.map((block) => comparable(toMarkdown(block).replace(/\s+$/, "")));
  const newUnits = markdownUnits(markdown);
  const filled = oldUnits.map((u, i) => [u, i] as const).filter(([u]) => u.trim());
  const pairs = commonPairs(
    filled.map(([u]) => u),
    newUnits.map(comparable),
  );
  const keptAt = new Map(pairs.map(([o, n]) => [n, filled[o][1]]));

  const target: DocNode[] = [];
  let lastKept = -1;
  newUnits.forEach((unit, n) => {
    const c = keptAt.get(n);
    if (c === undefined) {
      target.push(...toBlocks(unit));
      return;
    }
    // Empty blocks just before a kept block, if nothing between them changed.
    const empties: DocNode[] = [];
    for (let k = c - 1; k > lastKept && !oldUnits[k].trim(); k--) empties.unshift(current[k]);
    if (empties.length && c - empties.length === lastKept + 1) target.push(...empties);
    target.push(current[c]);
    lastKept = c;
  });
  return target;
}
