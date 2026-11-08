// Everything Plotra derives from a document's content: words, headings, tags
// and links. Pure, so the editor (live stats) and the server (content sync from
// the collab server) compute exactly the same thing.

import type { CanonStatus, ClaimStatus, KnowledgeLayer, LinkKind, NodeHeading } from "@plotra/db/schema";
import { scriptHeading } from "./script";

export type DocNode = { type?: string; text?: string; children?: DocNode[]; [key: string]: unknown };

export const WIKILINK = "wikilink";
export const EMBED = "embed";
/** An inline citation of a research note (components/editor/citation.tsx). */
export const CITATION = "citation";

export type WikiLinkElement = {
  type: typeof WIKILINK;
  nodeId: string;
  heading?: string;
  alias?: string;
  children: [{ text: "" }];
};
export type EmbedElement = { type: typeof EMBED; nodeId: string; heading?: string; children: [{ text: "" }] };
export type CitationElement = { type: typeof CITATION; nodeId: string; locator?: string; children: [{ text: "" }] };

export type ExtractedLink = {
  targetNodeId: string;
  targetHeading: string | null;
  kind: Extract<LinkKind, "wiki" | "embed">;
  context: string;
};

/**
 * Tags a block can carry (plan.md 2.8): its own canon status, when and where
 * it's revealed, and a fact-check claim. They're properties of the block's
 * element in the document, so they travel with it through copies and versions.
 */
export type BlockTags = {
  canon?: CanonStatus;
  /** A release id, or "never". */
  reveal?: string;
  channel?: string;
  layer?: KnowledgeLayer;
  claim?: ClaimStatus;
  /** The research note that backs the claim. */
  claimSource?: string;
};

export const blockTagKeys = ["canon", "reveal", "channel", "layer", "claim", "claimSource"] as const;

/** The tags on a block, or null when it has none. */
export function blockTags(block: DocNode): BlockTags | null {
  let tags: BlockTags | null = null;
  for (const key of blockTagKeys) {
    const value = block[key];
    if (typeof value === "string" && value) (tags ??= {})[key] = value as never;
  }
  return tags;
}

export type ExtractedFact = BlockTags & { blockId: string; excerpt: string };

export type DocIndex = {
  text: string;
  words: number;
  characters: number;
  headings: NodeHeading[];
  tags: string[];
  links: ExtractedLink[];
  /** Blocks carrying canon, reveal or claim tags. */
  facts: ExtractedFact[];
};

// Link placeholders inside backlink contexts; the client swaps them for titles.
export const LINK_START = "";
export const LINK_END = "";

