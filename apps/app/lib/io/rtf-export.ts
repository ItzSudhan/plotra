// RTF out (beat-the-competitors.md step 6): the manuscript as Rich Text, which
// Scrivener, Word, Pages, LibreOffice and most writing tools open. Laid out like
// the Word export (./docx.ts), following the compile settings (./compile.ts):
// title page, running header, a new page per chapter, the scene separator,
// font, size, spacing and indents. Scripts keep their Courier columns. Pure:
// it writes a string.

import { ACT_HEADING, CHARACTER, DIALOGUE, isScriptFormat, MUSIC_CUE, PARENTHETICAL, SCENE_HEADING, SFX, TRANSITION } from "../script";
import { compileFonts, paperInches, separatorText, standardManuscript, type CompileOptions } from "./compile";
import type { Front, Piece } from "./manuscript";
import type { Block, InlineRun } from "./model";

// RTF measures in twips: 1440 to the inch.
const INCH = 1440;

/** Text as RTF: the three special characters escaped, and anything past ASCII as a \u escape (one per UTF-16 unit). */
export function rtfText(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const ch = text[i];
    if (ch === "\\" || ch === "{" || ch === "}") out += `\\${ch}`;
    else if (ch === "\n") out += "\\line ";
    else if (ch === "\t") out += "\\tab ";
    else if (c < 0x20) continue;
    else if (c < 0x80) out += ch;
    else out += `\\u${c > 32767 ? c - 65536 : c}?`;
  }
  return out;
}

function runs(list: InlineRun[], base = ""): string {
  return list
    .map((run) => {
      const marks = `${run.bold ? "\\b" : ""}${run.italic ? "\\i" : ""}${run.underline ? "\\ul" : ""}${run.strikethrough ? "\\strike" : ""}${run.code ? "\\f1" : ""}`;
      const body = rtfText(run.text);
      const styled = marks || base ? `{${base}${marks} ${body}}` : body;
      // A web link stays clickable in Word and Pages.
      return run.href ? `{\\field{\\*\\fldinst HYPERLINK "${run.href.replace(/["\\{}]/g, "")}"}{\\fldrslt ${styled}}}` : styled;
    })
    .join("");
}

// A screenplay's columns on a six-inch text block, as in the Word export.
const scriptLayout: Record<string, string> = {
  [SCENE_HEADING]: `\\sb480`,
  [CHARACTER]: `\\li${Math.round(2.2 * INCH)}\\sb240`,
  [PARENTHETICAL]: `\\li${Math.round(1.6 * INCH)}\\ri${Math.round(2.4 * INCH)}`,
  [DIALOGUE]: `\\li${INCH}\\ri${Math.round(1.5 * INCH)}`,
  [TRANSITION]: `\\qr\\sb240`,
  [ACT_HEADING]: `\\qc\\sb480`,
};
const scriptBold = new Set<string>([SCENE_HEADING, SFX, MUSIC_CUE]);

export type RtfInput = Front & {
  email?: string;
  words: number;
  pieces: Piece[];
  references?: { heading: string; blocks: Block[] } | null;
  options?: CompileOptions;
};

