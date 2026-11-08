"use client";

import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@plotra/ui/components/dialog";
import { cn } from "@plotra/ui/lib/utils";
import { gzip, strFromU8, unzip } from "fflate";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fieldClass } from "@/components/views/view-ui";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { errorText, statusText } from "@/lib/errors";
import { responseError } from "@/components/agent/response-error";
import { IconButton } from "@plotra/ui/components/icon-button";
import type { PendingPicture } from "@/lib/io/import";
import type { ImportOptions, ImportPreview } from "@/lib/io/outline";
import { placeImportedPictures, type PicturePlacement } from "@/lib/io/picture-actions";
import { uploadAttachment } from "@/components/research/attachments";
import { isScrivenerProject, isScrivx, scrivenerKeep } from "@/lib/io/scrivener-files";
import { isWorldAnvilExport, worldAnvilKeep, worldAnvilPlace } from "@/lib/io/worldanvil-files";
import { decode } from "@/lib/read-codec";
import { containerKinds, isTrashed, nodeKindMeta, type BinderNode } from "@/lib/tree";
import { SelectField } from "@plotra/ui/components/select-field";
import { plural } from "@/lib/plural";

// Import (plan.md 2.7): Markdown, Word, RTF and plain-text files become
// chapters, scenes and notes, and a folder of them (an Obsidian vault) keeps
// its folders. A project from another app keeps its own structure: a
// Scrivener project (its .scriv folder, or a zip of it), a Plottr file, or a
// World Anvil export (its folder or zip); only what Plotra reads is sent
// (lib/io/scrivener.ts, plottr.ts, worldanvil.ts). The files are read on the
// server (POST /api/import); the dialog asks it what they would create before
// anything is created.
//
// A Plotra project file (.plotra, lib/io/plotra-file.ts) is different: it
// isn't added to this project but becomes a new project in the workspace,
// whole, with its world if it carries one.

const ACCEPT = ".md,.markdown,.txt,.docx,.rtf,.zip,.pltr,.plotra";
const PLOTRA = /\.plotra$/i;
const EXTENSION = /\.(md|markdown|mdown|txt|text|docx|rtf)$/i;
const MARKDOWN = /\.(md|markdown|mdown)$/i;
// A vault's pictures: only their paths go with the notes; the ones the notes show are uploaded after (lib/io/vault-pictures.ts).
const PICTURE_FILE = /\.(png|jpe?g|gif|webp|avif)$/i;
// The server's limits (lib/io/upload.ts), checked here first so a large upload fails before it's sent.
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 3200;
// The server's limit on what a project's gzipped files unpack to (lib/io/upload.ts).
const MAX_PROJECT_BYTES = 60 * 1024 * 1024;
// A zipped project is unpacked here, so only its text is sent; research PDFs and pictures can make it large.
const MAX_ZIP_BYTES = 500 * 1024 * 1024;
// A folder is walked in the browser; one that turns out to be a whole disk is given up on.
const MAX_WALKED = 20000;
const LISTED = 100;

/** A chosen file and where it was in the folder it came with (`Vault/Places/Verona.md`); just its name otherwise. */
type Picked = { file: File; path: string };

// Obsidian's settings and trash, version control, anything else a dot hides.
const isHidden = (path: string) => path.split("/").some((part) => part.startsWith("."));

