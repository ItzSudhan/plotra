import "server-only";
import { auth } from "@plotra/auth";
import { db, schema } from "@plotra/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { unzipSync } from "fflate";
import { createHash } from "node:crypto";
import { runAsApiUser, type Session } from "./data";
import { buildExport } from "./io/export";
import { collect } from "./publish/collect";
import { checkRateLimit } from "./rate-limit";
import { readOnly } from "./request-cache";
import { unseal } from "./secrets";
import { afterCommit } from "./webhooks";
import { plural } from "./plural";

// A project kept in a GitHub repository as Markdown (beat-the-competitors.md,
// 11: plain files, kept up to date, not a one-off export). The files are the
// Markdown export's, a file per note in folders mirroring the binder, with
// `[[links]]` kept, so the repository opens as an Obsidian vault too. They go
// in one folder of the repository, and each sync is one commit of only what
// changed; nothing is committed when nothing did. Markdown files in that folder
// that the project no longer has are deleted; anything else there is left alone.
//
// When: a few minutes after a note is saved or the binder changes (at most
// every SYNC_EVERY_SECONDS a project), on "Sync now", and once a day for
// anything left over (the digest's cron, app/api/cron/digest). The project is
// read as the person who set the sync up, with their access: a sync of
// someone who lost it fails, and says so.

const { gitSync, user } = schema;

export const SYNC_EVERY_SECONDS = 300;
const API = "https://api.github.com";
const PURPOSE = "git-sync";

export const tokenContext = (projectId: string) => `git-sync:${projectId}`;

/**
 * The token hint of a sync set up with the person's connected GitHub account
 * (git-sync-actions.ts) rather than a pasted token. Such a sync asks Better
 * Auth for a current token each time: a GitHub App's tokens last 8 hours and
 * are refreshed, so the sealed copy is only a fallback.
 */
export const LINKED_HINT = "github";

/** A current token for someone's connected GitHub account, refreshed if it expired; null without one. */
export async function linkedGitHubToken(userId: string): Promise<string | null> {
  const [linked] = await db
    .select({ id: schema.account.id })
    .from(schema.account)
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, "github")))
    .limit(1);
  if (!linked) return null;
  const { accessToken } = await auth.api.getAccessToken({ body: { accountId: linked.id, userId } });
  return accessToken ?? null;
}

export type SyncOutcome = { ok: boolean; commit: string | null; changed: number; error: string | null };

