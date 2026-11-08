// DOCX export (plan.md 2.7) in standard manuscript format: a title page, each
// chapter on a new page, 12pt serif, double-spaced, half-inch paragraph
// indents, `#` between scenes and a running header. Script elements keep
// their columns. Built with the `docx` package; no service.

import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Header,
  HeadingLevel,
  LevelFormat,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableBorders,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
  type IParagraphOptions,
  type IRunOptions,
  type ParagraphChild,
} from "docx";
import { ACT_HEADING, CHARACTER, DIALOGUE, dualPairs, isScriptFormat, keepsWithNext, MUSIC_CUE, PARENTHETICAL, SCENE_HEADING, SFX, TRANSITION } from "../script";
import { compileFonts, paperInches, separatorText, standardManuscript, type CompileOptions } from "./compile";
import type { Front, Piece } from "./manuscript";
import { dualInfo, type Block, type InlineRun } from "./model";

// Word measures in twentieths of a point: 1440 to the inch.
const INCH = 1440;
const SERIF = "Times New Roman";
const MONO = "Courier New";
const DOUBLE = { line: 480, lineRule: LineRuleType.AUTO };
const SINGLE = { line: 240, lineRule: LineRuleType.AUTO };

/** Characters XML can't carry. */
const clean = (text: string) => text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");

function textRuns(runs: InlineRun[], base: Partial<IRunOptions> = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const run of runs) {
    const options: Partial<IRunOptions> = {
      ...base,
      ...(run.bold && { bold: true }),
      ...(run.italic && { italics: true }),
      ...(run.underline && { underline: {} }),
      ...(run.strikethrough && { strike: true }),
      ...(run.code && { font: MONO }),
      ...(run.highlight && { highlight: "yellow" as const }),
    };
    // A line break inside a paragraph is a break in the run, not a new paragraph.
    const parts = run.text.split("\n").map((line, i) => new TextRun({ ...options, text: clean(line), ...(i > 0 && { break: 1 }), ...(run.href && { style: "Hyperlink" }) }));
    if (run.href) out.push(new ExternalHyperlink({ link: run.href, children: parts }));
    else out.push(...parts);
  }
  return out;
}

// A screenplay's columns on a six-inch text block (components/editor/script/script.css).
const scriptLayout: Record<string, Partial<IParagraphOptions>> = {
  [SCENE_HEADING]: { spacing: { ...SINGLE, before: 480 } },
  [CHARACTER]: { indent: { left: 2.2 * INCH } },
  [PARENTHETICAL]: { indent: { left: 1.6 * INCH, right: 2.4 * INCH }, spacing: SINGLE },
  [DIALOGUE]: { indent: { left: INCH, right: 1.5 * INCH }, spacing: SINGLE },
  [TRANSITION]: { alignment: AlignmentType.RIGHT },
  [ACT_HEADING]: { alignment: AlignmentType.CENTER, spacing: { ...SINGLE, before: 480 } },
};
const scriptBold = new Set<string>([SCENE_HEADING, SFX, MUSIC_CUE]);

type State = {
  /** Whether the text is mostly script: Courier and single spacing throughout. */
  script: boolean;
  /** Body text's line spacing, first-line indent and scene separator, from the compile settings. */
  body: { line: number; lineRule: (typeof LineRuleType)[keyof typeof LineRuleType] };
  indent: boolean;
  separator: string;
  /** Each ordered list numbers from 1 again. */
  lists: number;
  lastWasList: boolean;
};

