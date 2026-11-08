// Fountain (fountain.io), the plain-text screenplay format (plan.md 2.7):
// reading a .fountain file into script elements, and writing documents back
// out. Pure, so it runs in the browser (export), on the server (import) and in
// tests alike.

import type { DocNode } from "./doc-index";
import { WIKILINK } from "./doc-index";
import {
  ACT_HEADING,
  ACTION,
  CHARACTER,
  COMIC_CAPTION,
  COMIC_PAGE,
  COMIC_PANEL,
  comicLabel,
  DIALOGUE,
  isUppercaseElement,
  MUSIC_CUE,
  PARENTHETICAL,
  plainText,
  SCENE_HEADING,
  SCRIPT_NOTE,
  SFX,
  SHOT,
  TRANSITION,
  TRANSITION_PATTERN,
  wrapParenthetical,
  type ComicCounter,
} from "./script";

/** The title page's fields in the order they were written: Title, Credit, Author, Draft date, Contact… */
export type TitlePage = Record<string, string>;

export type FountainScript = {
  titlePage: TitlePage;
  /**
   * The body as script elements. Sections (`#`) are h1–h3, page breaks (`===`)
   * are `hr`, centred text is action with `align: "center"`, and a synopsis
   * (`= …`) is action flagged `fountain: "synopsis"`.
   */
  blocks: DocNode[];
};

/** Marks a block that only exists in Fountain's outline, not on the page. */
export const isSynopsis = (block: DocNode) => block.type === ACTION && block.fountain === "synopsis";
/** A sung line (`~` in Fountain): action, or dialogue inside a speech. */
export const isLyric = (block: DocNode) => block.fountain === "lyric";

const TITLE_KEYS = /^(title|credit|authors?|source|notes|draft date|date|contact(?: info)?|copyright|revision|format)\s*:\s*(.*)$/i;
// A scene heading Fountain recognises on its own: INT, EXT, EST, INT./EXT, INT/EXT, I/E, then a dot or a space.
const SCENE_AUTO = /^(?:INT\.?\/EXT|EXT\.?\/INT|INT|EXT|EST|I\/E)[.\s]/i;
const SCENE_NUMBER = /\s*#([^#\s][^#]*)#\s*$/;
const CENTERED = /^\s*>\s*(.*?)\s*<\s*$/;
const PAGE_BREAK = /^\s*={3,}\s*$/;

const hasLetter = (text: string) => /\p{L}/u.test(text);
const isUpper = (text: string) => hasLetter(text) && text === text.toUpperCase();
/** A cue is in capitals; its extensions, "(on the radio)", needn't be. */
const isCueLine = (line: string) => isUpper(line.replace(/\([^)]*\)/g, "").replace(/\^\s*$/, ""));

// ---- Emphasis -------------------------------------------------------------------------

type Marks = { bold?: true; italic?: true; underline?: true; [SCRIPT_NOTE]?: true };
type Leaf = Marks & { text: string };

const delimiters: Array<{ open: string; close: string; marks: Marks; raw?: boolean }> = [
  { open: "[[", close: "]]", marks: { [SCRIPT_NOTE]: true }, raw: true },
  { open: "***", close: "***", marks: { bold: true, italic: true } },
  { open: "**", close: "**", marks: { bold: true } },
  { open: "*", close: "*", marks: { italic: true } },
  { open: "_", close: "_", marks: { underline: true } },
];

/** Where the closing delimiter is, skipping escaped characters; emphasis never crosses a line. */
function findClose(text: string, from: number, close: string, raw: boolean) {
  if (raw) return text.indexOf(close, from);
  const stars = close[0] === "*";
  // Asterisks nest ("**bold *and italic***"): emphasis opened inside has to close before ours can.
  const inner: number[] = [];
  for (let i = from; i < text.length; i++) {
    if (text[i] === "\n") break;
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] !== close[0]) continue;
    let run = 1;
    while (text[i + run] === close[0]) run++;
    // A closer hugs the word before it, an opener the word after it.
    const closes = !/\s/.test(text[i - 1] ?? " ");
    const opens = !/\s/.test(text[i + run] ?? " ");
    if (!stars) {
      if (closes) return i;
      continue;
    }
    let left = run;
    while (closes && inner.length && left >= inner.at(-1)!) left -= inner.pop()!;
    if (closes && !inner.length && left >= close.length) return i + run - left + (left - close.length);
    if (left && opens && !(closes && left < run)) inner.push(left);
    i += run - 1;
  }
  return -1;
}

