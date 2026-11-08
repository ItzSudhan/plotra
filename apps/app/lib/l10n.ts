// Localization (plan.md 2.8 "Localization & translation"): the units of text
// a project translates, the glossary checks, and the file formats translators
// work in (CSV, XLIFF 1.2 out, 1.2 or 2.0 back in) plus subtitles (SRT, WebVTT).
// Pure: the same code builds an
// export on the client and reads an import on the server.

import type { GlossaryRule, TranslationStatus } from "@plotra/db/schema";
import { WIKILINK, type DocNode } from "./doc-index";

/** One piece of source text: a block of a document, or a string. */
export type Unit = {
  /** `<nodeId>:<blockId>` for a document block, `str:<key>` for a string. */
  key: string;
  source: string;
  /** Where it's from, for the translator: the note's title, or a string's context. */
  context?: string;
  nodeId?: string;
  /** The block's element type (a dialogue line, a scene heading…). */
  type?: string;
  /** Who says it, for dialogue. */
  speaker?: string;
  charLimit?: number | null;
};

export type TranslationRow = { unitKey: string; text: string; status: TranslationStatus; sourceHash: string | null };

export type Term = { id: string; term: string; locale: string | null; translation: string | null; rule: GlossaryRule; note: string | null };

/** FNV-1a: enough to notice that a source text changed since it was translated. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** A block's text as the reader sees it: a note link shows its alias, or else the linked note's title. */
const inlineText = (n: DocNode, titleOf?: (nodeId: string) => string | undefined): string => {
  if (typeof n.text === "string") return n.text;
  if (n.type === WIKILINK) return typeof n.alias === "string" && n.alias ? n.alias : typeof n.nodeId === "string" ? (titleOf?.(n.nodeId) ?? "") : "";
  return (n.children ?? []).map((c) => inlineText(c, titleOf)).join("");
};
const holdsBlocks = (n: DocNode) => Array.isArray(n.children) && n.children.length > 0 && n.children.every((c) => typeof c.text !== "string");

/** The translatable blocks of a document, in order: every block with text and an id. `titleOf` names the notes it links to. */
export function documentUnits(nodeId: string, title: string, value: DocNode[], titleOf?: (nodeId: string) => string | undefined): Unit[] {
  const units: Unit[] = [];
  let speaker: string | undefined;
  const visit = (block: DocNode) => {
    if (holdsBlocks(block)) {
      for (const child of block.children ?? []) visit(child);
      return;
    }
    const source = inlineText(block, titleOf).trim();
    if (block.type === "character") speaker = source.replace(/\s*\(.*\)\s*$/, "") || undefined;
    else if (block.type !== "dialogue" && block.type !== "parenthetical") speaker = undefined;
    if (!source || typeof block.id !== "string") return;
    units.push({
      key: `${nodeId}:${block.id}`,
      source,
      context: title,
      nodeId,
      ...(block.type && block.type !== "p" && { type: block.type }),
      ...(block.type === "dialogue" && speaker && { speaker }),
    });
  };
  for (const block of value) visit(block);
  return units;
}

// ---- Glossary ---------------------------------------------------------------------

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = new Map<string, RegExp>();
/** The term as a whole word, any case. Cached: every row of the view checks every term. */
const wordPattern = (term: string) => {
  let pattern = patterns.get(term);
  if (!pattern) {
    if (patterns.size > 2000) patterns.clear();
    pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, "iu");
    patterns.set(term, pattern);
  }
  return pattern;
};

/** The glossary entries that apply to a language: its own, and the ones for every language. */
export const termsFor = (terms: Term[], locale: string) => terms.filter((t) => t.term.trim() && (!t.locale || t.locale.toLowerCase() === locale.toLowerCase()));

export type GlossaryHit = { term: string; expected: string; rule: GlossaryRule; note: string | null; missing: boolean };

/**
 * Glossary terms that appear in a source text, with what the translation
 * should contain: the term itself for "do not translate", the official
 * translation otherwise. `missing` is set once there's a translation that
 * doesn't contain it. A term entered for the language wins over the same
 * term entered for every language.
 */
export function glossaryHits(source: string, target: string, terms: Term[], locale: string): GlossaryHit[] {
  const hits = new Map<string, GlossaryHit>();
  const specific = new Set<string>();
  for (const t of termsFor(terms, locale)) {
    const term = t.term.trim();
    if (!wordPattern(term).test(source)) continue;
    const expected = t.rule === "keep" ? term : (t.translation ?? "").trim();
    if (!expected) continue;
    const id = term.toLowerCase();
    if (specific.has(id) && !t.locale) continue;
    if (t.locale) specific.add(id);
    hits.set(id, { term, expected, rule: t.rule, note: t.note, missing: target.trim() !== "" && !target.toLowerCase().includes(expected.toLowerCase()) });
  }
  return [...hits.values()];
}

// ---- Text direction ---------------------------------------------------------------------

