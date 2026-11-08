import path from "node:path";
import { LibraryInUseError, NotALibraryError } from "./library";

/**
 * The words the desktop app says when something goes wrong, kept apart from
 * Electron so they can be tested. A problem is a plain headline and next step;
 * the technical part (error text, exit code, log file) sits behind "Show details".
 */

export type Problem = {
  /** The headline: what didn't happen. */
  title: string;
  /** What to do next, in plain words. */
  message: string;
  /** The technical text, shown only on "Show details". */
  detail?: string;
  /** A log file worth looking at, offered as "Show log". */
  log?: string;
};

/** An error whose message is already fit for people, with its technical part kept apart. */
export class FriendlyError extends Error {
  readonly title?: string;
  readonly detail?: string;
  readonly log?: string;
  constructor(message: string, extra: { title?: string; detail?: string; log?: string } = {}) {
    super(message);
    this.title = extra.title;
    this.detail = extra.detail;
    this.log = extra.log;
  }
}

/** What to do about the file-system errors people actually meet. */
const CODES: Record<string, string> = {
  EACCES: "Plotra isn't allowed to use that folder. Check the folder's permissions, or choose another folder.",
  EPERM: "Plotra isn't allowed to use that folder. Check the folder's permissions, or choose another folder.",
  ENOENT: "That folder isn't there any more. If it's on an external drive, check the drive is connected.",
  ENOSPC: "There isn't enough space on the disk. Free up some space and try again.",
  EROFS: "That folder can't be changed because it's read-only. Choose another folder.",
  EBUSY: "Another program is using that folder. Close it and try again.",
};

const SOMETHING_WENT_WRONG = "Something went wrong. Try again, and if it keeps happening, restart Plotra.";

/** Turns any error into a Problem with `title` as its headline (unless the error has its own). */
export function describeError(error: unknown, title: string): Problem {
  if (error instanceof FriendlyError) return { title: error.title ?? title, message: error.message, detail: error.detail, log: error.log };
  // The library's own errors are written for people already.
  if (error instanceof LibraryInUseError || error instanceof NotALibraryError) return { title, message: error.message };
  const raw = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error !== null ? (error as NodeJS.ErrnoException).code : undefined;
  return { title, message: (code && CODES[code]) || SOMETHING_WENT_WRONG, detail: raw || undefined };
}

/** A library is called by its folder's name. */
export const folderName = (dir: string) => path.basename(dir) || dir;

/** Labels for a list of libraries: folder names, with the parent folder added where two share a name. */
export function libraryLabels(dirs: string[]): { dir: string; label: string }[] {
  const counts = new Map<string, number>();
  for (const dir of dirs) counts.set(folderName(dir), (counts.get(folderName(dir)) ?? 0) + 1);
  return dirs.map((dir) => {
    const name = folderName(dir);
    return { dir, label: (counts.get(name) ?? 0) > 1 ? `${name} (${folderName(path.dirname(dir))})` : name };
  });
}

export const NOT_A_LIBRARY = "That folder isn't a Plotra library. Choose the folder you made with ‘New library…’, or make a new one.";

/** "Close ‘My Library’ and switch to Plotra Cloud?" */
export const switchQuestion = (from: string, to: string) => `Close ${from} and switch to ${to}?`;

/** How a library is named in sentences: its folder name in quotes. */
export const quoted = (dir: string) => `‘${folderName(dir)}’`;

/** What the "Back Up Now" dialog says, for a backup made at `when`. */
export function backupSaved(when: Date, locale?: string): string {
  const time = when.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  return `A copy of your library from ${time} is in the Snapshots folder.`;
}

/** The file manager's name on each platform, for "Show in …" buttons. */
export function fileManager(platform: NodeJS.Platform = process.platform): string {
  if (platform === "darwin") return "Finder";
  if (platform === "win32") return "Explorer";
  return "Files";
}
