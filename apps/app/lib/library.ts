import "server-only";
import { db, schema } from "@plotra/db";
import { localDatabaseHandle } from "@plotra/db/local";
import { eq } from "drizzle-orm";
import { unzipSync } from "fflate";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { flushLocalRooms } from "./collab/local-hub";
import { dailySnapshotsOn } from "./library-settings";
import { runAsApiUser, type Session } from "./data";
import { buildExport } from "./io/export";
import { LOCAL_EMAIL } from "./local-person";
import { collect } from "./publish/collect";
import { readOnly } from "./request-cache";

/**
 * The library folder's own jobs in local mode (local-mode-plan.md, phase 5),
 * run by the app's server while the desktop app has the library open:
 *
 * - **The Markdown copy.** Every project, as Markdown files mirroring the
 *   binder, in the library's Markdown folder, kept up to date: the writing is
 *   readable without Plotra, and safe to sync between computers (the live
 *   database isn't).
 * - **Snapshots.** A dated copy of the whole database, taken when asked for
 *   (File → Back Up Now), and once a day if the library says so (File →
 *   Snapshot Every Day), the newest few kept.
 *
 * The desktop app says where these go (PLOTRA_MARKDOWN_DIR and
 * PLOTRA_SNAPSHOTS_DIR); without them, neither job runs.
 *
 * The `turbopackIgnore` comments tell the build that these files are the
 * library's, decided at run time: without them it would trace the whole
 * project into the server's output.
 */

const SWEEP_MS = 30_000;
const SNAPSHOT_CHECK_MS = 60 * 60 * 1000;
const KEEP_SNAPSHOTS = 14;
/** Marks a folder in the Markdown copy as one project's, so a renamed project's folder is found again. */
const MARKER = ".plotra-project";

const markdownRoot = () => process.env.PLOTRA_MARKDOWN_DIR || null;
const snapshotsRoot = () => process.env.PLOTRA_SNAPSHOTS_DIR || null;

/** A file or folder name from a title: no path separators or characters some systems refuse. */
export function safeName(title: string, fallback: string): string {
  const cleaned = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

/** Local mode's person, as a session, for jobs that read what they can read. */
async function localSession(): Promise<Session | null> {
  const [person] = await db.select().from(schema.user).where(eq(schema.user.email, LOCAL_EMAIL));
  if (!person) return null;
  const now = new Date();
  return {
    user: person,
    session: {
      id: "local:library",
      token: "",
      userId: person.id,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 3600_000),
      ipAddress: null,
      userAgent: "plotra-library",
      activeOrganizationId: null,
    },
  } as unknown as Session;
}

/** When each project's copy was last written, by the project's `updatedAt`. */
const written = new Map<string, number>();

/** Files under `dir`, as paths relative to it, skipping the marker. */
function listFiles(dir: string, base = dir): string[] {
  if (!existsSync(/*turbopackIgnore: true*/ dir)) return [];
  return readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(/*turbopackIgnore: true*/ dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, base);
    return entry.name === MARKER ? [] : [path.relative(base, full)];
  });
}

function removeEmptyFolders(dir: string, keep: string) {
  if (!existsSync(/*turbopackIgnore: true*/ dir)) return;
  for (const entry of readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyFolders(path.join(/*turbopackIgnore: true*/ dir, entry.name), keep);
  }
  if (dir !== keep && readdirSync(/*turbopackIgnore: true*/ dir).length === 0) rmdirSync(/*turbopackIgnore: true*/ dir);
}

/** Folders of the Markdown copy, by the project they hold. */
function projectFolders(root: string): Map<string, string> {
  const found = new Map<string, string>();
  if (!existsSync(/*turbopackIgnore: true*/ root)) return found;
  for (const workspace of readdirSync(/*turbopackIgnore: true*/ root, { withFileTypes: true })) {
    if (!workspace.isDirectory()) continue;
    for (const folder of readdirSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ root, workspace.name), { withFileTypes: true })) {
      const marker = path.join(/*turbopackIgnore: true*/ root, workspace.name, folder.name, MARKER);
      if (folder.isDirectory() && existsSync(/*turbopackIgnore: true*/ marker)) found.set(readFileSync(/*turbopackIgnore: true*/ marker, "utf8").trim(), path.join(/*turbopackIgnore: true*/ root, workspace.name, folder.name));
    }
  }
  return found;
}

