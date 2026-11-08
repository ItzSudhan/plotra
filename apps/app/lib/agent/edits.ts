import { slateNodesToInsertDelta, slatePointToRelativePosition, yTextToSlateElement } from "@slate-yjs/core";
import * as Y from "yjs";
import { CITATION, keptBlocks, WIKILINK, type DocNode } from "../doc-index";
import { scriptElementTypes } from "../script";

// How the agent changes a document (plan.md 2.11 "Document text is edited by
// block id"). Pure: it takes a Y.Doc and a list of edits and changes the doc,
// with nothing about who may do so or where the doc came from (that is
// lib/agent/write.ts). The document is the same shared type Plate's YjsPlugin
// binds: a Y.XmlText called `content`, one embedded Y.XmlText per element.
//
// Two ways to apply an edit:
// - directly: the block is replaced, inserted or removed. A rewrite of plain
//   text changes only the words that differ, inside the block (`rewriteInPlace`);
// - as a suggestion (Suggest mode): the same edit written with the marks of
//   Plate's suggestion plugin, so it shows as tracked changes that the writer
//   accepts or rejects from the Comments tab like anyone else's.

export type BlockEdit =
  /** Rewrites one block. Several lines of `text` become the block and new blocks after it. */
  | { op: "replace"; blockId: string; text: string }
  /** Adds blocks after a block, or at the start or end of the note. One block per line of `text`. */
  | { op: "insert"; after: string; text: string }
  | { op: "delete"; blockId: string };

/** The suggestion every edit of one call belongs to, so it is accepted or rejected as one. */
export type SuggestionStamp = { id: string; userId: string; createdAt: number };

export type EditOptions = {
  /** Write the edits as suggestions by this author instead of applying them. */
  suggest: SuggestionStamp | null;
  /** The id of the note a `[[Title]]` names, or null when there is none. */
  resolveLink: (title: string) => string | null;
  /** The element a plain line becomes: a paragraph, or `action` in a script. */
  defaultType?: string;
};

export type EditResult = {
  /** Ids of the blocks written or marked, in the order they were touched. */
  touched: string[];
  /** Edits that couldn't be applied, in words the model can act on. */
  problems: string[];
};

const ROOT = "content";
export const rootOf = (doc: Y.Doc) => doc.get(ROOT, Y.XmlText);

/** Plate's ids are 10 characters of this alphabet; ours only need to be unique in a note. */
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function newBlockId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

// ---- Text the model wrote → blocks ---------------------------------------------------------

const scriptTypes = new Map(scriptElementTypes.map((type) => [type.replace(/_/g, " "), type] as const));

type Leaf = DocNode;

/** `**bold**`, `*italic*` and `[[links]]` in one line of text. Anything else stays as written. */
function inlineNodes(text: string, resolveLink: EditOptions["resolveLink"]): Leaf[] {
  const out: Leaf[] = [];
  const push = (value: string, marks: Record<string, true> = {}) => {
    if (value) out.push({ text: value, ...marks });
  };
  const token = /\[\[([^\]\n|]{1,200})(?:\|([^\]\n]{1,200}))?\]\]|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
  let last = 0;
  for (let match = token.exec(text); match; match = token.exec(text)) {
    push(text.slice(last, match.index));
    last = match.index + match[0].length;
    if (match[1] !== undefined) {
      const nodeId = resolveLink(match[1].trim());
      // A link to a note that doesn't exist stays as the words it was written with.
      if (!nodeId) push(match[2]?.trim() || match[1].trim());
      else out.push({ type: WIKILINK, nodeId, ...(match[2]?.trim() ? { alias: match[2].trim() } : {}), children: [{ text: "" }] });
    } else if (match[3] !== undefined) push(match[3], { bold: true });
    else push(match[4], { italic: true });
  }
  push(text.slice(last));
  // An inline element needs text on both sides of it, and a block needs at least one leaf.
  const padded: Leaf[] = [];
  for (const leaf of out) {
    if (leaf.type && (!padded.length || padded[padded.length - 1].type)) padded.push({ text: "" });
    padded.push(leaf);
  }
  if (!padded.length || padded[padded.length - 1].type) padded.push({ text: "" });
  return padded;
}

