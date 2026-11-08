// What every export format is written from (plan.md 2.7): a Plate document
// reduced to a flat list of blocks whose text is already resolved. Wiki-links
// are their link text, embeds the embedded note's title, citations their
// rendered form. Pure, so Markdown, DOCX and plain text describe a document the
// same way and tests need no database.

import { blockTags, CITATION, EMBED, WIKILINK, type BlockTags, type DocNode } from "../doc-index";
import {
  CHARACTER,
  COMIC_PAGE,
  COMIC_PANEL,
  comicLabel,
  isScriptElement,
  isUppercaseElement,
  MUSIC_CUE,
  PARENTHETICAL,
  SCRIPT_NOTE,
  SFX,
  type ComicCounter,
  type ScriptElementType,
} from "../script";

export type Marks = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  highlight?: boolean;
};

export const markKeys = ["bold", "italic", "underline", "strikethrough", "code", "highlight"] as const;

export type InlineRun = Marks & {
  text: string;
  /** An http(s) or mailto link the text points at. */
  href?: string;
  /** The note a wiki-link names, for formats that can keep `[[Title]]`. */
  wiki?: { title: string; heading?: string; alias?: string };
};

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; runs: InlineRun[] }
  /** `dual`: a character cue marked as dual dialogue (`dualPairs` in lib/script.ts sets it beside the speech before). */
  | { kind: "paragraph"; runs: InlineRun[]; script?: ScriptElementType; dual?: boolean }
  | { kind: "quote"; runs: InlineRun[] }
  | { kind: "callout"; runs: InlineRun[] }
  | { kind: "list"; style: "bullet" | "ordered" | "todo"; level: number; number: number; checked: boolean; runs: InlineRun[] }
  | { kind: "break" }
  | { kind: "table"; rows: Array<Array<{ header: boolean; runs: InlineRun[] }>> }
  | { kind: "image"; url: string; alt: string }
  | { kind: "embed"; title: string };

export type ExportContext = {
  /** The title of a note the reader may see; undefined for anything hidden or gone. */
  titleOf?: (nodeId: string) => string | undefined;
  /** The in-text form of a citation ("(Okafor 2019, 44)"). */
  cite?: (nodeId: string, locator?: string) => string;
  /** Comic pages and panels are numbered across a whole export, not per note. */
  comic?: ComicCounter;
};

const isText = (n: DocNode) => typeof n.text === "string";

// A document read back from Yjs has no empty text leaves, so a paragraph that
// is only a link has no text children at all: inline elements are told apart by type.
const inlineTypes = new Set<string | undefined>([WIKILINK, CITATION, "a"]);

/** Block types that hold other blocks rather than text. */
export const isContainer = (n: DocNode) =>
  Array.isArray(n.children) && n.children.length > 0 && n.children.every((c) => !isText(c) && !inlineTypes.has(c.type));

/** Only links that are safe to follow survive; anything else keeps its text and loses the link. */
export const safeHref = (url: unknown) => (typeof url === "string" && /^(https?:\/\/|mailto:)/i.test(url.trim()) ? url.trim() : undefined);

// ---- Suggestions -------------------------------------------------------------------

type SuggestionData = { type?: string; isLineBreak?: boolean; newProperties?: Record<string, unknown>; properties?: Record<string, unknown> };

const SUGGESTION = "suggestion";
const isSuggestionKey = (key: string) => key.startsWith("suggestion_");

function inlineSuggestions(n: DocNode): SuggestionData[] {
  const out: SuggestionData[] = [];
  for (const key of Object.keys(n)) {
    const data = n[key];
    if (isSuggestionKey(key) && data && typeof data === "object") out.push(data as SuggestionData);
  }
  return out;
}

function withoutSuggestion(n: DocNode, data: SuggestionData[]): DocNode {
  const out: DocNode = {};
  for (const key of Object.keys(n)) if (key !== SUGGESTION && !isSuggestionKey(key)) out[key] = n[key];
  // A suggested formatting change goes back to what the text looked like before it.
  for (const d of data) {
    if (d.type !== "update") continue;
    for (const key of Object.keys(d.newProperties ?? {})) delete out[key];
    Object.assign(out, d.properties ?? {});
  }
  return out;
}

/**
 * The document as it stands if every pending suggestion were rejected: text a
 * reviewer proposed adding is left out, text they proposed deleting is kept.
 * An export is the writer's own text, and a suggestion isn't theirs until they
 * accept it. Mirrors `rejectSuggestion` in @platejs/suggestion, without an editor.
 */
