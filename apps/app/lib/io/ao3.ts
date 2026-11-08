// Archive of Our Own (beat-the-competitors.md, 13): a work as AO3 takes it,
// one chapter at a time. AO3's posting form has a title, a summary and the
// chapter's text, which it takes as HTML from a short list of tags; this
// writes only those (p, br, em, strong, u, s, code, a, h2 and h3, blockquote,
// ul, ol, li, hr, table, img). Pure: the export route, the export dialog's
// copy-per-chapter list and the tests share it.

import { CHARACTER, PARENTHETICAL, TRANSITION } from "../script";
import { countWords } from "../doc-index";
import type { Piece } from "./manuscript";
import type { Block, InlineRun } from "./model";
import { blocksToText } from "./text";
import { plural } from "../plural";

export type Ao3Chapter = {
  title: string;
  /** The chapter's synopsis, for AO3's chapter summary; empty when it has none. */
  summary: string;
  /** The chapter's text, for the HTML box of AO3's chapter form. */
  html: string;
  words: number;
};

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function runsHtml(runs: InlineRun[]): string {
  return runs
    .map((run) => {
      let html = esc(run.text).replace(/\n/g, "<br />");
      if (!html) return "";
      if (run.code) html = `<code>${html}</code>`;
      if (run.bold) html = `<strong>${html}</strong>`;
      if (run.italic) html = `<em>${html}</em>`;
      if (run.underline) html = `<u>${html}</u>`;
      if (run.strikethrough) html = `<s>${html}</s>`;
      if (run.href) html = `<a href="${esc(run.href)}">${html}</a>`;
      return html;
    })
    .join("");
}

/** A script's lines, set as AO3 can show them: names and parentheticals centred, transitions to the right. */
const scriptAlign: Record<string, string> = { [CHARACTER]: "center", [PARENTHETICAL]: "center", [TRANSITION]: "right" };

/** Blocks as AO3 HTML. Lists are gathered into one list; pictures only when they're on the web, where AO3 can load them. */
export function blocksToAo3(blocks: Block[]): string {
  const out: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (list) out.push(`<${list.tag}>\n${list.items.map((item) => `  <li>${item}</li>`).join("\n")}\n</${list.tag}>`);
    list = null;
  };
  for (const b of blocks) {
    if (b.kind === "list") {
      const tag = b.style === "ordered" ? "ol" : "ul";
      const text = `${b.style === "todo" ? (b.checked ? "☑ " : "☐ ") : ""}${runsHtml(b.runs)}`;
      if (list && list.tag === tag) list.items.push(text);
      else {
        flush();
        list = { tag, items: [text] };
      }
      continue;
    }
    flush();
    switch (b.kind) {
      case "heading":
        out.push(`<h3>${runsHtml(b.runs)}</h3>`);
        break;
      case "quote":
      case "callout":
        out.push(`<blockquote><p>${runsHtml(b.runs)}</p></blockquote>`);
        break;
      case "break":
        out.push("<hr />");
        break;
      case "table":
        out.push(
          `<table>\n${b.rows.map((row) => `  <tr>${row.map((cell) => (cell.header ? `<th>${runsHtml(cell.runs)}</th>` : `<td>${runsHtml(cell.runs)}</td>`)).join("")}</tr>`).join("\n")}\n</table>`,
        );
        break;
      case "image":
        if (/^https?:\/\//i.test(b.url)) out.push(`<p align="center"><img src="${esc(b.url)}" alt="${esc(b.alt)}" /></p>`);
        else if (b.alt) out.push(`<p align="center">[${esc(b.alt)}]</p>`);
        break;
      case "embed":
        out.push(`<p><em>${esc(b.title)}</em></p>`);
        break;
      default: {
        const html = runsHtml(b.runs);
        if (!html) break;
        const align = b.script ? scriptAlign[b.script] : undefined;
        out.push(align ? `<p align="${align}">${html}</p>` : `<p>${html}</p>`);
      }
    }
  }
  flush();
  return out.join("\n");
}

/**
 * The manuscript cut into AO3 chapters: each chapter of the binder is one, and
 * so is anything with a heading of its own that text follows straight away (a
 * prologue at the top). A part's heading opens the first chapter inside it.
 * With no chapters at all the whole text is one chapter under the work's title.
 * Front matter stays out: AO3 has its own notes for that.
 */
