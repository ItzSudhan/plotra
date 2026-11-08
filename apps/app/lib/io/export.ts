import "server-only";
import { countWords } from "../doc-index";
import { nodeFormat } from "../modules";
import type { Collected } from "../publish/collect";
import { fileSlug } from "../publish/html";
import { zip } from "../publish/zip";
import { isDocumentKind } from "../story";
import { isTrashed, liveChildren, type BinderNode } from "../tree";
import { standardManuscript, type CompileOptions } from "./compile";
import { frontPages } from "./front-matter";
import { buildDocx } from "./docx";
import { buildFdx } from "./fdx";
import { buildRtf } from "./rtf-export";
import { htmlToValue } from "./html";
import { ao3Chapters, ao3Page, type Ao3Chapter } from "./ao3";
import { outlineToOpml, type OutlineItem } from "./opml";
import { fileName, layoutManuscript, manuscriptToText, sectionsToFiles, sectionsToMarkdown, withText, type ExportSection } from "./manuscript";
import { filterBlocks, rejectSuggestions, toBlocks, type Block, type ExportContext } from "./model";
import { blocksToText } from "./text";

// A writer's own text out of Plotra (plan.md 2.7): Markdown, DOCX and plain
// text, from what `collect` gathered (what the person can read, under the
// spoiler horizon they chose). Nothing here checks a quota: export always
// works (plan.md 8.1 "Never hold work hostage").
//
// Comments aren't in the document, so they never travel. Text still under
// suggestion is exported as if every suggestion were rejected: proposed
// insertions are left out and proposed deletions kept (`rejectSuggestions`),
// because a suggestion isn't the writer's text until they accept it.

