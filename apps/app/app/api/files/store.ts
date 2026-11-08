import "server-only";
import { isLocalMode } from "@/lib/local-mode";
import { schema } from "@plotra/db";
import { eq, sql } from "drizzle-orm";
import { unstable_rethrow } from "next/navigation";
import { requireNodeAccess } from "@/lib/access";
import { assertStorage, limitsFor } from "@/lib/quotas";
import { getSession } from "@/lib/data";
import { publicMessage } from "@/lib/errors";
import { userDb } from "@/lib/db";
import { r2Delete, r2Enabled, r2Get, r2PresignPut, r2Put, r2Size } from "@/lib/r2";
import { makeRoom } from "@/lib/versions";
import { isDocumentKind } from "@/lib/story";
import { readOnly, transaction } from "@/lib/request-cache";
import { readToken, signToken } from "@/lib/signed-token";
import type { AttachmentRow } from "@/lib/research-actions";

// Files attached to research notes (plan.md 2.8 "Clip web pages/PDFs/images").
// They go to R2 when it's configured and into Postgres otherwise, like version
// snapshots (lib/versions.ts). Shared by the /api/files route handlers.

const { attachment, node } = schema;

const MB = 1024 * 1024;

/** The largest file accepted: Postgres rows shouldn't carry more than a few megabytes. */
export const maxFileBytes = async (workspaceId: string) =>
  isLocalMode ? 100 * MB : r2Enabled() ? ((await limitsFor(workspaceId)).fileBytes ?? 100 * MB) : 10 * MB;
/** All of a project's files together, so free storage isn't filled by one project. Local mode's is as big as the disk. */
const maxProjectBytes = () => (isLocalMode ? Infinity : (r2Enabled() ? 2048 : 100) * MB);
const MAX_FILES_PER_NOTE = 100;

/** A response with a plain message the client can show. */
export const fail = (status: number, message: string) =>
  new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/**
 * Uploads and deletes must carry this header. A page on another site can't
 * send it without a CORS preflight, which this app never grants.
 */
export const isOwnRequest = (request: Request) => request.headers.get("x-plotra-request") === "1";

export const signedIn = async () => Boolean(await getSession());

/** Turns what an access check throws into a response: 404 for anything hidden, 403 otherwise. */
export function accessFailure(error: unknown) {
  try {
    unstable_rethrow(error);
  } catch {
    return fail(404, "Not found.");
  }
  return fail(403, publicMessage(error, "You can't do that."));
}

const byExtension: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  epub: "application/epub+zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  mp4: "video/mp4",
  zip: "application/zip",
};

export function cleanName(raw: string | null | undefined) {
  // No paths, no control characters: the name ends up in a response header.
  const name = (raw ?? "").split(/[/\\]/).at(-1)!.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
  return name || "file";
}