type ParsedBlock = {
  /** Set when the line said what it is (a heading mark, a list mark, a script element). */
  explicit: boolean;
  props: Record<string, unknown>;
  children: Leaf[];
};

function parseLine(line: string, options: EditOptions): ParsedBlock {
  const kids = (text: string) => inlineNodes(text, options.resolveLink);
  const plain = { type: options.defaultType ?? "p" };
  let match: RegExpExecArray | null;
  if (/^(-{3,}|\*{3,})$/.test(line.trim())) return { explicit: true, props: { type: "hr" }, children: [{ text: "" }] };
  if ((match = /^(#{1,3})\s+(.*)$/.exec(line))) return { explicit: true, props: { type: `h${match[1].length}` }, children: kids(match[2]) };
  if ((match = /^>\s?(.*)$/.exec(line))) return { explicit: true, props: { type: "blockquote" }, children: kids(match[1]) };
  if ((match = /^\[( |x|X)\]\s+(.*)$/.exec(line))) {
    return { explicit: true, props: { type: "p", indent: 1, listStyleType: "todo", checked: match[1] !== " " }, children: kids(match[2]) };
  }
  if ((match = /^[-*]\s+(.*)$/.exec(line))) return { explicit: true, props: { type: "p", indent: 1, listStyleType: "disc" }, children: kids(match[1]) };
  if ((match = /^\d{1,3}[.)]\s+(.*)$/.exec(line))) return { explicit: true, props: { type: "p", indent: 1, listStyleType: "decimal" }, children: kids(match[1]) };
  if ((match = /^\(([a-z ]{3,20})\)\s+(.*)$/.exec(line))) {
    const type = scriptTypes.get(match[1]);
    if (type) return { explicit: true, props: { type }, children: kids(match[2]) };
  }
  return { explicit: false, props: plain, children: kids(line) };
}

/** The lines of what the model wrote, without the `[block id]` it sometimes repeats in front of them. */
function linesOf(text: string, knownIds: ReadonlySet<string>): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const echoed = /^\[([A-Za-z0-9_-]{1,40})\]\s?/.exec(line);
      return echoed && (echoed[1] === "-" || knownIds.has(echoed[1])) ? line.slice(echoed[0].length) : line;
    })
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line) => line.trim());
}

/** Text as the model writes it (one block per line, Markdown marks) as document blocks, each with a new id. */
export function textToBlocks(text: string, options: EditOptions, knownIds: ReadonlySet<string> = new Set()): DocNode[] {
  return linesOf(text, knownIds).map((line) => {
    const parsed = parseLine(line, options);
    return { ...parsed.props, id: newBlockId(), children: parsed.children };
  });
}

// ---- Finding blocks in the shared type --------------------------------------------------------

type Located = { parent: Y.XmlText; index: number; block: Y.XmlText; top: number };

type DeltaOp = { insert?: string | Y.XmlText | object; attributes?: Record<string, unknown> };

/** The elements directly inside `parent`, with their offsets in it. */
function childElements(parent: Y.XmlText): Array<{ block: Y.XmlText; index: number }> {
  const out: Array<{ block: Y.XmlText; index: number }> = [];
  let offset = 0;
  for (const op of parent.toDelta() as DeltaOp[]) {
    if (typeof op.insert === "string") offset += op.insert.length;
    else {
      if (op.insert instanceof Y.XmlText) out.push({ block: op.insert, index: offset });
      offset += 1;
    }
  }
  return out;
}

/** Elements that sit inside a line of text. Everything else embedded in an element is a block of its own. */
const inlineTypes = new Set<unknown>([WIKILINK, CITATION, "a", "mention"]);

