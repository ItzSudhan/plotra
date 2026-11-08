// What an import creates in the binder (plan.md 2.7): files already read into
// Plate values, cut into folders, chapters, scenes and notes. Pure, so the
// preview in the import dialog and the import itself can't disagree.

import type { DocNode } from "../doc-index";
import { CITATION, countWords, EMBED, normalizeTag, WIKILINK } from "../doc-index";
import { plainText } from "../script";
import type { RawProperty } from "./properties";
import { PENDING_PICTURE } from "./vault-pictures";

export type ImportedFile = {
  /** The file's name, without its extension. */
  name: string;
  /** The folders it sat in, outermost first, when a whole folder (an Obsidian vault) was brought in. */
  folder?: string[];
  /** From front matter, when the file has it. */
  title?: string;
  tags: string[];
  /** Front matter's `aliases`. */
  aliases?: string[];
  /** Front matter's `order`: where the note sat among its siblings when it was exported. */
  order?: number;
  /** Front matter's other fields: the note's properties, typed on import (./properties.ts). */
  properties?: Record<string, RawProperty>;
  value: DocNode[];
};

export type ImportOptions = {
  /** `file`: one note per file. `headings`: `#` starts a chapter, `##` a scene. */
  split: "file" | "headings";
  /** Also start a new scene at every scene break (`***`, a rule). */
  breaks: boolean;
  /** What a file (or a piece with no heading of its own) becomes. */
  kind: "scene" | "note";
  /** `keep`: a new line in a Markdown paragraph stays a new line, as Obsidian shows it. */
  lines: "wrap" | "keep";
};

/** Characters and places come from a Scrivener project's folders of them (./scrivener.ts). */
export type OutlineKind = "folder" | "chapter" | "scene" | "note" | "character" | "location";

export type OutlineEntry = {
  /** Index of the entry this one goes inside; null for the place the import was started from. */
  parent: number | null;
  kind: OutlineKind;
  title: string;
  tags: string[];
  /** The note's text; empty for a folder or a chapter with none of its own. */
  value: DocNode[];
  aliases?: string[];
  /** Where the file was (`Places/Verona`, no extension), on the entry that stands for it: what a link by path means. */
  path?: string;
  /** What happens in it, in a line or two: a Scrivener document's index card. */
  synopsis?: string;
  /** Plot grid cells: the import's threads (by index) this scene is in, and what happens to each. */
  threads?: Array<{ thread: number; note: string }>;
  /** The file's front matter fields, on the entry that stands for it (./properties.ts). */
  properties?: Record<string, RawProperty>;
};

/** A plot thread an import brings (a Plottr plotline). One of the same name already in the project is used instead. */
export type ImportThread = { name: string; color?: string };

export const MAX_TITLE = 200;

const cleanTitle = (text: string, fallback = "Untitled") => text.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) || fallback;

// Things that are something even with no text of their own.
const solid = new Set<string | undefined>(["img", "table", EMBED, WIKILINK, CITATION]);
const hasContent = (b: DocNode): boolean =>
  typeof b.text === "string" ? b.text.trim().length > 0 : solid.has(b.type) || (b.children ?? []).some(hasContent);

/** Drops the empty paragraphs at either end of a piece. */
function trimBlocks(blocks: DocNode[]): DocNode[] {
  let start = 0;
  let end = blocks.length;
  while (start < end && !hasContent(blocks[start]) && blocks[start].type !== "hr") start++;
  while (end > start && !hasContent(blocks[end - 1]) && blocks[end - 1].type !== "hr") end--;
  return blocks.slice(start, end);
}

/** The pieces between scene breaks; a rule at the very start or end separates nothing. */
export function splitAtBreaks(blocks: DocNode[]): DocNode[][] {
  const parts: DocNode[][] = [[]];
  for (const b of blocks) {
    if (b.type === "hr") parts.push([]);
    else parts.at(-1)!.push(b);
  }
  return parts.map(trimBlocks).filter((part) => part.some(hasContent));
}

type Piece = { level: 0 | 1 | 2; title: string; blocks: DocNode[] };

/** A document cut at its `#` and `##` headings. The first piece (level 0) is what comes before any heading. */
export function splitAtHeadings(value: DocNode[]): Piece[] {
  const pieces: Piece[] = [{ level: 0, title: "", blocks: [] }];
  for (const b of value) {
    if (b.type === "h1" || b.type === "h2") pieces.push({ level: b.type === "h1" ? 1 : 2, title: plainText(b), blocks: [] });
    else pieces.at(-1)!.blocks.push(b);
  }
  return pieces.map((piece) => ({ ...piece, blocks: trimBlocks(piece.blocks) }));
}

