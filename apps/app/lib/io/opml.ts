// An outline of the binder as OPML (beat-the-competitors.md, step 6: "outline
// to Scrivener"): every folder, chapter and note in binder order, nested as
// they are, each with its synopsis as its note. Scrivener imports it (File →
// Import → OPML or OmniOutliner File…), and so do OmniOutliner, Workflowy,
// Dynalist, Logseq and most outliners. Pure.

export type OutlineItem = { title: string; synopsis: string | null; kind: string; children: OutlineItem[] };

const esc = (text: string) =>
  text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r?\n/g, "&#10;");

export function outlineToOpml(title: string, items: OutlineItem[], created = new Date()): string {
  const lines: string[] = [];
  const write = (item: OutlineItem, depth: number) => {
    const pad = "  ".repeat(depth + 2);
    // `_note` is OmniOutliner's convention for an item's note, which Scrivener reads too.
    const attrs = `text="${esc(item.title || "Untitled")}"${item.synopsis?.trim() ? ` _note="${esc(item.synopsis.trim())}"` : ""} type="${esc(item.kind)}"`;
    if (!item.children.length) return void lines.push(`${pad}<outline ${attrs}/>`);
    lines.push(`${pad}<outline ${attrs}>`);
    for (const child of item.children) write(child, depth + 1);
    lines.push(`${pad}</outline>`);
  };
  for (const item of items) write(item, 0);
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${esc(title)}</title>
    <dateCreated>${created.toUTCString()}</dateCreated>
  </head>
  <body>
${lines.join("\n")}
  </body>
</opml>
`;
}