/** The manuscript as an RTF document. */
export function buildRtf(input: RtfInput): string {
  const o = input.options ?? standardManuscript;
  const formats = input.pieces.flatMap((p) => (p.kind === "blocks" ? [p.format] : []));
  const script = formats.filter(isScriptFormat).length * 2 > formats.length;
  const fontName = script ? "Courier New" : compileFonts[o.font].family;
  const size = (script ? 12 : o.size) * 2;
  const line = script ? 240 : { single: 240, onehalf: 360, double: 480 }[o.spacing];
  const titlePage = script || o.titlePage;
  const pageBreaks = script || o.pageBreaks;
  const separator = rtfText(separatorText(o.separator));
  // Every paragraph starts from the same plain state, then adds its own layout.
  const pard = (layout = "", spacing = `\\sl${line}\\slmult1`) => `\\pard\\plain\\f${script ? 1 : 0}\\fs${size}${spacing}${layout} `;
  const single = `\\sl240\\slmult1`;

  const out: string[] = [];
  const title = input.title;
  if (titlePage) {
    out.push(`${pard(`\\tqr\\tx${(script ? 6 : 6.5) * INCH}`, single)}${rtfText(input.author)}${input.words > 0 ? `\\tab about ${Math.max(100, Math.round(input.words / 100) * 100).toLocaleString("en-US")} words` : ""}\\par`);
    if (input.email) out.push(`${pard("", single)}${rtfText(input.email)}\\par`);
    out.push(`${pard(`\\qc\\sb${Math.round(3.5 * INCH)}`)}${rtfText(script ? title.toUpperCase() : title)}\\par`);
    out.push(`${pard("\\qc")}${rtfText(`by ${input.author}`)}\\par`);
  }

  let first = titlePage;
  let afterHeading = false;
  const block = (b: Block): string => {
    switch (b.kind) {
      case "heading":
        return `${pard(`\\sb240\\keepn`)}{\\b ${runs(b.runs)}}\\par`;
      case "quote":
      case "callout":
        return `${pard(`\\li${INCH / 2}\\ri${INCH / 2}`)}${runs(b.runs)}\\par`;
      case "list": {
        const marker = b.style === "ordered" ? `${b.number}.` : b.style === "todo" ? (b.checked ? "☑" : "☐") : "•";
        return `${pard(`\\li${(INCH / 2) * b.level}\\fi-${INCH / 4}`)}${rtfText(marker)}\\tab ${runs(b.runs)}\\par`;
      }
      case "break":
        return `${pard("\\qc")}${separator}\\par`;
      case "table":
        return b.rows.map((row) => `${pard("", single)}${row.map((cell) => runs(cell.runs, cell.header ? "\\b" : "")).join("\\tab ")}\\par`).join("\n");
      case "image":
        return b.alt ? `${pard("\\qc")}${rtfText(`[${b.alt}]`)}\\par` : "";
      case "embed":
        return `${pard(`\\li${INCH / 2}`)}{\\i ${rtfText(b.title)}}\\par`;
      default:
        if (b.script) {
          const bold = scriptBold.has(b.script) ? "\\b" : "";
          const underline = b.script === ACT_HEADING ? "\\ul" : "";
          return `${pard(`${scriptLayout[b.script] ?? "\\sb240"}\\f1`, single)}${runs(b.runs, `${bold}${underline}`)}\\par`;
        }
        return `${pard(!script && o.indent ? `\\fi${INCH / 2}` : "")}${runs(b.runs)}\\par`;
    }
  };

  for (const piece of input.pieces) {
    if (piece.kind === "heading") {
      // Parts and chapters start a page a third of the way down; a chapter right under its part shares the page.
      const page = (piece.level < 3 && !afterHeading && pageBreaks) || first;
      const layout = piece.level < 3 ? `\\qc\\sb${page ? 2 * INCH : 480}\\sa480` : `\\sb${page ? 0 : 480}`;
      out.push(`${page ? "\\page " : ""}${pard(`${layout}\\keepn`)}${rtfText(piece.title)}\\par`);
      afterHeading = piece.level < 3;
    } else if (piece.kind === "scene-break") {
      out.push(`${pard("\\qc")}${separator}\\par`);
      afterHeading = false;
    } else if (piece.kind === "front") {
      // A page of its own: the copyright notice small and plain, a dedication or an epigraph centred a third of the way down.
      const { page } = piece;
      const copyright = page.role === "copyright";
      const smaller = `\\fs${Math.max(16, size - 4)}`;
      page.paragraphs.forEach((text, i) => {
        const lines = text.split("\n").map(rtfText).join("\\line ");
        const layout = copyright ? `${smaller}\\sa240` : `\\qc\\sa240${i === 0 ? `\\sb${2 * INCH}` : ""}`;
        out.push(`${i === 0 && (first || out.length > 0) ? "\\page " : ""}${pard(layout, single)}${copyright ? lines : `{\\i ${lines}}`}\\par`);
      });
      if (page.source) out.push(`${pard("\\qc\\sb120", single)}${rtfText(`— ${page.source}`)}\\par`);
      afterHeading = false;
    } else {
      const text = piece.blocks.map(block).filter(Boolean);
      if (first && text.length) out.push("\\page ");
      out.push(...text);
      afterHeading = false;
    }
    // What follows a page of front matter starts a page of its own, like the text after the title page.
    first = piece.kind === "front";
  }

  if (input.references) {
    out.push(`\\page ${pard(`\\qc\\sa480`)}${rtfText(input.references.heading)}\\par`);
    for (const b of input.references.blocks) if (b.kind === "paragraph") out.push(`${pard(`\\li${INCH / 2}\\fi-${INCH / 2}`)}${runs(b.runs)}\\par`);
  }

  const surname = input.author.trim().split(/\s+/).at(-1) || input.author;
  const header = !(script || o.header)
    ? ""
    : `{\\header ${pard("\\qr", single)}${script ? "{\\field{\\*\\fldinst PAGE}{\\fldrslt 1}}." : `${rtfText(`${surname} / ${title.toUpperCase()} / `)}{\\field{\\*\\fldinst PAGE}{\\fldrslt 1}}`}\\par}`;
  return [
    `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1`,
    `{\\fonttbl{\\f0\\fnil ${rtfText(fontName)};}{\\f1\\fmodern Courier New;}}`,
    `{\\info{\\title ${rtfText(title)}}{\\author ${rtfText(input.author)}}}`,
    // US Letter with one-inch margins; a script leaves an inch and a half on the left for the binding.
    `\\paperw${Math.round(paperInches[o.paper].width * INCH)}\\paperh${Math.round(paperInches[o.paper].height * INCH)}\\margl${(script ? 1.5 : 1) * INCH}\\margr${INCH}\\margt${INCH}\\margb${INCH}\\widowctrl${titlePage ? "\\titlepg" : ""}`,
    header,
    // No header on the title page.
    titlePage && header ? `{\\headerf ${pard("", single)}\\par}` : "",
    ...out,
    "}",
  ]
    .filter(Boolean)
    .join("\n");
}