export function ao3Chapters(pieces: Piece[], options: { title: string; summaryOf?: (id: string) => string | null | undefined }): Ao3Chapter[] {
  type Open = { title: string; id?: string; parts: string[]; blocks: Block[] };
  const chapters: Open[] = [];
  let current: Open | null = null;
  let carried: string[] = [];
  const startsChapter = (i: number) => {
    const piece = pieces[i];
    return piece.kind === "heading" && (piece.chapter || (piece.level < 3 && pieces[i + 1]?.kind === "blocks"));
  };
  pieces.forEach((piece, i) => {
    if (piece.kind === "front") return;
    if (piece.kind === "heading" && startsChapter(i)) {
      current = { title: piece.title, id: piece.id, parts: carried, blocks: [] };
      carried = [];
      chapters.push(current);
      return;
    }
    if (piece.kind === "heading" && piece.level < 3) {
      // A part: its title goes at the top of the next chapter.
      if (piece.title) carried.push(`<h2>${esc(piece.title)}</h2>`);
      return;
    }
    if (!current) {
      current = { title: options.title, parts: carried, blocks: [] };
      carried = [];
      chapters.push(current);
    }
    const open: Open = current;
    if (piece.kind === "heading") {
      if (piece.title) open.parts.push(`<h3>${esc(piece.title)}</h3>`);
    } else if (piece.kind === "scene-break") open.parts.push("<hr />");
    else {
      open.parts.push(blocksToAo3(piece.blocks));
      open.blocks.push(...piece.blocks);
    }
  });
  return chapters
    .filter((chapter) => chapter.blocks.length > 0)
    .map((chapter, i) => ({
      title: chapter.title || `Chapter ${i + 1}`,
      summary: (chapter.id && options.summaryOf?.(chapter.id)?.trim()) || "",
      html: chapter.parts.filter(Boolean).join("\n"),
      words: countWords(blocksToText(chapter.blocks)),
    }));
}

/**
 * A page to open in a browser: every chapter with its title, summary and word
 * count, a preview, and its HTML in a box with a Copy button, for posting the
 * work chapter by chapter without Plotra open. Its script copies and does
 * nothing else.
 */
export function ao3Page(title: string, author: string, chapters: Ao3Chapter[]): string {
  const total = chapters.reduce((sum, chapter) => sum + chapter.words, 0);
  const sections = chapters
    .map(
      (chapter, i) => `<section>
<h2>Chapter ${i + 1}: ${esc(chapter.title)}</h2>
<p class="meta">${chapter.words.toLocaleString("en")} words</p>
${chapter.summary ? `<p class="label">Summary</p>\n<textarea readonly rows="3" id="summary-${i}">${esc(chapter.summary)}</textarea>\n<button type="button" data-copy="summary-${i}">Copy the summary</button>` : ""}
<p class="label">Chapter text (paste it into AO3's HTML box)</p>
<textarea readonly rows="8" id="text-${i}">${esc(chapter.html)}</textarea>
<button type="button" data-copy="text-${i}">Copy chapter ${i + 1}</button>
<details><summary>Preview</summary><div class="preview">${chapter.html}</div></details>
</section>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}: for AO3</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 44rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; color: #222; }
section { border-top: 1px solid #ddd; padding: 1rem 0; }
textarea { width: 100%; font: 12px ui-monospace, monospace; }
button { margin: 0.25rem 0 0.75rem; padding: 0.3rem 0.7rem; }
.meta, .label { color: #666; font-size: 0.85rem; margin: 0.25rem 0; }
.preview { font-family: Georgia, serif; border-left: 3px solid #eee; padding-left: 1rem; }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
<p class="meta">By ${esc(author)} · ${chapters.length} ${plural(chapters.length, "chapter")} · ${total.toLocaleString("en")} words. On AO3, post the first chapter as the work, then Add Chapter for each of the rest.</p>
${sections}
<script>
document.addEventListener("click", function (event) {
  var id = event.target && event.target.getAttribute && event.target.getAttribute("data-copy");
  if (!id) return;
  var box = document.getElementById(id);
  box.select();
  (navigator.clipboard ? navigator.clipboard.writeText(box.value) : Promise.reject()).catch(function () { document.execCommand("copy"); });
  event.target.textContent = "Copied";
});
</script>
</body>
</html>
`;
}