/** Fountain inline markup (`*italic*`, `**bold**`, `_underline_`, `[[note]]`) as marked text. */
export function parseInline(text: string, marks: Marks = {}): Leaf[] {
  const out: Leaf[] = [];
  let plain = "";
  const flush = () => {
    if (plain) out.push({ text: plain, ...marks });
    plain = "";
  };
  for (let i = 0; i < text.length; ) {
    if (text[i] === "\\" && i + 1 < text.length && /[*_\\[]/.test(text[i + 1])) {
      plain += text[i + 1];
      i += 2;
      continue;
    }
    const delimiter = delimiters.find((d) => text.startsWith(d.open, i));
    const start = delimiter ? i + delimiter.open.length : -1;
    // An opener hugs the word after it, so "2 * 3" stays arithmetic.
    if (delimiter && (delimiter.raw || (start < text.length && !/\s/.test(text[start])))) {
      const end = findClose(text, start + (delimiter.raw ? 0 : 1), delimiter.close, Boolean(delimiter.raw));
      if (end > 0) {
        flush();
        const inner = text.slice(start, end);
        if (delimiter.raw) out.push({ text: inner.trim(), ...marks, ...delimiter.marks });
        else out.push(...parseInline(inner, { ...marks, ...delimiter.marks }));
        i = end + delimiter.close.length;
        continue;
      }
    }
    plain += text[i];
    i++;
  }
  flush();
  return out.length ? out : [{ text: "", ...marks }];
}

/** A block from a line of Fountain. Headings, cues and transitions are stored in capitals, as the editor types them. */
const block = (type: string, text: string, props: Record<string, unknown> = {}): DocNode => ({
  type,
  ...props,
  children: parseInline(isUppercaseElement(type) ? text.toUpperCase() : text) as DocNode[],
});

// ---- Parsing --------------------------------------------------------------------------

/** Reads a Fountain file. Never throws: anything it can't place is action, as in Fountain itself. */
export function parseFountain(source: string): FountainScript {
  const text = source
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    // The boneyard is cut material: left out.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // A note may run over several lines; it's kept as one piece of its paragraph.
    .replace(/\[\[[\s\S]*?\]\]/g, (note) => note.replace(/\s*\n\s*/g, " "));
  const lines = text.split("\n");

  // The title page: "Key: value" lines (values may continue on indented lines) up to the first blank line.
  const titlePage: TitlePage = {};
  let at = 0;
  while (at < lines.length && !lines[at].trim()) at++;
  if (TITLE_KEYS.test(lines[at] ?? "")) {
    let key = "";
    for (; at < lines.length && lines[at].trim(); at++) {
      const match = lines[at].match(TITLE_KEYS);
      if (match && !/^\s/.test(lines[at])) {
        key = match[1].replace(/\s+/g, " ");
        key = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
        titlePage[key] = match[2].trim();
      } else if (key) {
        titlePage[key] = [titlePage[key], lines[at].trim()].filter(Boolean).join("\n");
      }
    }
  } else {
    at = 0;
  }

  const blocks: DocNode[] = [];
  // The paragraph being gathered: consecutive lines of action, or of one speech, or of lyrics.
  let open: { type: typeof ACTION | typeof DIALOGUE; lyric: boolean; lines: string[] } | null = null;
  let inSpeech = false;
  const close = () => {
    if (open) blocks.push(block(open.type, open.lines.join("\n"), open.lyric ? { fountain: "lyric" } : {}));
    open = null;
  };
  const add = (type: typeof ACTION | typeof DIALOGUE, line: string, lyric = false) => {
    if (open?.type !== type || open.lyric !== lyric) {
      close();
      open = { type, lyric, lines: [] };
    }
    open!.lines.push(line);
  };

  for (let i = at; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, "");
    const trimmed = line.trim();
    const blankBefore = i === at || !lines[i - 1].trim();
    const blankAfter = i + 1 >= lines.length || !lines[i + 1].trim();

    if (!trimmed) {
      // A line of nothing but spaces is a deliberate gap inside a paragraph.
      if (lines[i].length >= 2 && open && !blankAfter) {
        (open as { lines: string[] }).lines.push("");
        continue;
      }
      close();
      inSpeech = false;
      continue;
    }

    if (PAGE_BREAK.test(line)) {
      close();
      inSpeech = false;
      blocks.push({ type: "hr", children: [{ text: "" }] });
      continue;
    }
    const section = trimmed.match(/^(#+)\s*(.*)$/);
    if (section) {
      close();
      inSpeech = false;
      if (section[2]) blocks.push(block(`h${Math.min(3, section[1].length)}`, section[2]));
      continue;
    }
    if (trimmed.startsWith("=")) {
      close();
      inSpeech = false;
      blocks.push(block(ACTION, trimmed.slice(1).trim(), { fountain: "synopsis" }));
      continue;
    }
    if (trimmed.startsWith("~")) {
      add(inSpeech ? DIALOGUE : ACTION, trimmed.slice(1).trim(), true);
      continue;
    }
    if (trimmed.startsWith("!")) {
      inSpeech = false;
      add(ACTION, line.replace("!", ""));
      continue;
    }
    // A forced heading is ".HEADING"; an ellipsis ("...and then") is not.
    const forcedHeading = /^\.[^.\s]/.test(trimmed);
    if (forcedHeading || (blankBefore && blankAfter && SCENE_AUTO.test(trimmed))) {
      close();
      inSpeech = false;
      let heading = forcedHeading ? trimmed.slice(1) : trimmed;
      const number = heading.match(SCENE_NUMBER);
      if (number) heading = heading.replace(SCENE_NUMBER, "");
      blocks.push(block(SCENE_HEADING, heading.trim(), number ? { number: number[1].trim() } : {}));
      continue;
    }
    const centered = trimmed.match(CENTERED);
    if (centered) {
      close();
      inSpeech = false;
      blocks.push(block(ACTION, centered[1], { align: "center" }));
      continue;
    }
    if (trimmed.startsWith(">")) {
      close();
      inSpeech = false;
      blocks.push(block(TRANSITION, trimmed.slice(1).trim()));
      continue;
    }
    if (blankBefore && blankAfter && TRANSITION_PATTERN.test(trimmed)) {
      close();
      inSpeech = false;
      blocks.push(block(TRANSITION, trimmed));
      continue;
    }
    // A cue: capitals with a line of speech straight after it, or forced with "@".
    if (blankBefore && !blankAfter && (trimmed.startsWith("@") || isCueLine(trimmed))) {
      close();
      inSpeech = true;
      // Dual dialogue ("^"): the cue is marked, and its speech is set beside the one before (`dualPairs`).
      const dual = /\^\s*$/.test(trimmed);
      const cue = trimmed.replace(/^@/, "").replace(/\s*\^\s*$/, "");
      blocks.push(block(CHARACTER, cue.trim(), dual ? { dual: true } : {}));
      continue;
    }
    if (inSpeech) {
      if (/^\(.*\)$/.test(trimmed)) {
        close();
        blocks.push(block(PARENTHETICAL, trimmed));
      } else {
        add(DIALOGUE, trimmed);
      }
      continue;
    }
    add(ACTION, line);
  }
  close();
  return { titlePage, blocks };
}

// ---- Writing --------------------------------------------------------------------------

export type SerializeOptions = {
  /** The title a wiki-link shows (links store only the note's id). */
  resolveLink?: (nodeId: string) => string | undefined;
};

const escapeInline = (text: string) => text.replace(/([*_\\])/g, "\\$1").replace(/\[\[/g, "\\[[");

function leafToFountain(leaf: DocNode): string {
  const text = String(leaf.text ?? "");
  if (!text) return "";
  if (leaf[SCRIPT_NOTE]) return `[[${text}]]`;
  // Markers hug the words: spaces at either end stay outside them, line by line.
  return text
    .split("\n")
    .map((line) => {
      const [, lead, body, tail] = line.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
      if (!body) return line;
      let out = escapeInline(body);
      if (leaf.bold && leaf.italic) out = `***${out}***`;
      else if (leaf.bold) out = `**${out}**`;
      else if (leaf.italic) out = `*${out}*`;
      if (leaf.underline) out = `_${out}_`;
      return lead + out + tail;
    })
    .join("\n");
}

function inlineToFountain(node: DocNode, options: SerializeOptions): string {
  if (typeof node.text === "string") return leafToFountain(node);
  if (node.type === WIKILINK) {
    return escapeInline(String(node.alias || options.resolveLink?.(String(node.nodeId)) || ""));
  }
  return (node.children ?? []).map((child) => inlineToFountain(child, options)).join("");
}

const oneLine = (text: string) => text.replace(/\s*\n\s*/g, " ").trim();
/** Lines of a paragraph, with gaps kept as the two spaces Fountain reads as "not a break". */
const paragraphLines = (text: string) => text.replace(/\s+$/, "").split("\n").map((line) => (line.trim() ? line.replace(/\s+$/, "") : "  "));

/** Lyrics, every line marked with "~". */
const lyricLines = (text: string) => paragraphLines(text).map((line) => `~${line.trim()}`).join("\n");

/** True when Fountain would read this line of action as something else, so it needs forcing with "!". */
function needsForce(line: string, first: boolean, last: boolean) {
  const trimmed = line.trim();
  if (/^[#=>!@~]/.test(trimmed) || /^\.[^.\s]/.test(trimmed) || PAGE_BREAK.test(trimmed)) return true;
  if (!first) return false;
  if (SCENE_AUTO.test(trimmed) || TRANSITION_PATTERN.test(trimmed)) return true;
  // Capitals with more text under them would be a character speaking.
  return !last && isCueLine(trimmed);
}

const actionToFountain = (text: string) => {
  const lines = paragraphLines(text);
  return lines.map((line, i) => (needsForce(line, i === 0, i === lines.length - 1) ? `!${line}` : line)).join("\n");
};

// Slate keeps a text leaf in every block that holds inline content.
const isContainer = (node: DocNode) =>
  Array.isArray(node.children) && node.children.length > 0 && node.children.every((c) => typeof c.text !== "string");

/**
 * Writes script elements as Fountain. Elements Fountain doesn't have are
 * written as the nearest thing: a shot is action in capitals, comic pages and
 * panels are sections, captions and sound cues are labelled action, and prose
 * blocks are action.
 */
export function serializeFountain(blocks: DocNode[], options: SerializeOptions = {}): string {
  // Paragraphs, separated by blank lines; `tight` ones follow the line above directly (a speech).
  const out: Array<{ text: string; tight?: boolean }> = [];
  const comic: ComicCounter = { page: 0, panel: 0 };
  let inSpeech = false;

  const visit = (node: DocNode) => {
    if (node.type === "hr") {
      inSpeech = false;
      out.push({ text: "===" });
      return;
    }
    if (isContainer(node)) {
      for (const child of node.children ?? []) visit(child);
      return;
    }
    const label = comicLabel(node, comic);
    const raw = inlineToFountain(node, options);
    const upper = raw.toUpperCase();
    if (!raw.trim() && !label) return;
    const speech = inSpeech;
    inSpeech = false;

    switch (node.type) {
      case SCENE_HEADING: {
        const heading = oneLine(upper);
        const number = typeof node.number === "string" && node.number ? ` #${node.number}#` : "";
        out.push({ text: `${SCENE_AUTO.test(heading) ? "" : "."}${heading}${number}` });
        return;
      }
      case CHARACTER: {
        const cue = oneLine(upper).replace(/\s*\^$/, "");
        out.push({ text: `${isCueLine(cue) ? cue : `@${cue}`}${node.dual ? " ^" : ""}` });
        inSpeech = true;
        return;
      }
      case PARENTHETICAL:
      case DIALOGUE: {
        // Speech with nobody speaking it can only be action in Fountain.
        if (!speech) {
          out.push({ text: actionToFountain(raw) });
          return;
        }
        const text = node.type === PARENTHETICAL ? wrapParenthetical(oneLine(raw)) : isLyric(node) ? lyricLines(raw) : paragraphLines(raw).join("\n");
        out.push({ text, tight: true });
        inSpeech = true;
        return;
      }
      case TRANSITION: {
        const transition = oneLine(upper);
        out.push({ text: TRANSITION_PATTERN.test(transition) ? transition : `> ${transition}` });
        return;
      }
      case SHOT:
        out.push({ text: actionToFountain(oneLine(upper)) });
        return;
      case ACT_HEADING:
      case "h1":
        out.push({ text: `# ${oneLine(node.type === ACT_HEADING ? upper : raw)}` });
        return;
      case "h2":
        out.push({ text: `## ${oneLine(raw)}` });
        return;
      case "h3":
        out.push({ text: `### ${oneLine(raw)}` });
        return;
      case COMIC_PAGE:
        out.push({ text: `# ${label}${raw.trim() ? `: ${oneLine(raw)}` : ""}` });
        return;
      case COMIC_PANEL:
        out.push({ text: `## ${label}` });
        if (raw.trim()) out.push({ text: actionToFountain(raw) });
        return;
      case COMIC_CAPTION:
        out.push({ text: actionToFountain(`CAPTION: ${raw}`) });
        return;
      case SFX:
        out.push({ text: actionToFountain(`SFX: ${oneLine(upper)}`) });
        return;
      case MUSIC_CUE:
        out.push({ text: actionToFountain(`MUSIC: ${oneLine(upper)}`) });
        return;
      default:
        if (isSynopsis(node)) out.push({ text: `= ${oneLine(raw)}` });
        else if (isLyric(node)) out.push({ text: lyricLines(raw) });
        else if (node.align === "center") out.push({ text: `> ${oneLine(raw)} <` });
        else out.push({ text: actionToFountain(raw) });
    }
  };
  for (const node of blocks) visit(node);

  return out.map((p, i) => (i === 0 ? "" : p.tight ? "\n" : "\n\n") + p.text).join("");
}

export function serializeTitlePage(titlePage: TitlePage): string {
  return Object.entries(titlePage)
    .filter(([, value]) => value.trim())
    .map(([key, value]) => (value.includes("\n") ? `${key}:\n${value.split("\n").map((line) => `    ${line.trim()}`).join("\n")}` : `${key}: ${value.trim()}`))
    .join("\n");
}

/** A title-page field as plain text (title pages often underline and embolden), keeping its lines. */
export function plainField(titlePage: TitlePage, key: string): string {
  return plainText({ children: parseInline(titlePage[key] ?? "") as DocNode[] }).trim();
}

/** The script's title on one line. */
export const plainTitle = (titlePage: TitlePage) => oneLine(plainField(titlePage, "Title"));

// ---- Whole scripts: the binder as a Fountain file, and back ----------------------------------

export type FountainSection = {
  title: string;
  kind: string;
  /** 1 for the top level of what's exported; 0 is the exported folder itself, which the title page names. */
  depth: number;
  synopsis?: string | null;
  value: DocNode[];
};

/**
 * A folder, chapter or scene and everything under it as one Fountain file:
 * chapters and folders become sections (`#`), scenes their own content. A
 * scene with no scene heading of its own is headed by its title.
 */
export function sectionsToFountain(sections: FountainSection[], titlePage: TitlePage, options: SerializeOptions = {}): string {
  const parts: string[] = [];
  const front = serializeTitlePage(titlePage);
  if (front) parts.push(front);
  sections.forEach((section) => {
    const structural = section.kind === "folder" || section.kind === "chapter";
    const body = serializeFountain(section.value, options);
    const synopsis = section.synopsis?.trim() ? `= ${oneLine(section.synopsis)}` : "";
    // The root names the script (it's on the title page); what's under it is the script.
    if (section.depth === 0 && structural) {
      if (body) parts.push(body);
      return;
    }
    if (structural) {
      parts.push([`${"#".repeat(Math.max(1, Math.min(6, section.depth)))} ${oneLine(section.title)}`, synopsis].filter(Boolean).join("\n\n"));
      if (body) parts.push(body);
      return;
    }
    const heading = section.value.findIndex((b) => b.type === SCENE_HEADING);
    if (heading < 0 && section.kind === "scene" && (body || synopsis)) {
      const title = oneLine(section.title).toUpperCase();
      parts.push(`${SCENE_AUTO.test(title) ? "" : "."}${title}`);
      if (synopsis) parts.push(synopsis);
      if (body) parts.push(body);
      return;
    }
    if (!body) return;
    if (!synopsis || heading < 0) {
      parts.push(body);
      return;
    }
    // The synopsis goes under the scene's heading, where Fountain keeps it.
    parts.push(serializeFountain(section.value.slice(0, heading + 1), options), synopsis);
    const rest = serializeFountain(section.value.slice(heading + 1), options);
    if (rest) parts.push(rest);
  });
  return `${parts.join("\n\n")}\n`;
}

export type OutlineNode = {
  kind: "folder" | "chapter" | "scene";
  title: string;
  synopsis: string | null;
  /** Index of the parent in the outline; null for the folder at the top. */
  parent: number | null;
  /** A scene's document. */
  value?: DocNode[];
};

/**
 * A parsed script as binder nodes: one folder named after the script, a
 * chapter per section (`#`, nested by depth) and a scene per scene heading.
 * Anything written before the first heading ("FADE IN:") opens the first
 * scene; synopses (`= …`) become the synopsis of their scene or section.
 */
export function fountainToOutline(script: FountainScript, fallbackTitle: string): OutlineNode[] {
  const title = plainTitle(script.titlePage) || fallbackTitle;
  const nodes: OutlineNode[] = [{ kind: "folder", title, synopsis: null, parent: null }];
  const sections: Array<{ level: number; index: number }> = [{ level: 0, index: 0 }];
  let scene: OutlineNode | null = null;
  // What a synopsis describes: the scene or section it follows.
  let last: OutlineNode = nodes[0];
  let pending: DocNode[] = [];
  const describe = (target: OutlineNode, text: string) => {
    target.synopsis = [target.synopsis, text].filter(Boolean).join(" ");
  };

  for (const b of script.blocks) {
    const level = b.type === "h1" ? 1 : b.type === "h2" ? 2 : b.type === "h3" ? 3 : 0;
    if (level) {
      while (sections.length > 1 && sections.at(-1)!.level >= level) sections.pop();
      const chapter: OutlineNode = { kind: "chapter", title: plainText(b).trim() || "Untitled", synopsis: null, parent: sections.at(-1)!.index };
      sections.push({ level, index: nodes.push(chapter) - 1 });
      scene = null;
      last = chapter;
    } else if (b.type === SCENE_HEADING) {
      scene = { kind: "scene", title: plainText(b).trim().toUpperCase() || "Untitled scene", synopsis: null, parent: sections.at(-1)!.index, value: [...pending, b] };
      pending = [];
      nodes.push(scene);
      last = scene;
    } else if (isSynopsis(b)) {
      describe(last, plainText(b).trim());
    } else if (scene) {
      scene.value!.push(b);
    } else {
      pending.push(b);
    }
  }
  // A script with no scene headings at all (or only a tail after the last section) is still a scene.
  if (pending.length) nodes.push({ kind: "scene", title: nodes.length === 1 ? title : "Untitled scene", synopsis: null, parent: sections.at(-1)!.index, value: pending });
  return nodes;
}
