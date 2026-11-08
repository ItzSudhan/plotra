// Final Draft out (beat-the-competitors.md step 6): a script as an .fdx, the
// XML that Final Draft, Fade In, Highland, WriterDuet and Arc Studio open.
// Each script element is a paragraph of Final Draft's matching type; dual
// dialogue is kept as dual dialogue; bold, italic, underline and strikeout
// travel as text styles. Binder titles (chapters, scene names) aren't part of
// the script, and neither is prose outside it, which becomes action. Pure.

import { ACT_HEADING, ACTION, CHARACTER, DIALOGUE, dualPairs, PARENTHETICAL, SCENE_HEADING, SHOT, TRANSITION } from "../script";
import type { Front, Piece } from "./manuscript";
import { dualInfo, type Block, type InlineRun } from "./model";

const fdxTypes: Record<string, string> = {
  [SCENE_HEADING]: "Scene Heading",
  [ACTION]: "Action",
  [CHARACTER]: "Character",
  [PARENTHETICAL]: "Parenthetical",
  [DIALOGUE]: "Dialogue",
  [TRANSITION]: "Transition",
  [SHOT]: "Shot",
  [ACT_HEADING]: "New Act",
};

/** Text XML can carry, escaped. */
const xml = (text: string) =>
  text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function texts(runs: InlineRun[]): string {
  const out = runs
    .filter((run) => run.text)
    .map((run) => {
      const style = [run.bold && "Bold", run.italic && "Italic", run.underline && "Underline", run.strikethrough && "Strikeout"].filter(Boolean).join("+");
      // A line break inside an element is a line break in Final Draft too.
      return `<Text${style ? ` Style="${style}"` : ""}>${xml(run.text)}</Text>`;
    });
  return out.length ? out.join("") : "<Text></Text>";
}

const paragraph = (type: string, runs: InlineRun[], extra = "") => `<Paragraph Type="${type}"${extra}>${texts(runs)}</Paragraph>`;

function blockParagraph(b: Block): string | null {
  switch (b.kind) {
    case "paragraph":
      return paragraph(b.script ? (fdxTypes[b.script] ?? "General") : "Action", b.runs);
    case "heading":
    case "quote":
    case "callout":
      return paragraph("Action", b.runs);
    case "list":
      return paragraph("Action", [{ text: b.style === "ordered" ? `${b.number}. ` : "• " }, ...b.runs]);
    case "break":
      return null;
    case "table":
      return b.rows.map((row) => paragraph("Action", row.flatMap((cell, i) => [...(i ? [{ text: "\t" }] : []), ...cell.runs]))).join("\n");
    case "image":
      return b.alt ? paragraph("Action", [{ text: `[${b.alt}]` }]) : null;
    case "embed":
      return paragraph("Action", [{ text: b.title, italic: true }]);
  }
}

/** Whether any of these pieces is written in a script format: what an .fdx needs to be worth making. */
export const hasScript = (pieces: Piece[]) => pieces.some((p) => p.kind === "blocks" && p.blocks.some((b) => b.kind === "paragraph" && b.script));

export function buildFdx(input: Front & { email?: string; pieces: Piece[] }): string {
  const body: string[] = [];
  for (const piece of input.pieces) {
    if (piece.kind !== "blocks") continue;
    const { blocks } = piece;
    const pairs = new Map(dualPairs(blocks, dualInfo).map((pair) => [pair.start, pair]));
    for (let i = 0; i < blocks.length; i++) {
      const pair = pairs.get(i);
      if (pair) {
        // Two speeches side by side: Final Draft wraps both in one DualDialogue.
        const inner = blocks.slice(pair.start, pair.end).map(blockParagraph).filter(Boolean).join("\n");
        body.push(`<Paragraph><DualDialogue>\n${inner}\n</DualDialogue></Paragraph>`);
        i = pair.end - 1;
        continue;
      }
      const p = blockParagraph(blocks[i]);
      if (p) body.push(p);
    }
  }
  if (!body.length) throw new Error("There's no script here to export: Final Draft export is for scenes written in a script format.");

  const center = (text: string) => `<Paragraph Alignment="Center" Type="General"><Text>${xml(text)}</Text></Paragraph>`;
  const blank = `<Paragraph Type="General"><Text></Text></Paragraph>`;
  const titlePage = [
    ...Array.from({ length: 16 }, () => blank),
    center(input.title.toUpperCase()),
    blank,
    center("Written by"),
    blank,
    center(input.author),
    ...Array.from({ length: 20 }, () => blank),
    ...(input.email ? [`<Paragraph Type="General"><Text>${xml(input.email)}</Text></Paragraph>`] : []),
  ];

  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
<Content>
${body.join("\n")}
</Content>
<TitlePage>
<Content>
${titlePage.join("\n")}
</Content>
</TitlePage>
</FinalDraft>
`;
}