/** An element holds other blocks (a table, a column) rather than text. */
const isContainer = (block: Y.XmlText) => {
  const delta = block.toDelta() as DeltaOp[];
  return delta.length > 0 && delta.every((op) => op.insert instanceof Y.XmlText && !inlineTypes.has(op.insert.getAttribute("type")));
};

function locate(root: Y.XmlText, blockId: string): Located | null {
  const search = (parent: Y.XmlText, top: number | null): Located | null => {
    for (const [position, child] of childElements(parent).entries()) {
      const at = top ?? position;
      if (child.block.getAttribute("id") === blockId) return { parent, index: child.index, block: child.block, top: at };
      if (isContainer(child.block)) {
        const inside = search(child.block, at);
        if (inside) return inside;
      }
    }
    return null;
  };
  return search(root, null);
}

/** Every block id in the document. */
export function blockIds(doc: Y.Doc): Set<string> {
  const ids = new Set<string>();
  const walk = (parent: Y.XmlText) => {
    for (const { block } of childElements(parent)) {
      const id = block.getAttribute("id");
      if (typeof id === "string") ids.add(id);
      if (isContainer(block)) walk(block);
    }
  };
  walk(rootOf(doc));
  return ids;
}

/**
 * Gives an id to every top-level block that has none. Plate does this in the
 * browser, so only notes nobody has opened yet (a template, an import) need it;
 * without ids the agent would have nothing to address its edits to.
 */
export function ensureBlockIds(doc: Y.Doc): number {
  let given = 0;
  doc.transact(() => {
    for (const { block } of childElements(rootOf(doc))) {
      if (typeof block.getAttribute("id") === "string") continue;
      block.setAttribute("id", newBlockId());
      given++;
    }
  });
  return given;
}

const textLength = (block: Y.XmlText) => block.length;
const hasText = (block: Y.XmlText) => (block.toDelta() as DeltaOp[]).some((op) => (typeof op.insert === "string" ? op.insert.trim() : true));

// ---- Writing -----------------------------------------------------------------------------

const insertBlocks = (parent: Y.XmlText, index: number, blocks: DocNode[]) => {
  if (blocks.length) parent.applyDelta([{ retain: index }, ...slateNodesToInsertDelta(blocks as never)], { sanitize: false });
};

const suggestionKey = (stamp: SuggestionStamp) => `suggestion_${stamp.id}`;
const inlineData = (stamp: SuggestionStamp, type: "insert" | "remove") => ({ id: stamp.id, createdAt: stamp.createdAt, type, userId: stamp.userId });

/** Marks leaves and inline elements as text the suggestion adds. */
function asInserted(children: Leaf[], stamp: SuggestionStamp): Leaf[] {
  return children.map((child) => ({ ...child, suggestion: true, [suggestionKey(stamp)]: inlineData(stamp, "insert") }));
}

/** Marks everything a block says as text the suggestion removes. */
function markRemoved(block: Y.XmlText, stamp: SuggestionStamp) {
  const marks = { suggestion: true, [suggestionKey(stamp)]: inlineData(stamp, "remove") };
  if (textLength(block)) block.format(0, textLength(block), marks);
  // Inline elements (links) carry their marks themselves.
  for (const child of childElements(block)) for (const [key, value] of Object.entries(marks)) child.block.setAttribute(key, value as never);
}

function suggestedBlock(block: DocNode, stamp: SuggestionStamp): DocNode {
  return { ...block, suggestion: inlineData(stamp, "insert"), children: asInserted(block.children ?? [], stamp) };
}

/** A block's own properties (its type, id, tags, indent), without what it says. */
function propsOf(block: Y.XmlText): Record<string, unknown> {
  const { suggestion: _pending, ...rest } = block.getAttributes() as Record<string, unknown>;
  void _pending;
  return rest;
}