export function rejectSuggestions(nodes: DocNode[]): DocNode[] {
  const out: DocNode[] = [];
  // A block whose suggested paragraph break is rejected: what follows joins it again.
  let joining: DocNode | null = null;
  for (const n of nodes) {
    const inline = inlineSuggestions(n);
    if (inline.some((d) => d.type === "insert")) continue;
    if (isText(n)) {
      out.push(inline.length || SUGGESTION in n ? withoutSuggestion(n, inline) : n);
      continue;
    }
    const block = n[SUGGESTION] && typeof n[SUGGESTION] === "object" ? (n[SUGGESTION] as SuggestionData) : null;
    if (block?.type === "insert" && !block.isLineBreak) continue;
    const children = rejectSuggestions(n.children ?? []);
    const cleaned: DocNode = { ...withoutSuggestion(n, inline), children: children.length ? children : [{ text: "" }] };
    if (joining) joining.children = [...(joining.children ?? []), ...(cleaned.children ?? [])];
    else out.push(cleaned);
    joining = block?.type === "insert" && block.isLineBreak ? (joining ?? cleaned) : null;
  }
  return out;
}

/** Leaves out blocks the reader may not see (spoiler horizon, canon), wherever they're nested. */
export function filterBlocks(value: DocNode[], show: (tags: BlockTags | null) => boolean): DocNode[] {
  return value.flatMap((b) => {
    if (isText(b)) return [b];
    if (!show(blockTags(b))) return [];
    return isContainer(b) ? [{ ...b, children: filterBlocks(b.children ?? [], show) }] : [b];
  });
}

// ---- Inline text --------------------------------------------------------------------

const marksOf = (n: DocNode): Marks => {
  const marks: Marks = {};
  for (const key of markKeys) if (n[key]) marks[key] = true;
  return marks;
};

/** The text of a block's children, with marks, links and what wiki-links, citations and embeds stand for. */
export function inlineRuns(nodes: DocNode[], ctx: ExportContext = {}, href?: string): InlineRun[] {
  const out: InlineRun[] = [];
  for (const n of nodes) {
    if (isText(n)) {
      // A writer's note in a script never prints (lib/publish/html.ts does the same).
      if (n[SCRIPT_NOTE] || !n.text) continue;
      out.push({ text: n.text as string, ...marksOf(n), ...(href && { href }) });
    } else if (n.type === WIKILINK) {
      const id = String(n.nodeId ?? "");
      // An imported link that hasn't been matched to a note yet still knows the title it was written with.
      const title = (id && ctx.titleOf?.(id)) || (typeof n.title === "string" ? n.title : undefined);
      const alias = typeof n.alias === "string" && n.alias ? n.alias : undefined;
      const heading = typeof n.heading === "string" && n.heading ? n.heading : undefined;
      // A link to something the reader may not see leaves only the words the writer put in the sentence.
      const text = alias || title;
      if (text) out.push({ text, ...(title && { wiki: { title, heading, alias } }) });
    } else if (n.type === CITATION) {
      const text = ctx.cite?.(String(n.nodeId ?? ""), typeof n.locator === "string" ? n.locator : undefined);
      if (text) out.push({ text });
    } else if (n.type === "a") {
      out.push(...inlineRuns(n.children ?? [], ctx, safeHref(n.url) ?? href));
    } else {
      out.push(...inlineRuns(n.children ?? [], ctx, href));
    }
  }
  return out;
}

/** How the dual-dialogue pairs of export blocks are found (`dualPairs(blocks, dualInfo)`). */
export const dualInfo = (b: Block) => (b.kind === "paragraph" ? { type: b.script, dual: b.dual } : {});

export const runsText = (runs: InlineRun[]) => runs.map((r) => r.text).join("");

const blank = (runs: InlineRun[]) => !runsText(runs).trim();

/** Several blocks' text as one run of lines (a table cell, a callout). */
function joinedRuns(blocks: DocNode[], ctx: ExportContext): InlineRun[] {
  const out: InlineRun[] = [];
  for (const b of blocks) {
    const runs = isContainer(b) ? joinedRuns(b.children ?? [], ctx) : b.type === EMBED ? embedRuns(b, ctx) : inlineRuns(b.children ?? [], ctx);
    if (blank(runs)) continue;
    if (out.length) out.push({ text: "\n" });
    out.push(...runs);
  }
  return out;
}

function embedRuns(b: DocNode, ctx: ExportContext): InlineRun[] {
  const title = embedTitle(b, ctx);
  return title ? [{ text: title }] : [];
}

