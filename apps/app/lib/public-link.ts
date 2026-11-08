// The read-only link (plan.md 2.9): the parts that need no database. Pure, so
// the Share dialog, the sign-in pages and the public reader (lib/public-read.ts)
// agree on what a token looks like, what is in the trash and where a link goes.

import type { NodeKind } from "@plotra/db/schema";
import { CITATION, EMBED, WIKILINK, type DocNode } from "./doc-index";
import { SCRIPT_NOTE } from "./script";

// ---- Tokens ---------------------------------------------------------------------

/** 32 random bytes: 256 bits, far past anything that can be guessed or searched. */
const TOKEN_BYTES = 32;
/** 32 bytes in base64url, without padding. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** A new link token: unguessable, and safe in a URL as it is. */
export function newShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Whether a string from a URL has the shape of a token. Anything else is never looked up. */
export const isShareToken = (value: unknown): value is string => typeof value === "string" && TOKEN.test(value);

/** Node ids are UUIDs; this only keeps junk from a URL out of a query. */
export const isNodeId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);

/** Where the public reader shows a project, or one of its notes. */
export const publicPath = (token: string, nodeId?: string) => (nodeId ? `/p/${token}/n/${nodeId}` : `/p/${token}`);

/** Where the public reader serves an image that is in a note. */
export const publicFilePath = (token: string, fileId: string) => `/p/${token}/f/${fileId}`;

// ---- The binder, without the trash ------------------------------------------------

export type PublicRow = {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
  position: string;
  entityTypeId: string | null;
  deletedAt: Date | string | null;
};

export type PublicTreeNode = { id: string; kind: NodeKind; title: string; children: PublicTreeNode[] };

// ---- An audience ---------------------------------------------------------------------
// A link can show the project as of a release (the spoiler horizon,
// lib/horizon.ts) and only what's canon (beat-the-competitors.md, 12).

export type Audience = {
  /** Whether the audience knows this note at all: its page has its text. */
  knows: (row: { id: string; canon?: string | null }) => boolean;
  /** Whether a passage with these tags is theirs to read, inside a note they know. */
  showBlock: (tags: { canon?: string | null; reveal?: string | null } | null) => boolean;
};

/** Everything, as a link without a horizon shows it. */
export const everyone: Audience = { knows: () => true, showBlock: () => true };

/**
 * The audience of a link that shows the project `asOf` a release (`horizon`
 * from computeHorizon) and maybe only canon. A passage tagged "never" is never
 * theirs. `never` is the tag's value (lib/world.ts `NEVER`).
 */
export function audienceOf(
  horizon: { knows: (id: string) => boolean; knowsBlock: (reveal: string | null | undefined) => boolean } | null,
  canonOnly: boolean,
  never: string,
): Audience {
  return {
    knows: (row) => (!horizon || horizon.knows(row.id)) && (!canonOnly || row.canon === "canon"),
    showBlock: (tags) => {
      if (!tags) return true;
      if (canonOnly && tags.canon && tags.canon !== "canon") return false;
      if (tags.reveal === never) return false;
      return horizon ? horizon.knowsBlock(tags.reveal) : true;
    },
  };
}

/** The rows a link's binder shows: what the audience knows, and the folders and notes holding it. */
export function audienceRows<T extends PublicRow & { canon?: string | null }>(rows: T[], audience: Audience): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const shown = new Set<string>();
  for (const row of rows) {
    if (!audience.knows(row)) continue;
    for (let cursor: T | undefined = row, depth = 0; cursor && depth < 200 && !shown.has(cursor.id); depth++) {
      shown.add(cursor.id);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
  }
  return rows.filter((r) => shown.has(r.id));
}

/** Boards aren't documents: the reader shows a placeholder for them. */
export const boardKinds: readonly NodeKind[] = ["canvas", "timeline", "dialogue"];

// Fractional-index keys sort by code unit (lib/tree.ts), never by locale.
const byPosition = (a: PublicRow, b: PublicRow) => (a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : 1);

