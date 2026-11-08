// A Scrivener project in (beat-the-competitors.md, step 3): its binder
// (`.scrivx`) and each document's text and synopsis become Plotra's binder.
//
// - The manuscript (Scrivener's Draft folder) comes in at the top: a folder
//   holding folders is a part, any other folder a chapter, and a document a
//   scene. A document with documents under it is a chapter with its own text.
// - Top-level folders keep their place. Documents in one named Characters (or
//   Cast, People) become characters; in Places (or Locations, Settings),
//   places; anywhere else, notes. Research is a folder of notes.
// - Synopses (the index-card text) become synopses; keywords become tags.
// - Left out: the trash, Template Sheets, and what isn't text (PDFs,
//   pictures, web pages, media), which are counted so the dialog can say so;
//   document notes, labels, status, snapshots and compile settings.
//
// Scrivener 3 keeps a document's text at `Files/Data/<UUID>/content.rtf`,
// Scrivener 2 at `Files/Docs/<ID>.rtf`; both are read. Pure.

import type { DocNode } from "../doc-index";
import { normalizeTag } from "../doc-index";
import { MAX_TITLE, type OutlineEntry, type OutlineKind } from "./outline";
import { rtfToValue } from "./rtf";
import { isScrivenerText, isScrivx } from "./scrivener-files";

export type ScrivenerFile = { name: string; bytes: Uint8Array; folder?: string[] };

export type ScrivenerPlan = {
  outline: OutlineEntry[];
  /** Binder items that aren't text (PDFs, pictures, web pages), left out. */
  leftOut: number;
};

// ---- A small XML reader: enough for a .scrivx, which is plain, well-formed XML -------------

type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string };

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeEntities = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return entities[ref.toLowerCase()] ?? whole;
  });