/** Every file under a dropped file or folder. */
async function walk(entry: FileSystemEntry, out: Picked[]): Promise<void> {
  if (out.length >= MAX_WALKED || entry.name.startsWith(".")) return;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    out.push({ file, path: entry.fullPath.replace(/^\//, "") });
    return;
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // A folder is read a batch at a time until a batch comes back empty.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) return;
    for (const child of batch) await walk(child, out);
  }
}

/** A project from another app, kept whole: its structure comes from the app, not from the options. */
type ProjectKind = "scrivener" | "plottr" | "worldanvil";
const projectOf = (files: Picked[]): ProjectKind | null =>
  files.some((f) => isScrivx(f.path))
    ? "scrivener"
    : files.some((f) => /\.pltr$/i.test(f.path))
      ? "plottr"
      : files.length && files.every((f) => worldAnvilKeep(f.path))
        ? "worldanvil"
        : null;
const projectLabel: Record<ProjectKind, string> = {
  scrivener: "A Scrivener project: its binder, text and synopses.",
  plottr: "A Plottr file: its timeline, cards and plotlines, characters, places and notes.",
  worldanvil: "A World Anvil export: its articles, in their categories.",
};

/** A Plottr file without its pictures, which are kept inside it and can make it many megabytes; Plotra leaves them out anyway. */
async function withoutPictures(file: File): Promise<File> {
  try {
    const data = JSON.parse(await file.text()) as Record<string, unknown>;
    delete data.images;
    return new File([JSON.stringify(data)], file.name, { type: "application/json" });
  } catch {
    // Not JSON: the server says so.
    return file;
  }
}

/** What Plotra reads of a zipped Scrivener project or World Anvil export, as files with their paths; null when the zip holds neither. */
async function unzipProject(zip: File): Promise<Picked[] | null> {
  if (zip.size > MAX_ZIP_BYTES) throw new Error(`“${zip.name}” is over ${MAX_ZIP_BYTES / 1024 / 1024} MB. Remove the research files from a copy of the project, or choose the .scriv folder instead.`);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  // Asynchronous, so a large project doesn't freeze the page while it's unpacked.
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(bytes, { filter: (entry) => !entry.name.startsWith("__MACOSX/") && (scrivenerKeep(entry.name) || worldAnvilKeep(entry.name)) }, (error, out) =>
      error ? reject(error) : resolve(out),
    ),
  );
  const paths = Object.keys(entries).filter((path) => !path.endsWith("/"));
  const keep = isScrivenerProject(paths) ? scrivenerKeep : isWorldAnvilExport(paths) ? worldAnvilKeep : null;
  if (!keep) return null;
  return paths.filter(keep).map((path) => ({ file: new File([entries[path] as BlobPart], path.split("/").at(-1)!), path }));
}

/** A chosen `.plotra` file and what its manifest says it holds. */
type ProjectFile = { file: File; title: string; world: string | null };

/** Reads just the manifest of a `.plotra` file, to say what importing it creates. */
async function readProjectFile(file: File): Promise<ProjectFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(bytes, { filter: (entry) => entry.name === "plotra.json" }, (error, out) => (error ? reject(error) : resolve(out))),
  );
  const manifest = entries["plotra.json"] ? (JSON.parse(strFromU8(entries["plotra.json"])) as { format?: string; project?: { title?: string }; world?: { title?: string } | null }) : null;
  if (manifest?.format !== "plotra") throw new Error(`“${file.name}” isn't a Plotra project file.`);
  return { file, title: manifest.project?.title || "Untitled", world: manifest.world?.title ?? null };
}

/**
 * Sends a `.plotra` file to be imported: straight to object storage first when
 * the server has it (lib/io/plotra-upload.ts), so a project with pictures isn't
 * capped by a function's body limit; through the app otherwise.
 */
async function sendProjectFile(workspaceSlug: string, file: File): Promise<Response> {
  const own = { "x-plotra-request": "1" };
  const url = `/api/import?${new URLSearchParams({ format: "plotra", workspace: workspaceSlug })}`;
  const throughApp = () => fetch(url, { method: "POST", body: file, headers: { ...own, "content-type": "application/octet-stream" } });
  const begin = await fetch("/api/import/direct", {
    method: "POST",
    headers: { ...own, "content-type": "application/json" },
    body: JSON.stringify({ workspace: workspaceSlug, size: file.size }),
  });
  // No object storage on this server: the app takes the file itself.
  if (begin.status === 501) return throughApp();
  if (!begin.ok) return begin;
  const { url: target, token, contentType } = (await begin.json()) as { url: string; token: string; contentType: string };
  let put: Response;
  try {
    put = await fetch(target, { method: "PUT", body: file, headers: { "content-type": contentType } });
  } catch {
    // The bucket doesn't let this site upload (its CORS rules), can't be reached from the browser
    // (a self-hosted store inside its compose network), or the connection dropped. The app takes it
    // instead; on the hosted app that's only possible up to a function's body limit (4.5 MB).
    const res = await throughApp().catch(() => null);
    if (res && res.status !== 413) return res;
    throw new Error("The file couldn't be sent to storage. Check your connection and try again.");
  }
  if (!put.ok) throw new Error(`The file couldn't be stored. ${statusText(put.status)}`);
  return fetch(url, { method: "POST", headers: { ...own, "content-type": "application/json" }, body: JSON.stringify({ token }) });
}