/** Git's own id of a file: what its tree already holds, so unchanged files aren't sent again. */
export function blobSha(bytes: Uint8Array): string {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

/** A folder in a repository as a person types it: no leading or trailing slash, no `..`. Empty for the top. */
export function cleanRepoPath(raw: string): string {
  const parts = String(raw ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== ".");
  if (parts.some((part) => part === "..")) throw new Error("A folder can't go up out of the repository.");
  return parts.join("/").slice(0, 200);
}

export type GitHubRequest = (method: string, path: string, body?: unknown) => Promise<{ status: number; data: unknown }>;

/** GitHub's REST API with a token. */
export function githubWith(token: string): GitHubRequest {
  return async (method, path, body) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
        "user-agent": "Plotra",
        ...(body !== undefined && { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data };
  };
}

const message = (data: unknown) => (data && typeof data === "object" && "message" in data ? String((data as { message: unknown }).message) : "");

function githubError(status: number, data: unknown, what: string): Error {
  if (status === 401) return new Error("GitHub didn't accept the token. It may have expired: make a new one and save it here.");
  if (status === 403 || status === 404) return new Error(`GitHub wouldn't let the token ${what}. Check the repository's name and that the token can read and write its contents.`);
  if (status === 409) return new Error("The repository is empty. Add a first file (a README) on GitHub, then sync again.");
  if (status === 422) return new Error(`GitHub refused to ${what}: ${message(data) || "the branch may have moved"}. Sync again.`);
  return new Error(`GitHub answered ${status} when asked to ${what}${message(data) ? `: ${message(data)}` : ""}.`);
}

/**
 * Commits `files` (paths inside `folder`) on `branch`, replacing what changed
 * and deleting `.md` files under `folder` the project no longer has. Returns
 * the new commit, or null when the repository already held exactly this.
 */
export async function commitFiles(github: GitHubRequest, repo: string, branch: string, folder: string, files: Map<string, Uint8Array>, note: string): Promise<{ commit: string | null; changed: number }> {
  const ref = await github("GET", `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (ref.status !== 200) throw githubError(ref.status, ref.data, `find the branch ${branch}`);
  const head = (ref.data as { object: { sha: string } }).object.sha;
  const commit = await github("GET", `/repos/${repo}/git/commits/${head}`);
  if (commit.status !== 200) throw githubError(commit.status, commit.data, "read the branch");
  const baseTree = (commit.data as { tree: { sha: string } }).tree.sha;
  const tree = await github("GET", `/repos/${repo}/git/trees/${baseTree}?recursive=1`);
  if (tree.status !== 200) throw githubError(tree.status, tree.data, "read the repository's files");
  const existing = new Map(
    ((tree.data as { tree: Array<{ path: string; type: string; sha: string }> }).tree ?? []).filter((entry) => entry.type === "blob").map((entry) => [entry.path, entry.sha]),
  );

  const prefix = folder ? `${folder}/` : "";
  const changes: Array<{ path: string; mode: "100644"; type: "blob"; content?: string; sha?: string | null }> = [];
  const wanted = new Set<string>();
  for (const [name, bytes] of files) {
    const path = `${prefix}${name}`;
    wanted.add(path);
    if (existing.get(path) === blobSha(bytes)) continue;
    changes.push({ path, mode: "100644", type: "blob", content: new TextDecoder().decode(bytes) });
  }
  for (const path of existing.keys()) {
    if (path.startsWith(prefix) && path.endsWith(".md") && !wanted.has(path)) changes.push({ path, mode: "100644", type: "blob", sha: null });
  }
  if (!changes.length) return { commit: null, changed: 0 };

  const made = await github("POST", `/repos/${repo}/git/trees`, { base_tree: baseTree, tree: changes });
  if (made.status !== 201) throw githubError(made.status, made.data, "write the files");
  const next = await github("POST", `/repos/${repo}/git/commits`, { message: note, tree: (made.data as { sha: string }).sha, parents: [head] });
  if (next.status !== 201) throw githubError(next.status, next.data, "make the commit");
  const sha = (next.data as { sha: string }).sha;
  // Not forced: a branch that moved meanwhile refuses, and the next sync starts from it.
  const moved = await github("PATCH", `/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { sha, force: false });
  if (moved.status !== 200) throw githubError(moved.status, moved.data, `move ${branch} to the new commit`);
  return { commit: sha, changed: changes.length };
}

/** A person, as a session, for a job that reads what they can read. */
async function sessionFor(userId: string): Promise<Session | null> {
  const [person] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!person) return null;
  const now = new Date();
  return {
    user: person,
    session: { id: `git-sync:${userId}`, token: "", userId, createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 3600_000), ipAddress: null, userAgent: "plotra-git-sync", activeOrganizationId: null },
  } as unknown as Session;
}

/** The project's Markdown files, as the Markdown export makes them, by path inside the project's folder. */
async function projectFiles(session: Session, projectId: string): Promise<Map<string, Uint8Array>> {
  const file = await runAsApiUser(session, () => readOnly(async () => buildExport(await collect(projectId), "markdown", "files")));
  const data = typeof file.data === "string" ? new TextEncoder().encode(file.data) : file.data;
  const files = new Map<string, Uint8Array>();
  for (const [name, bytes] of Object.entries(unzipSync(data))) {
    // The zip holds one folder named after the project; the repository's folder stands for it.
    const parts = name.split("/").filter(Boolean);
    const inner = parts.length > 1 ? parts.slice(1) : parts;
    if (name.endsWith("/") || inner.some((part) => part === ".." || part === ".")) continue;
    files.set(inner.join("/"), bytes);
  }
  return files;
}