/**
 * The rows a reader may see: not in the trash, and not under anything that is.
 * A row whose parent isn't among the rows is left out too, so nothing can show
 * up detached from where a member would find it.
 */
export function liveRows<T extends PublicRow>(rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const verdict = new Map<string, boolean>();
  const live = (id: string, depth = 0): boolean => {
    const known = verdict.get(id);
    if (known !== undefined) return known;
    const row = byId.get(id);
    // The depth guard only matters for a corrupt tree with a cycle.
    const ok = !!row && !row.deletedAt && depth < 200 && (row.parentId === null || live(row.parentId, depth + 1));
    verdict.set(id, ok);
    return ok;
  };
  return rows.filter((r) => live(r.id));
}

/** The binder as a tree, in binder order. Pass rows that are already live. */
export function buildTree(rows: PublicRow[]): PublicTreeNode[] {
  const children = new Map<string | null, PublicRow[]>();
  for (const row of rows) {
    const list = children.get(row.parentId);
    if (list) list.push(row);
    else children.set(row.parentId, [row]);
  }
  const build = (parentId: string | null, depth: number): PublicTreeNode[] =>
    depth > 200
      ? []
      : (children.get(parentId) ?? [])
          .sort(byPosition)
          .map((row) => ({ id: row.id, kind: row.kind, title: row.title, children: build(row.id, depth + 1) }));
  return build(null, 0);
}

/** The first thing to read: the first note in binder order that isn't a folder or a board. */
export function firstDocument(tree: PublicTreeNode[]): PublicTreeNode | null {
  for (const n of tree) {
    if (n.kind !== "folder" && !boardKinds.includes(n.kind)) return n;
    const inside = firstDocument(n.children);
    if (inside) return inside;
  }
  return null;
}

/** Everything there is to read, in binder order: the notes that aren't folders or boards. */
export function readingOrder(tree: PublicTreeNode[]): PublicTreeNode[] {
  const out: PublicTreeNode[] = [];
  const walk = (nodes: PublicTreeNode[]) => {
    for (const n of nodes) {
      if (n.kind !== "folder" && !boardKinds.includes(n.kind)) out.push(n);
      walk(n.children);
    }
  };
  walk(tree);
  return out;
}

/**
 * Where the public reader's links to Plotra itself point, tagged so sign-ups
 * that came from a reader can be counted (gtm-plan.md, the Publish loop).
 */
export function fromReader(href: string, campaign: "made-with-plotra" | "sign-up" | "the-end"): string {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("utm_source", "plotra");
  params.set("utm_medium", "public-reader");
  params.set("utm_campaign", campaign);
  return `${path}?${params}`;
}

// ---- Documents --------------------------------------------------------------------

export type PrepareContext = {
  /** Where a link to this note goes and what it's called; null when the reader can't see the note. */
  linkFor: (nodeId: string) => { href: string; title: string } | null;
  /** The in-text form of a citation, as text leaves; null when the source can't be seen. */
  cite?: (nodeId: string, locator?: string) => DocNode[] | null;
  /** The public address of a file stored in the project (an image in a note). */
  fileHref?: (fileId: string) => string | null;
};

// Only what the static renderer draws. Everything else on an element or a leaf
// (block ids, comment and suggestion marks, canon and reveal tags, claims)
// stays on the server.
const leafMarks = ["bold", "italic", "underline", "strikethrough", "code", "highlight", SCRIPT_NOTE] as const;
const blockProps = ["indent", "listStyleType", "listStart", "checked", "align"] as const;

