// Markdown in and out (plan.md 2.7). Written here rather than on
// @platejs/markdown: that serializer needs a live editor, parses MDX (so a
// stray `<` or `{` in a manuscript is a syntax error), has no GFM tables or
// task lists without remark-gfm (not installed), and knows nothing of
// `[[wiki-links]]`. This covers what Plotra's editor can hold: headings, marks,
// lists, quotes, callouts, rules, links, images and tables. Pure.

import { EMBED, WIKILINK, type DocNode } from "../doc-index";
import { PENDING_PICTURE } from "./vault-pictures";
import { toBlocks, type Block, type ExportContext, type InlineRun } from "./model";

// ---- Writing ------------------------------------------------------------------------

// Outermost first. Code is not here: a code span is literal, so it's written whole.
const nesting = ["bold", "italic", "strikethrough", "highlight", "underline"] as const;
type Nested = (typeof nesting)[number];
const opening: Record<Nested, string> = { bold: "**", italic: "*", strikethrough: "~~", highlight: "==", underline: "<u>" };
const closing: Record<Nested, string> = { ...opening, underline: "</u>" };

const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

/** Escapes what Markdown would read as syntax. */
function escapeText(text: string, table: boolean): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" || ch === "`" || ch === "*" || ch === "[" || ch === "]" || ch === "<") out += `\\${ch}`;
    // An underscore inside a word is never emphasis, so snake_case stays readable.
    else if (ch === "_") out += isWordChar(text[i - 1]) && isWordChar(text[i + 1]) ? ch : "\\_";
    else if ((ch === "~" || ch === "=") && text[i + 1] === ch) out += `\\${ch}`;
    else if (ch === "&" && /^&#?\w+;/.test(text.slice(i, i + 12))) out += "\\&";
    else if (ch === "|" && table) out += "\\|";
    else if (ch === "\n") out += table ? "<br>" : "\\\n";
    else out += ch;
  }
  return out;
}

/** Escapes a line that would otherwise start a heading, list, quote or rule. */
function escapeLineStart(line: string): string {
  if (/^(#{1,6}(\s|$)|>|[-+](\s|$)|=+\s*$|-{3,}\s*$)/.test(line)) return `\\${line}`;
  const ordered = /^(\d{1,9})([.)])(\s|$)/.exec(line);
  return ordered ? `${ordered[1]}\\${ordered[2]}${line.slice(ordered[0].length - ordered[3].length)}` : line;
}

function codeSpan(text: string) {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text.replace(/\n/g, " ")}${pad}${fence}`;
}

function wikiText(wiki: NonNullable<InlineRun["wiki"]>) {
  const clean = (text: string) => text.replace(/[[\]|\n]/g, " ").trim();
  return `[[${clean(wiki.title)}${wiki.heading ? `#${clean(wiki.heading)}` : ""}${wiki.alias ? `|${clean(wiki.alias)}` : ""}]]`;
}

type Segment = { text: string; marks: Set<Nested>; space: boolean; raw?: string };

function writeRuns(runs: InlineRun[], table: boolean): string {
  // Emphasis can't open before a space or close after one, so text is cut into
  // words and gaps, and a gap is formatted like whatever is on both sides of it.
  const segments: Segment[] = [];
  for (const run of runs) {
    const marks = new Set<Nested>(nesting.filter((m) => run[m]));
    if (run.wiki) segments.push({ text: run.text, marks, space: false, raw: wikiText(run.wiki) });
    else if (run.code) segments.push({ text: run.text, marks, space: false, raw: codeSpan(run.text) });
    else for (const part of run.text.split(/(\s+)/)) if (part) segments.push({ text: part, marks, space: !part.trim() });
  }
  const nextWord = (from: number) => {
    for (let i = from; i < segments.length; i++) if (!segments[i].space) return segments[i].marks;
    return new Set<Nested>();
  };

  let out = "";
  const stack: Nested[] = [];
  const closeUnless = (keep: Set<Nested>) => {
    const lowest = stack.findIndex((m) => !keep.has(m));
    if (lowest < 0) return;
    while (stack.length > lowest) out += closing[stack.pop()!];
  };
  segments.forEach((segment, i) => {
    closeUnless(segment.space ? nextWord(i + 1) : segment.marks);
    if (!segment.space) {
      for (const m of nesting) {
        if (!segment.marks.has(m) || stack.includes(m)) continue;
        stack.push(m);
        out += opening[m];
      }
    }
    out += segment.raw ?? escapeText(segment.text, table);
  });
  closeUnless(new Set());
  return out;
}

