import { WIKILINK, type DocNode } from "../doc-index";

// Text in and out of the editor for the inline actions (plan.md 2.11): the
// selected blocks become plain text with the few marks that matter in prose
// (italics, bold, links to other notes), and the model's answer becomes blocks
// again. Pure, so it can be tested without an editor.

type Leaf = { text: string; bold?: boolean; italic?: boolean };

const isText = (n: DocNode): n is DocNode & { text: string } => typeof n.text === "string";

/** One block's inline content as text: `*italic*`, `**bold**`, `[[Note title]]`. */
function inlineToText(node: DocNode, titleOf: (nodeId: string) => string | null): string {
  if (isText(node)) {
    if (!node.text) return "";
    // Marks hug the words, not the spaces around them, or they wouldn't parse back.
    const [, lead, body, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(node.text)!;
    if (!body) return node.text;
    const mark = node.bold && node.italic ? "***" : node.bold ? "**" : node.italic ? "*" : "";
    return `${lead}${mark}${body}${mark}${trail}`;
  }
  if (node.type === WIKILINK && typeof node.nodeId === "string") {
    const title = typeof node.alias === "string" && node.alias ? node.alias : titleOf(node.nodeId);
    return title ? `[[${title}]]` : "";
  }
  return (node.children ?? []).map((child) => inlineToText(child, titleOf)).join("");
}

/** Blocks as text, one paragraph per block, blank lines between them. Blocks that hold blocks are flattened. */
export function blocksToText(blocks: DocNode[], titleOf: (nodeId: string) => string | null = () => null): string {
  const out: string[] = [];
  const visit = (block: DocNode) => {
    const children = block.children ?? [];
    // Slate keeps a text leaf in every block that holds inline content, so a block of only elements holds blocks.
    if (children.length && children.every((c) => !isText(c))) {
      for (const child of children) visit(child);
      return;
    }
    const text = inlineToText(block, titleOf).trim();
    if (text) out.push(text);
  };
  for (const block of blocks) visit(block);
  return out.join("\n\n");
}

const MARKS = /(\*\*\*|___)(?=\S)([\s\S]+?)(?<=\S)\1|(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\3|(\*|_)(?=\S)([^*_\n]+?)(?<=\S)\5|\[\[([^\]\n]+)\]\]/g;

/** A paragraph's text as leaves and links. A `[[Title]]` that names no note stays as it was written. */
export function textToInline(text: string, noteByTitle: (title: string) => string | null = () => null): DocNode[] {
  const out: DocNode[] = [];
  const push = (leaf: Leaf) => {
    if (!leaf.text) return;
    const last = out.at(-1);
    if (last && isText(last) && !!last.bold === !!leaf.bold && !!last.italic === !!leaf.italic) last.text += leaf.text;
    else out.push({ text: leaf.text, ...(leaf.bold && { bold: true }), ...(leaf.italic && { italic: true }) });
  };
  let last = 0;
  for (const match of text.matchAll(MARKS)) {
    // An underscore inside a word (snake_case) isn't emphasis.
    const before = text[match.index - 1];
    const after = text[match.index + match[0].length];
    if (match[0].startsWith("_") && ((before && /\w/.test(before)) || (after && /\w/.test(after)))) continue;
    push({ text: text.slice(last, match.index) });
    if (match[2] !== undefined) push({ text: match[2], bold: true, italic: true });
    else if (match[4] !== undefined) push({ text: match[4], bold: true });
    else if (match[6] !== undefined) push({ text: match[6], italic: true });
    else {
      const [title, alias] = match[7].split("|").map((s) => s.trim());
      const nodeId = noteByTitle(title);
      if (nodeId) {
        // Slate wants text on both sides of an inline element.
        if (!out.length || !isText(out.at(-1)!)) out.push({ text: "" });
        out.push({ type: WIKILINK, nodeId, ...(alias && alias !== title && { alias }), children: [{ text: "" }] });
        out.push({ text: "" });
      } else push({ text: match[0] });
    }
    last = match.index + match[0].length;
  }
  push({ text: text.slice(last) });
  return out.length ? out : [{ text: "" }];
}

/** What a model sometimes wraps an answer in despite being asked not to. */
export function cleanAnswer(raw: string): string {
  let text = raw.replace(/\r\n?/g, "\n").trim();
  // A fenced block around the whole answer.
  const fenced = /^```[a-z]*\n([\s\S]*?)\n```$/i.exec(text);
  if (fenced) text = fenced[1].trim();
  // Quotation marks around the whole answer, when there is exactly one pair.
  const quoted = /^(["“])([\s\S]*)(["”])$/.exec(text);
  if (quoted && !/["“”]/.test(quoted[2])) text = quoted[2].trim();
  return text;
}

/** The properties of a block that say what kind of block it is, to give to its replacement. */
export function blockShape(block: DocNode | undefined): Record<string, unknown> {
  const shape: Record<string, unknown> = { type: typeof block?.type === "string" ? block.type : "p" };
  for (const key of ["listStyleType", "indent", "checked", "align"]) if (block?.[key] !== undefined) shape[key] = block[key];
  // A heading is a heading once: what is written after it, or in its place, is body text.
  if (/^h[1-6]$/.test(String(shape.type))) return { type: "p" };
  return shape;
}

/**
 * The model's answer as blocks: one per paragraph. `shapes` are the blocks
 * being replaced (or the block being continued): each new paragraph takes the
 * shape of the one in its place, and the last shape when there are more.
 */
export function textToBlocks(answer: string, shapes: Array<Record<string, unknown>>, noteByTitle: (title: string) => string | null = () => null): DocNode[] {
  const paragraphs = cleanAnswer(answer)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);
  const fallback = shapes.at(-1) ?? { type: "p" };
  return paragraphs.map((paragraph, i) => ({ ...(shapes[i] ?? fallback), children: textToInline(paragraph, noteByTitle) }));
}
