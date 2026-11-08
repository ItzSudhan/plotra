import { Gunzip } from "fflate";
import mammoth from "mammoth";
import type { DocNode } from "../doc-index";
import { htmlToValue } from "./html";
import { markdownToValue, parseFrontMatter } from "./markdown";
import { rtfToValue } from "./rtf";
import { hasScrivenerBinder, planScrivener } from "./scrivener";
import { hasWorldAnvilArticles, planWorldAnvil } from "./worldanvil";
import { buildOutline, type ImportedFile, type ImportOptions, type ImportThread, type OutlineEntry } from "./outline";
import { planPlottr } from "./plottr";
import { textToValue } from "./text";
import { pictureFinder } from "./vault-pictures";

type PictureFinder = ReturnType<typeof pictureFinder>;

// Reading uploaded files for an import (plan.md 2.7): Markdown, DOCX and plain
// text into Plate values, and from there into the outline of notes they make.
// Server code (mammoth needs Node), but nothing here touches the database, so
// the import route can say what a set of files would create before creating it.

const MB = 1024 * 1024;
/** Everything uploaded in one import, together. */
export const MAX_IMPORT_BYTES = 10 * MB;
// Enough for a folder of notes (an Obsidian vault), which is many small files, or a
// Scrivener project, which sends two files (text and synopsis) per document.
export const MAX_IMPORT_FILES = 3200;
/** What the gzipped files of one import (a Scrivener project's text, sent packed) may unpack to, together. */
export const MAX_UNPACKED_IMPORT_BYTES = 60 * MB;
/**
 * Unpacks a gzipped file, stopping at `cap` bytes whatever the gzip says it
 * holds, so a small upload can't unpack to fill memory. Throws past the cap.
 */
export function gunzipCapped(bytes: Uint8Array, cap: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const stream = new Gunzip((chunk) => {
    total += chunk.length;
    if (total > cap) throw new Error("That upload is too large to import.");
    chunks.push(chunk);
  });
  stream.push(bytes, true);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** Notes and folders one import may create. */
export const MAX_IMPORT_NOTES = 1500;
// A .docx is a zip: what it unpacks to is bounded too, so a small upload can't fill memory.
const MAX_UNPACKED_BYTES = 150 * MB;

export type UploadedFile = { name: string; bytes: Uint8Array; /** The folders it was in, when a folder was uploaded. */ folder?: string[] };

const formats = { md: "markdown", markdown: "markdown", mdown: "markdown", txt: "text", text: "text", docx: "docx", rtf: "rtf" } as const;
export type ImportFormat = (typeof formats)[keyof typeof formats];

const extension = (name: string) => name.split(".").at(-1)?.toLowerCase() ?? "";
export const importFormat = (name: string): ImportFormat | undefined => (Object.hasOwn(formats, extension(name)) ? formats[extension(name) as keyof typeof formats] : undefined);

function decodeText(bytes: Uint8Array): string {
  // Notepad and Word save "Unicode" text as UTF-16 with a byte-order mark.
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
  return new TextDecoder(encoding).decode(bytes);
}

/** The total size a zip says its files unpack to, from its central directory; null when it isn't a readable zip. */
function unpackedSize(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) return null;
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) return null;
    total += view.getUint32(at + 24, true);
    at += 46 + view.getUint16(at + 28, true) + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return total;
}

// Word's styles for what the editor can hold; mammoth's defaults cover headings, lists and tables.
const styleMap = [
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  "p[style-name='Block Text'] => blockquote > p:fresh",
  "u => u",
  "strike => s",
];

async function docxToValue(file: UploadedFile): Promise<DocNode[]> {
  const size = unpackedSize(file.bytes);
  if (size === null) throw new Error(`“${file.name}” isn't a Word document Plotra can read. Save it as .docx and try again.`);
  if (size > MAX_UNPACKED_BYTES) throw new Error(`“${file.name}” is too large to import.`);
  let html: string;
  try {
    const result = await mammoth.convertToHtml(
      { buffer: Buffer.from(file.bytes) },
      // Pictures are left out: the editor shows images by URL, and a manuscript's text is what's being brought in.
      { styleMap, convertImage: mammoth.images.imgElement(async () => ({ src: "" })) },
    );
    html = result.value;
  } catch {
    throw new Error(`“${file.name}” couldn't be read as a Word document.`);
  }
  return htmlToValue(html);
}