const counted = (n: number, one: string, many?: string) => `${n.toLocaleString()} ${plural(n, one, many)}`;

function describe(summary: ImportPreview["summary"]) {
  const parts = [
    summary.folders && counted(summary.folders, "folder"),
    summary.chapters && counted(summary.chapters, "chapter"),
    summary.scenes && counted(summary.scenes, "scene"),
    summary.notes && counted(summary.notes, "note"),
  ].filter(Boolean);
  return `${parts.join(", ")} · ${counted(summary.words, "word")}`;
}

/** A file gzipped, named `….gz`: how a project's files are sent, so a long manuscript or a big world fits in one upload. */
async function gzipped(file: File): Promise<File> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const packed = await new Promise<Uint8Array>((resolve, reject) => gzip(bytes, (error, out) => (error ? reject(error) : resolve(out))));
  return new File([packed as BlobPart], `${file.name}.gz`);
}

async function send(projectId: string, parentId: string | null, files: Picked[], options: ImportOptions, preview: boolean, signal?: AbortSignal, pictures: Picked[] = []) {
  const params = new URLSearchParams({ project: projectId, split: options.split, kind: options.kind });
  if (parentId) params.set("parent", parentId);
  if (options.breaks) params.set("breaks", "1");
  if (options.lines === "keep") params.set("lines", "keep");
  if (preview) params.set("preview", "1");
  const body = new FormData();
  const pack = projectOf(files) !== null;
  for (const { file, path } of files) {
    const sent = pack ? await gzipped(file) : file;
    body.append("file", sent, sent.name);
    body.append("path", pack ? `${path}.gz` : path);
  }
  for (const { path } of pictures) body.append("picture", path);
  // The header marks the request as the app's own (app/api/files/store.ts).
  const res = await fetch(`/api/import?${params}`, { method: "POST", body, headers: { "x-plotra-request": "1" }, signal });
  if (!res.ok) throw await responseError(res, "The import didn't work. Try again.");
  return res.text();
}

