import { fetch as expoFetch } from "expo/fetch";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { ApiError, type Client } from "./api";
import type { IconName } from "@/components/icon";

// Export and import on the phone, through the web's own export and import
// (apps/app/lib/io/export-request.ts and import-request.ts, behind
// /api/mobile/export and /api/mobile/import): the same formats, options,
// limits and messages as the web's Export… and Import… dialogs
// (apps/app/components/io/export-dialog.tsx, import-dialog.tsx).

// ---------------------------------------------------------------- Export

export type ExportChoice = "docx" | "rtf" | "fdx" | "markdown" | "markdown-files" | "txt" | "epub" | "opml" | "ao3" | "plotra";

/** The web's export choices, in its order and words. PDF is the web's print dialog, so it isn't here. */
export const exportChoices: { id: ExportChoice; icon: IconName; title: string; detail: string; script?: boolean }[] = [
  { id: "docx", icon: "scene", title: "Word (.docx)", detail: "In standard manuscript format." },
  { id: "rtf", icon: "scene", title: "Rich text (.rtf)", detail: "The same layout, for Scrivener, Pages, LibreOffice and older word processors." },
  { id: "fdx", icon: "dialogue", title: "Final Draft (.fdx)", detail: "The script, element by element, for Final Draft, Fade In, Highland or WriterDuet.", script: true },
  { id: "markdown", icon: "note", title: "Markdown (.md)", detail: "One file, with a heading for each chapter and scene." },
  { id: "markdown-files", icon: "folder", title: "Markdown, a file per note (.zip)", detail: "Folders and files that mirror the binder, with [[links]] kept." },
  { id: "txt", icon: "scene", title: "Plain text (.txt)", detail: "Just the words, with * * * between scenes." },
  { id: "epub", icon: "book", title: "E-book (.epub)", detail: "For Apple Books, Kobo, Google Play Books and most e-readers." },
  { id: "opml", icon: "bullet", title: "Outline (.opml)", detail: "Titles and synopses, nested as in the binder: for Scrivener, OmniOutliner or any outliner." },
  { id: "ao3", icon: "globe", title: "Archive of Our Own (AO3)", detail: "Chapter by chapter, as HTML AO3 takes, in a zip with a page to copy each chapter from." },
  {
    id: "plotra",
    icon: "archive",
    title: "Plotra project (.plotra)",
    detail: "The whole project, to import into another Plotra (the cloud or the desktop app): notes, boards, world, timelines, version history, comments and pictures.",
  },
];

/** Project types written as scripts (apps/app/lib/modules.ts defaultFormat), where Final Draft is offered. */
export const scriptProjectTypes = new Set(["screenplay", "stage_play", "podcast", "comic"]);

export type ExportRequest = {
  projectId: string;
  choice: ExportChoice;
  /** A folder, chapter or note to export instead of the whole project. */
  rootId?: string | null;
  /** Only what's revealed by this release ("as of"). */
  horizonId?: string | null;
};

export type ExportedFile = { file: File; name: string; type: string };

const exportsDir = () => new Directory(Paths.cache, "exports");

/** Builds the export on the server and keeps it in the phone's cache, ready to share. */
export async function exportProject(client: Client, { projectId, choice, rootId, horizonId }: ExportRequest): Promise<ExportedFile> {
  const params = new URLSearchParams({ project: projectId, format: choice === "markdown-files" ? "markdown" : choice });
  if (choice === "markdown-files") params.set("layout", "files");
  // A Plotra project file is always the whole project, as it is now.
  if (choice !== "plotra") {
    if (rootId) params.set("root", rootId);
    if (horizonId) params.set("horizon", horizonId);
  }
  const response = await client.raw(`/api/mobile/export?${params}`, { timeoutMs: 300_000 }, expoFetch);
  const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "export";
  const type = (response.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
  const bytes = await response.bytes();
  // Only the latest export is kept: the cache isn't a place to pile them up.
  const dir = exportsDir();
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, name);
  await file.write(bytes);
  return { file, name, type };
}