/** Inline Markdown for a block's text; links wrap the runs that share them. */
function writeInline(runs: InlineRun[], table = false): string {
  let out = "";
  for (let i = 0; i < runs.length; ) {
    const href = runs[i].href;
    let end = i + 1;
    while (end < runs.length && runs[end].href === href) end++;
    const text = writeRuns(runs.slice(i, end), table);
    out += href ? `[${text}](${href.replace(/[()\s]/g, encodeURIComponent)})` : text;
    i = end;
  }
  return out;
}

const escapeLines = (text: string) => text.split("\n").map(escapeLineStart).join("\n");

function writeTable(rows: Extract<Block, { kind: "table" }>["rows"]): string {
  const width = Math.max(...rows.map((row) => row.length));
  const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
  const cells = rows.map((row) => row.map((cell) => writeInline(cell.runs, true)));
  // A Markdown table always has a header row; a table without one gets an empty header.
  const headed = rows[0].some((cell) => cell.header);
  return [line(headed ? cells[0] : []), line(Array.from({ length: width }, () => "---")), ...(headed ? cells.slice(1) : cells).map(line)].join("\n");
}

/**
 * Export blocks as Markdown. Ends without a trailing newline. `headingShift`
 * pushes the document's own headings down, for a note printed under a heading
 * of its own in a longer file.
 */
export function blocksToMarkdown(blocks: Block[], headingShift = 0): string {
  const parts: string[] = [];
  let lastWasList = false;
  for (const b of blocks) {
    let text: string;
    switch (b.kind) {
      case "heading":
        text = `${"#".repeat(Math.max(1, Math.min(6, b.level + headingShift)))} ${writeInline(b.runs).replace(/\\\n/g, " ")}`;
        break;
      case "quote":
        text = writeInline(b.runs)
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
        break;
      case "callout":
        text = ["[!note]", ...writeInline(b.runs).split("\n")].map((line) => `> ${line}`).join("\n");
        break;
      case "list": {
        const marker = b.style === "ordered" ? `${b.number}.` : b.style === "todo" ? `- [${b.checked ? "x" : " "}]` : "-";
        // Four spaces a level nests under both "- " and "1. ".
        text = `${"    ".repeat(b.level - 1)}${marker} ${writeInline(b.runs).replace(/\\\n/g, "<br>")}`;
        break;
      }
      case "break":
        text = "---";
        break;
      case "table":
        text = writeTable(b.rows);
        break;
      case "image":
        text = `![${escapeText(b.alt, false)}](${b.url.replace(/[()\s]/g, encodeURIComponent)})`;
        break;
      case "embed":
        text = `!${wikiText({ title: b.title })}`;
        break;
      default:
        text = escapeLines(writeInline(b.runs));
    }
    // List items sit on consecutive lines; everything else is a paragraph apart.
    if (b.kind === "list" && lastWasList) parts[parts.length - 1] += `\n${text}`;
    else parts.push(text);
    lastWasList = b.kind === "list";
  }
  return parts.join("\n\n");
}

export const valueToMarkdown = (value: DocNode[], ctx: ExportContext = {}) => blocksToMarkdown(toBlocks(value, ctx));

// ---- Front matter -------------------------------------------------------------------

export type FrontMatter = {
  title?: string;
  tags: string[];
  /** Other names the note answers to (Obsidian's `aliases`). */
  aliases: string[];
  /** Where the note sat among its siblings when Plotra exported it. */
  order?: number;
  /**
   * Every other field, by its name as written: Obsidian's properties
   * (`status: draft`, `age: 32`, `home: "[[Verona]]"`, a list). Typed later,
   * from the values of every note of the import (./properties.ts).
   */
  properties: Record<string, string | string[]>;
};

/** Front matter fields that are about the file, not the note: not imported as properties. */
const notProperties = new Set(["title", "order", "tags", "tag", "keywords", "aliases", "alias", "cssclasses", "cssclass", "publish", "permalink", "kind", "author"]);