const rtlLanguages = new Set(["ar", "arc", "ckb", "dv", "fa", "he", "iw", "ks", "ku", "lrc", "mzn", "nqo", "pnb", "ps", "sd", "syr", "ug", "ur", "yi"]);
const rtlScripts = new Set(["arab", "hebr", "thaa", "syrc", "nkoo", "adlm", "rohg", "mand", "samr"]);

/** Which way a language is written, from its code: a script subtag wins over the language ("ku-Latn" is left to right). */
export function textDirection(locale: string): "ltr" | "rtl" {
  const [language = "", ...rest] = locale.toLowerCase().split(/[-_]/);
  const script = rest.find((part) => part.length === 4 && /^[a-z]+$/.test(part));
  if (script) return rtlScripts.has(script) ? "rtl" : "ltr";
  return rtlLanguages.has(language) ? "rtl" : "ltr";
}

// ---- CSV -----------------------------------------------------------------------------

export type ExchangeRow = { key: string; source: string; target: string; status: string; context: string };

// A cell that starts like a formula is run as one by spreadsheet apps ("-Hello"
// becomes #NAME?, "=HYPERLINK(…)" a link), so it's written with a leading
// apostrophe, which parseCsv takes off again.
const FORMULA = /^[=+\-@\t\r]/;
const csvCell = (raw: string) => {
  const value = FORMULA.test(raw) ? `'${raw}` : raw;
  return /[",;\t\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
};
const uncell = (value: string) => (value.startsWith("'") && FORMULA.test(value.slice(1)) ? value.slice(1) : value);

export function toCsv(rows: ExchangeRow[]): string {
  const lines = [["key", "source", "target", "status", "context"], ...rows.map((r) => [r.key, r.source, r.target, r.status, r.context])];
  // A BOM, so spreadsheet apps read the file as UTF-8.
  return `\uFEFF${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/**
 * Parses CSV text into rows of cells (quoted cells may hold separators, quotes
 * and line breaks). The separator is whichever of comma, semicolon or tab the
 * header line uses: spreadsheet apps differ by locale.
 */
export function parseCsvCells(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  const header = input.slice(0, input.search(/[\r\n]|$/));
  const delimiter = [",", ";", "\t"].reduce((best, d) => (header.split(d).length > header.split(best).length ? d : best), ",");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export type ImportedRow = { key: string; target: string; status?: string };

/** Reads translations from a CSV with at least `key` and `target` columns (as exported). */
export function parseCsv(text: string): ImportedRow[] {
  const [header, ...rows] = parseCsvCells(text);
  if (!header) return [];
  const column = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name);
  const key = column("key");
  const target = column("target");
  const status = column("status");
  if (key < 0 || target < 0) throw new Error("The file needs “key” and “target” columns, like the exported CSV.");
  return rows
    .map((r) => ({ key: (r[key] ?? "").trim(), target: uncell(r[target] ?? ""), ...(status >= 0 && r[status]?.trim() ? { status: r[status].trim().toLowerCase() } : {}) }))
    .filter((r) => r.key);
}

// ---- XLIFF -------------------------------------------------------------------------------

// Characters XML 1.0 doesn't allow at all; a stray one would make the whole file unreadable.
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
const xml = (text: string) => text.replace(INVALID_XML, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const entities = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
/** The text of an element's content: CDATA kept as written, comments and inline tags dropped. */
const unxml = (content: string) =>
  content
    .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)
    .map((part) => (part.startsWith("<![CDATA[") ? part.slice(9, -3) : entities(part.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, ""))))
    .join("");
/** One attribute of a start tag, single- or double-quoted. */
const attribute = (tag: string, name: string) => {
  const value = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return value ? entities(value[1] ?? value[2]) : undefined;
};

/** Our statuses as XLIFF target states, and back. */
const xliffState: Record<string, string> = { draft: "needs-translation", translated: "translated", reviewed: "needs-review-translation", approved: "final" };
const fromXliffState: Record<string, TranslationStatus> = {
  new: "draft",
  "needs-translation": "draft",
  "needs-adaptation": "draft",
  "needs-l10n": "draft",
  translated: "translated",
  "needs-review-translation": "reviewed",
  "needs-review-adaptation": "reviewed",
  "needs-review-l10n": "reviewed",
  "signed-off": "approved",
  final: "approved",
};
/** XLIFF 2.0 keeps the state on the segment, with four values. */
const fromXliff2State: Record<string, TranslationStatus> = { initial: "draft", translated: "translated", reviewed: "reviewed", final: "approved" };
const statusOrder: TranslationStatus[] = ["draft", "translated", "reviewed", "approved"];

export function toXliff(input: { original: string; sourceLocale: string; targetLocale: string; rows: ExchangeRow[] }): string {
  const units = input.rows
    .map(
      (r) => `      <trans-unit id="${xml(r.key)}" xml:space="preserve">
        <source>${xml(r.source)}</source>
        <target state="${xliffState[r.status] ?? "needs-translation"}">${xml(r.target)}</target>${r.context ? `\n        <note>${xml(r.context)}</note>` : ""}
      </trans-unit>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="${xml(input.original)}" datatype="plaintext" source-language="${xml(input.sourceLocale)}" target-language="${xml(input.targetLocale)}">
    <body>
${units}
    </body>
  </file>
</xliff>
`;
}

/**
 * Reads the translated units of an XLIFF file: 1.2 (`trans-unit`), as
 * exported, or 2.0 (`unit`, whose segments are joined). Inline tags inside a
 * target are dropped.
 */
export function parseXliff(text: string): ImportedRow[] {
  const rows: ImportedRow[] = [];
  for (const unit of text.matchAll(/<trans-unit\b([^>]*)>([\s\S]*?)<\/trans-unit>/g)) {
    const id = attribute(unit[1], "id");
    // Suggestions from a tool's memory carry targets of their own.
    const target = /<target\b([^>]*)>([\s\S]*?)<\/target>/.exec(unit[2].replace(/<alt-trans\b[\s\S]*?<\/alt-trans>/g, ""));
    if (!id || !target) continue;
    const state = attribute(target[1], "state");
    rows.push({ key: id, target: unxml(target[2]), ...(state && fromXliffState[state] ? { status: fromXliffState[state] } : {}) });
  }
  if (rows.length || !/<xliff\b[^>]*\bversion\s*=\s*["']2\./.test(text)) return rows;
  for (const unit of text.matchAll(/<unit\b([^>]*)>([\s\S]*?)<\/unit>/g)) {
    const id = attribute(unit[1], "id");
    if (!id) continue;
    let target = "";
    let found = false;
    const states: string[] = [];
    for (const part of unit[2].matchAll(/<(segment|ignorable)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
      const body = /<target\b[^>]*>([\s\S]*?)<\/target>/.exec(part[3]);
      // An ignorable without a target is the same whitespace in both languages.
      const piece = body ? unxml(body[1]) : part[1] === "ignorable" ? unxml(/<source\b[^>]*>([\s\S]*?)<\/source>/.exec(part[3])?.[1] ?? "") : "";
      if (body && part[1] === "segment") found = true;
      target += piece;
      if (part[1] === "segment") states.push(attribute(part[2], "state") ?? "initial");
    }
    if (!found) continue;
    // The unit is as far along as its least finished segment.
    const status = statusOrder[Math.min(...states.map((s) => statusOrder.indexOf(fromXliff2State[s] ?? "translated")))];
    rows.push({ key: id, target, status });
  }
  return rows;
}

// ---- Subtitles (SRT, WebVTT) ------------------------------------------------------------------

/** `hh:mm:ss,mmm` for SRT, `hh:mm:ss.mmm` for WebVTT. */
export const subtitleTime = (seconds: number, separator: "," | "." = ",") => {
  const ms = Math.round(seconds * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}${separator}${pad(ms % 1000, 3)}`;
};

/** Breaks a line into subtitle lines of at most `width` characters. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

export type SubtitleLine = { text: string; speaker?: string };
type SubtitleOptions = { speakers?: boolean; wordsPerSecond?: number };
type Cue = { start: number; end: number; lines: string[] };

/**
 * Cues for a script's dialogue. There's no audio to time against, so the
 * timings are estimates from reading speed (about 2.5 words a second, between
 * 1.2 and 7 seconds a cue): a starting point to adjust against the cut.
 */
function cues(lines: SubtitleLine[], options: SubtitleOptions): Cue[] {
  const rate = options.wordsPerSecond ?? 2.5;
  const out: Cue[] = [];
  // Whole milliseconds, so rounding never makes a cue overlap the next one.
  let at = 1000;
  for (const line of lines) {
    const text = line.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    // Two lines of 42 characters is the usual limit; longer speeches become several cues.
    const wrapped = wrap(text, 42);
    for (let i = 0; i < wrapped.length; i += 2) {
      const part = wrapped.slice(i, i + 2);
      const words = part.join(" ").split(" ").length;
      const duration = Math.round(Math.min(7, Math.max(1.2, words / rate + 0.4)) * 1000);
      if (options.speakers && line.speaker && i === 0) part[0] = `${line.speaker.toUpperCase()}: ${part[0]}`;
      out.push({ start: at / 1000, end: (at + duration) / 1000, lines: part });
      at += duration + 200;
    }
  }
  return out;
}

/** SubRip subtitles for a script's dialogue. */
export function toSrt(lines: SubtitleLine[], options: SubtitleOptions = {}): string {
  return `${cues(lines, options)
    .map((cue, i) => `${i + 1}\n${subtitleTime(cue.start)} --> ${subtitleTime(cue.end)}\n${cue.lines.join("\n")}`)
    .join("\n\n")}\n`;
}

// Cue text is markup in WebVTT: "<" and "&" start tags and entities, and "-->" would end the cue.
const vttText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** WebVTT subtitles for a script's dialogue, timed like the SRT. */
export function toVtt(lines: SubtitleLine[], options: SubtitleOptions = {}): string {
  const body = cues(lines, options).map((cue) => `${subtitleTime(cue.start, ".")} --> ${subtitleTime(cue.end, ".")}\n${cue.lines.map(vttText).join("\n")}`);
  return `WEBVTT\n\n${body.join("\n\n")}\n`;
}