/**
 * One unit of a block's content, for comparing what it says with what the
 * model wrote: a UTF-16 code unit with the marks the model can write (bold,
 * italic), or an inline element (a wiki-link, by its target and alias).
 */
type Atom = { text: string; marks: string } | { embed: string; leaf?: Leaf };

const markKey = (attrs: Record<string, unknown> | undefined) => `${attrs?.bold ? "b" : ""}${attrs?.italic ? "i" : ""}`;
const embedKey = (attrs: Record<string, unknown>) => `${String(attrs.type ?? "")}|${String(attrs.nodeId ?? "")}|${String(attrs.alias ?? "")}`;
const sameAtom = (a: Atom, b: Atom) => ("embed" in a ? "embed" in b && a.embed === b.embed : !("embed" in b) && a.text === b.text && a.marks === b.marks);
const lowSurrogate = (atom: Atom | undefined) => Boolean(atom && "text" in atom && /[\uDC00-\uDFFF]/.test(atom.text));

/**
 * Rewrites a block where it is, changing only the stretch between the longest
 * common start and end of what it says and what the model wrote: characters
 * compared with their bold and italic, links by what they point at. The block
 * stays the same shared type, so an open editor's caret, a comment anchored to
 * the unchanged words and anyone typing outside that stretch are undisturbed,
 * and formatting the model can't write (underline, a highlight) stays on the
 * words it didn't change. False when the block holds something it can't
 * compare (an inline element other than a link, or nested blocks): then it has
 * to be replaced whole.
 */
function rewriteInPlace(block: Y.XmlText, next: ParsedBlock): boolean {
  const delta = block.toDelta() as DeltaOp[];
  const before: Atom[] = [];
  // Every format key the block carries: new text sets each one, so it never inherits what's beside it.
  const keys = new Set<string>(["bold", "italic"]);
  for (const op of delta) {
    if (typeof op.insert === "string") {
      for (const key of Object.keys(op.attributes ?? {})) keys.add(key);
      const marks = markKey(op.attributes);
      for (let i = 0; i < op.insert.length; i++) before.push({ text: op.insert[i], marks });
    } else if (op.insert instanceof Y.XmlText && inlineTypes.has(op.insert.getAttribute("type") as string)) {
      before.push({ embed: embedKey(op.insert.getAttributes() as Record<string, unknown>) });
    } else return false;
  }
  const after: Atom[] = [];
  for (const leaf of next.children) {
    if (typeof leaf.text === "string" && !leaf.type) {
      const marks = markKey(leaf);
      for (let i = 0; i < leaf.text.length; i++) after.push({ text: leaf.text[i], marks });
    } else if (leaf.type === WIKILINK) after.push({ embed: embedKey(leaf), leaf });
    else return false;
  }

  if (next.explicit) for (const [key, value] of Object.entries(next.props)) if (block.getAttribute(key) !== value) block.setAttribute(key, value as never);
  let start = 0;
  while (start < before.length && start < after.length && sameAtom(before[start], after[start])) start++;
  if (start === before.length && start === after.length) return true;
  let end = 0;
  while (end < before.length - start && end < after.length - start && sameAtom(before[before.length - 1 - end], after[after.length - 1 - end])) end++;
  // Never split a surrogate pair: back off to a whole character on both sides.
  while (start > 0 && (lowSurrogate(before[start]) || lowSurrogate(after[start]))) start--;
  while (end > 0 && (lowSurrogate(before[before.length - end]) || lowSurrogate(after[after.length - end]))) end--;

  const removed = before.length - start - end;
  if (removed > 0) block.delete(start, removed);
  // The new middle, as runs of one set of marks, and links.
  const middle = after.slice(start, after.length - end);
  const cleared = Object.fromEntries([...keys].map((key) => [key, null]));
  const ops: DeltaOp[] = [{ retain: start } as DeltaOp];
  for (let i = 0; i < middle.length; ) {
    const atom = middle[i];
    if ("embed" in atom) {
      for (const op of slateNodesToInsertDelta([atom.leaf] as never) as DeltaOp[]) ops.push({ ...op, attributes: { ...cleared, ...op.attributes } });
      i++;
      continue;
    }
    let text = "";
    const marks = atom.marks;
    for (; i < middle.length && "text" in middle[i] && (middle[i] as { marks: string }).marks === marks; i++) text += (middle[i] as { text: string }).text;
    ops.push({ insert: text, attributes: { ...cleared, ...(marks.includes("b") && { bold: true }), ...(marks.includes("i") && { italic: true }) } });
  }
  if (ops.length > 1) block.applyDelta(ops as never, { sanitize: false });
  return true;
}