/** Offers the file to the share sheet: Files, Mail, AirDrop, another app. */
export async function shareExport({ file, type, name }: ExportedFile) {
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this phone.");
  // On iOS a type would add a second extension to the name (a .plotra would become .plotra.zip): the name says it.
  await Sharing.shareAsync(file.uri, Platform.OS === "android" ? { mimeType: type, dialogTitle: name } : {});
}

/** Removes the kept export, once it's been shared. */
export function clearExports() {
  try {
    const dir = exportsDir();
    if (dir.exists) dir.delete();
  } catch {}
}

// ---------------------------------------------------------------- Import

/** A file picked to import (expo-document-picker's asset). */
export type Picked = { uri: string; name: string; size: number };

export type ImportKind = "plotra" | "text" | "plottr" | "unsupported";

const TEXT = /\.(md|markdown|mdown|txt|text|docx|rtf)$/i;
const MARKDOWN = /\.(md|markdown|mdown)$/i;

export const kindOf = (name: string): ImportKind => (/\.plotra$/i.test(name) ? "plotra" : /\.pltr$/i.test(name) ? "plottr" : TEXT.test(name) ? "text" : "unsupported");
export const isMarkdown = (name: string) => MARKDOWN.test(name);
export const isPlainText = (name: string) => /\.(txt|text)$/i.test(name);

/** What the person is told about a file the phone can't import, by what it is. */
export function unsupportedMessage(name: string): string {
  if (/\.zip$/i.test(name)) return `“${name}” is a zip. A zipped Scrivener project or World Anvil export can be imported on the web; on the phone, choose the files inside it.`;
  if (/\.doc$/i.test(name)) return `“${name}” is an old Word format. Save it as .docx and try again.`;
  return `Plotra can't import “${name}”. Use Word (.docx), Markdown (.md), rich text (.rtf), plain text (.txt), a Plottr file (.pltr) or a Plotra project file (.plotra).`;
}

/** The server's limit on one import's files together (apps/app/lib/io/upload.ts MAX_IMPORT_BYTES). */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export type ImportOptions = { split: "headings" | "file"; breaks: boolean; kind: "scene" | "note"; lines: "wrap" | "keep" };

/** What an import would create (apps/app/lib/io/outline.ts ImportPreview). */
export type ImportPreview = {
  summary: { folders: number; chapters: number; scenes: number; notes: number; words: number };
  leftOut?: number;
  format?: string;
  threads?: number;
  pictures?: number;
  properties?: number;
  entries: { parent: number | null; kind: string; title: string }[];
};

type CreatedNode = { id: string; parentId: string | null; kind: string; title: string };

/** A file's bytes as they're sent: a Plottr file without its pictures, as the web sends it (they can be megabytes, and Plotra leaves them out). */
async function bytesOf(picked: Picked): Promise<Uint8Array> {
  const file = new File(picked.uri);
  if (kindOf(picked.name) !== "plottr") return file.bytes();
  try {
    const data = JSON.parse(await file.text()) as Record<string, unknown>;
    delete data.images;
    return new TextEncoder().encode(JSON.stringify(data));
  } catch {
    // Not JSON: the server says so.
    return file.bytes();
  }
}

