#!/usr/bin/env bun
// Database backups (plan.md Phase 8 "Production, on free tiers").
//
// Neon's free tier keeps only a few hours of history, so the hosted version
// keeps its own: a nightly `pg_dump` in an object-store bucket, the last N of
// them. Run by .github/workflows/backup.yml; the restore procedure is in the
// docs (Deploying → Backups and restore).
//
//   bun scripts/backup.ts                      dump, upload, then delete old backups
//   bun scripts/backup.ts --list               the backups in the bucket, newest first
//   bun scripts/backup.ts --download [key] [file]   fetch a backup (the newest by default) for a restore
//
// Environment:
//   BACKUP_DATABASE_URL    the database to dump. Use the direct connection
//                          string, not the pooled one: pg_dump needs a session.
//                          Falls back to DATABASE_URL.
//   S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION
//                          the store and its credentials, as in apps/app.
//   BACKUP_BUCKET          the bucket. Falls back to S3_BUCKET.
//                          A bucket of its own, with its own token, means a
//                          leaked app credential can't delete the backups.
//   BACKUP_KEEP            how many to keep (default 14).
//   BACKUP_PREFIX          key prefix (default "backups/").
//   PG_DUMP                the pg_dump binary (default "pg_dump"). Its major
//                          version must be the server's or newer.
//
// What this covers: everything in Postgres, which includes the current text of
// every note. What it doesn't: files in the object store itself (attachments
// and version-history snapshots), which live in the app's bucket.

import { S3Client } from "bun";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const env = process.env;

/** Thrown rather than exiting on the spot, so the temporary dump is always removed. */
class Problem extends Error {}

function fail(message: string): never {
  throw new Problem(message);
}

const prefix = (env.BACKUP_PREFIX || "backups/").replace(/^\/+/, "").replace(/\/*$/, "/");
const NAME = /^plotra-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.dump$/;
/** A dump smaller than this is a failed dump, whatever pg_dump's exit code said: an empty database's is larger. */
const MIN_BYTES = 1024;

/** `backups/plotra-2026-10-02T03-15-00Z.dump`: sorts by name in date order. */
export function backupKey(now: Date, keyPrefix = prefix): string {
  return `${keyPrefix}plotra-${now.toISOString().slice(0, 19).replace(/:/g, "-")}Z.dump`;
}

/** Our backups among `keys`, newest first. Anything else under the prefix is left alone. */
export function ourBackups(keys: string[], keyPrefix = prefix): string[] {
  return keys
    .filter((key) => key.startsWith(keyPrefix) && NAME.test(key.slice(keyPrefix.length)))
    .sort()
    .reverse();
}

/** The keys to delete so that `keep` remain. */
export function toPrune(keys: string[], keep: number, keyPrefix = prefix): string[] {
  return ourBackups(keys, keyPrefix).slice(Math.max(1, keep));
}

function keepCount(): number {
  const raw = env.BACKUP_KEEP?.trim();
  if (!raw) return 14;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) fail(`BACKUP_KEEP must be a whole number of at least 1, not "${raw}".`);
  return value;
}

function bucket(): S3Client {
  const name = env.BACKUP_BUCKET || env.S3_BUCKET;
  const endpoint = env.S3_ENDPOINT?.trim().replace(/\/+$/, "");
  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  const missing = [
    !name && "BACKUP_BUCKET",
    !endpoint && "S3_ENDPOINT",
    !accessKeyId && "S3_ACCESS_KEY_ID",
    !secretAccessKey && "S3_SECRET_ACCESS_KEY",
  ].filter(Boolean);
  if (missing.length) fail(`not configured: set ${missing.join(", ")}.`);
  return new S3Client({ bucket: name, endpoint, accessKeyId, secretAccessKey, region: env.S3_REGION || "us-east-1" });
}

async function listKeys(client: S3Client): Promise<{ key: string; size: number }[]> {
  const found: { key: string; size: number }[] = [];
  let token: string | undefined;
  do {
    const page = await client.list({ prefix, continuationToken: token });
    for (const item of page.contents ?? []) found.push({ key: item.key, size: item.size ?? 0 });
    token = page.isTruncated ? page.nextContinuationToken : undefined;
  } while (token);
  return found;
}

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

async function dump(file: string): Promise<void> {
  const url = env.BACKUP_DATABASE_URL || env.DATABASE_URL;
  if (!url) fail("not configured: set BACKUP_DATABASE_URL.");
  const bin = env.PG_DUMP || "pg_dump";
  // Custom format: compressed, and pg_restore can restore all of it or one table.
  // Ownership is left out because the restoring database's role has another name.
  let child;
  try {
    child = Bun.spawn([bin, "--format=custom", "--no-owner", `--file=${file}`, `--dbname=${url}`], { stdout: "inherit", stderr: "inherit" });
  } catch {
    fail(`couldn't run ${bin}. Install the Postgres client tools, or point PG_DUMP at the binary.`);
  }
  const code = await child.exited;
  if (code !== 0) fail(`pg_dump exited with ${code}. A "server version mismatch" means pg_dump is older than the database.`);
}

async function backup() {
  const keep = keepCount();
  const client = bucket();
  const dir = await mkdtemp(join(tmpdir(), "plotra-backup-"));
  const file = join(dir, "plotra.dump");
  try {
    await dump(file);
    const { size } = await stat(file).catch(() => ({ size: 0 }));
    if (size < MIN_BYTES) fail(`the dump is ${size} bytes, which can't be a database. Nothing was uploaded or deleted.`);

    const key = backupKey(new Date());
    await client.write(key, Bun.file(file), { type: "application/octet-stream" });
    // Old backups are only deleted once the new one is known to be there, whole.
    const stored = await client.size(key);
    if (stored !== size) fail(`uploaded ${key} but the bucket reports ${stored} bytes instead of ${size}. Nothing was deleted.`);
    console.log(`backup: uploaded ${key} (${megabytes(size)})`);

    const stale = toPrune((await listKeys(client)).map((item) => item.key), keep);
    for (const old of stale) {
      await client.delete(old);
      console.log(`backup: deleted ${old}`);
    }
    console.log(`backup: done, keeping the last ${keep}.`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function list() {
  const items = await listKeys(bucket());
  const sizes = new Map(items.map((item) => [item.key, item.size]));
  const keys = ourBackups(items.map((item) => item.key));
  if (!keys.length) console.log(`No backups under ${prefix}`);
  for (const key of keys) console.log(`${key}\t${megabytes(sizes.get(key) ?? 0)}`);
}

async function download(key: string | undefined, target: string | undefined) {
  const client = bucket();
  const chosen = key ?? ourBackups((await listKeys(client)).map((item) => item.key))[0];
  if (!chosen) fail(`no backups under ${prefix}`);
  if (!(await client.exists(chosen))) fail(`${chosen} isn't in the bucket. See --list.`);
  const file = target ?? chosen.split("/").at(-1)!;
  const bytes = await Bun.write(file, client.file(chosen));
  console.log(`backup: downloaded ${chosen} to ${file} (${megabytes(bytes)})`);
}

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2);
  try {
    if (!command) await backup();
    else if (command === "--list") await list();
    else if (command === "--download") await download(rest[0], rest[1]);
    else fail(`unknown option ${command}. See the top of scripts/backup.ts.`);
  } catch (error) {
    // The database URL is never part of a message here; an S3 error's own text is safe to print.
    console.error(`backup: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