const FILE = /^\/api\/files\/([A-Za-z0-9_-]+)(?:\?.*)?$/;
const safeLink = (url: unknown) => (typeof url === "string" && /^(https?:\/\/|mailto:)/i.test(url.trim()) ? url.trim() : null);
const safeImage = (url: unknown) => (typeof url === "string" && /^https?:\/\//i.test(url.trim()) ? url.trim() : null);

const text = (value: string): DocNode => ({ text: value });
const anchor = (url: string, label: string): DocNode => ({ type: "a", url, children: [text(label)] });

/**
 * A stored document made ready for a reader without an account: links between
 * notes point into the public reader (or become plain text when their target
 * is in the trash or in another project), citations are written out, images
 * stored in the project are served from the public reader, links that aren't
 * web or mail addresses lose their target, and nothing the renderer doesn't
 * draw is passed on.
 */
export function prepareValue(value: DocNode[], ctx: PrepareContext): DocNode[] {
  const visit = (n: DocNode): DocNode[] => {
    if (typeof n.text === "string") {
      const leaf: DocNode = { text: n.text };
      for (const mark of leafMarks) if (n[mark]) leaf[mark] = true;
      return [leaf];
    }
    const children = () => {
      const out = (n.children ?? []).flatMap(visit);
      return out.length ? out : [text("")];
    };

    if (n.type === WIKILINK) {
      const target = typeof n.nodeId === "string" ? ctx.linkFor(n.nodeId) : null;
      const alias = typeof n.alias === "string" && n.alias ? n.alias : null;
      return [target ? anchor(target.href, alias ?? target.title) : text(alias ?? "Missing note")];
    }
    if (n.type === CITATION) {
      const leaves = typeof n.nodeId === "string" ? ctx.cite?.(n.nodeId, typeof n.locator === "string" ? n.locator : undefined) : null;
      return leaves?.length ? leaves : [text("(source unavailable)")];
    }
    if (n.type === EMBED) {
      const target = typeof n.nodeId === "string" ? ctx.linkFor(n.nodeId) : null;
      return target ? [{ type: "p", children: [text("Embedded: "), anchor(target.href, target.title)] }] : [];
    }
    if (n.type === "a") {
      const url = safeLink(n.url);
      return url ? [{ type: "a", url, children: children() }] : children();
    }
    if (n.type === "img") {
      const file = typeof n.url === "string" ? FILE.exec(n.url.trim())?.[1] : undefined;
      const url = file ? (ctx.fileHref?.(file) ?? null) : safeImage(n.url);
      return url ? [{ type: "img", url, alt: typeof n.alt === "string" ? n.alt : "", children: [text("")] }] : [];
    }

    const out: DocNode = { children: children() };
    if (typeof n.type === "string") out.type = n.type;
    for (const key of blockProps) {
      const v = n[key];
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[key] = v;
    }
    return [out];
  };
  return value.flatMap(visit);
}

/** Whether a prepared document has anything in it to show. */
export function hasContent(value: DocNode[]): boolean {
  const some = (n: DocNode): boolean =>
    typeof n.text === "string" ? n.text.trim() !== "" : n.type === "img" || n.type === "hr" || (n.children ?? []).some(some);
  return value.some(some);
}

/** Whether a stored document cites anything, so the sources are only loaded when it does. */
export function hasCitations(value: DocNode[]): boolean {
  const some = (n: DocNode): boolean => n.type === CITATION || (n.children ?? []).some(some);
  return value.some(some);
}

/** A prepared document as plain text, one line per block, for a link card's excerpt and word count. */
export function plainText(value: DocNode[]): string {
  const inline = (n: DocNode): string => (typeof n.text === "string" ? n.text : (n.children ?? []).map(inline).join(""));
  const blocks: string[] = [];
  const visit = (n: DocNode) => {
    if (typeof n.text === "string" || n.type === "img") return;
    const kids = n.children ?? [];
    // A block of blocks (a list, a quote of paragraphs) is read one block at a time.
    if (kids.some((k) => typeof k.text !== "string" && k.type !== "a")) kids.forEach(visit);
    else {
      const line = inline(n).replace(/\s+/g, " ").trim();
      if (line) blocks.push(line);
    }
  };
  value.forEach(visit);
  return blocks.join("\n");
}

/** The first lines of a document, cut at a word near `max` characters. */
export function excerpt(text: string, max = 220): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  // Up to the last whole word: the space after it may be the first character cut off.
  const cut = flat.slice(0, max + 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 30)).replace(/[\s,.;:!?—–-]+$/, "")}…`;
}
