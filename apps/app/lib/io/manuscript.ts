// How a run of notes becomes one file (plan.md 2.7). Pure: the notes arrive
// already collected, filtered and reduced to export blocks (./model).

import type { NodeKind, ScriptFormat } from "@plotra/db/schema";
import { blocksToMarkdown } from "./markdown";
import { chapterHeading, separatorText, type CompileOptions } from "./compile";
import type { FrontPage } from "./front-matter";
import type { Block } from "./model";
import { blocksToText, TEXT_BREAK } from "./text";

export type ExportSection = {
  id: string;
  title: string;
  kind: NodeKind;
  /** 0 for what sits directly under the exported root (or at the top of the project). */
  depth: number;
  /** The note or folder that was chosen for export; its title names the file. */
  root?: boolean;
  format: ScriptFormat;
  tags: string[];
  blocks: Block[];
};

const structural = (s: ExportSection) => s.kind === "folder" || s.kind === "chapter";

/** Whether `t` sits somewhere under the section at `i` (sections are in binder order, with depths). */
function isInside(all: ExportSection[], i: number, t: ExportSection) {
  const j = all.indexOf(t);
  for (let k = i + 1; k <= j; k++) if (all[k].depth <= all[i].depth) return false;
  return j > i;
}

/** Leaves out notes with nothing in them, and folders that end up holding nothing. */
export function withText(sections: ExportSection[]): ExportSection[] {
  return sections.filter((s, i) => {
    if (s.blocks.length) return true;
    for (let j = i + 1; j < sections.length && (s.root || sections[j].depth > s.depth); j++) if (sections[j].blocks.length) return true;
    return false;
  });
}

// ---- Manuscript layout (DOCX, plain text) -----------------------------------------------

export type Piece =
  /** A folder, chapter or note title. Levels 1 and 2 start a new page. A chapter's title may be empty (compile settings: no heading, just the new page). */
  | { kind: "heading"; title: string; level: 1 | 2 | 3; chapter?: boolean; id?: string }
  | { kind: "scene-break" }
  | { kind: "blocks"; blocks: Block[]; format: ScriptFormat }
  /** A page of front matter (./front-matter.ts): each starts a page of its own. */
  | { kind: "front"; page: FrontPage };

/**
 * The manuscript as it's set on the page: folders and chapters are headings,
 * the scenes inside them run on with a break between, and anything else (a
 * note, a character sheet) goes under its own title.
 */
export function layoutManuscript(sections: ExportSection[], options: Pick<CompileOptions, "chapters" | "sceneTitles"> = { chapters: "title", sceneTitles: false }): Piece[] {
  const out: Piece[] = [];
  const all = withText(sections);
  const rootHolds = all.some((s) => s.root && structural(s));
  // Which headings are chapters, to number: the chapters, or in a book built of folders, the folders that hold no others.
  const chapters = all.some((s) => !s.root && s.kind === "chapter")
    ? new Set(all.filter((s) => !s.root && s.kind === "chapter").map((s) => s.id))
    : new Set(all.filter((s, i) => !s.root && s.kind === "folder" && !all.slice(i + 1).some((t) => t.depth > s.depth && structural(t) && isInside(all, i, t))).map((s) => s.id));
  let chapterNumber = 0;
  let lastWasScene = false;
  for (const s of all) {
    const level = Math.min(3, s.depth + 1) as 1 | 2 | 3;
    if (s.root) {
      // The title page already names it.
    } else if (structural(s)) {
      const title = chapters.has(s.id) ? chapterHeading(options.chapters, s.title, ++chapterNumber) : s.title;
      out.push({ kind: "heading", title, level, id: s.id, ...(chapters.has(s.id) && { chapter: true }) });
      lastWasScene = false;
    } else if (s.kind === "scene" && (s.depth > 0 || rootHolds)) {
      // A scene under its own title, or a separator between scenes.
      if (options.sceneTitles && s.blocks.length) out.push({ kind: "heading", title: s.title, level: 3, id: s.id });
      else if (lastWasScene && s.blocks.length) out.push({ kind: "scene-break" });
    } else {
      out.push({ kind: "heading", title: s.title, level, id: s.id });
      lastWasScene = false;
    }
    if (!s.blocks.length) continue;
    out.push({ kind: "blocks", blocks: s.blocks, format: s.format });
    if (s.kind === "scene") lastWasScene = true;
  }
  return out;
}

export type Front = { title: string; author: string };

export function manuscriptToText(
  front: Front,
  pieces: Piece[],
  references?: { heading: string; blocks: Block[] } | null,
  options: Pick<CompileOptions, "separator" | "titlePage"> = { separator: "* * *", titlePage: true },
): string {
  const parts = options.titlePage ? [front.title.toUpperCase(), `by ${front.author}`, ""] : [];
  for (const piece of pieces) {
    if (piece.kind === "heading") {
      if (piece.title) parts.push("", piece.level === 1 ? piece.title.toUpperCase() : piece.title);
    } else if (piece.kind === "scene-break") parts.push(options.separator === "* * *" ? TEXT_BREAK : separatorText(options.separator));
    else if (piece.kind === "front") {
      // A page of its own in a printed book; here, set apart by blank lines.
      const { page } = piece;
      parts.push("", ...page.paragraphs, ...(page.source ? [`— ${page.source}`] : []), "");
    } else parts.push(blocksToText(piece.blocks));
  }
  if (references) parts.push("", references.heading, blocksToText(references.blocks));
  return `${parts.join("\n\n").replace(/\n{4,}/g, "\n\n\n")}\n`;
}