/** A folder for a project: its old one while the title is the same, else a free name. */
function folderFor(workspaceDir: string, title: string, projectId: string, current: string | undefined): string {
  const base = safeName(title, "Untitled project");
  if (current && path.dirname(current) === workspaceDir && path.basename(current).replace(/ \(\d+\)$/, "") === base) return current;
  let candidate = path.join(/*turbopackIgnore: true*/ workspaceDir, base);
  for (let n = 2; existsSync(/*turbopackIgnore: true*/ candidate) && readMarker(candidate) !== projectId; n++) candidate = path.join(/*turbopackIgnore: true*/ workspaceDir, `${base} (${n})`);
  return candidate;
}

function readMarker(dir: string): string | null {
  try {
    return readFileSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, MARKER), "utf8").trim();
  } catch {
    return null;
  }
}

/** Writes `data` unless the file already holds exactly that, so synced folders don't see a change every sweep. */
function writeIfChanged(file: string, data: Uint8Array) {
  try {
    const old = readFileSync(/*turbopackIgnore: true*/ file);
    if (old.length === data.length && old.equals(data)) return;
  } catch {
    // Not there yet.
  }
  mkdirSync(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
  writeFileSync(/*turbopackIgnore: true*/ file, data);
}

/** One project's Markdown files, in the binder's shape. */
async function projectFiles(session: Session, projectId: string): Promise<Map<string, Uint8Array>> {
  try {
    const file = await runAsApiUser(session, () => readOnly(async () => buildExport(await collect(projectId), "markdown", "files")));
    const data = typeof file.data === "string" ? new TextEncoder().encode(file.data) : file.data;
    const entries = unzipSync(data);
    const files = new Map<string, Uint8Array>();
    for (const [name, bytes] of Object.entries(entries)) {
      // The zip holds one folder named after the project; the copy's folder already is.
      const parts = name.split("/").filter(Boolean);
      const inner = parts.length > 1 ? parts.slice(1) : parts;
      if (name.endsWith("/") || inner.some((part) => part === ".." || part === ".")) continue;
      files.set(path.join(/*turbopackIgnore: true*/ ...inner), bytes);
    }
    return files;
  } catch {
    // A project with nothing written in it yet has nothing to export.
    return new Map();
  }
}

/**
 * Brings the Markdown copy up to date: projects changed since the last sweep
 * are written again (only the files that changed), projects that are gone
 * lose their folder, and renamed ones move.
 */
export async function writeMarkdownCopy(force = false): Promise<void> {
  const root = markdownRoot();
  if (!root) return;
  const session = await localSession();
  if (!session) return;
  mkdirSync(/*turbopackIgnore: true*/ root, { recursive: true });

  const projects = await db
    .select({
      id: schema.project.id,
      title: schema.project.title,
      updatedAt: schema.project.updatedAt,
      workspace: schema.organization.name,
    })
    .from(schema.project)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.project.organizationId))
    .innerJoin(schema.member, eq(schema.member.organizationId, schema.organization.id))
    .where(eq(schema.member.userId, session.user.id));

  const folders = projectFolders(root);
  const alive = new Set(projects.map((p) => p.id));
  for (const [projectId, dir] of folders) {
    if (!alive.has(projectId)) {
      rmSync(/*turbopackIgnore: true*/ dir, { recursive: true, force: true });
      written.delete(projectId);
    }
  }

  for (const project of projects) {
    const workspaceDir = path.join(/*turbopackIgnore: true*/ root, safeName(project.workspace, "Workspace"));
    const current = folders.get(project.id);
    const dir = folderFor(workspaceDir, project.title, project.id, current);
    const stamp = project.updatedAt.getTime();
    if (!force && current === dir && written.get(project.id) === stamp) continue;

    if (current && current !== dir) rmSync(/*turbopackIgnore: true*/ current, { recursive: true, force: true });
    mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
    writeFileSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, MARKER), project.id);
    const files = await projectFiles(session, project.id);
    for (const [name, data] of files) writeIfChanged(path.join(/*turbopackIgnore: true*/ dir, name), data);
    for (const old of listFiles(dir)) if (!files.has(old)) rmSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, old));
    removeEmptyFolders(dir, dir);
    written.set(project.id, stamp);
  }
  for (const workspace of existsSync(/*turbopackIgnore: true*/ root) ? readdirSync(/*turbopackIgnore: true*/ root, { withFileTypes: true }) : []) {
    if (workspace.isDirectory()) removeEmptyFolders(path.join(/*turbopackIgnore: true*/ root, workspace.name), root);
  }
}

