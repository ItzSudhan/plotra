"use client";

import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { confirm } from "@plotra/ui/components/dialogs";
import { IconButton } from "@plotra/ui/components/icon-button";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { sharedResource } from "@/components/workflow/data";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { read } from "@/lib/read";
import { decode } from "@/lib/read-codec";
import type { AttachmentRow } from "@/lib/research-actions";
import type { BinderNode } from "@/lib/tree";
import { insertImageIntoNote } from "./editor-bridge";
import { errorText } from "@/lib/errors";
import { plural } from "@/lib/plural";

// Files attached to a source (plan.md 2.8 "Clip web pages/PDFs/images into
// research notes"): PDFs, scans, photographs. They're uploaded to and served
// from /api/files, which checks access to the note on every request.

/** Announced after a file is added or removed. */
export const ATTACHMENTS_NOTICE = "attachments";

const useAttachmentsResource = sharedResource<AttachmentRow[]>();

/** Every attachment in the project the user can see. */
export function useAttachments() {
  const { project } = useWorkspace();
  return useAttachmentsResource(project.id, () => read("listAttachments", project.id), ATTACHMENTS_NOTICE);
}

export const fileUrl = (id: string, download = false) => `/api/files/${id}${download ? "?download=1" : ""}`;

/** Image types /api/files serves in place (never SVG), so they can be shown as thumbnails and put in a note. */
const images = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);
export const isImage = (file: Pick<AttachmentRow, "contentType">) => images.has(file.contentType);

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ownRequest = { "x-plotra-request": "1" };

async function failure(res: Response) {
  const text = res.headers.get("content-type")?.startsWith("text/plain") ? await res.text().catch(() => "") : "";
  return new Error(text || `Something went wrong (${res.status}).`);
}

/** The most a file sent through the app can be on the hosted version (a Vercel Function's body limit). */
const THROUGH_APP_BYTES = 4 * 1024 * 1024;

/**
 * Attaches a file to a research note: straight to object storage when the
 * server has it (so large files aren't capped by a function's body limit),
 * through the app otherwise.
 */