const embedTitle = (b: DocNode, ctx: ExportContext) =>
  (typeof b.nodeId === "string" && b.nodeId && ctx.titleOf?.(b.nodeId)) || (typeof b.title === "string" ? b.title : undefined);

const upper = (runs: InlineRun[]) => runs.map((r) => ({ ...r, text: r.text.toUpperCase() }));

/** A script element's text as it's printed: capitals, brackets, and the labels the stylesheet adds on screen. */
function scriptRuns(b: DocNode, type: ScriptElementType, ctx: ExportContext): InlineRun[] {
  let runs = inlineRuns(b.children ?? [], ctx);
  if (isUppercaseElement(type)) runs = upper(runs);
  const label = comicLabel(b, (ctx.comic ??= { page: 0, panel: 0 }));
  if (label) return blank(runs) ? [{ text: label }] : [{ text: `${label}: ` }, ...runs];
  if (blank(runs)) return [];
  if (type === SFX) return [{ text: "SFX: " }, ...runs];
  if (type === MUSIC_CUE) return [{ text: "MUSIC: " }, ...runs];
  if (type === PARENTHETICAL) {
    const text = runsText(runs).trim();
    if (!text.startsWith("(")) runs = [{ text: "(" }, ...runs];
    if (!text.endsWith(")")) runs = [...runs, { text: ")" }];
  }
  return runs;
}

// ---- Blocks -------------------------------------------------------------------------

const headingLevels: Record<string, 1 | 2 | 3> = { h1: 1, h2: 2, h3: 3 };

/**
 * A document as export blocks. Suggestions should already be rejected and
 * hidden passages filtered (`rejectSuggestions`, `filterBlocks`).
 */
export function toBlocks(value: DocNode[], ctx: ExportContext = {}): Block[] {
  const out: Block[] = [];
  // Plate's lists are flat (consecutive blocks with a `listStyleType`), so ordered items are counted here.
  let counters: Array<{ style: string; n: number }> = [];

  const visit = (b: DocNode, quoted: boolean) => {
    if (isText(b)) return;
    if (b.listStyleType) {
      const runs = inlineRuns(b.children ?? [], ctx);
      const level = Math.max(1, typeof b.indent === "number" ? Math.floor(b.indent) : 1);
      const style = b.listStyleType === "decimal" ? "ordered" : b.listStyleType === "todo" ? "todo" : "bullet";
      counters = counters.slice(0, level);
      const previous = counters[level - 1];
      const number = typeof b.listStart === "number" ? b.listStart : previous?.style === style ? previous.n + 1 : 1;
      counters[level - 1] = { style, n: number };
      out.push({ kind: "list", style, level, number, checked: Boolean(b.checked), runs });
      return;
    }
    counters = [];
    const type = b.type ?? "p";
    if (type === "hr") return void out.push({ kind: "break" });
    if (type === "img") {
      const url = typeof b.url === "string" && /^https?:\/\//i.test(b.url.trim()) ? b.url.trim() : null;
      if (url) out.push({ kind: "image", url, alt: String(b.alt ?? "") });
      return;
    }
    if (type === EMBED) {
      const title = embedTitle(b, ctx);
      if (title) out.push({ kind: "embed", title });
      return;
    }
    if (type === "table") {
      const rows = (b.children ?? [])
        .map((row) => (row.children ?? []).map((cell) => ({ header: cell.type === "th", runs: joinedRuns(cell.children ?? [], ctx) })))
        .filter((row) => row.length);
      if (rows.length) out.push({ kind: "table", rows });
      return;
    }
    if (type === "callout") {
      const runs = isContainer(b) ? joinedRuns(b.children ?? [], ctx) : inlineRuns(b.children ?? [], ctx);
      if (!blank(runs)) out.push({ kind: "callout", runs });
      return;
    }
    if (isContainer(b)) {
      for (const child of b.children ?? []) visit(child, quoted || type === "blockquote");
      return;
    }
    if (isScriptElement(type)) {
      const runs = scriptRuns(b, type, ctx);
      // A comic page or panel prints its number even with no text of its own.
      if (runs.length || type === COMIC_PAGE || type === COMIC_PANEL) out.push({ kind: "paragraph", runs, script: type, ...(type === CHARACTER && b.dual === true && { dual: true }) });
      return;
    }
    const runs = inlineRuns(b.children ?? [], ctx);
    if (blank(runs)) return;
    const level = headingLevels[type];
    if (level) out.push({ kind: "heading", level, runs });
    else if (type === "blockquote" || quoted) out.push({ kind: "quote", runs });
    else out.push({ kind: "paragraph", runs });
  };

  for (const b of value) visit(b, false);
  return out;
}
