// HTML to a Plate value (plan.md 2.7): the second half of DOCX import, where
// mammoth turns a Word file into clean HTML. Not a browser-grade parser: it
// reads the well-formed subset mammoth writes (and that our own exports use).
// Scripts and styles are dropped, never run. Pure.

import type { DocNode } from "../doc-index";
import { decodeEntity, tidyInline } from "./markdown";
import { isBreakLine } from "./text";

type Element = { tag: string; attrs: Record<string, string>; children: Array<Element | string> };

const voidTags = new Set(["br", "hr", "img", "meta", "link", "input", "col", "wbr"]);
const dropped = new Set(["script", "style", "head", "title", "template", "noscript"]);
const blockTags = new Set(["p", "div", "section", "article", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "hr", "pre", "body", "html", "figure", "figcaption", "header", "footer", "main", "aside", "dl", "dt", "dd"]);

const decode = (text: string) => text.replace(/&#?\w+;/g, (entity) => decodeEntity(entity) ?? entity);

function parse(html: string): Element {
  const root: Element = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const TAG = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>]+))?)*)\s*(\/?)>/g;
  let last = 0;
  for (let match = TAG.exec(html); match; match = TAG.exec(html)) {
    if (match.index > last) stack.at(-1)!.children.push(decode(html.slice(last, match.index)));
    last = TAG.lastIndex;
    const tag = match[2]?.toLowerCase();
    if (!tag) continue;
    if (match[1]) {
      // Close up to the matching element; a stray closing tag is ignored.
      const at = stack.findLastIndex((el) => el.tag === tag);
      if (at > 0) stack.length = at;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const attr of (match[3] ?? "").matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+)))?/g)) {
      attrs[attr[1].toLowerCase()] = decode(attr[2] ?? attr[3] ?? attr[4] ?? "");
    }
    const element: Element = { tag, attrs, children: [] };
    stack.at(-1)!.children.push(element);
    if (dropped.has(tag) && !match[4]) {
      // Skip to the end of what must not become text.
      const end = html.toLowerCase().indexOf(`</${tag}`, last);
      TAG.lastIndex = last = end < 0 ? html.length : end;
      continue;
    }
    if (!voidTags.has(tag) && !match[4]) stack.push(element);
  }
  if (last < html.length) stack.at(-1)!.children.push(decode(html.slice(last)));
  return root;
}

const markTags: Record<string, string> = { strong: "bold", b: "bold", em: "italic", i: "italic", u: "underline", ins: "underline", s: "strikethrough", strike: "strikethrough", del: "strikethrough", code: "code", kbd: "code", mark: "highlight" };

type Marks = Record<string, true>;

/** The text inside an element as leaves and links; block elements nested in it are left to the caller. */
function inlines(children: Array<Element | string>, marks: Marks, pre: boolean): DocNode[] {
  const out: DocNode[] = [];
  for (const child of children) {
    if (typeof child === "string") {
      const text = pre ? child : child.replace(/\s+/g, " ");
      if (text) out.push({ text, ...marks });
      continue;
    }
    if (child.tag === "br") out.push({ text: "\n", ...marks });
    else if (child.tag === "img") {
      if (child.attrs.alt) out.push({ text: child.attrs.alt, ...marks });
    } else if (dropped.has(child.tag) || child.tag === "ul" || child.tag === "ol" || child.tag === "table") continue;
    else if (child.tag === "a" && /^(https?:\/\/|mailto:)/i.test(child.attrs.href ?? "")) {
      const inner = tidyInline(inlines(child.children, marks, pre));
      if (inner.some((n) => n.text)) out.push({ type: "a", url: child.attrs.href.trim(), children: inner });
    } else {
      const mark = markTags[child.tag];
      out.push(...inlines(child.children, mark ? { ...marks, [mark]: true } : marks, pre || child.tag === "pre"));
    }
  }
  return out;
}

const textOf = (nodes: DocNode[]): string => nodes.map((n) => (typeof n.text === "string" ? n.text : textOf(n.children ?? []))).join("");

/** Trims the space HTML leaves at the edges of a block. */
function trimmed(nodes: DocNode[]): DocNode[] {
  const out = tidyInline(nodes);
  const first = out[0];
  const last = out.at(-1)!;
  if (typeof first.text === "string") first.text = first.text.replace(/^[ \t\n]+/, "");
  if (typeof last.text === "string") last.text = last.text.replace(/[ \t\n]+$/, "");
  return tidyInline(out);
}