export async function uploadAttachment(projectId: string, nodeId: string, file: File): Promise<AttachmentRow> {
  const type = file.type || "application/octet-stream";
  const begin = await fetch("/api/files/direct", {
    method: "POST",
    headers: { ...ownRequest, "content-type": "application/json" },
    body: JSON.stringify({ project: projectId, node: nodeId, name: file.name, type, size: file.size }),
  });
  // No object storage on this server: the app takes the file itself.
  if (begin.status === 501) return uploadThroughApp(projectId, nodeId, file);
  if (!begin.ok) throw await failure(begin);
  const { url, token, contentType } = (await begin.json()) as { url: string; token: string; contentType: string };
  let put: Response;
  try {
    put = await fetch(url, { method: "PUT", body: file, headers: { "content-type": contentType } });
  } catch {
    // The bucket doesn't let this site upload (its CORS rules), can't be reached from the browser
    // (a self-hosted store inside its compose network), or the connection dropped.
    if (file.size <= THROUGH_APP_BYTES) return uploadThroughApp(projectId, nodeId, file);
    // Larger files can go through a self-hosted app; the hosted one refuses them (a function's body limit).
    try {
      return await uploadThroughApp(projectId, nodeId, file);
    } catch (error) {
      // The app's own refusals say why; anything else (the platform's 413, no connection) doesn't.
      if (error instanceof Error && !error.message.startsWith("Something went wrong") && !(error instanceof TypeError)) throw error;
      throw new Error("The file couldn't be sent to storage. Check your connection and try again.");
    }
  }
  if (!put.ok) throw new Error(`The file couldn't be stored (${put.status}). Try again.`);
  const done = await fetch("/api/files/direct/done", {
    method: "POST",
    headers: { ...ownRequest, "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!done.ok) throw await failure(done);
  return decode<AttachmentRow>(await done.text());
}

async function uploadThroughApp(projectId: string, nodeId: string, file: File): Promise<AttachmentRow> {
  const params = new URLSearchParams({ project: projectId, node: nodeId, name: file.name });
  const res = await fetch(`/api/files?${params}`, {
    method: "POST",
    body: file,
    headers: { ...ownRequest, "content-type": file.type || "application/octet-stream" },
  });
  if (!res.ok) throw await failure(res);
  return decode<AttachmentRow>(await res.text());
}

export async function removeAttachment(id: string) {
  const res = await fetch(fileUrl(id), { method: "DELETE", headers: ownRequest });
  if (!res.ok && res.status !== 404) throw await failure(res);
}

const iconFor = (file: AttachmentRow) => (file.contentType === "application/pdf" ? "file-text-linear" : isImage(file) ? "gallery-linear" : "paperclip-linear");

/** A source's files: drop or choose to add, open, download, put an image into the note, remove. */
export function Attachments({ node }: { node: BinderNode }) {
  const { project, openNode, withEditor, notify } = useWorkspace();
  const { data, refresh } = useAttachments();
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(0);
  const canEdit = node.actions.includes("edit");
  const files = (data ?? []).filter((a) => a.nodeId === node.id);

  const changed = () => {
    refresh();
    notify(ATTACHMENTS_NOTICE);
  };

  const upload = async (list: File[]) => {
    if (!list.length) return;
    setUploading((n) => n + list.length);
    // One at a time: several large files at once only compete with each other.
    for (const file of list) {
      try {
        await uploadAttachment(project.id, node.id, file);
      } catch (error) {
        toast.error(`${file.name}: ${errorText(error, "couldn't be uploaded.")}`);
      }
      setUploading((n) => n - 1);
    }
    changed();
  };

  const remove = async (file: AttachmentRow) => {
    const ok = await confirm({
      title: `Delete ‘${file.name}’ for good?`,
      description: "The file is removed from Plotra, and any picture of it in your notes stops showing. This can't be undone.",
      confirmLabel: "Delete file",
    });
    if (!ok) return;
    try {
      await removeAttachment(file.id);
      changed();
    } catch (error) {
      toast.error(errorText(error, "Couldn't remove it."));
    }
  };

  const insert = (file: AttachmentRow) => {
    openNode(node.id, "tab");
    // Runs once the note's editor has loaded.
    withEditor(node.id, () => {
      if (insertImageIntoNote(node.id, fileUrl(file.id), file.name)) toast.success("Added to the note.");
      else toast.error("The note can't be edited right now.");
    });
  };

  return (
    <div
      onDragOver={(e) => {
        if (!canEdit || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!canEdit || !e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        void upload([...e.dataTransfer.files]);
      }}
      className={cn("grid gap-1.5 rounded-lg border border-dashed border-transparent", dragging && "border-ember bg-ember/5")}
    >
      {data === null ? (
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
      ) : (
        files.length === 0 && <p className="text-xs text-faint">{canEdit ? "No files yet. Drop a PDF or an image here." : "No files."}</p>
      )}
      {files.map((file) => (
        <div key={file.id} className="group/file flex items-center gap-2 rounded-md border bg-card p-1.5">
          <a
            href={fileUrl(file.id)}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`Open ${file.name}`}
            tabIndex={-1}
            className="grid size-10 shrink-0 place-items-center overflow-hidden rounded bg-muted text-muted-foreground"
          >
            {isImage(file) ? (
              // eslint-disable-next-line @next/next/no-img-element -- served by /api/files after an access check
              <img src={fileUrl(file.id)} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
              <Icon name={iconFor(file)} className="size-5" />
            )}
          </a>
          <div className="grid min-w-0 flex-1">
            <a href={fileUrl(file.id)} target="_blank" rel="noreferrer noopener" className="truncate text-ui-sm hover:text-ember-ink" title={file.name}>
              {file.name}
            </a>
            <span className="text-xs text-faint">{formatBytes(file.size)}</span>
          </div>
          {isImage(file) && canEdit && (
            <IconButton icon="gallery-linear" label={`Insert ${file.name} into the note`} onClick={() => insert(file)} />
          )}
          <Tooltip content="Download">
            <a
              href={fileUrl(file.id, true)}
              aria-label={`Download ${file.name}`}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground pointer-coarse:size-11"
            >
              <Icon name="download-linear" className="size-4" />
            </a>
          </Tooltip>
          {canEdit && (
            <IconButton icon="trash-bin-minimalistic-linear" variant="destructive" label={`Delete ${file.name}`} onClick={() => void remove(file)} />
          )}
        </div>
      ))}
      {canEdit && (
        <>
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              void upload([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={uploading > 0}
            onClick={() => picker.current?.click()}
            className="flex h-8 items-center gap-1.5 rounded-md px-1 text-ui-sm text-faint hover:bg-accent hover:text-foreground disabled:opacity-60"
          >
            <Icon name="upload-linear" className="size-3.5" />
            {uploading > 0 ? `Uploading ${uploading} ${plural(uploading, "file")}…` : "Attach a file"}
          </button>
        </>
      )}
    </div>
  );
}
