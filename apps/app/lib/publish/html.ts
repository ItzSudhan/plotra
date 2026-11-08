// Renders a Plate document as HTML, for exports (EPUB, the public wiki, the
// series bible). Pure and string-based, so it runs in a route handler without
// React. The markup is also valid XHTML (every tag closed, no named entities
// beyond the XML ones), which EPUB requires.

import { blockTags, EMBED, WIKILINK, type BlockTags, type DocNode } from "../doc-index";
import { COMIC_PAGE, COMIC_PANEL, dualPairs, SCRIPT_NOTE } from "../script";

export type RenderContext = {
  /** Where a link to another note should point; null (or no function) prints its title as plain text. */
  linkFor?: (nodeId: string) => string | null;
  titleOf?: (nodeId: string) => string | undefined;
  /** Whether a block may be shown, given its tags: the spoiler horizon and canon filters. */
  showBlock?: (tags: BlockTags | null) => boolean;
  /** The in-text form of a citation ("(Okafor 2019, 44)"). */
  cite?: (nodeId: string, locator?: string) => string;
  /** Whether images may be included (remote URLs don't travel inside an EPUB). */
  images?: boolean;
  /** Where a picture's source points instead, such as a copy packed inside an EPUB; null leaves the picture out. */
  imageSrc?: (url: unknown) => string | null;
};

