// The manuscript as a printable page: HTML laid out the way the DOCX export
// (./docx.ts) sets it — title page, front matter, chapters on new pages,
// scene separators, screenplay columns — from the same compile settings
// (./compile.ts). The phone app turns it into a PDF with the system's own
// renderer (apps/mobile: expo-print). No running header: page margin boxes
// aren't drawn by the renderers that read this. Pure.

import { ACT_HEADING, CHARACTER, DIALOGUE, dualPairs, isScriptFormat, keepsWithNext, MUSIC_CUE, PARENTHETICAL, SCENE_HEADING, SFX, TRANSITION } from "../script";
import { compileFonts, paperInches, separatorText, standardManuscript } from "./compile";
import type { DocxInput } from "./docx";
import { dualInfo, type Block, type InlineRun } from "./model";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function runs(list: InlineRun[]): string {
  return list
    .map((run) => {
      let html = escape(run.text).replace(/\n/g, "<br>");
      if (run.code) html = `<code>${html}</code>`;
      if (run.bold) html = `<strong>${html}</strong>`;
      if (run.italic) html = `<em>${html}</em>`;
      if (run.underline) html = `<u>${html}</u>`;
      if (run.strikethrough) html = `<s>${html}</s>`;
      if (run.highlight) html = `<mark>${html}</mark>`;
      if (run.href && /^(https?:|mailto:)/i.test(run.href)) html = `<a href="${escape(run.href)}">${html}</a>`;
      return html;
    })
    .join("");
}

const scriptClass: Record<string, string> = {
  [SCENE_HEADING]: "s-scene",
  [CHARACTER]: "s-character",
  [PARENTHETICAL]: "s-paren",
  [DIALOGUE]: "s-dialogue",
  [TRANSITION]: "s-transition",
  [ACT_HEADING]: "s-act",
  [SFX]: "s-bold",
  [MUSIC_CUE]: "s-bold",
};

type State = { script: boolean; separator: string; lastList: "ul" | "ol" | null };

function closeList(state: State): string {
  const out = state.lastList ? `</${state.lastList}>` : "";
  state.lastList = null;
  return out;
}

function block(b: Block, state: State): string {
  if (b.kind !== "list") {
    const close = closeList(state);
    return close + blockBody(b, state);
  }
  const tag = b.style === "ordered" ? "ol" : "ul";
  let out = "";
  if (state.lastList !== tag) out += closeList(state) + `<${tag}>`;
  state.lastList = tag;
  const marker = b.style === "todo" ? (b.checked ? "☑ " : "☐ ") : "";
  return `${out}<li style="margin-left:${(b.level - 1) * 0.5}in"${b.style === "todo" ? ' class="todo"' : ""}>${marker}${runs(b.runs)}</li>`;
}

function blockBody(b: Exclude<Block, { kind: "list" }>, state: State): string {
  switch (b.kind) {
    case "heading":
      return `<h${b.level + 3}>${runs(b.runs)}</h${b.level + 3}>`;
    case "quote":
    case "callout":
      return `<blockquote>${runs(b.runs)}</blockquote>`;
    case "break":
      return `<p class="sep">${escape(state.separator) || "&nbsp;"}</p>`;
    case "table":
      return `<table>${b.rows.map((row) => `<tr>${row.map((cell) => (cell.header ? `<th>${runs(cell.runs)}</th>` : `<td>${runs(cell.runs)}</td>`)).join("")}</tr>`).join("")}</table>`;
    case "image":
      // Pictures live at addresses the export doesn't fetch; their description stands in, as in Word.
      return b.alt ? `<p class="center">[${escape(b.alt)}]</p>` : "";
    case "embed":
      return `<p class="embed"><em>${escape(b.title)}</em></p>`;
    default:
      if (b.script) return `<p class="script ${scriptClass[b.script] ?? ""}${keepsWithNext(b.script) ? " keep" : ""}">${runs(b.runs)}</p>`;
      return `<p class="${state.script ? "script" : "body"}">${runs(b.runs)}</p>`;
  }
}