/** Files in the order they were exported in, or else by name the way a person would sort them. */
export function sortFiles<T extends { name: string; order?: number }>(files: T[]): T[] {
  const ordered = files.every((f) => f.order !== undefined);
  return [...files].sort((a, b) => (ordered && a.order !== b.order ? a.order! - b.order! : collator.compare(a.name, b.name)));
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

type Tree = { folders: Map<string, Tree>; files: ImportedFile[] };

/** The binder entries an import makes, parents before their children. */
export function buildOutline(files: ImportedFile[], options: ImportOptions): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  const add = (entry: OutlineEntry) => out.push(entry) - 1;

  /** One piece of text: a single note, or (with scene breaks) a chapter holding its scenes. `whole`: it is a file of its own. */
  const leaf = (parent: number | null, title: string, blocks: DocNode[], kind: OutlineKind, tags: string[], whole = false) => {
    const parts = options.breaks ? splitAtBreaks(blocks) : [];
    if (parts.length < 2) return add({ parent, kind, title, tags, value: trimBlocks(blocks) });
    // Scenes split out of a scene sit beside each other; anything else becomes a chapter of scenes.
    if (kind === "scene" && !whole) {
      parts.forEach((part, i) => add({ parent, kind: "scene", title: i ? cleanTitle(`${title} (${i + 1})`) : title, tags, value: part }));
      return out.length - 1;
    }
    const chapter = add({ parent, kind: "chapter", title, tags, value: [] });
    parts.forEach((part, i) => add({ parent: chapter, kind: "scene", title: `Scene ${i + 1}`, tags: [], value: part }));
    return chapter;
  };

  const addFile = (file: ImportedFile, parent: number | null, trail: string[]) => {
    const title = cleanTitle(file.title || file.name, "Imported");
    const tags = [...new Set(file.tags.map(normalizeTag).filter(Boolean))].slice(0, 50);
    const aliases = [...new Set((file.aliases ?? []).map((alias) => cleanTitle(alias, "")).filter((alias) => alias && alias !== title))].slice(0, 20);
    // The entry links to this file land on: the note it becomes, or its one chapter.
    const properties = file.properties && Object.keys(file.properties).length ? file.properties : undefined;
    const stands = (at: number) => Object.assign(out[at], { path: [...trail, file.name].join("/"), ...(aliases.length && { aliases }), ...(properties && { properties }) });
    const pieces = options.split === "headings" ? splitAtHeadings(file.value) : [];
    const headed = pieces.filter((piece) => piece.level > 0);
    if (!headed.length) return void stands(leaf(parent, title, file.value, options.kind, tags, true));

    const preface = pieces[0].blocks.some(hasContent) ? pieces[0] : null;
    const chapters = headed.filter((piece) => piece.level === 1).length;
    const looseScenes = headed.findIndex((piece) => piece.level === 1);
    // A file that is one chapter and nothing else doesn't need a folder around it.
    const wrap = Boolean(preface) || chapters !== 1 || looseScenes !== 0;
    const folder = wrap ? add({ parent, kind: "folder", title, tags, value: [] }) : parent;
    if (preface) leaf(folder, title, preface.blocks, options.kind, []);

    let chapter: number | null = null;
    for (const piece of headed) {
      const name = cleanTitle(piece.title);
      if (piece.level === 2) {
        leaf(chapter ?? folder, name, piece.blocks, "scene", []);
        continue;
      }
      const parts = options.breaks ? splitAtBreaks(piece.blocks) : [];
      // Text right under a chapter heading is the chapter's own, unless scene breaks cut it up.
      chapter = add({ parent: folder, kind: "chapter", title: name, tags: wrap ? [] : tags, value: parts.length > 1 ? [] : piece.blocks });
      if (!wrap) stands(chapter);
      if (parts.length > 1) parts.forEach((part, i) => add({ parent: chapter, kind: "scene", title: `Scene ${i + 1}`, tags: [], value: part }));
    }
  };

  // Files that came in folders keep them: a folder's own folders first, then its notes, as a vault lists them.
  const root: Tree = { folders: new Map(), files: [] };
  for (const file of files) {
    let at = root;
    for (const name of file.folder ?? []) {
      if (!at.folders.has(name)) at.folders.set(name, { folders: new Map(), files: [] });
      at = at.folders.get(name)!;
    }
    at.files.push(file);
  }
  const walk = (tree: Tree, parent: number | null, trail: string[]) => {
    for (const name of [...tree.folders.keys()].sort(collator.compare)) {
      walk(tree.folders.get(name)!, add({ parent, kind: "folder", title: cleanTitle(name, "Folder"), tags: [], value: [] }), [...trail, name]);
    }
    for (const file of sortFiles(tree.files)) addFile(file, parent, trail);
  };
  walk(root, null, []);
  return out;
}

