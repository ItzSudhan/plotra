// A Plottr file in (beat-the-competitors.md, step 3). A `.pltr` is JSON:
// books, a tree of beats (acts and chapters), cards placed on a beat and a
// plotline, characters, places, notes and tags, with rich text in Slate's JSON.
//
// - Each beat is a chapter, or a folder when it holds beats of its own; a
//   book of a series is a folder of its own.
// - Each card is a scene in its beat's chapter. Its description is the
//   scene's synopsis (Plottr's cards are the outline, so the scene's page is
//   left for the draft), or its text when longer than a synopsis holds.
// - Each plotline is a plot thread, and a card's scene has a cell in its
//   plotline's column, holding the card's description: the plot grid looks as
//   Plottr's timeline did, turned on its side.
// - Characters, places and notes are pages in folders of their own, with
//   their custom attributes as lines at the top. Tags and character
//   categories become tags. A card's characters and places are linked at the
//   foot of its scene, so each page collects the scenes it's in.
// - Left out: pictures, templates, and the series-level timeline.
//
// Files from 2020 on keep beats as a tree per book; older ones as a list
// (`beats`, or `chapters` before that). All are read. Pure.

import { normalizeTag, WIKILINK, type DocNode } from "../doc-index";
import { MAX_TITLE, type ImportThread, type OutlineEntry } from "./outline";

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.filter((v): v is Json => Boolean(v) && typeof v === "object") : []);
const str = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
const key = (value: unknown) => (value === null || value === undefined ? "" : String(value));
/** A tag from a name: "STAGE: Exposition" is `stage-exposition`. */
export const tagFrom = (name: string) => normalizeTag(name.replace(/[^\p{L}\p{N}\s/_-]+/gu, " ").replace(/\s+/g, " "));
const cleanTitle = (title: string, fallback: string) => title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) || fallback;

// ---- Slate's rich text ----------------------------------------------------------------------

const blockTypes: Record<string, string> = { "heading-one": "h1", "heading-two": "h2", "heading-three": "h3", "block-quote": "blockquote", paragraph: "p" };

function inline(nodes: unknown): DocNode[] {
  const out: DocNode[] = [];
  for (const node of list(nodes)) {
    if (typeof node.text === "string") {
      out.push({
        text: node.text,
        ...(node.bold === true && { bold: true }),
        ...(node.italic === true && { italic: true }),
        ...(node.underline === true && { underline: true }),
        ...((node.strike === true || node.strikethrough === true) && { strikethrough: true }),
      });
    } else if (node.type === "link" && typeof node.url === "string" && /^https?:\/\//i.test(node.url)) {
      const children = inline(node.children);
      if (children.some((c) => c.text)) out.push({ type: "a", url: node.url, children });
    } else out.push(...inline(node.children));
  }
  return out;
}

const hasText = (nodes: DocNode[]): boolean => nodes.some((n) => (typeof n.text === "string" ? n.text.trim() : hasText(n.children ?? [])));

/** Plottr's rich text (Slate's JSON, or a plain string in old files) as Plate blocks. */
export function slateToValue(value: unknown): DocNode[] {
  if (typeof value === "string") return value.split(/\n\s*\n|\r\n\s*\r\n/).map((text) => text.trim()).filter(Boolean).map((text) => ({ type: "p", children: [{ text }] }));
  const out: DocNode[] = [];
  const blocks = (nodes: unknown, depth = 0, style?: string) => {
    for (const node of list(nodes)) {
      const type = str(node.type);
      if (type === "bulleted-list" || type === "numbered-list") {
        blocks(node.children, depth + 1, type === "numbered-list" ? "decimal" : "disc");
        continue;
      }
      if (type === "image-link" || type === "image-data") continue;
      const children = inline(node.children);
      if (!hasText(children)) continue;
      if (type === "list-item" && style) out.push({ type: "p", indent: depth, listStyleType: style, children });
      else out.push({ type: blockTypes[type] ?? "p", children });
    }
  };
  blocks(value);
  return out;
}

const plain = (blocks: DocNode[]) => blocks.map((b) => (b.children ?? []).map((c) => (typeof c.text === "string" ? c.text : (c.children ?? []).map((x) => x.text ?? "").join(""))).join("")).join("\n\n");

/** A paragraph linking to notes by title, like "Characters: [[Hamlet]], [[Horatio]]". Links resolve when the import is written. */
export function linksParagraph(label: string, titles: string[]): DocNode | null {
  const unique = [...new Set(titles.filter(Boolean))];
  if (!unique.length) return null;
  const children: DocNode[] = [{ text: `${label}: ` }];
  unique.forEach((title, i) => {
    children.push({ type: WIKILINK, nodeId: "", title, children: [{ text: "" }] });
    children.push({ text: i < unique.length - 1 ? ", " : "" });
  });
  return { type: "p", children };
}