/** A run of blocks, dual dialogue set side by side. */
function blocks(list: Block[], state: State): string {
  const pairs = new Map(dualPairs(list, dualInfo).map((pair) => [pair.start, pair]));
  let out = "";
  for (let i = 0; i < list.length; i++) {
    const pair = pairs.get(i);
    if (pair) {
      out += closeList(state);
      const column = (part: Block[]) => part.map((b) => blockBody(b as Exclude<Block, { kind: "list" }>, state)).join("");
      out += `<div class="dual"><div>${column(list.slice(pair.start, pair.split))}</div><div>${column(list.slice(pair.split, pair.end))}</div></div>`;
      i = pair.end - 1;
    } else out += block(list[i], state);
  }
  return out + closeList(state);
}

export type PrintPage = { width: number; height: number };

/** The page size in points (72 to the inch), for the renderer. */
export function printPage(input: Pick<DocxInput, "options">): PrintPage {
  const paper = paperInches[(input.options ?? standardManuscript).paper];
  return { width: Math.round(paper.width * 72), height: Math.round(paper.height * 72) };
}

/** The manuscript as one printable HTML document. */
export function buildPrintHtml(input: DocxInput): string {
  const { title, author } = input;
  const formats = input.pieces.flatMap((p) => (p.kind === "blocks" ? [p.format] : []));
  const script = formats.filter(isScriptFormat).length * 2 > formats.length;
  const o = input.options ?? standardManuscript;
  const font = script ? '"Courier Prime", "Courier New", Courier, monospace' : o.font === "serif" ? '"Times New Roman", Times, serif' : `"${compileFonts[o.font].family}", ${o.font === "sans" ? "Helvetica, Arial, sans-serif" : o.font === "mono" ? "Courier, monospace" : "serif"}`;
  const size = script ? 12 : o.size;
  const line = script ? 1.15 : { single: 1.15, onehalf: 1.5, double: 2 }[o.spacing];
  const paper = paperInches[o.paper];
  const state: State = { script, separator: separatorText(o.separator), lastList: null };
  const titlePage = script || o.titlePage;
  const pageBreaks = script || o.pageBreaks;

  const parts: string[] = [];
  if (titlePage) {
    const words = input.words > 0 ? `about ${Math.max(100, Math.round(input.words / 100) * 100).toLocaleString("en-US")} words` : "";
    parts.push(
      `<section class="title-page"><div class="contact"><div>${escape(author)}${input.email ? `<br>${escape(input.email)}` : ""}</div><div>${escape(words)}</div></div>` +
        `<h1 class="book">${escape(script ? title.toUpperCase() : title)}</h1><p class="byline">by ${escape(author)}</p></section>`,
    );
  }

  let afterHeading = false;
  // Whatever comes first after the title page (or a page of front matter) starts a new page.
  let newPage = titlePage;
  for (const piece of input.pieces) {
    if (piece.kind === "heading") {
      const chapterPage = piece.level < 3 && !afterHeading && pageBreaks;
      const tag = `h${piece.level}`;
      const cls = [piece.level < 3 ? "chapter" : "", chapterPage || newPage ? "page" : ""].filter(Boolean).join(" ");
      parts.push(`<${tag} class="${cls}">${escape(piece.title)}</${tag}>`);
      afterHeading = piece.level < 3;
    } else if (piece.kind === "scene-break") {
      parts.push(`<p class="sep">${escape(state.separator) || "&nbsp;"}</p>`);
      afterHeading = false;
    } else if (piece.kind === "front") {
      const { page } = piece;
      const copyright = page.role === "copyright";
      parts.push(
        `<section class="front ${copyright ? "copyright" : "centre"}">${page.paragraphs.map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`).join("")}${page.source ? `<p class="source">— ${escape(page.source)}</p>` : ""}</section>`,
      );
      afterHeading = false;
    } else {
      const html = blocks(piece.blocks, state);
      if (html) parts.push(newPage ? `<div class="page">${html}</div>` : html);
      afterHeading = false;
    }
    newPage = piece.kind === "front";
  }

  if (input.references) {
    parts.push(`<h1 class="chapter page">${escape(input.references.heading)}</h1>`);
    for (const b of input.references.blocks) if (b.kind === "paragraph") parts.push(`<p class="reference">${runs(b.runs)}</p>`);
  }

  const css = `
    @page { size: ${paper.width}in ${paper.height}in; margin: 1in 1in 1in ${script ? 1.5 : 1}in; }
    html { -webkit-print-color-adjust: exact; }
    body { margin: 0; font-family: ${font}; font-size: ${size}pt; line-height: ${line}; color: #000; }
    p { margin: 0; orphans: 2; widows: 2; }
    p.body { text-indent: ${o.indent ? "0.5in" : "0"}; ${o.indent ? "" : "margin-bottom: 0.6em;"} }
    p.body:first-child, h1 + p.body, h2 + p.body, h3 + p.body, p.sep + p.body { text-indent: 0; }
    .page { break-before: page; page-break-before: always; }
    .title-page { height: ${paper.height - 2}in; position: relative; line-height: 1.15; }
    .contact { display: flex; justify-content: space-between; }
    h1.book { font-size: ${size}pt; font-weight: normal; text-align: center; margin: 3.25in 0 0; }
    .byline { text-align: center; margin-top: 1em; }
    h1, h2, h3 { font-size: ${size}pt; break-after: avoid; page-break-after: avoid; }
    h1.chapter, h2.chapter { text-align: center; font-weight: normal; margin: 0 0 ${line}em; }
    h1.chapter.page, h2.chapter.page { padding-top: 2in; }
    h3 { font-weight: bold; margin: 1.5em 0 0.5em; }
    h4, h5, h6 { font-size: ${size}pt; margin: 1em 0 0; break-after: avoid; }
    h6 { font-style: italic; font-weight: normal; }
    .sep { text-align: center; margin: ${line * 0.5}em 0; }
    blockquote { margin: 0 0.5in; }
    ul, ol { margin: 0; padding-left: 0.5in; }
    li.todo { list-style: none; }
    table { border-collapse: collapse; width: 100%; margin: 0.5em 0; line-height: 1.15; font-size: ${Math.max(9, size - 2)}pt; }
    td, th { border: 1px solid #999; padding: 3pt 5pt; vertical-align: top; text-align: left; }
    .center, .embed { text-align: center; }
    .front { break-before: page; page-break-before: always; line-height: 1.3; }
    .front.centre { text-align: center; font-style: italic; padding-top: 2in; }
    .front.centre .source { font-style: normal; margin-top: 0.5em; }
    .front.copyright { font-size: ${Math.max(8, size - 2)}pt; }
    .front p { margin-bottom: 1em; }
    .reference { padding-left: 0.5in; text-indent: -0.5in; margin-bottom: 0.4em; }
    code { font-family: "Courier New", Courier, monospace; }
    mark { background: #fff59d; }
    a { color: inherit; }
    .script { font-family: "Courier Prime", "Courier New", Courier, monospace; font-size: 12pt; line-height: 1.15; margin-top: 12pt; }
    .s-scene { font-weight: bold; text-transform: uppercase; margin-top: 24pt; }
    .s-character { margin-left: 2.2in; text-transform: uppercase; }
    .s-paren { margin: 0 2.4in 0 1.6in; }
    .s-dialogue { margin: 0 1.5in 0 1in; }
    .s-character + .s-paren, .s-character + .s-dialogue, .s-paren + .s-dialogue, .s-dialogue + .s-paren { margin-top: 0; }
    .s-transition { text-align: right; text-transform: uppercase; }
    .s-act { text-align: center; text-decoration: underline; margin-top: 24pt; }
    .s-bold { font-weight: bold; }
    .keep { break-after: avoid; page-break-after: avoid; }
    .dual { display: flex; gap: 0.15in; break-inside: avoid; margin-top: 12pt; }
    .dual > div { flex: 1; }
    .dual .script { margin-top: 0; }
    .dual .s-character { margin-left: 0.9in; }
    .dual .s-paren { margin: 0 0.45in; }
    .dual .s-dialogue { margin: 0; }
  `;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>${css}</style></head><body>${parts.join("\n")}</body></html>`;
}