export const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Only http(s) links survive: anything else (javascript:, data:, a path inside the app) is dropped. */
export const safeUrl = (url: unknown) => (typeof url === "string" && /^https?:\/\//i.test(url.trim()) ? url.trim() : null);

function leaf(n: DocNode): string {
  // A writer's note in a script never prints.
  if (n[SCRIPT_NOTE]) return "";
  let out = esc(String(n.text ?? "")).replace(/\n/g, "<br/>");
  if (!out) return "";
  if (n.code) out = `<code>${out}</code>`;
  if (n.bold) out = `<strong>${out}</strong>`;
  if (n.italic) out = `<em>${out}</em>`;
  if (n.underline) out = `<u>${out}</u>`;
  if (n.strikethrough) out = `<s>${out}</s>`;
  if (n.highlight) out = `<mark>${out}</mark>`;
  return out;
}

function inlines(nodes: DocNode[], ctx: RenderContext): string {
  return nodes
    .map((n) => {
      if (typeof n.text === "string") return leaf(n);
      if (n.type === WIKILINK) {
        const id = String(n.nodeId ?? "");
        const label = esc(String(n.alias || ctx.titleOf?.(id) || ""));
        // A link to something the reader may not see leaves no trace, not even a name.
        if (!label) return "";
        const href = ctx.linkFor?.(id);
        return href ? `<a href="${esc(href)}">${label}</a>` : label;
      }
      if (n.type === "citation") {
        const text = ctx.cite?.(String(n.nodeId ?? ""), typeof n.locator === "string" ? n.locator : undefined);
        return text ? `<span class="citation">${esc(text)}</span>` : "";
      }
      if (n.type === "a") {
        const href = safeUrl(n.url);
        const inner = inlines(n.children ?? [], ctx);
        return href ? `<a href="${esc(href)}">${inner}</a>` : inner;
      }
      return inlines(n.children ?? [], ctx);
    })
    .join("");
}

/** Block types that hold other blocks rather than text. */
const isContainer = (n: DocNode) => Array.isArray(n.children) && n.children.length > 0 && n.children.every((c) => typeof c.text !== "string");

const className = (type: string) => `b-${type.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

function block(b: DocNode, ctx: RenderContext): string {
  if (ctx.showBlock && !ctx.showBlock(blockTags(b))) return "";
  const inner = () => inlines(b.children ?? [], ctx);
  switch (b.type) {
    case "h1":
      return `<h2>${inner()}</h2>`;
    case "h2":
      return `<h3>${inner()}</h3>`;
    case "h3":
      return `<h4>${inner()}</h4>`;
    case "blockquote":
      return `<blockquote>${isContainer(b) ? renderBlocks(b.children ?? [], ctx) : `<p>${inner()}</p>`}</blockquote>`;
    case "hr":
      return `<hr/>`;
    case "callout":
      return `<aside class="callout">${isContainer(b) ? renderBlocks(b.children ?? [], ctx) : `<p>${inner()}</p>`}</aside>`;
    case "img": {
      const src = ctx.imageSrc ? ctx.imageSrc(b.url) : ctx.images === false ? null : safeUrl(b.url);
      return src ? `<p class="figure"><img src="${esc(src)}" alt="${esc(String(b.alt ?? ""))}"/></p>` : "";
    }
    case "table":
      return `<table>${(b.children ?? [])
        .map(
          (row) =>
            `<tr>${(row.children ?? [])
              .map((cell) => {
                const tag = cell.type === "th" ? "th" : "td";
                return `<${tag}>${renderBlocks(cell.children ?? [], ctx)}</${tag}>`;
              })
              .join("")}</tr>`,
        )
        .join("")}</table>`;
    case EMBED: {
      const title = ctx.titleOf?.(String(b.nodeId ?? ""));
      const href = title ? ctx.linkFor?.(String(b.nodeId)) : null;
      return title ? `<p class="embed">${href ? `<a href="${esc(href)}">${esc(title)}</a>` : esc(title)}</p>` : "";
    }
    case "p":
    case undefined: {
      const html = inner();
      return html ? `<p>${html}</p>` : "";
    }
    default: {
      // Script elements and anything a plugin adds: a paragraph the stylesheet can lay out by type.
      if (isContainer(b)) return `<div class="${className(b.type)}">${renderBlocks(b.children ?? [], ctx)}</div>`;
      const html = inner();
      // Comic pages and panels are numbered by the stylesheet, so they print even without text of their own.
      return html || b.type === COMIC_PAGE || b.type === COMIC_PANEL ? `<p class="${className(b.type)}">${html}</p>` : "";
    }
  }
}

/**
 * Plate's lists are flat: consecutive blocks with a `listStyleType`. They become one list here.
 * Dual dialogue (`dualPairs`) becomes two columns, `.b-dual-col` in a `.b-dual` (./script-css.ts).
 */
export function renderBlocks(all: DocNode[], ctx: RenderContext = {}): string {
  // Pairs are found among what the reader sees, so a hidden speech doesn't leave a column empty.
  const value = ctx.showBlock ? all.filter((b) => ctx.showBlock!(blockTags(b))) : all;
  const pairs = new Map(dualPairs(value).map((pair) => [pair.start, pair]));
  const out: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (list) out.push(`<${list.tag}>${list.items.join("")}</${list.tag}>`);
    list = null;
  };
  for (let i = 0; i < value.length; i++) {
    const b = value[i];
    const pair = pairs.get(i);
    if (pair) {
      flush();
      const column = (blocks: DocNode[]) => `<div class="b-dual-col">${blocks.map((x) => block(x, ctx)).join("")}</div>`;
      out.push(`<div class="b-dual">${column(value.slice(pair.start, pair.split))}${column(value.slice(pair.split, pair.end))}</div>`);
      i = pair.end - 1;
      continue;
    }
    if (b.listStyleType) {
      if (ctx.showBlock && !ctx.showBlock(blockTags(b))) continue;
      const tag = b.listStyleType === "decimal" ? "ol" : "ul";
      if (list && list.tag !== tag) flush();
      list ??= { tag, items: [] };
      const depth = typeof b.indent === "number" && b.indent > 1 ? ` style="margin-left:${(b.indent - 1) * 1.5}em"` : "";
      const mark = b.listStyleType === "todo" ? (b.checked ? "☑ " : "☐ ") : "";
      list.items.push(`<li${depth}>${mark}${inlines(b.children ?? [], ctx)}</li>`);
      continue;
    }
    flush();
    const html = block(b, ctx);
    if (html) out.push(html);
  }
  flush();
  return out.join("\n");
}

/** Plain text of a document, for descriptions and excerpts. */
export function plainText(value: DocNode[], max = 280): string {
  const parts: string[] = [];
  const walk = (n: DocNode) => {
    if (typeof n.text === "string") parts.push(n.text);
    else for (const c of n.children ?? []) walk(c);
  };
  for (const b of value) {
    walk(b);
    parts.push(" ");
    if (parts.join("").length > max * 2) break;
  }
  const text = parts.join("").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** A file name that's safe everywhere: lowercase words joined by hyphens. */
export function fileSlug(title: string, fallback = "untitled") {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}

/** Typography shared by every export; each adds its own layout on top. */
export const baseCss = `
body { font-family: Georgia, "Iowan Old Style", "Times New Roman", serif; line-height: 1.6; }
h1, h2, h3, h4 { line-height: 1.25; }
blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid #bbb; font-style: italic; }
aside.callout { margin: 1em 0; padding: 0.75em 1em; background: #f1efe9; border-radius: 6px; }
table { border-collapse: collapse; margin: 1em 0; }
td, th { border: 1px solid #bbb; padding: 0.3em 0.6em; vertical-align: top; text-align: left; }
img { max-width: 100%; }
code { font-family: ui-monospace, Menlo, monospace; font-size: 0.9em; }
mark { background: #f6e3a1; }
.citation { white-space: nowrap; }
`;