/**
 * Applies the edits, in order, in one transaction. An edit that names a block
 * the document doesn't have is skipped and reported; the rest still apply.
 */
export function applyEdits(doc: Y.Doc, edits: BlockEdit[], options: EditOptions): EditResult {
  const root = rootOf(doc);
  const touched: string[] = [];
  const problems: string[] = [];
  const known = blockIds(doc);
  const missing = (id: string) => `No block with id ${id} in this note. Read the note again for its current block ids.`;

  doc.transact(() => {
    for (const edit of edits) {
      if (edit.op === "delete") {
        const found = locate(root, edit.blockId);
        if (!found) {
          problems.push(missing(edit.blockId));
          continue;
        }
        if (options.suggest) {
          found.block.setAttribute("suggestion", inlineData(options.suggest, "remove") as never);
          markRemoved(found.block, options.suggest);
        } else found.parent.delete(found.index, 1);
        touched.push(edit.blockId);
        continue;
      }

      if (edit.op === "replace") {
        const found = locate(root, edit.blockId);
        if (!found) {
          problems.push(missing(edit.blockId));
          continue;
        }
        const lines = linesOf(edit.text, known);
        if (!lines.length) {
          problems.push(`The new text for block ${edit.blockId} is empty. To remove a block, delete it.`);
          continue;
        }
        const old = propsOf(found.block);
        const [first, ...rest] = lines.map((line) => parseLine(line, { ...options, defaultType: typeof old.type === "string" ? old.type : options.defaultType }));
        const more = rest.map((parsed) => ({ ...parsed.props, id: newBlockId(), children: parsed.children }) as DocNode);
        if (options.suggest) {
          // The block keeps what it is; only its words change, old struck through and new beside them.
          markRemoved(found.block, options.suggest);
          found.block.applyDelta([{ retain: textLength(found.block) }, ...slateNodesToInsertDelta(asInserted(first.children, options.suggest) as never)], { sanitize: false });
          insertBlocks(found.parent, found.index + 1, more.map((block) => suggestedBlock(block, options.suggest!)));
        } else if (rewriteInPlace(found.block, first)) {
          // Only the words that differ were changed, inside the block: someone typing elsewhere in it keeps their keystrokes.
          insertBlocks(found.parent, found.index + 1, more);
        } else {
          // A line that says what it is (a heading, a list item) changes the block's type; a plain one keeps it.
          const replacement = { ...old, ...(first.explicit ? first.props : {}), children: first.children } as DocNode;
          found.parent.delete(found.index, 1);
          insertBlocks(found.parent, found.index, [replacement, ...more]);
        }
        touched.push(edit.blockId, ...more.map((block) => block.id as string));
        continue;
      }

      let blocks = textToBlocks(edit.text, options, known);
      if (!blocks.length) {
        problems.push("There was no text to insert.");
        continue;
      }
      if (options.suggest) blocks = blocks.map((block) => suggestedBlock(block, options.suggest!));
      const top = childElements(root);
      if (edit.after === "start") insertBlocks(root, 0, blocks);
      else if (edit.after === "end") {
        // A note that is one empty paragraph is an empty note: the text takes its place.
        const onlyEmpty = !options.suggest && top.length === 1 && !hasText(top[0].block) && !isContainer(top[0].block);
        if (onlyEmpty) root.delete(top[0].index, 1);
        insertBlocks(root, onlyEmpty ? 0 : root.length, blocks);
      } else {
        const found = locate(root, edit.after);
        if (!found) {
          problems.push(missing(edit.after));
          continue;
        }
        insertBlocks(found.parent, found.index + 1, blocks);
      }
      touched.push(...blocks.map((block) => block.id as string));
    }
  });
  return { touched, problems };
}