export function ImportDialog({ nodeId, onClose }: { nodeId: string | null; onClose: () => void }) {
  const { project, binder, track, announce, setUi, open, workspace } = useWorkspace();
  const router = useRouter();
  const [projectFile, setProjectFile] = useState<ProjectFile | null>(null);
  const { index } = useStore(binder);
  const [files, setFiles] = useState<Picked[]>([]);
  // Pictures in a chosen folder (a vault's attachments): uploaded after the notes, the ones they show.
  const [pictures, setPictures] = useState<Picked[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  // Files of a chosen folder that can't be imported: pictures, canvases, PDFs.
  const [leftOut, setLeftOut] = useState(0);
  const [split, setSplit] = useState<ImportOptions["split"]>("headings");
  const [breaks, setBreaks] = useState(false);
  const [keepLines, setKeepLines] = useState(false);
  const [keepRoot, setKeepRoot] = useState(false);
  // Markdown notes are usually notes; a manuscript in Word or plain text is scenes.
  const [kind, setKind] = useState<ImportOptions["kind"] | null>(null);
  // What the server said about one particular choice of files and options; stale answers are ignored.
  const [answer, setAnswer] = useState<{ key: string; preview?: ImportPreview; problem?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  // Into the folder the dialog was opened on, when it's one the user can add to.
  const target = nodeId ? index.byId.get(nodeId) : undefined;
  const parent = target && containerKinds.includes(target.kind) && !isTrashed(index, target.id) && target.actions.includes("edit") ? target : undefined;
  const effectiveKind = kind ?? (files.length && files.every((f) => MARKDOWN.test(f.file.name)) ? "note" : "scene");
  const hasText = files.some((f) => /\.(txt|text)$/i.test(f.file.name));
  const hasMarkdown = files.some((f) => MARKDOWN.test(f.file.name));

  const source = projectOf(files);
  const scrivener = source === "scrivener";

  const choose = async (chosen: Picked[]) => {
    if (!chosen.length) return;
    // A Plotra project file is a project of its own, imported alone.
    const plotra = chosen.find((f) => PLOTRA.test(f.file.name));
    if (plotra) {
      if (!workspace.role) return void toast.error("Only members of a workspace can add projects to it.");
      try {
        setProjectFile(await readProjectFile(plotra.file));
        setFiles([]);
        setLeftOut(0);
      } catch (error) {
        toast.error(errorText(error, `“${plotra.file.name}” couldn't be opened.`));
      }
      return;
    }
    setProjectFile(null);
    // A zipped Scrivener project or World Anvil export is opened here; any other zip isn't something Plotra reads.
    const zips = chosen.filter((f) => /\.zip$/i.test(f.file.name));
    if (zips.length) {
      chosen = chosen.filter((f) => !zips.includes(f));
      for (const zip of zips) {
        try {
          const inside = await unzipProject(zip.file);
          if (inside) chosen.push(...inside);
          else toast.message(`“${zip.file.name}” has no Scrivener project or World Anvil export in it. Unzip it and choose the files inside.`);
        } catch (error) {
          toast.error(errorText(error, `“${zip.file.name}” couldn't be opened.`));
        }
      }
      if (!chosen.length) return;
    }
    // A project from another app replaces whatever was chosen before: it's a whole binder of its own.
    const plottr = chosen.find((f) => /\.pltr$/i.test(f.file.name));
    if (plottr) {
      setLeftOut(0);
      setFiles([{ file: await withoutPictures(plottr.file), path: plottr.file.name }]);
      return;
    }
    const paths = chosen.map((f) => f.path);
    const keep = isScrivenerProject(paths) ? scrivenerKeep : isWorldAnvilExport(paths) ? worldAnvilKeep : null;
    if (keep) {
      const kept = chosen.filter((f) => keep(f.path));
      if (kept.length > MAX_FILES) return void toast.error(`That project has more documents than one import can take (${(MAX_FILES / 2).toLocaleString()}). Import it from a copy split in two.`);
      setLeftOut(0);
      setFiles(kept);
      return;
    }
    const visible = chosen.filter((f) => !isHidden(f.path));
    const usable = visible.filter((f) => EXTENSION.test(f.file.name));
    const folder = chosen.some((f) => f.path.includes("/"));
    const seen = folder ? visible.filter((f) => PICTURE_FILE.test(f.file.name)) : [];
    if (seen.length) setPictures((have) => [...have, ...seen.filter((f) => !have.some((p) => p.path === f.path))]);
    if (folder) {
      setLeftOut((n) => n + visible.length - usable.length - seen.length);
      if (!usable.length) toast.message("That folder has no Markdown, Word or plain text files in it.");
      // A folder of notes is a vault: a note per file, its lines as they were written. Both can be changed back.
      else if (usable.some((f) => MARKDOWN.test(f.file.name))) {
        setSplit("file");
        setKeepLines(true);
      }
    } else if (usable.length < chosen.length) toast.message("Only Markdown (.md), Word (.docx), rich text (.rtf), plain text (.txt), Scrivener and Plottr projects and World Anvil exports can be imported.");
    const next = [...files, ...usable.filter((f) => !files.some((have) => have.path === f.path && have.file.size === f.file.size))];
    if (next.length > MAX_FILES) toast.message(`An import can be up to ${MAX_FILES.toLocaleString()} files. The first ${MAX_FILES.toLocaleString()} are kept; import the rest after.`);
    setFiles(next.slice(0, MAX_FILES));
  };
  const chooseList = (list: FileList | null) => void choose([...(list ?? [])].map((file) => ({ file, path: file.webkitRelativePath || file.name })));
  const drop = async (transfer: DataTransfer) => {
    // The entries have to be taken before the first await; the drop's data is gone after it.
    const entries = [...transfer.items].map((item) => item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry => Boolean(entry));
    if (!entries.some((entry) => entry.isDirectory)) return chooseList(transfer.files);
    const walked: Picked[] = [];
    try {
      for (const entry of entries) await walk(entry, walked);
    } catch {
      return void toast.error("That folder couldn't be read. Try “Choose folder…” instead.");
    }
    void choose(walked);
  };

  // A vault's own name is one folder too many in a binder, unless it's asked for.
  const roots = new Set(files.filter((f) => f.path.includes("/")).map((f) => f.path.split("/")[0]));
  // A project's folder is how it's stored, not part of its binder.
  const root = !source && roots.size === 1 && files.every((f) => f.path.includes("/")) ? [...roots][0] : null;
  const sent = root && !keepRoot ? files.map((f) => ({ ...f, path: f.path.slice(root.length + 1) })) : files;
  // Pictures named the way their notes are, so a note's `![[map.png]]` finds its own.
  const sentPictures = source ? [] : root && !keepRoot ? pictures.filter((f) => f.path.startsWith(`${root}/`)).map((f) => ({ ...f, path: f.path.slice(root.length + 1) })) : pictures;
  const lines = keepLines && hasMarkdown ? "keep" : "wrap";

  const size = files.reduce((sum, f) => sum + f.file.size, 0);
  // A project's files are gzipped on the way (see `send`), so it's held to what they unpack to.
  const tooLarge = size > (source ? MAX_PROJECT_BYTES : MAX_BYTES);

  // Ask the server what these files would create, a moment after the last change.
  const key = JSON.stringify([sent.map((f) => [f.path, f.file.size, f.file.lastModified]), sentPictures.length, split, breaks, lines, effectiveKind, parent?.id ?? null]);
  useEffect(() => {
    if (!files.length || tooLarge) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      send(project.id, parent?.id ?? null, sent, { split, breaks, kind: effectiveKind, lines }, true, controller.signal, sentPictures)
        .then((text) => setAnswer({ key, preview: JSON.parse(text) as ImportPreview }))
        .catch((error) => {
          if (!controller.signal.aborted) setAnswer({ key, problem: errorText(error, "Those files couldn't be read.") });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `key` stands for the files and every option.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, project.id, tooLarge]);
  const preview = answer?.key === key ? (answer.preview ?? null) : null;
  const problem = answer?.key === key ? (answer.problem ?? null) : null;

  const runProjectFile = async (chosen: ProjectFile) => {
    setBusy(true);
    try {
      const res = await sendProjectFile(workspace.slug, chosen.file);
      if (!res.ok) throw await responseError(res, "The import didn't work. Try again.");
      const { href } = (await res.json()) as { href: string };
      toast.success(`Imported “${chosen.title}” as a new project.`);
      onClose();
      router.push(href);
    } catch (error) {
      toast.error(errorText(error, "The import failed."));
    } finally {
      setBusy(false);
    }
  };

  /** Uploads the vault's pictures the new notes show, each as a file of the first note that shows it, then puts them in their notes. */
  const addPictures = async (shown: PendingPicture[]) => {
    const byPath = new Map(sentPictures.map((f) => [f.path.toLowerCase(), f.file]));
    const placements: PicturePlacement[] = [];
    let done = 0;
    let failed = 0;
    setProgress(`Adding pictures: 0 of ${shown.length}`);
    // A few at a time: each is a request of its own, possibly straight to storage.
    const queue = [...shown];
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const file = byPath.get(next.path.toLowerCase());
        let fileId: string | null = null;
        if (file) {
          try {
            fileId = (await uploadAttachment(project.id, next.nodeIds[0], file)).id;
          } catch {
            failed++;
          }
        } else failed++;
        placements.push({ ...next, fileId });
        setProgress(`Adding pictures: ${++done} of ${shown.length}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, shown.length) }, worker));
    try {
      await placeImportedPictures(project.id, placements);
    } catch (error) {
      toast.error(errorText(error, "The pictures couldn't be put in their notes."));
    }
    if (failed) toast.message(`${counted(failed, "picture")} couldn't be added (too large, or not in the folder), and ${failed === 1 ? "was" : "were"} left out.`);
    setProgress(null);
  };

  const run = async () => {
    if (projectFile) return runProjectFile(projectFile);
    setBusy(true);
    try {
      const { nodes: created, pictures: shown } = decode<{ nodes: BinderNode[]; pictures: PendingPicture[] }>(
        await track(send(project.id, parent?.id ?? null, sent, { split, breaks, kind: effectiveKind, lines }, false, undefined, sentPictures)),
      );
      binder.upsert(...created);
      if (shown.length) await addPictures(shown);
      announce();
      const ids = new Set(created.map((n) => n.id));
      const top = created.filter((n) => !n.parentId || !ids.has(n.parentId));
      if (top[0]) setUi({ left: true, leftTab: "binder", selectedId: top[0].id });
      // One note is opened; a whole manuscript is left for the writer to browse.
      if (created.length === 1 && created[0].kind !== "folder") open(created[0].id, "tab");
      toast.success(`Imported ${counted(created.filter((n) => n.kind !== "folder").length, "note")}${parent ? ` into ${parent.title}` : ""}.`);
      onClose();
    } catch (error) {
      toast.error(errorText(error, "The import failed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && !busy && onClose()}>
      <DialogContent className="gap-4 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="import-linear" className="size-5 text-ember-ink" />
            Import
          </DialogTitle>
          <DialogDescription className="text-ui-sm">
            Bring writing in {parent ? `to ${parent.title}` : "at the top of the binder"}. Nothing you already have is changed.
          </DialogDescription>
          <ul className="list-disc space-y-0.5 pl-5 text-ui-sm text-muted-foreground">
            <li>Word (.docx), Markdown, rich text (.rtf) or plain text files</li>
            <li>A whole folder of them, such as an Obsidian vault</li>
            <li>A Scrivener or Plottr project, or a World Anvil export</li>
            <li>A Plotra project file (.plotra), which becomes a new project</li>
          </ul>
        </DialogHeader>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void drop(e.dataTransfer);
          }}
          className={cn("grid gap-2 rounded-md border border-dashed p-3 text-ui-sm", dragging && "border-ember bg-ember/5")}
        >
          <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => (chooseList(e.target.files), (e.target.value = ""))} />
          {/* `webkitdirectory` is the one way a page can be handed a folder; every current browser has it. */}
          <input ref={folderInput} type="file" multiple className="hidden" {...{ webkitdirectory: "" }} onChange={(e) => (chooseList(e.target.files), (e.target.value = ""))} />
          {projectFile && (
            <ul className="grid gap-0.5">
              <li className="flex items-center gap-2">
                <Icon name="archive-linear" className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{projectFile.file.name}</span>
                <span className="shrink-0 text-xs text-faint">{Math.max(1, Math.round(projectFile.file.size / 1024)).toLocaleString()} KB</span>
                <IconButton icon="close-linear" size="xs" label={`Remove ${projectFile.file.name}`} onClick={() => setProjectFile(null)} />
              </li>
            </ul>
          )}
          {files.length > 0 && (
            <ul className="grid max-h-32 gap-0.5 overflow-y-auto">
              {(source === "scrivener" ? sent.filter((f) => isScrivx(f.path)) : source === "worldanvil" ? sent.slice(0, 1) : sent).slice(0, LISTED).map(({ file, path }, i) => (
                <li key={`${path}:${file.size}`} className="flex items-center gap-2">
                  <Icon name="file-text-linear" className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {scrivener ? file.name.replace(/\.scrivx$/i, "") : source === "worldanvil" ? (worldAnvilPlace(path)?.world ?? "World Anvil export") : path}
                  </span>
                  <span className="shrink-0 text-xs text-faint">
                    {scrivener ? `${counted(files.filter((f) => /content\.rtf$|^\d+\.rtf$/i.test(f.file.name)).length, "document")} · ` : ""}
                    {source === "worldanvil" ? `${counted(files.length, "article")} · ` : ""}
                    {Math.max(1, Math.round((source ? size : file.size) / 1024)).toLocaleString()} KB
                  </span>
                  <IconButton
                    icon="close-linear"
                    size="xs"
                    label={`Remove ${file.name}`}
                    // A project goes as a whole.
                    onClick={() => setFiles(source ? [] : files.filter((f) => f !== files[i]))}
                  />
                </li>
              ))}
              {!source && files.length > LISTED && <li className="text-xs text-faint">and {(files.length - LISTED).toLocaleString()} more</li>}
            </ul>
          )}
          {source ? (
            <p className="text-xs text-muted-foreground">
              {projectLabel[source]}
              {preview?.threads ? ` Its ${counted(preview.threads, "plotline")} become${preview.threads === 1 ? "s a" : ""} plot ${plural(preview.threads, "thread")}.` : ""}
              {preview?.leftOut ? ` ${counted(preview.leftOut, "item")} that ${preview.leftOut === 1 ? "isn't" : "aren't"} text (PDFs, pictures, web pages) ${preview.leftOut === 1 ? "is" : "are"} left out.` : ""}
            </p>
          ) : files.length > 0 && (leftOut > 0 || files.length > 1) && (
            <p className="text-xs text-muted-foreground">
              {counted(files.length, "file")}
              {leftOut > 0 && `. ${counted(leftOut, "other file")} in the folder (pictures, canvases, PDFs) ${leftOut === 1 ? "is" : "are"} left out`}.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
              {files.length ? "Add files…" : "Choose files…"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => folderInput.current?.click()}>
              <Icon name="folder-linear" />
              {files.length ? "Add a folder…" : "Choose a folder…"}
            </Button>
            <span className="text-xs text-faint">{files.length ? "" : "or drop them here. "}Up to 10 MB at a time.</span>
            {!files.length && (
              <span className="basis-full text-xs text-faint">
                For Scrivener, choose or drop the project&apos;s .scriv folder (on a Mac, drop it here, or compress it and choose the .zip). For Plottr, choose the .pltr file; for World Anvil, the export&apos;s .zip or its folder. A Plotra project file (.plotra) becomes a new project.
              </span>
            )}
            {files.length > 0 && (
              <button type="button" onClick={() => (setFiles([]), setPictures([]), setLeftOut(0))} className="ml-auto h-8 rounded-md px-2 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Clear
              </button>
            )}
          </div>
        </div>

        {/* A project from another app keeps its own structure: none of the ways of cutting up files apply. */}
        <fieldset className={cn("grid gap-2 text-ui-sm", (source || projectFile) && "hidden")} disabled={busy}>
          <legend className="sr-only">How to split the files</legend>
          <label className="flex items-start gap-2">
            <input type="radio" name="split" className="mt-1" checked={split === "headings"} onChange={() => setSplit("headings")} />
            <span>
              Split at headings
              <span className="block text-xs text-muted-foreground">
                A top-level heading (<code>#</code>, Heading 1{hasText ? ", or a line like “Chapter 1”" : ""}) starts a chapter; a second-level heading (<code>##</code>, Heading 2) starts a scene.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" name="split" className="mt-1" checked={split === "file"} onChange={() => setSplit("file")} />
            <span>
              One note per file
              <span className="block text-xs text-muted-foreground">Each file becomes a single note, headings and all.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={breaks} onChange={(e) => setBreaks(e.target.checked)} />
            <span>
              Start a new scene at every scene break
              <span className="block text-xs text-muted-foreground">
                A line of <code>***</code>, <code>#</code> or a rule between passages.
              </span>
            </span>
          </label>
          {hasMarkdown && (
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={keepLines} onChange={(e) => setKeepLines(e.target.checked)} />
              <span>
                Keep single line breaks
                <span className="block text-xs text-muted-foreground">A new line in a Markdown note stays a new line, as Obsidian shows it. Leave off for text that was wrapped by hand.</span>
              </span>
            </label>
          )}
          {root && (
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={keepRoot} onChange={(e) => setKeepRoot(e.target.checked)} />
              <span>
                Keep “{root}” as a folder
                <span className="block text-xs text-muted-foreground">Otherwise what is inside it goes straight {parent ? `into ${parent.title}` : "into the binder"}.</span>
              </span>
            </label>
          )}
          <label className="flex items-center gap-2">
            <span className="shrink-0 text-muted-foreground">Text without a heading of its own becomes</span>
            <SelectField value={effectiveKind} onValueChange={(v) => setKind(v as ImportOptions["kind"])} className={cn(fieldClass, "w-28")}>
              <option value="scene">a scene</option>
              <option value="note">a note</option>
            </SelectField>
          </label>
        </fieldset>

        <div className="min-h-16 rounded-md bg-muted/60 px-3 py-2 text-ui-sm" aria-live="polite">
          {projectFile ? (
            <>
              <p className="font-medium">
                Creates a new project in {workspace.name}: “{projectFile.title}”{projectFile.world ? `, and its world “${projectFile.world}” beside it` : ""}.
              </p>
              <p className="mt-1 text-muted-foreground">Everything in the file comes along: notes, boards, timelines, version history, comments and pictures. This project isn&apos;t changed.</p>
            </>
          ) : tooLarge ? (
            <p className="text-destructive">
              {source
                ? `This project's text is ${Math.ceil(size / (1024 * 1024))} MB; one import can take up to 60 MB of it. Import it from a copy with part of the manuscript moved to the trash, then the rest.`
                : `These files are ${Math.ceil(size / (1024 * 1024))} MB together; an import can be up to 10 MB. Import them in parts.`}
            </p>
          ) : problem ? (
            <p className="text-destructive">{problem}</p>
          ) : !files.length ? (
            <p className="text-muted-foreground">Choose files to see what will be created.</p>
          ) : !preview ? (
            <p className="text-muted-foreground">Reading…</p>
          ) : (
            <>
              <p className="font-medium">Creates {describe(preview.summary)}</p>
              {(preview.pictures || preview.properties) && (
                <p className="text-xs text-muted-foreground">
                  {[
                    preview.pictures && `${counted(preview.pictures, "picture")} the notes show, uploaded with them`,
                    preview.properties && `${counted(preview.properties, "extra detail")} from the top of Markdown files, kept as ${preview.properties === 1 ? "a property" : "properties"}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  .
                </p>
              )}
              <ul className="mt-1 grid max-h-36 gap-0.5 overflow-y-auto text-muted-foreground">
                {preview.entries.map((entry, i) => {
                  let depth = 0;
                  for (let p = entry.parent; p !== null && depth < 8; p = preview.entries[p]?.parent ?? null) depth++;
                  return (
                    <li key={i} className="flex items-center gap-1.5" style={{ paddingLeft: depth * 14 }}>
                      <Icon name={nodeKindMeta[entry.kind].icon} className="size-3.5 shrink-0" />
                      <span className="truncate">{entry.title}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy || (!projectFile && (!preview || tooLarge))} onClick={() => void run()}>
            {progress ?? (busy ? "Importing…" : "Import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