/** Brings the project's repository up to date now, and records how it went. */
export async function runGitSync(projectId: string): Promise<SyncOutcome> {
  const [row] = await db.select().from(gitSync).where(eq(gitSync.projectId, projectId)).limit(1);
  if (!row) return { ok: false, commit: null, changed: 0, error: "This project isn't synced to GitHub." };
  const startedAt = new Date();
  let outcome: SyncOutcome;
  try {
    if (!row.userId) throw new Error("Whoever set up the sync no longer has an account. Set it up again.");
    const session = await sessionFor(row.userId);
    if (!session) throw new Error("Whoever set up the sync no longer has an account. Set it up again.");
    let files: Map<string, Uint8Array>;
    try {
      files = await projectFiles(session, projectId);
    } catch (error) {
      // Nothing written yet is an empty folder, not an error.
      if (error instanceof Error && /nothing written/i.test(error.message)) files = new Map();
      else throw new Error("The project couldn't be read with the access of whoever set up the sync. Set it up again yourself.");
    }
    const linked = row.tokenHint === LINKED_HINT ? await linkedGitHubToken(row.userId).catch(() => null) : null;
    if (row.tokenHint === LINKED_HINT && !linked) throw new Error("The GitHub account this was set up with isn't connected any more. Connect GitHub again.");
    const github = githubWith(linked ?? unseal(row.tokenSealed, PURPOSE, tokenContext(projectId)));
    const { commit, changed } = await commitFiles(github, row.repo, row.branch, row.path, files, `Update from Plotra (${files.size} ${plural(files.size, "file")})`);
    outcome = { ok: true, commit, changed, error: null };
  } catch (error) {
    outcome = { ok: false, commit: null, changed: 0, error: error instanceof Error ? error.message.slice(0, 500) : "The sync failed." };
  }
  await db
    .update(gitSync)
    .set({
      lastSyncedAt: startedAt,
      lastError: outcome.error,
      ...(outcome.commit && { lastCommit: outcome.commit }),
      // Done, unless something changed again while it ran.
      ...(outcome.ok && { dirtyAt: sql`case when ${gitSync.dirtyAt} > ${startedAt} then ${gitSync.dirtyAt} else null end` }),
    })
    .where(eq(gitSync.projectId, projectId))
    .catch((error) => console.error(`[plotra] couldn't record the git sync of ${projectId}`, error));
  return outcome;
}

/**
 * A change in the project: marks it for the next sync, and syncs a few minutes
 * after the last one at most. Never throws, and costs one indexed read for a
 * project with no sync. Runs after the response, once the change committed.
 */
export async function gitSyncSoon(projectId: string): Promise<void> {
  try {
    const [row] = await db.select({ enabled: gitSync.enabled }).from(gitSync).where(eq(gitSync.projectId, projectId)).limit(1);
    if (!row?.enabled) return;
    await db.update(gitSync).set({ dirtyAt: new Date() }).where(eq(gitSync.projectId, projectId));
    const { ok } = await checkRateLimit("git-sync", projectId, { limit: 1, windowSeconds: SYNC_EVERY_SECONDS });
    if (ok) afterCommit(async () => void (await runGitSync(projectId)));
  } catch (error) {
    console.error(`[plotra] couldn't schedule the git sync of ${projectId}`, error);
  }
}

/** The day's sweep: every sync with changes still waiting. */
export async function sweepGitSyncs(): Promise<{ synced: number; failed: number }> {
  const waiting = await db.select({ projectId: gitSync.projectId }).from(gitSync).where(and(eq(gitSync.enabled, true), isNotNull(gitSync.dirtyAt))).limit(100);
  let synced = 0;
  let failed = 0;
  for (const { projectId } of waiting) {
    const outcome = await runGitSync(projectId);
    if (outcome.ok) synced++;
    else failed++;
  }
  return { synced, failed };
}