const unquote = (text: string) => text.trim().replace(/^(["'])(.*)\1$/, "$2").trim();

/**
 * Splits a leading `---` block off a Markdown file and reads its title, tags
 * and aliases. Only the YAML people write by hand in notes: `key: value`, `[a, b]`
 * and dashed lists.
 */
export function parseFrontMatter(source: string): { meta: FrontMatter; body: string } {
  const meta: FrontMatter = { tags: [], aliases: [], properties: {} };
  const match = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(source);
  if (!match) return { meta, body: source.replace(/^﻿/, "") };
  const lines = match[1].split(/\r?\n/);
  // Not YAML after all (a rule, some text, another rule): leave the file as it is.
  if (!lines.some((line) => /^[\w-]+\s*:/.test(line))) return { meta, body: source.replace(/^﻿/, "") };
  const list = (text: string) =>
    text
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map(unquote)
      .filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const entry = /^([\w-][\w -]*?)\s*:\s*(.*)$/.exec(lines[i]);
    if (!entry) continue;
    const key = entry[1].toLowerCase();
    let value = entry[2].trim();
    const items: string[] = [];
    while (!value && /^\s*-\s+/.test(lines[i + 1] ?? "")) items.push(unquote(lines[++i].replace(/^\s*-\s+/, "")));
    if (key === "title" && value) meta.title = unquote(value);
    else if (key === "order" && /^\d{1,6}$/.test(value)) meta.order = Number(value);
    else if (key === "tags" || key === "tag" || key === "keywords") {
      if (value.startsWith("[") || value.includes(",")) items.push(...list(value));
      else if (value) items.push(...value.split(/\s+/).map(unquote));
      value = "";
      meta.tags.push(...items.map((tag) => tag.replace(/^#/, "")).filter(Boolean));
    } else if (key === "aliases" || key === "alias") {
      if (value.startsWith("[")) items.push(...list(value));
      else if (value) items.push(unquote(value));
      meta.aliases.push(...items.filter(Boolean));
    } else if (!notProperties.has(key) && !(entry[1] in meta.properties)) {
      // A block of text (`|`, `>`) or a map of its own is more YAML than a note's property: left out.
      if (/^[|>][+-]?$/.test(value) || (!value && !items.length && /^\s+\S/.test(lines[i + 1] ?? ""))) continue;
      if (value.startsWith("[") && !value.startsWith("[[")) items.push(...list(value));
      const picked = items.length ? items.filter(Boolean) : unquote(value);
      if (picked.length) meta.properties[entry[1]] = picked;
    }
  }
  return { meta, body: source.slice(match[0].length) };
}

// ---- Reading: inline ----------------------------------------------------------------

type Token =
  | { t: "text"; s: string }
  | { t: "code"; s: string }
  | { t: "node"; node: DocNode }
  | { t: "open"; mark: string }
  | { t: "close"; mark: string }
  | { t: "delim"; ch: string; n: number; orig: number; canOpen: boolean; canClose: boolean; opens: string[]; closes: string[] };

// The named entities worth knowing in prose: every Latin-1 name (U+00A0 to U+00FF, in
// order) plus the typographic ones. Names are case-sensitive: &Eacute; is É, &eacute; é.
const latin1 =
  "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest " +
  "Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig " +
  "agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml";
// No prototype, so "&constructor;" is an unknown name rather than Object's constructor.
const entities: Record<string, string> = Object.assign(Object.create(null) as Record<string, string>, {
  ...Object.fromEntries(latin1.split(" ").map((name, i) => [name, String.fromCharCode(0xa0 + i)])),
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  mdash: "—", ndash: "–", hellip: "…", minus: "−",
  lsquo: "‘", rsquo: "’", sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„", lsaquo: "‹", rsaquo: "›", prime: "′", Prime: "″",
  bull: "•", dagger: "†", Dagger: "‡", permil: "‰", trade: "™", euro: "€",
  ensp: "\u2002", emsp: "\u2003", thinsp: "\u2009", zwnj: "\u200c", zwj: "\u200d",
  OElig: "Œ", oelig: "œ", Scaron: "Š", scaron: "š", Yuml: "Ÿ", fnof: "ƒ", circ: "ˆ", tilde: "˜",
});

export function decodeEntity(entity: string): string | null {
  const body = entity.slice(1, -1);
  if (body.startsWith("#")) {
    const code = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : null;
  }
  return entities[body] ?? null;
}

const PUNCT = /[!-/:-@[-`{-~\p{P}\p{S}]/u;

/** The wiki-link a `[[Title#Heading|Alias]]` names; its note is found later (`resolveLinks`). */
function wikiPlaceholder(inner: string, type: typeof WIKILINK | typeof EMBED): DocNode | null {
  const [target, ...rest] = inner.split("|");
  const [title, ...heading] = target.split("#");
  if (!title.trim()) return null;
  const alias = rest.join("|").trim();
  // `#^id` points at one block (Obsidian); blocks here have ids of their own, so the link goes to the note.
  const anchor = heading.join("#").trim();
  return {
    type,
    nodeId: "",
    title: title.trim(),
    ...(anchor && !anchor.startsWith("^") && { heading: anchor }),
    ...(alias && type === WIKILINK && { alias }),
    children: [{ text: "" }],
  };
}

/** Finds the `]` that closes the `[` at `start`, skipping escapes and nested brackets. */
function closingBracket(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === "[") depth++;
    else if (text[i] === "]" && --depth === 0) return i;
  }
  return -1;
}

/** Reads `(url "title")` at `start`; null when it isn't a link destination. */
function destination(text: string, start: number): { url: string; end: number } | null {
  if (text[start] !== "(") return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) {
      const inner = text.slice(start + 1, i).trim();
      const url = (/^<([^>]*)>/.exec(inner)?.[1] ?? inner.split(/\s+["'(]/)[0]).replace(/\\([!-/:-@[-`{-~])/g, "$1");
      return { url: url.trim(), end: i + 1 };
    }
    else if (text[i] === "\n") return null;
  }
  return null;
}

const safeDecode = (text: string) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

function linkNode(url: string, children: DocNode[]): DocNode[] {
  if (/^(https?:\/\/|mailto:)/i.test(url)) return [{ type: "a", url, children }];
  // A link to another Markdown file is a link to that note.
  const file = /^(?!\w+:)([^#?]+?)\.(?:md|markdown)(?:#(.*))?$/i.exec(url);
  if (file) {
    const title = safeDecode(file[1]).split("/").at(-1)!.trim();
    const alias = children.map(leafText).join("").trim();
    const node = wikiPlaceholder(`${title}${file[2] ? `#${safeDecode(file[2])}` : ""}${alias && alias !== title ? `|${alias}` : ""}`, WIKILINK);
    if (node) return [node];
  }
  return children;
}

const leafText = (n: DocNode): string => (typeof n.text === "string" ? n.text : (n.children ?? []).map(leafText).join(""));

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) tokens.push({ t: "text", s: buffer });
    buffer = "";
  };
  // What stands on either side of a run of emphasis characters decides whether it can open or close.
  // A link or a code span counts as a word; another run of emphasis as itself.
  const before = () => {
    if (buffer) return buffer.at(-1)!;
    const last = tokens.at(-1);
    return !last ? " " : last.t === "delim" ? last.ch : last.t === "text" ? last.s.at(-1)! : "a";
  };

  for (let i = 0; i < text.length; ) {
    const ch = text[i];
    const rest = text.slice(i);

    if (ch === "\\") {
      const next = text[i + 1];
      if (next === "\n") {
        buffer += "\n";
        i += 2;
      } else if (next && /[!-/:-@[-`{-~]/.test(next)) {
        buffer += next;
        i += 2;
      } else {
        buffer += ch;
        i++;
      }
      continue;
    }
    if (ch === "\n") {
      // Two spaces before a line end keep the break; otherwise wrapped lines are one paragraph.
      const hard = / {2,}$/.test(buffer);
      buffer = `${buffer.replace(/[ \t]+$/, "")}${hard ? "\n" : " "}`;
      i++;
      while (text[i] === " " || text[i] === "\t") i++;
      continue;
    }
    if (ch === "`") {
      const fence = /^`+/.exec(rest)![0];
      const close = text.indexOf(fence, i + fence.length);
      // The closing run has to be exactly as long as the opening one.
      let end = close;
      while (end >= 0 && (text[end + fence.length] === "`" || text[end - 1] === "`")) end = text.indexOf(fence, end + 1);
      if (end >= 0) {
        flush();
        let code = text.slice(i + fence.length, end).replace(/\n/g, " ");
        // One space of padding lets a span start or end with a backtick.
        if (code.startsWith(" ") && code.endsWith(" ") && code.trim()) code = code.slice(1, -1);
        tokens.push({ t: "code", s: code });
        i = end + fence.length;
        continue;
      }
      buffer += fence;
      i += fence.length;
      continue;
    }
    if (rest.startsWith("[[") || rest.startsWith("![[")) {
      const start = i + (ch === "!" ? 3 : 2);
      const end = text.indexOf("]]", start);
      const inner = end >= 0 ? text.slice(start, end) : "";
      const node = inner && !/[\n[\]]/.test(inner) ? wikiPlaceholder(inner, WIKILINK) : null;
      if (node) {
        flush();
        tokens.push({ t: "node", node });
        i = end + 2;
        continue;
      }
    }
    if (ch === "[" || (ch === "!" && text[i + 1] === "[")) {
      const open = ch === "!" ? i + 1 : i;
      const close = closingBracket(text, open);
      const target = close >= 0 ? destination(text, close + 1) : null;
      if (target) {
        flush();
        const children = parseInline(text.slice(open + 1, close));
        // An image in the middle of a sentence keeps its description; images that stand alone become image blocks.
        for (const node of ch === "!" ? children : linkNode(target.url, children)) tokens.push({ t: "node", node });
        i = target.end;
        continue;
      }
    }
    if (ch === "<") {
      const tag = /^<(\/?)u>/i.exec(rest);
      if (tag) {
        flush();
        tokens.push({ t: tag[1] ? "close" : "open", mark: "underline" });
        i += tag[0].length;
        continue;
      }
      const br = /^<br\s*\/?>/i.exec(rest);
      if (br) {
        buffer += "\n";
        i += br[0].length;
        continue;
      }
      const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(rest);
      if (auto) {
        flush();
        tokens.push({ t: "node", node: { type: "a", url: auto[1], children: [{ text: auto[1] }] } });
        i += auto[0].length;
        continue;
      }
    }
    if (ch === "&") {
      const entity = /^&#?\w+;/.exec(rest);
      const decoded = entity && decodeEntity(entity[0]);
      if (decoded) {
        buffer += decoded;
        i += entity[0].length;
        continue;
      }
    }
    if (ch === "*" || ch === "_" || ch === "~" || ch === "=") {
      let n = 1;
      while (text[i + n] === ch) n++;
      // Strikethrough and highlight are exactly two characters; anything else is just text.
      if ((ch === "~" || ch === "=") && n !== 2) {
        buffer += ch.repeat(n);
        i += n;
        continue;
      }
      const prev = before();
      const next = text[i + n] ?? " ";
      const prevSpace = /\s/.test(prev);
      const nextSpace = /\s/.test(next);
      const prevPunct = PUNCT.test(prev);
      const nextPunct = PUNCT.test(next);
      const left = !nextSpace && (!nextPunct || prevSpace || prevPunct);
      const right = !prevSpace && (!prevPunct || nextSpace || nextPunct);
      flush();
      tokens.push({
        t: "delim",
        ch,
        n,
        orig: n,
        canOpen: ch === "_" ? left && (!right || prevPunct) : left,
        canClose: ch === "_" ? right && (!left || nextPunct) : right,
        opens: [],
        closes: [],
      });
      i += n;
      continue;
    }
    buffer += ch;
    i++;
  }
  flush();
  return tokens;
}

/** Pairs emphasis runs the way CommonMark does (closest opener first, the "rule of three" included). */
function pairDelimiters(tokens: Token[]) {
  for (let j = 0; j < tokens.length; j++) {
    const closer = tokens[j];
    if (closer.t !== "delim" || !closer.canClose) continue;
    while (closer.n > 0) {
      let found = -1;
      for (let i = j - 1; i >= 0; i--) {
        const opener = tokens[i];
        if (opener.t !== "delim" || opener.ch !== closer.ch || !opener.canOpen || opener.n === 0) continue;
        const either = (opener.canOpen && opener.canClose) || (closer.canOpen && closer.canClose);
        if (either && (opener.orig + closer.orig) % 3 === 0 && (opener.orig % 3 !== 0 || closer.orig % 3 !== 0)) continue;
        found = i;
        break;
      }
      if (found < 0) break;
      const opener = tokens[found] as Extract<Token, { t: "delim" }>;
      const strong = closer.ch === "*" || closer.ch === "_" ? closer.n >= 2 && opener.n >= 2 : true;
      const used = strong ? 2 : 1;
      const mark = closer.ch === "~" ? "strikethrough" : closer.ch === "=" ? "highlight" : strong ? "bold" : "italic";
      opener.n -= used;
      closer.n -= used;
      // The first pair found is the innermost one.
      opener.opens.unshift(mark);
      closer.closes.push(mark);
      // Runs in between can no longer pair with anything outside.
      for (let k = found + 1; k < j; k++) {
        const between = tokens[k];
        if (between.t === "delim") between.canOpen = between.canClose = false;
      }
    }
  }
}

const sameMarks = (a: DocNode, b: DocNode) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.delete("text");
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
};

/** Slate wants text on both sides of every inline element, and no two equal neighbours. */
export function tidyInline(nodes: DocNode[]): DocNode[] {
  const out: DocNode[] = [];
  for (const n of nodes) {
    const last = out.at(-1);
    if (typeof n.text === "string") {
      if (!n.text) continue;
      if (last && typeof last.text === "string" && sameMarks(last, n)) last.text += n.text;
      else out.push({ ...n });
    } else {
      if (!last || typeof last.text !== "string") out.push({ text: "" });
      out.push(n);
    }
  }
  if (!out.length || typeof out.at(-1)!.text !== "string") out.push({ text: "" });
  return out;
}

const withMarks = (n: DocNode, marks: Record<string, true>): DocNode =>
  typeof n.text === "string" ? { ...n, ...marks } : n.type === "a" ? { ...n, children: (n.children ?? []).map((c) => withMarks(c, marks)) } : n;

/** Inline Markdown as Plate leaves and inline elements (links, wiki-link placeholders). */
export function parseInline(text: string): DocNode[] {
  const tokens = tokenize(text);
  pairDelimiters(tokens);
  const active = new Map<string, number>();
  const change = (mark: string, by: number) => active.set(mark, Math.max(0, (active.get(mark) ?? 0) + by));
  const marks = () => Object.fromEntries([...active].filter(([, n]) => n > 0).map(([m]) => [m, true as const]));
  const out: DocNode[] = [];
  for (const token of tokens) {
    if (token.t === "text") out.push({ text: token.s, ...marks() });
    else if (token.t === "code") out.push({ text: token.s, ...marks(), code: true });
    else if (token.t === "node") out.push(withMarks(token.node, marks()));
    else if (token.t === "open") change(token.mark, 1);
    else if (token.t === "close") change(token.mark, -1);
    else {
      for (const mark of token.closes) change(mark, -1);
      // What didn't pair up is the characters themselves.
      if (token.n > 0) out.push({ text: token.ch.repeat(token.n), ...marks() });
      for (const mark of token.opens) change(mark, 1);
    }
  }
  return tidyInline(out);
}

// ---- Reading: blocks ----------------------------------------------------------------

const p = (children: DocNode[]): DocNode => ({ type: "p", children });

const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const QUOTE = /^ {0,3}>[ \t]?(.*)$/;
const ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*)|[ \t]*)$/;
const TABLE_RULE = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

// Obsidian's name for a block (`… the feud. ^feud`), at the end of it or on a line of its own.
const BLOCK_ID = /(?:^|[ \t])\^[A-Za-z0-9-]+$/;

const width = (indent: string) => indent.replace(/\t/g, "    ").length;

const closingFence = (open: string) => new RegExp(`^ {0,3}${open[0]}{${open.length},}[ \\t]*$`);

/**
 * Leaves out `%%comments%%` (Obsidian), on one line or across several. Code
 * keeps them, and a lone `%%` with nothing to close it is text.
 */
function stripComments(lines: string[]): string[] {
  let fence: RegExp | null = null;
  let marks = 0;
  for (const line of lines) {
    if (fence) {
      if (fence.test(line)) fence = null;
    } else if (FENCE.test(line)) fence = closingFence(FENCE.exec(line)![1]);
    else marks += line.split("%%").length - 1;
  }
  if (!marks || marks % 2) return lines;

  const out: string[] = [];
  let hidden = false;
  fence = null;
  for (const line of lines) {
    if (fence) {
      if (fence.test(line)) fence = null;
      out.push(line);
      continue;
    }
    if (!hidden && FENCE.test(line)) {
      fence = closingFence(FENCE.exec(line)![1]);
      out.push(line);
      continue;
    }
    const parts = line.split("%%");
    let kept = "";
    for (const part of parts.slice(0, -1)) {
      if (!hidden) kept += part;
      hidden = !hidden;
    }
    if (!hidden) kept += parts.at(-1);
    // A line that was all comment leaves nothing behind, not a gap between paragraphs.
    if (parts.length === 1 ? !hidden : kept.trim()) out.push(kept);
  }
  return out;
}

export type MarkdownOptions = {
  /**
   * `keep`: a new line in a paragraph is a new line, the way Obsidian shows a
   * note. `wrap` (the default) is Markdown's own rule: lines of a paragraph
   * run together unless they end in two spaces or a backslash.
   */
  lines?: "wrap" | "keep";
  /**
   * Where a picture the note shows (`![[map.png]]`, `![](Attachments/map.png)`)
   * is in the vault being imported, or null when it isn't there
   * (./vault-pictures.ts). Found, it comes in as a picture waiting for its file.
   */
  picture?: (ref: string) => string | null;
};

function tableCells(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  const trimmed = line.trim().replace(/^\|/, "");
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "\\" && trimmed[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (trimmed[i] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else cell += trimmed[i];
  }
  if (cell.trim()) cells.push(cell.trim());
  return cells;
}

/**
 * A Markdown document as a Plate value. `[[links]]` come out as wiki-link
 * elements without a `nodeId`, carrying the `title` they named, for
 * `resolveLinks` to match to notes.
 */
export function markdownToValue(source: string, options: MarkdownOptions = {}): DocNode[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  return parseBlocks(source.includes("%%") ? stripComments(lines) : lines, options.lines === "keep", options.picture);
}

/** A picture of the vault being imported, waiting for its file to be uploaded (./vault-pictures.ts). */
const pendingPicture = (path: string, alt: string): DocNode => ({ type: "img", url: `${PENDING_PICTURE}${path}`, alt, children: [{ text: "" }] });

/** Lines of one paragraph or list item; two spaces before a line end are what the inline reader keeps as a break. */
const joinLines = (lines: string[], keep: boolean) => (keep ? lines.map((line) => line.trimEnd()).join("  \n") : lines.join("\n"));

function parseBlocks(lines: string[], keep: boolean, picture?: MarkdownOptions["picture"]): DocNode[] {
  const out: DocNode[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (!paragraph.length) return;
    const text = joinLines(paragraph, keep).trimEnd().replace(BLOCK_ID, "");
    paragraph = [];
    if (!text.trim()) return;
    const embed = /^!\[\[([^\n[\]]+)\]\]$/.exec(text.trim());
    const vaultPicture = embed && picture?.(embed[1]);
    if (vaultPicture) return void out.push(pendingPicture(vaultPicture, vaultPicture.split("/").at(-1)!.replace(/\.[a-z0-9]+$/i, "")));
    const node = embed && wikiPlaceholder(embed[1], EMBED);
    if (node) return void out.push(node);
    const image = /^!\[([^\]]*)\]\((\S+?)(?:\s+["'(][^)]*)?\)$/.exec(text.trim()) ?? /^!\[([^\]]*)\]\(<([^>]+)>\)$/.exec(text.trim());
    const alt = image?.[1] ? image[1].replace(/\\(.)/g, "$1") : "";
    if (image && /^https?:\/\//i.test(image[2])) {
      return void out.push({ type: "img", url: image[2], ...(alt && { alt }), children: [{ text: "" }] });
    }
    const local = image && picture?.(image[2]);
    if (local) return void out.push(pendingPicture(local, alt));
    out.push(p(parseInline(text.replace(/^[ \t]+/, ""))));
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      const closing = closingFence(fence[1]);
      for (i++; i < lines.length && !closing.test(lines[i]); i++) body.push(lines[i]);
      // The editor has no code blocks: the lines are kept, as one paragraph of code.
      if (body.length) out.push(p([{ text: body.join("\n"), code: true }]));
      continue;
    }

    // A line of = or - under text makes that text a heading.
    if (paragraph.length && /^ {0,3}(=+|-+)[ \t]*$/.test(line)) {
      const text = paragraph.join(" ");
      paragraph = [];
      out.push({ type: line.trim()[0] === "=" ? "h1" : "h2", children: parseInline(text.trim()) });
      continue;
    }

    const heading = ATX.exec(line);
    if (heading) {
      flush();
      out.push({ type: `h${Math.min(3, heading[1].length)}`, children: parseInline(heading[2] ?? "") });
      continue;
    }

    if (RULE.test(line)) {
      flush();
      out.push({ type: "hr", children: [{ text: "" }] });
      continue;
    }

    if (QUOTE.test(line)) {
      flush();
      const inner: string[] = [];
      for (; i < lines.length && QUOTE.test(lines[i]); i++) inner.push(QUOTE.exec(lines[i])![1]);
      i--;
      const callout = /^\[!(\w+)\][-+]?[ \t]*(.*)$/.exec(inner[0] ?? "");
      if (callout) {
        // Line breaks inside a callout are kept as breaks, however they were marked.
        const text = [callout[2], ...inner.slice(1)]
          .map((l) => l.replace(/(\\| {2,})$/, "").trim())
          .filter((l, n) => n > 0 || l)
          .join("\\\n");
        out.push({ type: "callout", children: parseInline(text) });
        continue;
      }
      // The editor's quotes hold text, not blocks: each quoted paragraph is its own quote.
      for (const block of parseBlocks(inner, keep, picture)) out.push(block.type === "p" && !block.listStyleType ? { ...block, type: "blockquote" } : block);
      continue;
    }

    if (line.includes("|") && TABLE_RULE.test(lines[i + 1] ?? "") && (lines[i + 1] ?? "").includes("-") && !paragraph.length) {
      const header = tableCells(line);
      const columns = Math.max(header.length, tableCells(lines[i + 1]).length);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].trim() && lines[i].includes("|"); i++) rows.push(tableCells(lines[i]));
      i--;
      const row = (cells: string[], type: "th" | "td"): DocNode => ({
        type: "tr",
        children: Array.from({ length: columns }, (_, c) => ({ type, children: [p(parseInline(cells[c] ?? ""))] })),
      });
      // An empty header row is how a table without headers is written.
      out.push({ type: "table", children: [...(header.some(Boolean) ? [row(header, "th")] : []), ...rows.map((cells) => row(cells, "td"))] });
      continue;
    }

    const item = ITEM.exec(line);
    // A number that isn't 1 doesn't interrupt a paragraph ("…in the year\n1984. It was…").
    if (item && !(paragraph.length && /^\d/.test(item[2]) && item[2] !== "1." && item[2] !== "1)")) {
      flush();
      i = parseList(lines, i, out, keep) - 1;
      continue;
    }

    paragraph.push(line);
  }
  flush();
  return out;
}

/** Reads a list starting at `start` into flat, indented items; returns the line after it. */
function parseList(lines: string[], start: number, out: DocNode[], keep: boolean): number {
  const indents: number[] = [];
  const counters: Array<{ style: string; n: number }> = [];
  let i = start;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      // A blank line only ends the list when what follows isn't another item.
      let next = i + 1;
      while (next < lines.length && !lines[next].trim()) next++;
      if (next < lines.length && ITEM.test(lines[next])) {
        i = next - 1;
        continue;
      }
      break;
    }
    const item = ITEM.exec(line);
    if (!item || RULE.test(line)) break;
    const indent = width(item[1]);
    while (indents.length && indent < indents.at(-1)!) indents.pop();
    if (!indents.length || indent > indents.at(-1)!) indents.push(indent);
    const level = indents.length;

    const text = [item[3] ?? ""];
    // Wrapped lines of the same item.
    while (i + 1 < lines.length && lines[i + 1].trim() && !ITEM.test(lines[i + 1]) && !ATX.test(lines[i + 1]) && !QUOTE.test(lines[i + 1]) && !FENCE.test(lines[i + 1])) {
      text.push(lines[++i].trim());
    }
    let body = joinLines(text, keep).trimEnd().replace(BLOCK_ID, "");
    const ordered = /^\d/.test(item[2]);
    const task = ordered ? null : /^\[([ xX])\](?:[ \t]+|$)/.exec(body);
    if (task) body = body.slice(task[0].length);
    const style = ordered ? "decimal" : task ? "todo" : "disc";

    counters.length = level;
    const previous = counters[level - 1];
    const number = previous?.style === style ? previous.n + 1 : ordered ? parseInt(item[2], 10) : 1;
    counters[level - 1] = { style, n: number };
    out.push({
      type: "p",
      indent: level,
      listStyleType: style,
      ...(task && { checked: task[1] !== " " }),
      // Plate numbers an ordered item from its `listStart`; the first one starts at 1 by itself.
      ...(ordered && number !== 1 && { listStart: number }),
      children: parseInline(body),
    });
  }
  return i;
}

// ---- Links --------------------------------------------------------------------------

/**
 * Points imported `[[links]]` and `![[embeds]]` at notes. `find` answers a
 * title with a note's id; a link to nothing goes back to the text it was
 * written as, so nothing the writer typed is lost.
 */
export function resolveLinks(value: DocNode[], find: (title: string) => string | undefined): DocNode[] {
  const literal = (n: DocNode) =>
    `${n.type === EMBED ? "!" : ""}[[${String(n.title)}${n.heading ? `#${String(n.heading)}` : ""}${n.alias ? `|${String(n.alias)}` : ""}]]`;
  const visit = (nodes: DocNode[]): DocNode[] => {
    const out = nodes.map((n): DocNode => {
      if (typeof n.text === "string") return n;
      const pending = (n.type === WIKILINK || n.type === EMBED) && !n.nodeId && typeof n.title === "string";
      if (!pending) return n.children ? { ...n, children: visit(n.children) } : n;
      const id = find(String(n.title));
      if (id) {
        const found: DocNode = { ...n, nodeId: id };
        delete found.title;
        return found;
      }
      return n.type === EMBED ? p([{ text: literal(n) }]) : { text: literal(n) };
    });
    // Only a block's text needs tidying; a table's rows or a document's blocks are left as they are.
    return out.some((n) => typeof n.text === "string") ? tidyInline(out) : out;
  };
  return visit(value);
}
