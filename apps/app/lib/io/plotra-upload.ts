import "server-only";
import { r2Delete, r2Get, r2PresignPut, r2Size } from "../r2";
import { readToken, signToken } from "../signed-token";
import { MAX_PLOTRA_BYTES } from "./plotra-file";

// A `.plotra` file sent straight to object storage before it's imported
// (local-mode-plan.md, phase 6). On the hosted app a request body can't pass
// 4.5 MB (a Vercel Function's limit), which a project with pictures soon does,
// so, as with attachments (app/api/files/store.ts, "Direct uploads"):
//
// 1. POST /api/import/direct with { workspace, size }: checks the person is a
//    member and the file isn't too large, and answers a short-lived signed PUT
//    URL for a temporary object under `imports/<user>/`, with a token saying so.
// 2. The browser PUTs the file there.
// 3. POST /api/import?format=plotra&workspace=<slug> with { token }: the token
//    has to be this person's and for this workspace; the file is read from
//    storage, imported, and the temporary object deleted, whether the import
//    worked or not.
//
// An object whose import is never asked for (a closed tab) is left behind:
// a lifecycle rule on the bucket's `imports/` prefix clears those (docs:
// self-hosting, storage).

const MB = 1024 * 1024;
const UPLOAD_SECONDS = 15 * 60;
const PURPOSE = "plotra-import";

/** The type the browser PUTs with: it's signed into the URL, so the two have to agree. */
export const PLOTRA_UPLOAD_TYPE = "application/octet-stream";

/**
 * The most a function on the hosted app reads in one go. Importing holds the
 * file, what it unpacks to and the rewritten documents in memory at once, so a
 * file several times this size would run a function out of memory.
 */
export const HOSTED_PLOTRA_BYTES = 256 * MB;

/**
 * The largest `.plotra` file a workspace can send straight to storage. A
 * file's pictures, files and version snapshots count against the workspace's
 * storage when they're imported, so one larger than the plan's whole storage
 * (with some room for its text, which isn't counted) couldn't be imported
 * anyway: Free's 50 MB of storage makes it 66 MB, which is said before a byte
 * is sent rather than after. On the hosted app no file passes 256 MB
 * (`HOSTED_PLOTRA_BYTES`), so that's Pro's. A self-hosted server, with no
 * plans, takes up to `MAX_PLOTRA_BYTES` (1 GB).
 */
export function plotraUploadCap(input: { storageBytes: number | null; hosted: boolean }): number {
  let cap = MAX_PLOTRA_BYTES;
  if (input.hosted) cap = Math.min(cap, HOSTED_PLOTRA_BYTES);
  if (input.storageBytes !== null) cap = Math.min(cap, input.storageBytes + 16 * MB);
  return cap;
}

export type PlotraUploadClaims = { userId: string; workspace: string; size: number; key: string; exp: number };

/** A presigned URL for one `.plotra` file and the token that imports it. */
export async function beginPlotraUpload(input: { userId: string; workspace: string; size: number }): Promise<{ url: string; token: string; contentType: string }> {
  const claims: PlotraUploadClaims = {
    ...input,
    key: `imports/${input.userId}/${crypto.randomUUID()}.plotra`,
    exp: Math.floor(Date.now() / 1000) + UPLOAD_SECONDS,
  };
  return { url: await r2PresignPut(claims.key, PLOTRA_UPLOAD_TYPE, UPLOAD_SECONDS), token: signToken(PURPOSE, claims), contentType: PLOTRA_UPLOAD_TYPE };
}

/**
 * The upload a token stands for, when this server signed it, it hasn't run
 * out, and it was made for this person and this workspace. Anyone else's token,
 * or one for an attachment, is null.
 */
export function readPlotraUploadToken(token: string, userId: string, workspace: string): PlotraUploadClaims | null {
  // A minute longer than the URL lasts, so a file that arrived just in time can still be imported.
  const claims = readToken<PlotraUploadClaims>(PURPOSE, token, 60);
  if (!claims || claims.userId !== userId || claims.workspace !== workspace) return null;
  // Only keys this module makes, under the person's own prefix.
  if (typeof claims.key !== "string" || !claims.key.startsWith(`imports/${userId}/`)) return null;
  return claims;
}

/** What `takePlotraUpload` reads from and deletes with: object storage, or a stand-in in tests. */
export type UploadStore = { size(key: string): Promise<number | null>; get(key: string): Promise<Uint8Array>; delete(keys: string[]): Promise<void> };

const objectStore: UploadStore = { size: r2Size, get: r2Get, delete: r2Delete };

/** Deletes an uploaded file that won't be imported (the import was refused before it began). */
export const discardPlotraUpload = (claims: PlotraUploadClaims, store: UploadStore = objectStore) => store.delete([claims.key]).catch(() => {});

/**
 * Reads an uploaded `.plotra` file and hands its bytes to `importBytes`,
 * then deletes the temporary object, whatever happened: a file that didn't
 * arrive, isn't the size announced, or fails to import is gone afterwards too.
 */
export async function takePlotraUpload<T>(claims: PlotraUploadClaims, importBytes: (bytes: Uint8Array) => Promise<T>, store: UploadStore = objectStore): Promise<T> {
  try {
    const size = await store.size(claims.key);
    if (size === null) throw new Error("The file didn't arrive. Try again.");
    if (size !== claims.size) throw new Error("The file that arrived isn't the one that was announced. Try again.");
    return await importBytes(await store.get(claims.key));
  } finally {
    await discardPlotraUpload(claims, store);
  }
}
