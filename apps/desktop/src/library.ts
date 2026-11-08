import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import path from "node:path";

/**
 * A library (local-mode-plan.md): the folder where local mode keeps
 * everything. The person picks where it goes, and backs it up and moves it
 * themselves.
 *
 *   plotra-library.json   what makes the folder a library: its format and its secrets
 *   Database/             the database (PGlite: Postgres stored as a folder)
 *   Markdown/             a readable copy of every project, kept up to date (phase 5)
 *   Snapshots/            dated copies of the database, for backups (phase 5)
 *   .plotra-lock          who has the library open right now
 *
 * The secrets live in the library, not on the computer, so a library copied to
 * another computer opens there as it was: the person's sign-in and their saved
 * AI keys are derived from them.
 */

export const MANIFEST = "plotra-library.json";
const LOCK = ".plotra-lock";
const FORMAT = 1;

/** A lock older than this was left by an app that didn't close properly. */
export const LOCK_STALE_MS = 2 * 60 * 1000;
/** How often an open library's lock is renewed. */
export const LOCK_HEARTBEAT_MS = 30 * 1000;

export type LibraryManifest = {
  format: number;
  createdAt: string;
  /** Signs sessions, and derives the local person's password (apps/app/lib/local-person.ts). */
  authSecret: string;
  /** Encrypts AI keys saved in the app (apps/app/lib/agent/keys.ts). */
  aiKeySecret: string;
};

export type Library = { dir: string; manifest: LibraryManifest };

export const databaseDir = (dir: string) => path.join(dir, "Database");
export const markdownDir = (dir: string) => path.join(dir, "Markdown");
export const snapshotsDir = (dir: string) => path.join(dir, "Snapshots");

export const isLibrary = (dir: string) => existsSync(path.join(dir, MANIFEST));

const secret = () => randomBytes(32).toString("base64url");

/** Writes a file so that a crash halfway leaves the old one, not half of the new one. */
function writeAtomic(file: string, text: string) {
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, file);
}

/**
 * Makes `dir` a library. An empty (or missing) folder becomes the library; a
 * folder with other things in it gets a "Plotra Library" folder inside it, so
 * the library never mixes with someone's other files.
 */
export function createLibrary(dir: string): Library {
  if (isLibrary(dir)) return openLibrary(dir);
  let target = dir;
  if (existsSync(dir) && readdirSync(dir).some((name) => !name.startsWith("."))) {
    target = path.join(dir, "Plotra Library");
    for (let n = 2; existsSync(target) && !isLibrary(target); n++) target = path.join(dir, `Plotra Library ${n}`);
    if (isLibrary(target)) return openLibrary(target);
  }
  mkdirSync(target, { recursive: true });
  const manifest: LibraryManifest = { format: FORMAT, createdAt: new Date().toISOString(), authSecret: secret(), aiKeySecret: secret() };
  writeAtomic(path.join(target, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const sub of [databaseDir(target), markdownDir(target), snapshotsDir(target)]) mkdirSync(sub, { recursive: true });
  writeFileSync(
    path.join(target, "README.txt"),
    [
      "This folder is a Plotra library.",
      "",
      "Database   your projects. Open them with Plotra; don't change these files by hand.",
      "Markdown   a readable copy of every project, kept up to date while Plotra is open.",
      "Snapshots  dated copies of the database. Restore one from Plotra's File menu.",
      "",
      "Back up this whole folder. Only one copy of Plotra may have it open at a time:",
      "if you sync it between computers, close Plotra on one before opening it on the other.",
      "",
    ].join("\n"),
  );
  return { dir: target, manifest };
}

/** What a new library is called when the person doesn't name it. */
export const DEFAULT_LIBRARY_NAME = "Plotra Library";

/**
 * A library name fit to be a folder's name on every platform: no slashes or
 * other characters Windows refuses, no dots or spaces at the ends.
 */
export function libraryFolderName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80)
    .trim();
  // Names Windows keeps for devices.
  if (!cleaned || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned)) return DEFAULT_LIBRARY_NAME;
  return cleaned;
}

/**
 * Where a new library called `name` goes in `parent`: a folder of that name,
 * or, when one is there already and isn't a library, the first free "name 2",
 * "name 3"…. A library already there of that name is where it goes (and is
 * opened rather than made).
 */
export function newLibraryPath(parent: string, name: string): string {
  const base = libraryFolderName(name);
  let target = path.join(parent, base);
  for (let n = 2; existsSync(target) && !isLibrary(target) && readdirSync(target).some((entry) => !entry.startsWith(".")); n++) {
    target = path.join(parent, `${base} ${n}`);
  }
  return target;
}

export class NotALibraryError extends Error {}

export function openLibrary(dir: string): Library {
  let manifest: LibraryManifest;
  try {
    manifest = JSON.parse(readFileSync(path.join(dir, MANIFEST), "utf8")) as LibraryManifest;
  } catch {
    throw new NotALibraryError("That folder isn't a Plotra library. Choose the folder you made with ‘New library…’, or make a new one.");
  }
  if (typeof manifest.format !== "number" || manifest.format > FORMAT) {
    throw new NotALibraryError("This library was made by a newer Plotra. Update Plotra to open it.");
  }
  if (!manifest.authSecret || !manifest.aiKeySecret) throw new NotALibraryError("This library's settings file (plotra-library.json) is damaged. Restore the library folder from a backup, or make a new library.");
  return { dir, manifest };
}

type LockFile = { pid: number; host: string; at: number };

export class LibraryInUseError extends Error {}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it exists, it just isn't ours to signal.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Takes the library's lock, or throws LibraryInUseError when another copy of
 * Plotra has it open: PGlite is one process, and two writing to one folder
 * would damage it. On this computer the other app's process is checked; on
 * another (a folder synced through Dropbox), its lock is trusted until it goes
 * stale. Returns a function that gives the lock back.
 */
export function lockLibrary(dir: string, now = Date.now): () => void {
  const file = path.join(dir, LOCK);
  if (existsSync(file)) {
    try {
      const held = JSON.parse(readFileSync(file, "utf8")) as LockFile;
      const ours = held.host === hostname() && held.pid === process.pid;
      const live = held.host === hostname() ? processAlive(held.pid) : now() - held.at < LOCK_STALE_MS;
      if (!ours && live) {
        throw new LibraryInUseError(
          held.host === hostname()
            ? "This library is already open in Plotra."
            : `This library is open in Plotra on another computer (${held.host}). Close it there first.`,
        );
      }
    } catch (error) {
      if (error instanceof LibraryInUseError) throw error;
      // An unreadable lock is a broken one: take it over.
    }
  }
  const write = () => writeAtomic(file, JSON.stringify({ pid: process.pid, host: hostname(), at: now() } satisfies LockFile));
  write();
  const heartbeat = setInterval(() => {
    try {
      write();
    } catch {
      // The folder went away (an unplugged drive): the app notices on its next save.
    }
  }, LOCK_HEARTBEAT_MS);
  heartbeat.unref?.();
  return () => {
    clearInterval(heartbeat);
    try {
      const held = JSON.parse(readFileSync(file, "utf8")) as LockFile;
      if (held.pid === process.pid && held.host === hostname()) rmSync(file);
    } catch {
      // Already gone.
    }
  };
}