// ---- Markdown ----------------------------------------------------------------------------

const yamlString = (text: string) => (/^[\w][\w .,'’()-]*$/.test(text) && !/^(true|false|null|yes|no|~)$/i.test(text) && !/^\d/.test(text) ? text : JSON.stringify(text));

export function frontMatter(fields: { title?: string; author?: string; kind?: string; order?: number; tags?: string[] }): string {
  const lines = ["---"];
  if (fields.title) lines.push(`title: ${yamlString(fields.title)}`);
  if (fields.author) lines.push(`author: ${yamlString(fields.author)}`);
  if (fields.kind) lines.push(`kind: ${fields.kind}`);
  if (fields.order !== undefined) lines.push(`order: ${fields.order}`);
  if (fields.tags?.length) lines.push(`tags: [${fields.tags.map(yamlString).join(", ")}]`);
  lines.push("---");
  return `${lines.join("\n")}\n`;
}

/**
 * One Markdown file: every note under a heading as deep as it sits in the
 * binder, so `#` is a chapter and `##` a scene when a manuscript folder is
 * exported, which is how the import splits a file back up.
 */
export function sectionsToMarkdown(front: Front, sections: ExportSection[], references?: { heading: string; blocks: Block[] } | null): string {
  const parts: string[] = [];
  for (const s of withText(sections)) {
    const level = s.root ? 0 : Math.min(6, s.depth + 1);
    if (level) parts.push(`${"#".repeat(level)} ${blocksToMarkdown([{ kind: "paragraph", runs: [{ text: s.title }] }]).replace(/\n/g, " ")}`);
    // The note's own headings go right under its title, whichever level it started them at.
    const shallowest = Math.min(4, ...s.blocks.flatMap((b) => (b.kind === "heading" ? [b.level] : [])));
    if (s.blocks.length) parts.push(blocksToMarkdown(s.blocks, level ? level - (shallowest - 1) : 0));
  }
  if (references) parts.push(`# ${references.heading}`, blocksToMarkdown(references.blocks));
  return `${frontMatter(front)}\n${parts.join("\n\n")}\n`;
}

/** A file or folder name that's safe on every system, kept as close to the title as that allows. */
export function fileName(title: string, fallback = "Untitled"): string {
  const name = title
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 80)
    .trim();
  return name || fallback;
}

/**
 * A file per note, in folders that mirror the binder. A folder or chapter with
 * text of its own gets a note named after it inside its folder. Names follow
 * titles (so `[[links]]` still resolve in other Markdown tools); the binder's
 * order is kept in each file's front matter.
 */
export function sectionsToFiles(rootName: string, sections: ExportSection[]): Array<{ path: string; data: string }> {
  const files: Array<{ path: string; data: string }> = [];
  const taken = new Set<string>();
  const unique = (path: string, extension = "") => {
    let candidate = path;
    for (let n = 2; taken.has(`${candidate}${extension}`.toLowerCase()); n++) candidate = `${path} (${n})`;
    taken.add(`${candidate}${extension}`.toLowerCase());
    return candidate;
  };
  const top = fileName(rootName, "Export");
  const add = (path: string, s: ExportSection, order?: number) => {
    const body = blocksToMarkdown(s.blocks);
    files.push({
      path: `${unique(path, ".md")}.md`,
      data: `${frontMatter({ title: s.title, kind: s.kind, order, tags: s.tags })}${body ? `\n${body}\n` : ""}`,
    });
  };
  // The folder that notes at each depth go in, and how many siblings it has so far.
  const dirs: string[] = [top];
  const counts: number[] = [0];
  sections.forEach((s, i) => {
    const name = fileName(s.title);
    if (s.root) {
      // A folder with no text of its own is just a folder.
      if (s.blocks.length || sections.length === 1) add(`${top}/${name}`, s);
      return;
    }
    const depth = Math.min(s.depth, dirs.length - 1);
    dirs.length = counts.length = depth + 1;
    const order = (counts[depth] = (counts[depth] ?? 0) + 1);
    const holds = sections[i + 1] !== undefined && !sections[i + 1].root && sections[i + 1].depth > s.depth;
    if (!holds) return add(`${dirs[depth]}/${name}`, s, order);
    const folder = unique(`${dirs[depth]}/${name}`);
    dirs[depth + 1] = folder;
    counts[depth + 1] = 0;
    if (s.blocks.length) add(`${folder}/${name}`, s, order);
  });
  return files;
}
