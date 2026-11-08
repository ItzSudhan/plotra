// Plain text in and out (plan.md 2.7). Pure.

import type { DocNode } from "../doc-index";
import { CHARACTER, DIALOGUE, PARENTHETICAL, TRANSITION } from "../script";
import { runsText, toBlocks, type Block, type ExportContext } from "./model";

// ---- Writing ------------------------------------------------------------------------

/** How a scene break is written in plain text. */
export const TEXT_BREAK = "* * *";

// A typewritten script's columns, in characters from the left edge.
const scriptIndent: Record<string, number> = { [CHARACTER]: 22, [PARENTHETICAL]: 16, [DIALOGUE]: 10, [TRANSITION]: 45 };

export function blocksToText(blocks: Block[]): string {
  const parts: string[] = [];
  let previous: Block | undefined;
  for (const b of blocks) {
    let text: string;
    // Lines of a list, and of one speech in a script, stay together.
    let tight = false;
    switch (b.kind) {
      case "list": {
        const marker = b.style === "ordered" ? `${b.number}.` : b.style === "todo" ? `[${b.checked ? "x" : " "}]` : "-";
        text = `${"  ".repeat(b.level - 1)}${marker} ${runsText(b.runs)}`;
        tight = previous?.kind === "list";
        break;
      }
      case "break":
        text = TEXT_BREAK;
        break;
      case "table":
        text = b.rows.map((row) => row.map((cell) => runsText(cell.runs).replace(/\s*\n\s*/g, " ")).join("\t")).join("\n");
        break;
      case "image":
        text = b.alt ? `[${b.alt}]` : "";
        break;
      case "embed":
        text = b.title;
        break;
      case "paragraph": {
        const indent = " ".repeat((b.script && scriptIndent[b.script]) || 0);
        text = runsText(b.runs)
          .split("\n")
          .map((line) => indent + line)
          .join("\n");
        tight = (b.script === DIALOGUE || b.script === PARENTHETICAL) && previous?.kind === "paragraph" && Boolean(previous.script);
        break;
      }
      default:
        text = runsText(b.runs);
    }
    if (!text) continue;
    if (tight && parts.length) parts[parts.length - 1] += `\n${text}`;
    else parts.push(text);
    previous = b;
  }
  return parts.join("\n\n");
}

export const valueToText = (value: DocNode[], ctx: ExportContext = {}) => blocksToText(toBlocks(value, ctx));

// ---- Reading ------------------------------------------------------------------------

const numberWords =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred";
const ordinalWords = "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|last|final";
const NUMBER = `(\\d{1,4}|[ivxlcdm]{1,8}|(?:${numberWords})(?:[- ](?:${numberWords}))?|${ordinalWords})`;
// "Chapter 1", "Chapter One.", "CHAPTER 1: The Storm", "Chapter 1 The Storm".
const CHAPTER = new RegExp(`^(?:chapter|part|book|act)\\s+${NUMBER}(?:\\s*[.:]|\\s*[:.\\-–—]\\s*\\S.*|\\s+(\\S.*))?$`, "i");
const NAMED = /^(?:prologue|epilogue|interlude|foreword|preface|afterword|introduction|acknowledge?ments)\b(?:\s*[.:]|\s*[:.\-–—]\s*\S.*)?$/i;

/** True for a line like "Chapter 1", "CHAPTER ONE: The Storm" or "Prologue". */
export function isChapterLine(line: string): boolean {
  const text = line.trim();
  if (!text || text.length > 80) return false;
  if (NAMED.test(text)) return true;
  const match = CHAPTER.exec(text);
  if (!match) return false;
  // A title with nothing before it but a space has to look like one, or
  // "Chapter 1 was the hard part." and "Book I never finished" would be chapters.
  const bare = match[2];
  return bare === undefined || (/^\d/.test(match[1]) && /^\p{Lu}/u.test(bare) && !/[.,;]$/.test(bare));
}

/** True for a line that only separates scenes: "***", "* * *", "#", "---", "⁂". */
export function isBreakLine(line: string): boolean {
  const text = line.trim();
  return /^(?:#{1,3}|⁂|[*•·~_=-](?:\s*[*•·~_=-]){2,})$/.test(text);
}

export type TextOptions = {
  /** Turn "Chapter 1"-style lines into headings, so the import can split at them. */
  chapters?: boolean;
};

const paragraph = (text: string): DocNode => ({ type: "p", children: [{ text }] });

/**
 * A plain-text file as a Plate value: paragraphs at blank lines, scene-break
 * lines as rules and, when asked, chapter lines as headings.
 */
export function textToValue(source: string, options: TextOptions = {}): DocNode[] {
  const lines = source
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""));

  // Files with no blank lines at all have a paragraph per line.
  const perLine = !lines.some((line, i) => !line && i > 0 && i < lines.length - 1 && lines.slice(i + 1).some(Boolean));
  const groups: string[][] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
  };
  for (const line of lines) {
    if (!line.trim()) flush();
    // A chapter line counts at the start of a paragraph, where a heading sits; not in the middle of one.
    else if (perLine || isBreakLine(line) || (options.chapters && !current.length && isChapterLine(line))) {
      flush();
      groups.push([line]);
    } else current.push(line);
  }
  flush();

  // Lines inside a paragraph are either hard-wrapped prose (joined) or meant as lines (verse, addresses).
  const inner = groups.filter((g) => g.length > 1).flatMap((g) => g.slice(0, -1));
  const wrapped = inner.length > 0 && inner.reduce((sum, line) => sum + line.trim().length, 0) / inner.length >= 45;

  const out: DocNode[] = [];
  for (const group of groups) {
    const first = group[0].trim();
    if (group.length === 1 && isBreakLine(first)) out.push({ type: "hr", children: [{ text: "" }] });
    else if (group.length === 1 && options.chapters && isChapterLine(first)) out.push({ type: "h1", children: [{ text: first }] });
    else out.push(paragraph(group.map((line) => line.trim()).join(wrapped ? " " : "\n")));
  }
  return out;
}