/**
 * Replaces everything the note says. As a suggestion, every block with text is
 * marked for removal and the new text follows it.
 */
export function replaceAll(doc: Y.Doc, text: string, options: EditOptions): EditResult {
  const root = rootOf(doc);
  const blocks = textToBlocks(text, options, blockIds(doc));
  if (!blocks.length) return { touched: [], problems: ["There was no text to write."] };
  doc.transact(() => {
    if (options.suggest) {
      for (const { block } of childElements(root)) {
        if (!hasText(block)) continue;
        block.setAttribute("suggestion", inlineData(options.suggest, "remove") as never);
        markRemoved(block, options.suggest);
      }
      insertBlocks(root, root.length, blocks.map((block) => suggestedBlock(block, options.suggest!)));
    } else {
      root.delete(0, root.length);
      insertBlocks(root, 0, blocks);
    }
  });
  return { touched: blocks.map((block) => block.id as string), problems: [] };
}

/**
 * Puts a document back to a saved value (a checkpoint being restored by "Undo
 * run"). Blocks the run didn't change are left alone, so comments anchored in
 * them keep their place; the rest are removed and the saved ones put back.
 */
export function restoreValue(doc: Y.Doc, value: DocNode[]) {
  const root = rootOf(doc);
  const target = value.length ? value : [{ type: "p", children: [{ text: "" }] }];
  doc.transact(() => {
    const delta = root.toDelta() as DeltaOp[];
    // Only a document of blocks can be restored block by block; anything else is rewritten whole.
    if (!delta.every((op) => op.insert instanceof Y.XmlText)) {
      root.delete(0, root.length);
      insertBlocks(root, 0, target);
      return;
    }
    const current = childElements(root);
    const kept = keptBlocks(
      current.map(({ block }) => yTextToSlateElement(block) as unknown as DocNode),
      target,
    );
    const stays = new Set(kept.values());
    for (let i = current.length - 1; i >= 0; i--) if (!stays.has(i)) root.delete(current[i].index, 1);
    // What is left is the kept blocks, in order, one position each: put the others in around them.
    target.forEach((block, t) => {
      if (!kept.has(t)) insertBlocks(root, t, [block]);
    });
  });
}

// ---- The agent's cursor ----------------------------------------------------------------------

/**
 * A caret at the end of a block, in the form slate-yjs keeps selections in
 * awareness, so open editors draw the agent's cursor where it last wrote.
 * Null when the block isn't in the document (or holds no text to stand in).
 */
export function cursorAt(doc: Y.Doc, blockId: string): { anchor: unknown; focus: unknown } | null {
  const root = rootOf(doc);
  const found = locate(root, blockId);
  if (!found) return null;
  try {
    const slateRoot = yTextToSlateElement(root);
    // The last leaf of the top-level block the edit is in.
    const path = [found.top];
    let node = slateRoot.children[found.top] as DocNode | undefined;
    while (node && Array.isArray(node.children) && node.children.length) {
      path.push(node.children.length - 1);
      node = node.children[node.children.length - 1];
    }
    if (!node || typeof node.text !== "string") return null;
    const position = slatePointToRelativePosition(root, slateRoot, { path, offset: node.text.length });
    const json = Y.relativePositionToJSON(position);
    return { anchor: json, focus: json };
  } catch {
    // The cursor is decoration: an edit never fails over it.
    return null;
  }
}