function blockParagraphs(b: Block, state: State): Array<Paragraph | Table> {
  const spacing = state.script ? { ...SINGLE, before: 240 } : state.body;
  const wasList = state.lastWasList;
  state.lastWasList = b.kind === "list";
  switch (b.kind) {
    case "heading":
      // The document's own headings sit below the chapter headings.
      return [new Paragraph({ heading: [HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][b.level - 1], spacing: { ...spacing, before: 240 }, keepNext: true, children: textRuns(b.runs) })];
    case "quote":
    case "callout":
      return [new Paragraph({ spacing, indent: { left: 0.5 * INCH, right: 0.5 * INCH }, children: textRuns(b.runs) })];
    case "list": {
      if (b.style === "ordered" && (!wasList || b.number === 1) && b.level === 1) state.lists++;
      const indent = { left: 0.5 * INCH * b.level, hanging: 0.25 * INCH };
      if (b.style === "todo") return [new Paragraph({ spacing, indent, children: textRuns([{ text: b.checked ? "☑ " : "☐ " }, ...b.runs]) })];
      return [
        new Paragraph({
          spacing,
          numbering: { reference: b.style === "ordered" ? "numbers" : "bullets", level: Math.min(8, b.level - 1), ...(b.style === "ordered" && { instance: state.lists }) },
          children: textRuns(b.runs),
        }),
      ];
    }
    case "break":
      return [new Paragraph({ spacing, alignment: AlignmentType.CENTER, children: [new TextRun(state.separator)] })];
    case "table": {
      const columns = Math.max(...b.rows.map((row) => row.length));
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: b.rows.map(
            (row) =>
              new TableRow({
                children: Array.from({ length: columns }, (_, c) => {
                  const cell = row[c];
                  return new TableCell({
                    width: { size: Math.floor(100 / columns), type: WidthType.PERCENTAGE },
                    children: [new Paragraph({ spacing: SINGLE, children: cell ? textRuns(cell.runs, cell.header ? { bold: true } : {}) : [] })],
                  });
                }),
              }),
          ),
        }),
        new Paragraph({ spacing: SINGLE, children: [] }),
      ];
    }
    case "image":
      // Pictures live at URLs the export doesn't fetch; their description stands in.
      return b.alt ? [new Paragraph({ spacing, alignment: AlignmentType.CENTER, children: textRuns([{ text: `[${b.alt}]` }]) })] : [];
    case "embed":
      return [new Paragraph({ spacing, indent: { left: 0.5 * INCH }, children: textRuns([{ text: b.title, italic: true }]) })];
    default: {
      if (b.script) {
        const layout = scriptLayout[b.script] ?? {};
        return [
          new Paragraph({
            spacing: { ...SINGLE, before: 240 },
            ...layout,
            keepNext: keepsWithNext(b.script),
            children: textRuns(b.runs, { font: MONO, ...(scriptBold.has(b.script) && { bold: true }), ...(b.script === ACT_HEADING && { underline: {} }) }),
          }),
        ];
      }
      return [new Paragraph({ spacing, ...(!state.script && state.indent && { indent: { firstLine: 0.5 * INCH } }), children: textRuns(b.runs) })];
    }
  }
}

// Dual dialogue: each speech in a column about three inches wide, the cue and parenthetical set in.
const dualLayout: Record<string, Partial<IParagraphOptions>> = {
  [CHARACTER]: { indent: { left: 0.9 * INCH } },
  [PARENTHETICAL]: { indent: { left: 0.45 * INCH, right: 0.45 * INCH } },
};

/** Two speeches side by side: a borderless two-column table whose row never breaks over a page. */
function dualTable(left: Block[], right: Block[]): Array<Paragraph | Table> {
  const column = (blocks: Block[]) =>
    new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      margins: { left: 0, right: 0.15 * INCH },
      children: blocks.map(
        (b, i) =>
          new Paragraph({
            spacing: { ...SINGLE, before: 0 },
            ...(b.kind === "paragraph" && dualLayout[b.script ?? ""]),
            keepNext: i < blocks.length - 1,
            children: b.kind === "paragraph" ? textRuns(b.runs, { font: MONO }) : [],
          }),
      ),
    });
  return [
    // The blank line a speech has above it.
    new Paragraph({ spacing: { ...SINGLE, before: 0 }, keepNext: true, children: [] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: TableBorders.NONE,
      rows: [new TableRow({ cantSplit: true, children: [column(left), column(right)] })],
    }),
  ];
}