/** A line of a custom attribute: the name in bold, then its value. */
const attributeLine = (name: string, value: unknown): DocNode[] => {
  const blocks = typeof value === "string" ? (value.trim() ? [{ type: "p", children: [{ text: value.trim() }] }] : []) : slateToValue(value);
  if (!blocks.length) return [];
  const [first, ...rest] = blocks;
  return [{ ...first, type: "p", children: [{ text: `${name}: `, bold: true }, ...(first.children ?? [])] }, ...rest];
};

// ---- The file ---------------------------------------------------------------------------------

export type PlottrPlan = { outline: OutlineEntry[]; threads: ImportThread[] };

const SYNOPSIS_MAX = 2000;
const CELL_MAX = 4000;
const PLOTTR_COLOR = /^#[0-9a-f]{6}$/i;

/** True for what reads as a Plottr file: JSON with books and cards. */
export function isPlottr(text: string): boolean {
  try {
    const data = obj(JSON.parse(text));
    return "cards" in data && ("books" in data || "beats" in data || "chapters" in data);
  } catch {
    return false;
  }
}

export function planPlottr(text: string, fileName: string): PlottrPlan {
  let data: Json;
  try {
    data = obj(JSON.parse(text));
  } catch {
    throw new Error(`“${fileName}” isn't a Plottr file Plotra can read.`);
  }
  if (!Array.isArray(data.cards)) throw new Error(`“${fileName}” isn't a Plottr file Plotra can read.`);

  const outline: OutlineEntry[] = [];
  const threads: ImportThread[] = [];
  const push = (entry: OutlineEntry) => (outline.push(entry), outline.length - 1);

  const books = obj(data.books);
  const bookIds = (Array.isArray(books.allIds) ? books.allIds : Object.keys(books).filter((k) => k !== "allIds")).map(key);
  const tagNames = new Map(list(data.tags).map((t) => [key(t.id), str(t.title)]));
  const characters = list(data.characters);
  const places = list(data.places);
  const characterNames = new Map(characters.map((c) => [key(c.id), cleanTitle(str(c.name), "Unnamed character")]));
  const placeNames = new Map(places.map((p) => [key(p.id), cleanTitle(str(p.name), "Unnamed place")]));
  const tagsOf = (ids: unknown) => [...new Set(list(Array.isArray(ids) ? ids.map((id) => ({ id })) : []).map((t) => tagFrom(tagNames.get(key(t.id)) ?? "")).filter(Boolean))];

  // Plotlines, in their order, as threads; a card's line says which.
  const lines = list(data.lines).sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
  const threadOf = new Map<string, number>();
  for (const line of lines) {
    if (key(line.bookId) === "series") continue;
    const name = cleanTitle(str(line.title), "Plotline");
    // Books of a series often repeat their plotlines; one thread each.
    let at = threads.findIndex((t) => t.name === name);
    if (at < 0) at = threads.push({ name, ...(PLOTTR_COLOR.test(str(line.color)) && { color: str(line.color).toLowerCase() }) }) - 1;
    threadOf.set(key(line.id), at);
  }
  const lineBook = new Map(lines.map((l) => [key(l.id), key(l.bookId)]));

  type Beat = { id: string; title: string; position: number; children: Beat[] };
  /** A book's beats as a tree, whichever way the file keeps them. */
  const beatsOf = (book: string): Beat[] => {
    const beats = data.beats;
    const tree = obj(obj(beats)[book]);
    if (tree.index && tree.children) {
      const index = obj(tree.index);
      const children = obj(tree.children);
      const build = (parent: string): Beat[] =>
        (Array.isArray(children[parent]) ? (children[parent] as unknown[]) : [])
          .map((id) => obj(index[key(id)]))
          .filter((b) => b.id !== undefined)
          .map((b) => ({ id: key(b.id), title: str(b.title), position: Number(b.position ?? 0), children: build(key(b.id)) }))
          .sort((a, b) => a.position - b.position);
      return build("null");
    }
    // Older files: a flat list, filtered by book.
    const flat = list(Array.isArray(beats) ? beats : data.chapters).filter((b) => key(b.bookId) === book || (bookIds.length <= 1 && b.bookId === undefined));
    return flat.map((b) => ({ id: key(b.id), title: str(b.title), position: Number(b.position ?? 0), children: [] })).sort((a, b) => a.position - b.position);
  };

  const cards = list(data.cards);
  const cardsOn = (book: string, beat: string) =>
    cards
      .filter((c) => key(c.beatId ?? c.chapterId) === beat && (lineBook.get(key(c.lineId)) ?? key(c.bookId)) === book)
      // Plottr's outline order: place in the chapter, then plotline, then place in the plotline's stack.
      .sort(
        (a, b) =>
          Number(a.positionInChapter ?? 0) - Number(b.positionInChapter ?? 0) ||
          (threadOf.get(key(a.lineId)) ?? 0) - (threadOf.get(key(b.lineId)) ?? 0) ||
          Number(a.positionWithinLine ?? a.position ?? 0) - Number(b.positionWithinLine ?? b.position ?? 0),
      );

  const scene = (card: Json, parent: number) => {
    const description = slateToValue(card.description);
    const text = plain(description).trim();
    const short = text.length <= SYNOPSIS_MAX;
    const links = [
      linksParagraph("Characters", list((card.characters as unknown[] | undefined)?.map((id) => ({ id })) ?? []).map((c) => characterNames.get(key(c.id)) ?? "")),
      linksParagraph("Places", list((card.places as unknown[] | undefined)?.map((id) => ({ id })) ?? []).map((p) => placeNames.get(key(p.id)) ?? "")),
    ].filter((b): b is DocNode => b !== null);
    const thread = threadOf.get(key(card.lineId));
    push({
      parent,
      kind: "scene",
      title: cleanTitle(str(card.title), "Untitled scene"),
      tags: tagsOf(card.tags),
      value: [...(short ? [] : description), ...links],
      ...(short && text && { synopsis: text.replace(/\s+/g, " ") }),
      ...(thread !== undefined && { threads: [{ thread, note: text.slice(0, CELL_MAX) }] }),
    });
  };

  // "auto" is Plottr's word for a beat it numbers itself ("Chapter 3").
  const levelName = (book: string, depth: number, deepest: number) => str(obj(obj(obj(data.hierarchyLevels)[book])[String(deepest - depth)]).name) || (depth === deepest ? "Chapter" : "Act");
  const depthOf = (beats: Beat[]): number => (beats.length ? 1 + Math.max(...beats.map((b) => depthOf(b.children))) : 0);

  const beat = (book: string, b: Beat, parent: number | null, depth: number, deepest: number, n: number) => {
    const title = !b.title || b.title === "auto" ? `${levelName(book, depth, deepest)} ${n}` : b.title;
    const at = push({ parent, kind: b.children.length ? "folder" : "chapter", title: cleanTitle(title, "Chapter"), tags: [], value: [] });
    b.children.forEach((c, i) => beat(book, c, at, depth + 1, deepest, i + 1));
    for (const card of cardsOn(book, b.id)) scene(card, at);
  };

  for (const book of bookIds) {
    const info = obj(books[book]);
    const parent = bookIds.length > 1 ? push({ parent: null, kind: "folder", title: cleanTitle(str(info.title), `Book ${bookIds.indexOf(book) + 1}`), tags: [], value: [] }) : null;
    const beats = beatsOf(book);
    const deepest = depthOf(beats) - 1;
    beats.forEach((b, i) => beat(book, b, parent, 0, deepest, i + 1));
  }

  // The story bible: characters, places, notes, each with what Plottr kept about them.
  const custom = obj(data.customAttributes);
  const attributeNames = (kind: string) => list(custom[kind]).map((a) => str(a.name)).filter(Boolean);
  const categoryNames = new Map(list(obj(data.categories).characters).map((c) => [key(c.id), str(c.name)]));
  const bible = (title: string, items: Json[], kind: "character" | "location" | "note", attrsKind: string, notesKey: string, nameKey: string) => {
    if (!items.length) return;
    const folder = push({ parent: null, kind: "folder", title, tags: [], value: [] });
    const attrs = attributeNames(attrsKind);
    for (const item of items) {
      const description = str(item.description).trim();
      push({
        parent: folder,
        kind,
        title: cleanTitle(str(item[nameKey]), kind === "note" ? "Untitled note" : "Unnamed"),
        tags: [...new Set([...tagsOf(item.tags), ...(kind === "character" && categoryNames.get(key(item.categoryId)) ? [tagFrom(categoryNames.get(key(item.categoryId))!)] : [])])],
        value: [...attrs.flatMap((name) => attributeLine(name, item[name])), ...slateToValue(item[notesKey])],
        ...(description && { synopsis: description.slice(0, SYNOPSIS_MAX) }),
      });
    }
  };
  bible("Characters", characters, "character", "characters", "notes", "name");
  bible("Places", places, "location", "places", "notes", "name");
  bible("Notes", list(data.notes), "note", "notes", "content", "title");

  if (!outline.length) throw new Error(`“${fileName}” has nothing in it to import.`);
  return { outline, threads };
}
