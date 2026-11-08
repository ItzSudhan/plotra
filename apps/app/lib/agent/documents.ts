import "server-only";
import { schema } from "@plotra/db";
import { eq } from "drizzle-orm";
import { requireNodeAccess } from "../access";
import { ydocToValue } from "../collab/ydoc";
import { userDb } from "../db";
import { blockTags, CITATION, EMBED, WIKILINK, type BlockTags, type DocNode } from "../doc-index";
import { isScriptElement } from "../script";

// A note's document as text the model can read and, later, edit by block id
// (plan.md 2.11 "Document text is edited by block id"). The document is the
// last state the collab server synced (`node.ydoc`), read as the signed-in
// user.

const { node } = schema;

/** The note's document as last synced. Throws (404) when the user can't read it. */
export async function loadDocument(projectId: string, nodeId: string): Promise<DocNode[]> {
  await requireNodeAccess(projectId, nodeId);
  const [row] = await userDb((tx) => tx.select({ ydoc: node.ydoc, content: node.content }).from(node).where(eq(node.id, nodeId)).limit(1));
  if (row?.ydoc?.length) return ydocToValue(row.ydoc);
  // Notes from before live collaboration keep their first document here until they're opened.
  return Array.isArray(row?.content) ? (row.content as DocNode[]) : [];
}

export type DocLine = {
  /** The block's id in the document, for edits addressed to it. Null for a block that has none yet. */
  id: string | null;
  text: string;
  tags: BlockTags | null;
};

const isText = (n: DocNode) => typeof n.text === "string";
const isContainer = (n: DocNode) => Array.isArray(n.children) && n.children.length > 0 && n.children.every((c) => !isText(c));

/** Text someone suggested adding isn't the document's text until it's accepted. */
function isSuggestedInsert(leaf: DocNode): boolean {
  for (const key of Object.keys(leaf)) {
    if (!key.startsWith("suggestion_")) continue;
    const data = leaf[key];
    if (data && typeof data === "object" && (data as { type?: string }).type === "insert") return true;
  }
  return false;
}

const headingMarks: Record<string, string> = { h1: "# ", h2: "## ", h3: "### ", blockquote: "> " };

function blockPrefix(block: DocNode): string {
  const type = typeof block.type === "string" ? block.type : "p";
  if (headingMarks[type]) return headingMarks[type];
  const list = block.listStyleType;
  if (list === "todo") return block.checked ? "[x] " : "[ ] ";
  if (list === "decimal") return "1. ";
  if (typeof list === "string") return "- ";
  // Script elements (scene heading, character, dialogue…) say what they are: the layout carries meaning.
  if (isScriptElement(type)) return `(${type.replace(/_/g, " ")}) `;
  return "";
}

/**
 * Flattens a document into one line per block of text. Links to other notes
 * are written `[[Title]]`, with titles looked up by `titleOf`; `keep` drops
 * blocks (the spoiler horizon uses it for passages revealed later).
 */
export function documentLines(value: DocNode[], titleOf: (nodeId: string) => string, keep: (tags: BlockTags | null) => boolean = () => true): DocLine[] {
  const lines: DocLine[] = [];

  const inline = (n: DocNode): string => {
    if (isText(n)) return isSuggestedInsert(n) ? "" : (n.text as string);
    if (n.type === WIKILINK && typeof n.nodeId === "string") return `[[${typeof n.alias === "string" && n.alias ? n.alias : titleOf(n.nodeId)}]]`;
    if (n.type === CITATION && typeof n.nodeId === "string") return `[source: ${titleOf(n.nodeId)}]`;
    return (n.children ?? []).map(inline).join("");
  };

  const visit = (block: DocNode) => {
    const tags = blockTags(block);
    if (!keep(tags)) return;
    const id = typeof block.id === "string" ? block.id : null;
    if (block.type === EMBED && typeof block.nodeId === "string") {
      lines.push({ id, text: `![[${titleOf(block.nodeId)}]] (another note, shown here)`, tags });
      return;
    }
    if (isContainer(block)) {
      for (const child of block.children ?? []) visit(child);
      return;
    }
    if (block.type === "hr") {
      lines.push({ id, text: "---", tags });
      return;
    }
    const text = inline(block).replace(/\s+$/g, "");
    if (!text.trim()) return;
    lines.push({ id, text: `${blockPrefix(block)}${text}`, tags });
  };

  for (const block of value) visit(block);
  return lines;
}

/** A line as the model sees it: its block id, its tags if it has any, its text. */
export function renderLine(line: DocLine): string {
  const tags = line.tags ? ` {${Object.entries(line.tags).map(([key, value]) => `${key}: ${value}`).join(", ")}}` : "";
  return `[${line.id ?? "-"}]${tags} ${line.text}`;
}

/** Splits lines into pages of at most `size` characters, never cutting a block in two. */
export function paginate(lines: string[], size: number): string[][] {
  const pages: string[][] = [[]];
  let used = 0;
  for (const line of lines) {
    const page = pages[pages.length - 1];
    if (page.length && used + line.length > size) {
      pages.push([line]);
      used = line.length;
    } else {
      page.push(line);
      used += line.length + 1;
    }
  }
  return pages;
}