/** A run of blocks as paragraphs, with dual dialogue set side by side. */
function blocksParagraphs(blocks: Block[], state: State): Array<Paragraph | Table> {
  const pairs = new Map(dualPairs(blocks, dualInfo).map((pair) => [pair.start, pair]));
  const out: Array<Paragraph | Table> = [];
  for (let i = 0; i < blocks.length; i++) {
    const pair = pairs.get(i);
    if (pair) {
      out.push(...dualTable(blocks.slice(pair.start, pair.split), blocks.slice(pair.split, pair.end)));
      state.lastWasList = false;
      i = pair.end - 1;
    } else out.push(...blockParagraphs(blocks[i], state));
  }
  return out;
}

export type DocxInput = Front & {
  email?: string;
  words: number;
  pieces: Piece[];
  references?: { heading: string; blocks: Block[] } | null;
  /** How the manuscript is set (./compile.ts); standard manuscript format when absent. A script keeps its own layout. */
  options?: CompileOptions;
};

/** The manuscript as a Word document. */
export async function buildDocx(input: DocxInput): Promise<Uint8Array> {
  const { title, author } = input;
  const formats = input.pieces.flatMap((p) => (p.kind === "blocks" ? [p.format] : []));
  const script = formats.filter(isScriptFormat).length * 2 > formats.length;
  const o = input.options ?? standardManuscript;
  const line = { single: 240, onehalf: 360, double: 480 }[o.spacing];
  const spacing = script ? SINGLE : { line, lineRule: LineRuleType.AUTO };
  const font = script ? MONO : o.font === "serif" ? SERIF : compileFonts[o.font].family;
  // Word measures text size in half-points.
  const size = script ? 24 : o.size * 2;
  const state: State = { script, lists: 0, lastWasList: false, body: spacing, indent: o.indent, separator: separatorText(o.separator) };
  const titlePage = script || o.titlePage;
  const pageBreaks = script || o.pageBreaks;

  const body: Array<Paragraph | Table> = !titlePage ? [] : [
    // Contact details top left and the length top right, then the title a third of the way down.
    new Paragraph({
      spacing: SINGLE,
      tabStops: [{ type: TabStopType.RIGHT, position: (script ? 6 : 6.5) * INCH }],
      children: [new TextRun(clean(author)), ...(input.words > 0 ? [new TextRun(`\tabout ${Math.max(100, Math.round(input.words / 100) * 100).toLocaleString("en-US")} words`)] : [])],
    }),
    ...(input.email ? [new Paragraph({ spacing: SINGLE, children: [new TextRun(clean(input.email))] })] : []),
    new Paragraph({ spacing: { ...DOUBLE, before: 3.5 * INCH }, alignment: AlignmentType.CENTER, children: [new TextRun(clean(script ? title.toUpperCase() : title))] }),
    new Paragraph({ spacing: DOUBLE, alignment: AlignmentType.CENTER, children: [new TextRun(clean(`by ${author}`))] }),
  ];

  // Without a title page, the first thing in the file needs no page break before it.
  let first = titlePage;
  let afterHeading = false;
  for (const piece of input.pieces) {
    if (piece.kind === "heading") {
      // Parts and chapters start a page a third of the way down; a chapter right under its part shares the page.
      const page = piece.level < 3 && !afterHeading && pageBreaks;
      body.push(
        new Paragraph({
          heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][piece.level - 1],
          alignment: piece.level < 3 ? AlignmentType.CENTER : AlignmentType.LEFT,
          pageBreakBefore: page || first,
          keepNext: true,
          spacing: { ...spacing, before: page || first ? (piece.level < 3 ? 2 * INCH : 0) : 480, after: piece.level < 3 ? 480 : 0 },
          children: piece.title ? [new TextRun(clean(piece.title))] : [],
        }),
      );
      afterHeading = piece.level < 3;
    } else if (piece.kind === "scene-break") {
      body.push(new Paragraph({ spacing, alignment: AlignmentType.CENTER, children: [new TextRun(state.separator)] }));
      afterHeading = false;
    } else if (piece.kind === "front") {
      // Each page of front matter is a page of its own: the copyright notice small and plain, a dedication or an epigraph centred a third of the way down.
      const { page } = piece;
      const copyright = page.role === "copyright";
      const lines = (text: string, italics: boolean) =>
        text.split("\n").map((line, i) => new TextRun({ text: clean(line), italics, ...(i > 0 && { break: 1 }), ...(copyright && { size: Math.max(16, size - 4) }) }));
      page.paragraphs.forEach((text, i) =>
        body.push(
          new Paragraph({
            pageBreakBefore: i === 0 && (first || body.length > 0),
            alignment: copyright ? AlignmentType.LEFT : AlignmentType.CENTER,
            spacing: { ...SINGLE, before: i === 0 && !copyright ? 2 * INCH : 0, after: 240 },
            children: lines(text, !copyright),
          }),
        ),
      );
      if (page.source) body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { ...SINGLE, before: 120 }, children: [new TextRun(clean(`— ${page.source}`))] }));
      afterHeading = false;
    } else {
      const paragraphs = blocksParagraphs(piece.blocks, state);
      // Text with no heading over it still starts after the title page.
      if (first && paragraphs.length) body.push(new Paragraph({ pageBreakBefore: true, spacing: SINGLE, children: [] }));
      body.push(...paragraphs);
      afterHeading = false;
    }
    // What follows a page of front matter starts a page of its own, like the text after the title page.
    first = piece.kind === "front";
  }

  if (input.references) {
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, pageBreakBefore: true, spacing: { ...spacing, after: 480 }, children: [new TextRun(clean(input.references.heading))] }));
    for (const b of input.references.blocks) {
      if (b.kind !== "paragraph") continue;
      body.push(new Paragraph({ spacing, indent: { left: 0.5 * INCH, hanging: 0.5 * INCH }, children: textRuns(b.runs) }));
    }
  }

  const heading = { run: { font, size, bold: false, color: "000000" }, paragraph: { spacing } };
  const surname = author.trim().split(/\s+/).at(-1) || author;
  const level = (format: (typeof LevelFormat)[keyof typeof LevelFormat], text: (n: number) => string) =>
    Array.from({ length: 9 }, (_, i) => ({
      level: i,
      format,
      text: text(i + 1),
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 0.5 * INCH * (i + 1), hanging: 0.25 * INCH } } },
    }));

  const doc = new Document({
    creator: clean(author),
    title: clean(title),
    styles: {
      default: {
        document: { run: { font, size }, paragraph: { spacing } },
        heading1: heading,
        heading2: heading,
        heading3: { ...heading, run: { ...heading.run, bold: true } },
        heading4: { ...heading, run: { ...heading.run, bold: true } },
        heading5: { ...heading, run: { ...heading.run, bold: true } },
        heading6: { ...heading, run: { ...heading.run, italics: true } },
      },
    },
    numbering: {
      config: [
        { reference: "bullets", levels: level(LevelFormat.BULLET, () => "•") },
        { reference: "numbers", levels: level(LevelFormat.DECIMAL, (n) => `%${n}.`) },
      ],
    },
    sections: [
      {
        properties: {
          // US Letter with one-inch margins; a script leaves an inch and a half on the left for the binding.
          page: {
            size: { width: Math.round(paperInches[o.paper].width * INCH), height: Math.round(paperInches[o.paper].height * INCH) },
            margin: { top: INCH, right: INCH, bottom: INCH, left: (script ? 1.5 : 1) * INCH },
          },
          // No header on the title page.
          titlePage,
        },
        headers: !(script || o.header) ? {} : {
          first: new Header({ children: [new Paragraph({ children: [] })] }),
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: SINGLE,
                children: script
                  ? [new TextRun({ children: [PageNumber.CURRENT, "."] })]
                  : [new TextRun({ children: [clean(`${surname} / ${title.toUpperCase()} / `), PageNumber.CURRENT] })],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