const isBlock = (child: Element | string) => typeof child !== "string" && blockTags.has(child.tag);

type Context = { quote: boolean; level: number };

function blocks(children: Array<Element | string>, ctx: Context, out: DocNode[]) {
  // Text and inline elements that sit directly among blocks are a paragraph of their own.
  let loose: Array<Element | string> = [];
  const flush = () => {
    if (loose.length) text(loose, ctx.quote ? "blockquote" : "p", out);
    loose = [];
  };
  for (const child of children) {
    if (typeof child === "string" || !isBlock(child)) {
      if (typeof child === "string" || !dropped.has(child.tag)) loose.push(child);
      continue;
    }
    flush();
    block(child, ctx, out);
  }
  flush();
}

/** One block of text. Empty ones are skipped; a line of asterisks is a scene break. */
function text(children: Array<Element | string>, type: string, out: DocNode[], extra: Record<string, unknown> = {}, pre = false) {
  const nodes = pre ? tidyInline(inlines(children, { code: true }, true)) : trimmed(inlines(children, {}, false));
  const plain = textOf(nodes);
  if (!plain.trim()) return;
  if ((type === "p" || type === "blockquote") && !("listStyleType" in extra) && isBreakLine(plain)) return void out.push({ type: "hr", children: [{ text: "" }] });
  out.push({ type, ...extra, children: nodes });
}

function block(el: Element, ctx: Context, out: DocNode[]) {
  switch (el.tag) {
    case "h1":
    case "h2":
    case "h3":
      return text(el.children, el.tag, out);
    case "h4":
    case "h5":
    case "h6":
      return text(el.children, "h3", out);
    case "hr":
      return void out.push({ type: "hr", children: [{ text: "" }] });
    case "pre":
      return text(el.children, "p", out, {}, true);
    case "blockquote":
      return blocks(el.children, { ...ctx, quote: true }, out);
    case "ul":
    case "ol": {
      const level = ctx.level + 1;
      let number = Number(el.attrs.start) || 1;
      for (const item of el.children) {
        if (typeof item === "string" || item.tag !== "li") continue;
        const style = el.tag === "ol" ? "decimal" : "disc";
        // The item's own text first (paragraphs inside it run together), then the lists nested in it.
        const own = item.children.flatMap((c) => (typeof c !== "string" && (c.tag === "p" || c.tag === "div") ? [...c.children, " "] : [c]));
        const before = out.length;
        text(own, "p", out, { indent: level, listStyleType: style, ...(style === "decimal" && number !== 1 && { listStart: number }) });
        if (out.length > before) number++;
        for (const nested of item.children) if (typeof nested !== "string" && (nested.tag === "ul" || nested.tag === "ol")) block(nested, { ...ctx, level }, out);
      }
      return;
    }
    case "table": {
      const rows: DocNode[] = [];
      const visit = (node: Element, head: boolean) => {
        for (const child of node.children) {
          if (typeof child === "string") continue;
          if (child.tag === "tr") {
            const cells = child.children.filter((c): c is Element => typeof c !== "string" && (c.tag === "td" || c.tag === "th"));
            if (!cells.length) continue;
            rows.push({
              type: "tr",
              children: cells.map((cell) => {
                const inner: DocNode[] = [];
                blocks(cell.children, { quote: false, level: 0 }, inner);
                return { type: head || cell.tag === "th" ? "th" : "td", children: inner.length ? inner : [{ type: "p", children: [{ text: "" }] }] };
              }),
            });
          } else visit(child, head || child.tag === "thead");
        }
      };
      visit(el, false);
      if (rows.length) out.push({ type: "table", children: rows });
      return;
    }
    case "p":
    case "li":
    case "dt":
    case "dd":
    case "figcaption":
      // A paragraph can't hold blocks, but sloppy HTML nests them anyway.
      if (el.children.some(isBlock)) return blocks(el.children, ctx, out);
      return text(el.children, ctx.quote ? "blockquote" : "p", out);
    default:
      return blocks(el.children, ctx, out);
  }
}

/** An HTML document or fragment as a Plate value. */
export function htmlToValue(html: string): DocNode[] {
  const out: DocNode[] = [];
  blocks(parse(html).children, { quote: false, level: 0 }, out);
  return out;
}