const linkKey = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * What a `[[link]]` in an import points at. Notes of the import come first,
 * by title, then by file name, then by alias; after them the notes the
 * project already has (`existing`: a name and its note's id, titles before
 * aliases). A link may also name a path, in full or from any folder down
 * (`[[Places/Verona]]`), which is how Obsidian tells two notes of one name apart.
 */
export function linkFinder(outline: OutlineEntry[], ids: string[], existing: Array<[name: string, id: string]> = []): (title: string) => string | undefined {
  const byName = new Map<string, string>();
  const byPath = new Map<string, string>();
  const name = (text: string | undefined, id: string) => {
    const key = linkKey(text ?? "");
    if (key && !byName.has(key)) byName.set(key, id);
  };
  const notes = outline.map((entry, i) => [entry, ids[i]] as const).filter(([entry]) => entry.kind !== "folder");
  for (const [entry, id] of notes) name(entry.title, id);
  for (const [entry, id] of notes) {
    if (!entry.path) continue;
    name(entry.path.split("/").at(-1), id);
    if (!byPath.has(linkKey(entry.path))) byPath.set(linkKey(entry.path), id);
  }
  for (const [entry, id] of notes) for (const alias of entry.aliases ?? []) name(alias, id);
  for (const [text, id] of existing) name(text, id);

  return (title) => {
    const key = linkKey(title.replace(/\.(?:md|markdown)$/i, "").replace(/^\/+/, ""));
    const found = byName.get(key);
    if (found || !key.includes("/")) return found;
    for (const [path, id] of byPath) if (path === key || path.endsWith(`/${key}`)) return id;
    return byName.get(key.split("/").at(-1)!);
  };
}

export type OutlineSummary = { folders: number; chapters: number; scenes: number; notes: number; words: number };

/** What the import dialog shows before anything is created: N chapters, M scenes. */
export function summarize(outline: OutlineEntry[]): OutlineSummary {
  const summary: OutlineSummary = { folders: 0, chapters: 0, scenes: 0, notes: 0, words: 0 };
  for (const entry of outline) {
    summary[entry.kind === "folder" ? "folders" : entry.kind === "chapter" ? "chapters" : entry.kind === "scene" ? "scenes" : "notes"]++;
    for (const block of entry.value) summary.words += countWords(plainText(block));
  }
  return summary;
}

/** How many vault pictures the outline's notes show, and how many front matter fields become properties. */
export function extras(outline: OutlineEntry[]): { pictures: number; properties: number } {
  const pictures = new Set<string>();
  const walk = (nodes: DocNode[]) => {
    for (const n of nodes) {
      if (n.type === "img" && typeof n.url === "string" && n.url.startsWith(PENDING_PICTURE)) pictures.add(n.url);
      if (n.children) walk(n.children);
    }
  };
  const fields = new Set<string>();
  for (const entry of outline) {
    walk(entry.value);
    for (const key of Object.keys(entry.properties ?? {})) fields.add(`${entry.kind}:${key.toLowerCase()}`);
  }
  return { pictures: pictures.size, properties: fields.size };
}

/** What POST /api/import answers with `preview=1`. */
export type ImportPreview = {
  summary: OutlineSummary;
  /** In a Scrivener project, binder items that aren't text (PDFs, pictures, web pages): left out. */
  leftOut?: number;
  /** "scrivener", "plottr" or "worldanvil" when the upload is a project from another app; the split options don't apply to it. */
  format?: string;
  /** Plot threads the import adds (a Plottr file's plotlines). */
  threads?: number;
  /** Pictures of the vault the notes show, to be uploaded with them (./vault-pictures.ts). */
  pictures?: number;
  /** Front matter fields that become properties (./properties.ts). */
  properties?: number;
  /** The first entries, enough to show the shape of what's coming. */
  entries: Array<Pick<OutlineEntry, "parent" | "kind" | "title">>;
};