const headingLevels: Record<string, number> = { h1: 1, h2: 2, h3: 3 };
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
// #tag, #nested/tag. Must start after whitespace or a line start and not be only digits.
const TAG = /(?:^|[\s(])#([\p{L}_][\p{L}\p{N}_/-]*|\d+[\p{L}_][\p{L}\p{N}_/-]*)/gu;

export const MAX_LINKS = 500;
export const MAX_FACTS = 500;
const MAX_CONTEXT = 280;

export const countWords = (text: string) => text.match(WORD)?.length ?? 0;

export function normalizeTag(tag: string) {
  return tag
    .trim()
    .replace(/^#+/, "")
    .replace(/\/+$/, "")
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 80);
}

export function extractTags(text: string) {
  const tags = new Set<string>();
  for (const match of text.matchAll(TAG)) {
    const tag = normalizeTag(match[1]);
    if (tag) tags.add(tag);
  }
  return [...tags];
}

/** Plain text of a node; links become placeholders when `withLinks` is set. */
function inlineText(n: DocNode, withLinks: boolean): string {
  if (typeof n.text === "string") return n.text;
  if (n.type === WIKILINK) {
    if (!withLinks) return "";
    const el = n as unknown as WikiLinkElement;
    return `${LINK_START}${el.alias ? `${el.alias}|` : ""}${el.nodeId}${LINK_END}`;
  }
  // A citation's text is made from its source when shown; here it only marks where the source is cited.
  if (n.type === CITATION) return withLinks && typeof n.nodeId === "string" ? `${LINK_START}${n.nodeId}${LINK_END}` : "";
  return (n.children ?? []).map((c) => inlineText(c, withLinks)).join("");
}

function truncate(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > MAX_CONTEXT ? `${clean.slice(0, MAX_CONTEXT - 1)}…` : clean;
}

// Slate keeps a text leaf in every block that holds inline content, so a block
// whose children are all elements (table, row, callout…) contains blocks.
const isBlockContainer = (n: DocNode) =>
  Array.isArray(n.children) && n.children.length > 0 && n.children.every((c) => typeof c.text !== "string");

export function indexDocument(value: DocNode[]): DocIndex {
  const lines: string[] = [];
  const headings: NodeHeading[] = [];
  const links: ExtractedLink[] = [];
  const facts: ExtractedFact[] = [];
  const comic = { page: 0, panel: 0 };

  const visitInlines = (n: DocNode, context: () => string) => {
    if (n.type === WIKILINK && links.length < MAX_LINKS) {
      const el = n as unknown as WikiLinkElement;
      if (el.nodeId) links.push({ targetNodeId: el.nodeId, targetHeading: el.heading || null, kind: "wiki", context: context() });
    }
    // A citation links to its source, so the source's backlinks list where it's cited.
    if (n.type === CITATION && typeof n.nodeId === "string" && n.nodeId && links.length < MAX_LINKS) {
      links.push({ targetNodeId: n.nodeId, targetHeading: null, kind: "wiki", context: context() });
    }
    for (const child of n.children ?? []) visitInlines(child, context);
  };

  const visitBlock = (block: DocNode) => {
    if (block.type === EMBED) {
      const el = block as unknown as EmbedElement;
      if (el.nodeId && links.length < MAX_LINKS) {
        links.push({ targetNodeId: el.nodeId, targetHeading: el.heading || null, kind: "embed", context: "" });
      }
      return;
    }
    // Tables, lists of blocks and other containers: index their blocks one by one.
    if (isBlockContainer(block)) {
      for (const child of block.children ?? []) visitBlock(child);
      return;
    }
    const text = inlineText(block, false);
    lines.push(text);
    const tags = blockTags(block);
    if (tags && typeof block.id === "string" && facts.length < MAX_FACTS) {
      facts.push({ ...tags, blockId: block.id, excerpt: truncate(text) });
    }
    const level = block.type ? headingLevels[block.type] : undefined;
    if (level && text.trim()) {
      headings.push({ id: String(block.id ?? `h${headings.length}`), level, text: text.trim() });
    }
    // Scene and act headings, comic pages and panels head a script the way h1–h3 head prose.
    const heading = scriptHeading(block, text, comic);
    if (heading) headings.push({ id: String(block.id ?? `h${headings.length}`), ...heading });
    let context: string | undefined;
    visitInlines(block, () => (context ??= truncate(inlineText(block, true))));
  };

  for (const block of value) visitBlock(block);

  const text = lines.join("\n");
  return {
    text,
    words: countWords(text),
    characters: text.replace(/\n/g, "").length,
    headings,
    tags: extractTags(text),
    links,
    facts,
  };
}

/** Splits a backlink context into text and link pieces for rendering. */
export function parseContext(context: string) {
  const parts: Array<{ text: string } | { nodeId: string; alias?: string }> = [];
  const re = new RegExp(`${LINK_START}(?:([^${LINK_END}|]*)\\|)?([^${LINK_END}]*)${LINK_END}`, "g");
  let last = 0;
  for (const match of context.matchAll(re)) {
    if (match.index > last) parts.push({ text: context.slice(last, match.index) });
    parts.push({ nodeId: match[2], alias: match[1] || undefined });
    last = match.index + match[0].length;
  }
  if (last < context.length) parts.push({ text: context.slice(last) });
  return parts;
}

export function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches a whole-word, case-insensitive mention of any of the names. */
export function mentionPattern(names: string[]) {
  const usable = names.map((n) => n.trim()).filter((n) => n.length >= 2);
  if (!usable.length) return null;
  const alternation = usable
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  return new RegExp(`(?<![\\p{L}\\p{N}])(${alternation})(?![\\p{L}\\p{N}])`, "giu");
}

/**
 * Which blocks of `current` can stay as they are when the document becomes
 * `target`: the same id and the same content, in the same order. Maps a
 * target block's position to the current block's. Greedy, so a block moved
 * earlier is replaced rather than kept; that only costs a reinsert.
 */
export function keptBlocks(current: DocNode[], target: DocNode[]): Map<number, number> {
  const byId = new Map<string, number>();
  current.forEach((block, i) => typeof block.id === "string" && !byId.has(block.id) && byId.set(block.id, i));
  const kept = new Map<number, number>();
  let last = -1;
  target.forEach((block, t) => {
    const c = typeof block.id === "string" ? byId.get(block.id) : undefined;
    if (c !== undefined && c > last && JSON.stringify(current[c]) === JSON.stringify(block)) {
      kept.set(t, c);
      last = c;
    }
  });
  return kept;
}
