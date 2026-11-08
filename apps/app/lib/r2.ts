import "server-only";
import { AwsClient } from "aws4fetch";

// Object storage through the S3 API (plan.md 1: snapshots, uploads, exports).
// Optional: without credentials, callers fall back to Postgres.
//
// Any S3-compatible store works (Cloudflare R2, MinIO, Garage, AWS S3 itself):
// S3_ENDPOINT plus S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_BUCKET, and
// S3_REGION when the store checks it. The bucket is addressed path-style
// (`<endpoint>/<bucket>/<key>`), which every such store accepts and which
// needs no wildcard DNS.

type Store = { client: AwsClient; base: string };

let store: Store | null | undefined;

function configure(): Store | null {
  const { S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey, S3_BUCKET: bucket } = process.env;
  const endpoint = process.env.S3_ENDPOINT?.trim().replace(/\/+$/, "");
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    // MinIO rejects a signature made for a region other than its own, and
    // `us-east-1` is its default (and AWS's). R2 takes it as its `auto`.
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: process.env.S3_REGION || "us-east-1" }),
    base: `${endpoint}/${bucket}`,
  };
}

function r2() {
  if (store === undefined) store = configure();
  return store;
}

const objectUrl = (base: string, key: string) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;

export const r2Enabled = () => r2() !== null;

export async function r2Put(key: string, body: Uint8Array, contentType = "application/octet-stream") {
  const { client, base } = r2()!;
  const res = await client.fetch(objectUrl(base, key), {
    method: "PUT",
    body: Buffer.from(body),
    headers: { "content-type": contentType },
  });
  if (!res.ok) throw new Error(`R2 upload failed (${res.status}).`);
}

export async function r2Get(key: string): Promise<Uint8Array> {
  const { client, base } = r2()!;
  const res = await client.fetch(objectUrl(base, key));
  if (!res.ok) throw new Error(`R2 download failed (${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function r2Delete(keys: string[]) {
  const s = r2();
  if (!s) return;
  await Promise.all(keys.map((key) => s.client.fetch(objectUrl(s.base, key), { method: "DELETE" }).catch(() => {})));
}

/**
 * A URL that lets whoever holds it PUT one object of this type, for `seconds`.
 * Uploads go from the browser straight to the store with it, so a file never
 * passes through a function (whose request body Vercel caps at 4.5 MB). The
 * bucket has to allow the app's origin to PUT (its CORS rules).
 */
export async function r2PresignPut(key: string, contentType: string, seconds = 600): Promise<string> {
  const { client, base } = r2()!;
  const url = new URL(objectUrl(base, key));
  url.searchParams.set("X-Amz-Expires", String(seconds));
  const signed = await client.sign(url.toString(), { method: "PUT", headers: { "content-type": contentType }, aws: { signQuery: true } });
  return signed.url;
}

/** An object's size, or null when there's no such object. */
export async function r2Size(key: string): Promise<number | null> {
  const { client, base } = r2()!;
  const res = await client.fetch(objectUrl(base, key), { method: "HEAD" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 lookup failed (${res.status}).`);
  return Number(res.headers.get("content-length") ?? NaN);
}
