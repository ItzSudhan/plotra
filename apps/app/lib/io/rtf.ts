// Rich Text Format in (beat-the-competitors.md, step 3): what Scrivener keeps
// each document in, read into a Plate value. Paragraphs, bold, italic,
// underline and strikethrough come across; fonts, colours, sizes, spacing and
// pictures don't, since the editor sets its own. A paragraph that only
// separates scenes ("#", "* * *") becomes a rule, as in a text import. Pure.

import type { DocNode } from "../doc-index";
import { isBreakLine } from "./text";

type Marks = { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean };
type State = Marks & { skip: boolean; uc: number };
type Leaf = Marks & { text: string };

// Groups whose text isn't part of the document: tables of fonts and colours, styles, metadata,
// pictures, headers and footers, footnotes, list labels, and field instructions (the result is kept).
const skipped = new Set([
  "fonttbl",
  "colortbl",
  "expandedcolortbl",
  "stylesheet",
  "listtable",
  "listoverridetable",
  "info",
  "pict",
  "shppict",
  "nonshppict",
  "object",
  "header",
  "headerl",
  "headerr",
  "headerf",
  "footer",
  "footerl",
  "footerr",
  "footerf",
  "footnote",
  "annotation",
  "fldinst",
  "listtext",
  "pntext",
  "pntxta",
  "pntxtb",
  "themedata",
  "colorschememapping",
  "latentstyles",
  "datastore",
  "xmlnstbl",
  "generator",
  "rsidtbl",
  "mmathPr",
  "filetbl",
  "revtbl",
]);

const symbols: Record<string, string> = {
  emdash: "—",
  endash: "–",
  lquote: "‘",
  rquote: "’",
  ldblquote: "“",
  rdblquote: "”",
  bullet: "•",
  emspace: " ",
  enspace: " ",
  qmspace: " ",
  tab: "\t",
  line: "\n",
};

// Windows-1252's characters in 0x80–0x9F, where it differs from Latin-1.
const cp1252: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡", 0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž",
  0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};
const byteChar = (code: number) => cp1252[code] ?? String.fromCharCode(code);

const sameMarks = (a: Marks, b: Marks) => !a.bold === !b.bold && !a.italic === !b.italic && !a.underline === !b.underline && !a.strikethrough === !b.strikethrough;

/** An RTF document as Plate blocks. */
export function rtfToValue(source: string): DocNode[] {
  const blocks: DocNode[] = [];
  let leaves: Leaf[] = [];
  let state: State = { skip: false, uc: 1 };
  const stack: State[] = [];
  // Characters still to drop after a \u escape (its fallback for readers without Unicode).
  let dropping = 0;

  const add = (text: string) => {
    if (state.skip) return;
    if (dropping > 0) {
      const dropped = Math.min(dropping, text.length);
      dropping -= dropped;
      text = text.slice(dropped);
      if (!text) return;
    }
    const marks: Marks = {
      ...(state.bold && { bold: true }),
      ...(state.italic && { italic: true }),
      ...(state.underline && { underline: true }),
      ...(state.strikethrough && { strikethrough: true }),
    };
    const last = leaves.at(-1);
    if (last && sameMarks(last, marks)) last.text += text;
    else leaves.push({ ...marks, text });
  };

  const endParagraph = () => {
    const text = leaves.map((leaf) => leaf.text).join("");
    if (text.trim() && isBreakLine(text)) blocks.push({ type: "hr", children: [{ text: "" }] });
    // Empty paragraphs were spacing; the editor spaces paragraphs itself.
    else if (text.trim()) {
      // Space at the paragraph's ends (an indent typed as a tab, say) goes.
      leaves[0].text = leaves[0].text.replace(/^[\t ]+/, "");
      leaves[leaves.length - 1].text = leaves[leaves.length - 1].text.replace(/[\t ]+$/, "");
      blocks.push({ type: "p", children: leaves.filter((leaf) => leaf.text) });
    }
    leaves = [];
  };

  let i = 0;
  // A destination marked "\*" is skipped unless its name is one we read.
  let starred = false;
  while (i < source.length) {
    const c = source[i];
    if (c === "{") {
      stack.push(state);
      state = { ...state };
      i++;
      continue;
    }
    if (c === "}") {
      state = stack.pop() ?? state;
      starred = false;
      i++;
      continue;
    }
    if (c === "\r" || c === "\n") {
      i++;
      continue;
    }
    if (c !== "\\") {
      // Plain text runs to the next special character.
      let end = i;
      while (end < source.length && !"\\{}\r\n".includes(source[end])) end++;
      add(source.slice(i, end));
      i = end;
      continue;
    }

    // A control symbol or word.
    const next = source[i + 1];
    if (next === undefined) break;
    if (next === "\\" || next === "{" || next === "}") {
      add(next);
      i += 2;
      continue;
    }
    if (next === "'") {
      const code = parseInt(source.slice(i + 2, i + 4), 16);
      if (!Number.isNaN(code)) add(byteChar(code));
      i += 4;
      continue;
    }
    if (next === "*") {
      starred = true;
      i += 2;
      continue;
    }
    if (next === "~") {
      add(" ");
      i += 2;
      continue;
    }
    if (next === "_") {
      add("‑");
      i += 2;
      continue;
    }
    if (next === "-") {
      i += 2;
      continue;
    }
    if (next === "\n" || next === "\r") {
      if (!state.skip) endParagraph();
      i += 2;
      continue;
    }
    // Scrivener's own words have underscores (`\Scrv_annot`), which RTF's don't.
    const match = /^(Scrv_[a-zA-Z_]{1,32}|[a-zA-Z]{1,32})(-?\d{1,10})? ?/.exec(source.slice(i + 1, i + 48));
    if (!match) {
      i += 2;
      continue;
    }
    i += 1 + match[0].length;
    const word = match[1];
    const param = match[2] === undefined ? null : Number(match[2]);

    if (starred) {
      starred = false;
      // Every starred destination we don't read, Scrivener's own included, is skipped.
      if (word !== "fldrslt") {
        state.skip = true;
        continue;
      }
    }
    // Scrivener's inline annotations and footnotes are groups of its own words: their text isn't the document's.
    if (skipped.has(word) || word.startsWith("Scrv_")) {
      state.skip = true;
      continue;
    }
    if (state.skip) continue;

    switch (word) {
      case "par":
      case "sect":
      case "page":
      // A table's cells and rows come in as paragraphs of their own: the text, not the grid.
      case "cell":
      case "row":
      case "nestcell":
      case "nestrow":
        endParagraph();
        break;
      case "pard":
        break;
      case "plain":
        state.bold = state.italic = state.underline = state.strikethrough = false;
        break;
      case "b":
        state.bold = param !== 0;
        break;
      case "i":
        state.italic = param !== 0;
        break;
      case "ul":
      case "uld":
      case "uldb":
      case "ulw":
        state.underline = param !== 0;
        break;
      case "ulnone":
        state.underline = false;
        break;
      case "strike":
      case "striked":
        state.strikethrough = param !== 0;
        break;
      case "uc":
        state.uc = Math.max(0, param ?? 1);
        break;
      case "u": {
        if (param === null) break;
        add(String.fromCharCode(param < 0 ? param + 65536 : param));
        dropping = state.uc;
        break;
      }
      default:
        if (word in symbols) add(symbols[word]);
    }
  }
  endParagraph();
  return blocks;
}