const pad = (n: number) => String(n).padStart(2, "0");
const day = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const snapshotName = (d: Date) => `Plotra ${day(d)} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}.tar.gz`;

/** Snapshots in the library, newest first. */
export function listSnapshots(dir = snapshotsRoot()): string[] {
  if (!dir || !existsSync(/*turbopackIgnore: true*/ dir)) return [];
  return readdirSync(/*turbopackIgnore: true*/ dir)
    .filter((name) => name.startsWith("Plotra ") && name.endsWith(".tar.gz"))
    .sort()
    .reverse();
}

/** A copy of the whole database, as of now, in the library's Snapshots folder. Returns its file name. */
export async function takeSnapshot(): Promise<string> {
  const dir = snapshotsRoot();
  if (!dir) throw new Error("This library has no Snapshots folder.");
  mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  // Saved first, so the snapshot has what open editors are holding.
  await flushLocalRooms();
  const database = await localDatabaseHandle();
  const dump = await database.dumpDataDir("gzip");
  const name = snapshotName(new Date());
  writeFileSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, name), new Uint8Array(await dump.arrayBuffer()));
  for (const old of listSnapshots(dir).slice(KEEP_SNAPSHOTS)) rmSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, old), { force: true });
  return name;
}

/** Takes the day's snapshot if the library takes them and there isn't one from today yet. */
async function dailySnapshot() {
  const dir = snapshotsRoot();
  if (!dir || !dailySnapshotsOn()) return;
  const today = `Plotra ${day(new Date())}`;
  const newest = listSnapshots(dir)[0];
  if (newest?.startsWith(today) && statSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, newest)).size > 0) return;
  await takeSnapshot();
}

const globalForJobs = globalThis as unknown as { plotraLibraryJobs?: boolean };

/** Starts the library's jobs, once per server. Called when the server starts (instrumentation.ts). */
export function startLibraryJobs() {
  if (globalForJobs.plotraLibraryJobs) return;
  globalForJobs.plotraLibraryJobs = true;
  let sweeping = false;
  const sweep = async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      await writeMarkdownCopy();
    } catch (error) {
      console.error("[plotra] the library's Markdown copy couldn't be written", error);
    } finally {
      sweeping = false;
    }
  };
  const snapshot = () => dailySnapshot().catch((error) => console.error("[plotra] the daily snapshot failed", error));
  setTimeout(() => void sweep(), 10_000).unref();
  setInterval(() => void sweep(), SWEEP_MS).unref();
  setTimeout(() => void snapshot(), 60_000).unref();
  setInterval(() => void snapshot(), SNAPSHOT_CHECK_MS).unref();
}

/**
 * The app is quitting: save what open editors hold, bring the Markdown copy
 * up to date, and close the database cleanly.
 */
export async function closeLibrary(): Promise<void> {
  await flushLocalRooms();
  await writeMarkdownCopy().catch((error) => console.error("[plotra] the library's Markdown copy couldn't be written", error));
  const database = await localDatabaseHandle();
  await database.close();
}