export const exportFormats = {
  markdown: { extension: "md", type: "text/markdown; charset=utf-8" },
  docx: { extension: "docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  rtf: { extension: "rtf", type: "application/rtf" },
  txt: { extension: "txt", type: "text/plain; charset=utf-8" },
  fdx: { extension: "fdx", type: "application/xml; charset=utf-8" },
} as const;

export type ExportFormat = keyof typeof exportFormats;
export const isExportFormat = (format: string): format is ExportFormat => Object.hasOwn(exportFormats, format);

export type ExportFile = { name: string; type: string; data: string | Uint8Array };

const manuscriptKinds = new Set<BinderNode["kind"]>(["folder", "chapter", "scene"]);

async function sections(c: Collected, ctx: ExportContext): Promise<ExportSection[]> {
  // Boards (canvas, timeline, dialogue trees) aren't text. A note outside the
  // horizon is left out; a folder outside it stays as a heading for what it
  // holds, like in the Read view, and is dropped later if that's nothing.
  const nodes = c.ordered.filter((n) => isDocumentKind(n.kind) && (c.includes(n) || n.kind === "folder" || n.kind === "chapter"));
  const bodies = await c.bodies(nodes.filter((n) => c.includes(n)).map((n) => n.id));
  const depthOf = (id: string) => {
    let depth = 0;
    for (let n = c.index.byId.get(id); n?.parentId && n.parentId !== c.root?.id; n = c.index.byId.get(n.parentId)) depth++;
    return depth;
  };
  return nodes.map((n) => ({
    id: n.id,
    title: n.title,
    kind: n.kind,
    depth: n.id === c.root?.id ? -1 : depthOf(n.id),
    ...(n.id === c.root?.id && { root: true }),
    format: nodeFormat(n.settings),
    tags: c.includes(n) ? n.tags : [],
    blocks: toBlocks(filterBlocks(rejectSuggestions(bodies.get(n.id) ?? []), c.showBlock), ctx),
  }));
}

function references(c: Collected): { heading: string; blocks: Block[] } | null {
  const found = c.references();
  return found ? { heading: found.heading, blocks: toBlocks(htmlToValue(found.html)) } : null;
}

const nothing = () => new Error("There's nothing written here to export yet.");

function contextFor(c: Collected): ExportContext {
  return {
    // A link to a note the reader may not see keeps only the words written in the sentence.
    titleOf: (id) => {
      const target = c.index.byId.get(id);
      return target && !isTrashed(c.index, id) && c.includes(target) ? target.title : undefined;
    },
    cite: c.cite,
  };
}

/** One file of a whole project is the manuscript; a project with no manuscript is all of its notes. */
function pick(c: Collected, all: ExportSection[]): ExportSection[] {
  const manuscript = all.filter((s) => manuscriptKinds.has(s.kind));
  return withText(c.root || !manuscript.some((s) => s.kind !== "folder" && s.blocks.length) ? all : manuscript);
}

/**
 * The binder as an outline (./opml.ts): what was chosen and everything inside
 * it, or the whole project, that the reader may see, in binder order, with
 * synopses. Boards come too: an outline is the shape of the project.
 */
export function buildOpml(c: Collected): ExportFile {
  const title = c.root?.title ?? c.project.title;
  const shown = new Set(c.ordered.filter((n) => c.includes(n) || n.kind === "folder" || n.kind === "chapter").map((n) => n.id));
  const build = (parentId: string | null): OutlineItem[] => {
    const out: OutlineItem[] = [];
    for (const n of liveChildren(c.index, parentId)) {
      if (!shown.has(n.id)) continue;
      const children = build(n.id);
      // A folder kept only for what it holds goes when it ends up holding nothing.
      if (!c.includes(n) && !children.length) continue;
      out.push({ title: n.title, synopsis: c.includes(n) ? n.synopsis : null, kind: n.kind, children });
    }
    return out;
  };
  const items = c.root ? [{ title: c.root.title, synopsis: c.root.synopsis, kind: c.root.kind, children: build(c.root.id) }] : build(null);
  if (!items.length) throw nothing();
  return { name: `${fileSlug(title, "outline")}.opml`, type: "text/x-opml; charset=utf-8", data: outlineToOpml(title, items) };
}

/** The manuscript as AO3 chapters (./ao3.ts), each with its synopsis as the chapter summary. */
export async function buildAo3(c: Collected): Promise<{ title: string; author: string; chapters: Ao3Chapter[] }> {
  const title = c.root?.title ?? c.project.title;
  const picked = pick(c, await sections(c, contextFor(c)));
  const chapters = picked.length ? ao3Chapters(layoutManuscript(picked), { title, summaryOf: (id) => c.index.byId.get(id)?.synopsis }) : [];
  if (!chapters.length) throw nothing();
  return { title, author: c.author, chapters };
}

/** The same as a download: a page with every chapter and a Copy button for each, and each chapter's HTML as a file of its own. */
export async function buildAo3File(c: Collected): Promise<ExportFile> {
  const { title, author, chapters } = await buildAo3(c);
  const width = String(chapters.length).length;
  const files = [
    { path: "post-to-ao3.html", data: ao3Page(title, author, chapters) },
    ...chapters.map((chapter, i) => ({ path: `chapters/${String(i + 1).padStart(Math.max(2, width), "0")} ${fileName(chapter.title)}.html`, data: `${chapter.html}\n` })),
  ];
  return { name: `${fileSlug(title, "export")}-ao3.zip`, type: "application/zip", data: zip(files) };
}

/**
 * Builds the download for `format`. `layout` only matters for Markdown: one
 * file, or a zip of files mirroring the binder. `options` (./compile.ts) set how
 * Word, RTF and plain text are laid out; standard manuscript format when absent.
 */
export async function buildExport(c: Collected, format: ExportFormat, layout: "single" | "files", contact?: string, options: CompileOptions = standardManuscript): Promise<ExportFile> {
  const title = c.root?.title ?? c.project.title;
  const all = await sections(c, contextFor(c));
  const slug = fileSlug(title, "export");

  if (format === "markdown" && layout === "files") {
    const files = sectionsToFiles(title, all);
    if (!files.length) throw nothing();
    return { name: `${slug}.zip`, type: "application/zip", data: zip(files) };
  }

  const picked = pick(c, all);
  if (!picked.length) throw nothing();

  const front = { title, author: c.author };
  const { extension, type } = exportFormats[format];
  const name = `${slug}.${extension}`;
  if (format === "markdown") return { name, type, data: sectionsToMarkdown(front, picked, references(c)) };
  // The project's copyright page, dedication and epigraph, when the layout asks for them; a script goes without.
  const opening = options.frontMatter && format !== "fdx" ? frontPages(c.project.settings.frontMatter).map((page) => ({ kind: "front" as const, page })) : [];
  const pieces = [...opening, ...layoutManuscript(picked, options)];
  if (format === "fdx") return { name, type, data: buildFdx({ ...front, email: contact, pieces }) };
  if (format === "txt") return { name, type, data: manuscriptToText(front, pieces, references(c), options) };
  const words = picked.reduce((sum, s) => sum + countWords(blocksToText(s.blocks)), 0);
  const input = { ...front, email: contact, words, pieces, references: references(c), options };
  if (format === "rtf") return { name, type, data: buildRtf(input) };
  return { name, type, data: await buildDocx(input) };
}