export function parseXml(source: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  let i = 0;
  while (i < source.length) {
    const open = source.indexOf("<", i);
    const top = stack[stack.length - 1];
    if (open < 0) {
      top.text += decodeEntities(source.slice(i));
      break;
    }
    if (open > i) top.text += decodeEntities(source.slice(i, open));
    if (source.startsWith("<!--", open)) {
      const end = source.indexOf("-->", open + 4);
      i = end < 0 ? source.length : end + 3;
    } else if (source.startsWith("<![CDATA[", open)) {
      const end = source.indexOf("]]>", open + 9);
      top.text += source.slice(open + 9, end < 0 ? source.length : end);
      i = end < 0 ? source.length : end + 3;
    } else if (source[open + 1] === "?" || source[open + 1] === "!") {
      const end = source.indexOf(">", open);
      i = end < 0 ? source.length : end + 1;
    } else if (source[open + 1] === "/") {
      const end = source.indexOf(">", open);
      const name = source.slice(open + 2, end).trim();
      // Close up to the matching element; a stray end tag is ignored.
      const at = stack.map((node) => node.name).lastIndexOf(name);
      if (at > 0) stack.length = at;
      i = end < 0 ? source.length : end + 1;
    } else {
      const end = source.indexOf(">", open);
      if (end < 0) break;
      let body = source.slice(open + 1, end);
      const selfClosing = body.endsWith("/");
      if (selfClosing) body = body.slice(0, -1);
      const name = /^[^\s/>]+/.exec(body)?.[0] ?? "";
      const attrs: Record<string, string> = {};
      for (const match of body.slice(name.length).matchAll(/([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[match[1]] = decodeEntities(match[3] ?? match[4] ?? "");
      const node: XmlNode = { name, attrs, children: [], text: "" };
      top.children.push(node);
      if (!selfClosing) stack.push(node);
      i = end + 1;
    }
  }
  return root;
}

const child = (node: XmlNode | undefined, name: string) => node?.children.find((c) => c.name === name);
const childrenNamed = (node: XmlNode | undefined, name: string) => node?.children.filter((c) => c.name === name) ?? [];
const textOf = (node: XmlNode | undefined) => (node?.text ?? "").trim();
const findAll = (node: XmlNode | undefined, name: RegExp): XmlNode[] =>
  node ? [...node.children.filter((c) => name.test(c.name)), ...node.children.flatMap((c) => findAll(c, name))] : [];

// What Scrivener writes into a document's text that isn't the writing:
// - styles, as marks around the text: `<$Scr_Ps::0>Heading<!$Scr_Ps::0>`, `<$Scr_Cs::2>word<!$Scr_Cs::2>`
//   (Scrivener 3). The marks go; the text stays.
// - inline annotations and footnotes, as escaped text:
//   `{\Scrv_annot \color={…} \text=a note to self\end_Scrv_annot}`. They go whole.
const SCRIVENER_MARKS = /<!?\$Scr_[A-Za-z]+::\d+>|\{\\Scrv_([a-z]+)[\s\S]*?\\end_Scrv_\1\}/g;

/** Takes those out of each paragraph, even where one crosses a change of bold or italic. */
function withoutStyleMarks(blocks: DocNode[]): DocNode[] {
  const out: DocNode[] = [];
  for (const block of blocks) {
    const leaves = block.children ?? [];
    if (block.type !== "p" || !leaves.every((leaf) => typeof leaf.text === "string")) {
      out.push(block);
      continue;
    }
    const whole = leaves.map((leaf) => leaf.text as string).join("");
    const cut: Array<[number, number]> = [...whole.matchAll(SCRIVENER_MARKS)].map((m) => [m.index, m.index + m[0].length]);
    if (!cut.length) {
      out.push(block);
      continue;
    }
    let at = 0;
    const kept = leaves
      .map((leaf) => {
        const text = leaf.text as string;
        const start = at;
        at += text.length;
        let next = "";
        for (let i = 0; i < text.length; i++) if (!cut.some(([from, to]) => start + i >= from && start + i < to)) next += text[i];
        return { ...leaf, text: next };
      })
      .filter((leaf) => leaf.text);
    if (kept.some((leaf) => leaf.text.trim())) out.push({ ...block, children: kept });
  }
  return out;
}

// ---- The project --------------------------------------------------------------------------

const decoder = new TextDecoder("utf-8");
const decode = (bytes: Uint8Array) => decoder.decode(bytes).replace(/^﻿/, "");

const CHARACTERS = /^(characters?|cast|people|dramatis personae)$/i;
const PLACES = /^(places?|locations?|settings?)$/i;
const TEMPLATES = /^template sheets?$/i;
const TEXT_TYPES = new Set(["Text", "Folder", "DraftFolder", "ResearchFolder", "Root"]);

const cleanTitle = (title: string) => title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) || "Untitled";

/** True when the uploaded files include a Scrivener binder. */
export const hasScrivenerBinder = (files: ScrivenerFile[]) => files.some((file) => isScrivx(file.name));

/** Reads a Scrivener project's binder and text into the outline of notes it makes. */
export function planScrivener(files: ScrivenerFile[]): ScrivenerPlan {
  const binderFile = files.find((file) => isScrivx(file.name));
  if (!binderFile) throw new Error("That folder has no Scrivener project in it (a .scrivx file).");
  const project = parseXml(decode(binderFile.bytes)).children.find((node) => node.name === "ScrivenerProject");
  const binder = child(project, "Binder");
  if (!binder) throw new Error(`“${binderFile.name}” isn't a Scrivener project Plotra can read.`);

  // Each document's text and synopsis, by its UUID (Scrivener 3) or ID (Scrivener 2).
  const texts = new Map<string, { content?: Uint8Array; synopsis?: Uint8Array }>();
  for (const file of files) {
    const path = [...(file.folder ?? []), file.name].join("/");
    if (!isScrivenerText(path)) continue;
    const v2 = /^(\d+)(_synopsis)?\.(rtf|txt)$/i.exec(file.name);
    const key = (v2 ? v2[1] : (file.folder?.at(-1) ?? "")).toLowerCase();
    const entry = texts.get(key) ?? {};
    if (/synopsis\.txt$/i.test(file.name)) entry.synopsis = file.bytes;
    else entry.content = file.bytes;
    texts.set(key, entry);
  }

  // Keywords are defined once for the project and referred to by id (Scrivener 3).
  const keywordNames = new Map<string, string>();
  for (const keyword of childrenNamed(child(project, "Keywords"), "Keyword")) {
    const title = textOf(child(keyword, "Title")) || textOf(keyword);
    if (keyword.attrs.ID && title) keywordNames.set(keyword.attrs.ID, title);
  }

  const outline: OutlineEntry[] = [];
  let leftOut = 0;
  const countLeftOut = (item: XmlNode): number =>
    (TEXT_TYPES.has(item.attrs.Type ?? "") ? 0 : 1) + childrenNamed(child(item, "Children"), "BinderItem").reduce((sum, c) => sum + countLeftOut(c), 0);

  const contentOf = (item: XmlNode): { value: DocNode[]; synopsis?: string } => {
    const found = texts.get((item.attrs.UUID ?? item.attrs.ID ?? "").toLowerCase());
    const value = found?.content ? withoutStyleMarks(rtfToValue(decode(found.content))) : [];
    const synopsis = found?.synopsis ? decode(found.synopsis).replace(/\s+/g, " ").trim().slice(0, 2000) : "";
    return { value, ...(synopsis && { synopsis }) };
  };

  const tagsOf = (item: XmlNode) => {
    const keywords = child(item, "Keywords");
    const ids = childrenNamed(keywords, "KeywordID").map((k) => keywordNames.get(textOf(k)) ?? "");
    // Scrivener 2 writes the keywords themselves, separated by semicolons.
    const written = ids.length ? [] : textOf(keywords).split(/[;,]/);
    return [...new Set([...ids, ...written].map(normalizeTag).filter(Boolean))].slice(0, 20);
  };

  const push = (item: XmlNode, parent: number | null, kind: OutlineKind) => {
    outline.push({ parent, kind, title: cleanTitle(textOf(child(item, "Title"))), tags: tagsOf(item), ...contentOf(item) });
    return outline.length - 1;
  };

  const kids = (item: XmlNode) => childrenNamed(child(item, "Children"), "BinderItem");
  const isText = (item: XmlNode) => item.attrs.Type === "Text" || item.attrs.Type === "Folder";

  /** An item of the manuscript. */
  const manuscript = (item: XmlNode, parent: number | null) => {
    if (!isText(item)) return void (leftOut += countLeftOut(item));
    const children = kids(item);
    // A folder holding folders (or documents that hold documents) is a part; any other with something under it, a chapter.
    const holdsChapters = children.some((c) => c.attrs.Type === "Folder" || kids(c).length > 0);
    const kind: OutlineKind = children.length || item.attrs.Type === "Folder" ? (holdsChapters ? "folder" : "chapter") : "scene";
    const at = push(item, parent, kind);
    for (const c of children) manuscript(c, at);
  };

  /** An item anywhere else: research, characters, places, notes. */
  const elsewhere = (item: XmlNode, parent: number | null, entity?: "character" | "location") => {
    if (!isText(item)) return void (leftOut += countLeftOut(item));
    const children = kids(item);
    const title = textOf(child(item, "Title"));
    if (item.attrs.Type === "Folder" || children.length) {
      const at = push(item, parent, "folder");
      const inside = CHARACTERS.test(title) ? "character" : PLACES.test(title) ? "location" : entity;
      for (const c of children) elsewhere(c, at, inside);
    } else push(item, parent, entity ?? "note");
  };

  // The folder of document templates is named in the project's settings, whatever it's called.
  const templates = new Set(findAll(project, /^TemplateFolder(UUID|ID)$/).map((node) => textOf(node).toLowerCase()));
  for (const item of childrenNamed(binder, "BinderItem")) {
    const type = item.attrs.Type;
    const title = textOf(child(item, "Title"));
    if (type === "TrashFolder" || TEMPLATES.test(title) || templates.has((item.attrs.UUID ?? item.attrs.ID ?? "").toLowerCase())) continue;
    if (type === "DraftFolder") {
      // The manuscript's own folder is one folder too many: what's in it goes at the top.
      for (const c of kids(item)) manuscript(c, null);
    } else if (type === "ResearchFolder") {
      const at = push(item, null, "folder");
      for (const c of kids(item)) elsewhere(c, at);
    } else elsewhere(item, null);
  }

  if (!outline.length) throw new Error("That Scrivener project has nothing in its binder to import.");
  return { outline, leftOut };
}