/** A multipart form with each file as a `file` field, built here so the names and sizes are exactly what the server reads. */
async function multipart(files: Picked[]): Promise<{ body: Uint8Array<ArrayBuffer>; type: string }> {
  const boundary = `----plotra${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const picked of files) {
    const name = picked.name.replace(/[\r\n"]/g, (ch) => (ch === '"' ? "%22" : " "));
    parts.push(encoder.encode(`--${boundary}\r\ncontent-disposition: form-data; name="file"; filename="${name}"\r\ncontent-type: application/octet-stream\r\n\r\n`));
    parts.push(await bytesOf(picked));
    parts.push(encoder.encode("\r\n"));
  }
  parts.push(encoder.encode(`--${boundary}--\r\n`));
  const body = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    body.set(part, at);
    at += part.length;
  }
  return { body, type: `multipart/form-data; boundary=${boundary}` };
}

function importQuery(projectId: string, parentId: string | null, options: ImportOptions, preview: boolean) {
  const params = new URLSearchParams({ project: projectId, split: options.split, kind: options.kind });
  if (parentId) params.set("parent", parentId);
  if (options.breaks) params.set("breaks", "1");
  if (options.lines === "keep") params.set("lines", "keep");
  if (preview) params.set("preview", "1");
  return `/api/mobile/import?${params}`;
}

async function sendFiles(client: Client, projectId: string, parentId: string | null, files: Picked[], options: ImportOptions, preview: boolean): Promise<unknown> {
  const { body, type } = await multipart(files);
  const response = await client.raw(importQuery(projectId, parentId, options, preview), { method: "POST", body, headers: { "content-type": type }, timeoutMs: 300_000 }, expoFetch);
  return response.json();
}

/** What the files would create, without creating anything. */
export const previewImport = (client: Client, projectId: string, parentId: string | null, files: Picked[], options: ImportOptions) =>
  sendFiles(client, projectId, parentId, files, options, true) as Promise<ImportPreview>;

/** Imports the files into the project; answers how many notes were made, and the first of them. */
export async function importFiles(client: Client, projectId: string, parentId: string | null, files: Picked[], options: ImportOptions): Promise<{ notes: number; first: CreatedNode | null }> {
  const { nodes } = (await sendFiles(client, projectId, parentId, files, options, false)) as { nodes: CreatedNode[] };
  const ids = new Set(nodes.map((n) => n.id));
  return { notes: nodes.filter((n) => n.kind !== "folder").length, first: nodes.find((n) => !n.parentId || !ids.has(n.parentId)) ?? null };
}

const json = async <T>(response: Response) => (await response.json()) as T;

/**
 * Imports a `.plotra` file as a new project in the workspace: straight to object
 * storage first when the server has it, so a project with pictures isn't capped by
 * what one request may carry; through the server otherwise. As the web does.
 */
export async function importProjectFile(client: Client, workspaceSlug: string, picked: Picked): Promise<{ projectId: string; notes: number }> {
  const path = `/api/mobile/import?${new URLSearchParams({ format: "plotra", workspace: workspaceSlug })}`;
  const throughServer = async () => {
    const bytes = await new File(picked.uri).bytes();
    return client.raw(path, { method: "POST", body: bytes, headers: { "content-type": "application/octet-stream" }, timeoutMs: 600_000 }, expoFetch);
  };
  let begun: { url: string; token: string; contentType: string } | null = null;
  try {
    begun = await json(await client.raw("/api/mobile/import/direct", { method: "POST", body: JSON.stringify({ workspace: workspaceSlug, size: picked.size }), headers: { "content-type": "application/json" } }, expoFetch));
  } catch (error) {
    // 501: no object storage on this server, so it takes the file itself.
    if (!(error instanceof ApiError && error.status === 501)) throw error;
  }
  if (!begun) return json(await throughServer());

  let status: number;
  try {
    status = (await new File(picked.uri).upload(begun.url, { httpMethod: "PUT", headers: { "content-type": begun.contentType }, sessionType: "foreground" })).status;
  } catch {
    // Storage couldn't be reached from the phone. The server takes it instead, up to what one request may carry.
    try {
      return json(await throughServer());
    } catch (error) {
      if (error instanceof ApiError && error.status !== 413) throw error;
      throw new Error("The file couldn't be sent to storage. Check your connection and try again.");
    }
  }
  if (status < 200 || status >= 300) throw new Error(`The file couldn't be stored (${status}). Try again.`);
  return json(await client.raw(path, { method: "POST", body: JSON.stringify({ token: begun.token }), headers: { "content-type": "application/json" }, timeoutMs: 600_000 }, expoFetch));
}