export function cleanContentType(raw: string | null | undefined, name: string) {
  const type = (raw ?? "").split(";")[0].trim().toLowerCase();
  if (/^[a-z0-9][\w.+-]{0,60}\/[a-z0-9][\w.+-]{0,100}$/.test(type) && type !== "application/octet-stream") return type;
  return byExtension[name.split(".").at(-1)?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** Reads a request body, giving up (null) as soon as it passes `limit` bytes. */
export async function readLimited(request: Request, limit: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limit) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Pictures a text note can hold (a vault's, imported with it: lib/io/vault-pictures.ts). Never SVG, which can carry script. */
const pictureTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

/**
 * Throws unless the user may attach files to this note: `edit` on it, and it's
 * a research note or a map (its picture), which take any file, or a text note,
 * which takes pictures (`contentType`, once it's known). Returns the workspace's id.
 */
export async function assertCanAttach(projectId: string, nodeId: string, contentType?: string) {
  const { project } = await requireNodeAccess(projectId, nodeId, "edit");
  const [target] = await userDb((tx) => tx.select({ kind: node.kind, settings: node.settings }).from(node).where(eq(node.id, nodeId)));
  const isMap = target?.kind === "canvas" && target.settings?.board === "map";
  if (target?.kind === "research" || isMap) return project.organizationId;
  if (!target || !isDocumentKind(target.kind)) throw new Error("Files can only be attached to research notes, maps and, as pictures, text notes.");
  if (contentType !== undefined && !pictureTypes.has(contentType)) throw new Error("Only pictures (PNG, JPEG, GIF, WebP or AVIF) can go in this note. Attach other files to a research note.");
  return project.organizationId;
}

export const checkCanAttach = (projectId: string, nodeId: string) => readOnly(() => assertCanAttach(projectId, nodeId));

/**
 * What a file has to fit before it's stored: the workspace's storage quota
 * (plan.md 8.2; old automatic snapshots of notes give way to it, as they do to
 * a newer snapshot), the note's file count and the project's cap. Returns the
 * workspace's id.
 */
async function assertRoomFor(projectId: string, nodeId: string, size: number, contentType: string): Promise<string> {
  const workspaceId = await assertCanAttach(projectId, nodeId, contentType);
  await makeRoom(workspaceId, size);
  await assertStorage(workspaceId, size);
  const [usage] = await userDb((tx) =>
    tx
      .select({
        bytes: sql<number>`coalesce(sum(${attachment.size}), 0)::float8`,
        onNote: sql<number>`count(*) filter (where ${attachment.nodeId} = ${nodeId})::int`,
      })
      .from(attachment)
      .where(eq(attachment.projectId, projectId)),
  );
  if (usage.onNote >= MAX_FILES_PER_NOTE) throw new Error("This source has as many files as it can hold.");
  // Pro's storage is the workspace's to spend as it likes; without R2 the files sit in Postgres, whatever the plan.
  const perProject = r2Enabled() && (await limitsFor(workspaceId)).plan === "pro" ? Infinity : maxProjectBytes();
  if (usage.bytes + size > perProject) throw new Error("This project's file storage is full. Remove some files first.");
  return workspaceId;
}

/** The same checks, before a direct upload is allowed to start. */
export const checkRoomFor = (projectId: string, nodeId: string, size: number, contentType: string) => readOnly(() => assertRoomFor(projectId, nodeId, size, contentType));

type NewAttachment = { id: string; projectId: string; nodeId: string; name: string; contentType: string; size: number; r2Key: string | null; data: Uint8Array | null };

async function insertAttachment(values: NewAttachment): Promise<AttachmentRow> {
  const session = await getSession();
  const [row] = await userDb((tx) =>
    tx
      .insert(attachment)
      .values({ ...values, createdById: session?.user.id ?? null })
      .returning({
        id: attachment.id,
        nodeId: attachment.nodeId,
        name: attachment.name,
        contentType: attachment.contentType,
        size: attachment.size,
        createdAt: attachment.createdAt,
      }),
  );
  return row;
}

/** Stores a file against a note (a research note's, a map's picture, a text note's picture) and returns its row. */
export async function saveAttachment(input: { projectId: string; nodeId: string; name: string; contentType: string; bytes: Uint8Array }): Promise<AttachmentRow> {
  const { projectId, nodeId, name, contentType, bytes } = input;
  const id = crypto.randomUUID();
  const r2Key = r2Enabled() ? `attachments/${projectId}/${id}` : null;
  let stored = false;
  try {
    return await transaction(async () => {
      await assertRoomFor(projectId, nodeId, bytes.length, contentType);
      if (r2Key) {
        await r2Put(r2Key, bytes, contentType);
        stored = true;
      }
      return insertAttachment({ id, projectId, nodeId, name, contentType, size: bytes.length, r2Key, data: r2Key ? null : bytes });
    });
  } catch (error) {
    // Nothing points at the object if the row never made it.
    if (stored && r2Key) await r2Delete([r2Key]);
    throw error;
  }
}

// ---- Direct uploads -----------------------------------------------------------------
//
// With object storage configured, the browser sends a file straight to it:
// /api/files/direct checks the file may be added and hands back a short-lived
// signed PUT URL with a token describing the upload; /api/files/direct/done
// takes the token back, checks what arrived and records it. The token is
// signed here, so the second step can trust what the first one checked.

const UPLOAD_SECONDS = 10 * 60;

export type UploadClaims = { id: string; projectId: string; nodeId: string; userId: string; name: string; contentType: string; size: number; r2Key: string; exp: number };

/** A presigned URL for one file, and the token that finishes it. */
export async function beginUpload(claims: Omit<UploadClaims, "id" | "r2Key" | "exp">): Promise<{ url: string; token: string }> {
  const id = crypto.randomUUID();
  const full: UploadClaims = { ...claims, id, r2Key: `attachments/${claims.projectId}/${id}`, exp: Math.floor(Date.now() / 1000) + UPLOAD_SECONDS };
  return { url: await r2PresignPut(full.r2Key, full.contentType, UPLOAD_SECONDS), token: signToken("upload", full) };
}

/**
 * What a token says, if this server signed it and it hasn't run out: a little
 * longer than the URL lasts, so an upload that finished just in time can still be recorded.
 */
export const readUploadToken = (token: string) => readToken<UploadClaims>("upload", token, 60);

/** Records a file that was sent straight to storage, once it's there and is what was announced. */
export async function finishUpload(claims: UploadClaims): Promise<AttachmentRow> {
  const size = await r2Size(claims.r2Key);
  if (size === null) throw new Error("The file didn't arrive. Try again.");
  try {
    if (size !== claims.size) throw new Error("The file that arrived isn't the one that was announced. Try again.");
    return await transaction(async () => {
      await assertRoomFor(claims.projectId, claims.nodeId, size, claims.contentType);
      return insertAttachment({ id: claims.id, projectId: claims.projectId, nodeId: claims.nodeId, name: claims.name, contentType: claims.contentType, size, r2Key: claims.r2Key, data: null });
    });
  } catch (error) {
    await r2Delete([claims.r2Key]);
    throw error;
  }
}

export type StoredFile = { projectId: string; name: string; contentType: string; bytes: Uint8Array };

/** A file's row, if the user can read the note it's attached to. Throws like `requireNodeAccess` otherwise. */
export async function findAttachment(id: string) {
  return readOnly(async () => {
    const [row] = await userDb((tx) =>
      tx
        .select({ projectId: attachment.projectId, nodeId: attachment.nodeId, name: attachment.name, contentType: attachment.contentType, r2Key: attachment.r2Key })
        .from(attachment)
        .where(eq(attachment.id, id)),
    );
    if (!row) return null;
    await requireNodeAccess(row.projectId, row.nodeId);
    return row;
  });
}

/** A file's bytes, wherever they're kept. */
export async function loadAttachment(id: string): Promise<StoredFile | null> {
  const row = await findAttachment(id);
  if (!row) return null;
  if (row.r2Key) return { ...row, bytes: await r2Get(row.r2Key) };
  const [inline] = await readOnly(() => userDb((tx) => tx.select({ data: attachment.data }).from(attachment).where(eq(attachment.id, id))));
  if (!inline?.data) return null;
  return { ...row, bytes: inline.data };
}
