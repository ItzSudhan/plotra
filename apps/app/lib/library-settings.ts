import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Whether this library takes a snapshot every day: its settings file says
 * (apps/desktop/src/library.ts). Read at each check, so turning it on or off
 * in the File menu needs no restart. A library from before it was asked keeps
 * the daily snapshot it always had.
 */
export function dailySnapshotsOn(): boolean {
  const dir = process.env.PLOTRA_LIBRARY;
  if (!dir) return false;
  try {
    const manifest = JSON.parse(readFileSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, "plotra-library.json"), "utf8")) as { dailySnapshots?: boolean };
    return manifest.dailySnapshots !== false;
  } catch {
    return false;
  }
}