/**
 * One uploaded file as a Plate value, with the title, tags and properties it
 * declares. `findPicture` says where a picture a Markdown note shows is in the
 * vault it came from (./vault-pictures.ts).
 */
export async function readUpload(file: UploadedFile, options: ImportOptions, findPicture?: PictureFinder): Promise<ImportedFile> {
  const name = file.name.replace(/\.[a-z0-9]+$/i, "").trim() || "Imported";
  const format = importFormat(file.name);
  const folder = file.folder;
  if (format === "docx") return { name, folder, tags: [], value: await docxToValue(file) };
  if (format === "rtf") return { name, folder, tags: [], value: rtfToValue(decodeText(file.bytes)) };
  if (format === "markdown") {
    const { meta, body } = parseFrontMatter(decodeText(file.bytes));
    const picture = findPicture && ((ref: string) => findPicture(ref, folder));
    return {
      name,
      folder,
      title: meta.title,
      tags: meta.tags,
      aliases: meta.aliases,
      order: meta.order,
      properties: meta.properties,
      value: markdownToValue(body, { lines: options.lines, picture }),
    };
  }
  // Chapter lines only matter when the import splits at headings.
  if (format === "text") return { name, folder, tags: [], value: textToValue(decodeText(file.bytes), { chapters: options.split === "headings" }) };
  if (extension(file.name) === "doc") throw new Error(`“${file.name}” is an old Word format. Save it as .docx and try again.`);
  throw new Error(`Plotra can't import “${file.name}”. Use Markdown (.md), Word (.docx), rich text (.rtf), plain text (.txt) or a Scrivener project.`);
}

/** What the files would create, without creating it. `pictures`: the paths of the pictures in the vault they came from. */
export async function planImport(files: UploadedFile[], options: ImportOptions, pictures: string[] = []): Promise<OutlineEntry[]> {
  const findPicture = pictures.length ? pictureFinder(pictures) : undefined;
  const read: ImportedFile[] = [];
  for (const file of files) read.push(await readUpload(file, options, findPicture));
  const outline = buildOutline(read, options);
  if (!outline.some((entry) => entry.value.length)) throw new Error(files.length > 1 ? "Those files are empty." : "That file is empty.");
  return withinLimit(outline);
}

function withinLimit(outline: OutlineEntry[]) {
  if (outline.length > MAX_IMPORT_NOTES) {
    throw new Error(`That would create ${outline.length.toLocaleString("en")} notes and folders, and one import can create ${MAX_IMPORT_NOTES.toLocaleString("en")}. Import it in parts, or split it less finely.`);
  }
  return outline;
}

export type UploadPlan = {
  outline: OutlineEntry[];
  /** What a project held that isn't imported: a Scrivener binder's PDFs and pictures, a World Anvil file that couldn't be read. */
  leftOut: number;
  /** "scrivener", "plottr", "worldanvil", or the file formats ("docx+markdown"). */
  format: string;
  /** Plot threads to create (a Plottr file's plotlines). */
  threads: ImportThread[];
};

/**
 * What an upload would create. A whole project from another app keeps its own
 * structure: a Scrivener project (./scrivener.ts), a Plottr file
 * (./plottr.ts) or a World Anvil export (./worldanvil.ts). Anything else is
 * read file by file and cut up by the options.
 */
export async function planUpload(files: UploadedFile[], options: ImportOptions, pictures: string[] = []): Promise<UploadPlan> {
  if (hasScrivenerBinder(files)) {
    const { outline, leftOut } = planScrivener(files);
    return { outline: withinLimit(outline), leftOut, format: "scrivener", threads: [] };
  }
  const plottr = files.filter((file) => /\.pltr$/i.test(file.name));
  if (plottr.length) {
    if (files.length > 1) throw new Error("Import a Plottr file on its own.");
    const { outline, threads } = planPlottr(decodeText(plottr[0].bytes), plottr[0].name);
    return { outline: withinLimit(outline), leftOut: 0, format: "plottr", threads };
  }
  if (hasWorldAnvilArticles(files)) {
    const { outline, leftOut } = planWorldAnvil(files);
    return { outline: withinLimit(outline), leftOut, format: "worldanvil", threads: [] };
  }
  return {
    outline: await planImport(files, options, pictures),
    leftOut: 0,
    format: [...new Set(files.map((file) => importFormat(file.name) ?? "other"))].sort().join("+"),
    threads: [],
  };
}
