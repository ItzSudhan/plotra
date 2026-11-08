"use server";

import { schema } from "@plotra/db";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "./access";
import { requireSession } from "./data";
import { userDb } from "./db";
import { cleanRepoPath, githubWith, runGitSync, tokenContext, type SyncOutcome } from "./git-sync";
import { rateLimit } from "./rate-limit";
import { readOnly, transaction } from "./request-cache";
import { seal } from "./secrets";
import { slugify } from "./slug";

// Project settings → GitHub (lib/git-sync.ts): where the project's Markdown
// files go, with a token that can write there. Managers only; the token is
// never sent back to the browser.

const { gitSync } = schema;

export type GitSyncState = {
  repo: string;
  branch: string;
  path: string;
  tokenHint: string;
  enabled: boolean;
  /** Changes waiting to go. */
  waiting: boolean;
  lastSyncedAt: string | null;
  lastCommit: string | null;
  lastError: string | null;
};

const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,120}$/;

const stateOf = (row: typeof gitSync.$inferSelect): GitSyncState => ({
  repo: row.repo,
  branch: row.branch,
  path: row.path,
  tokenHint: row.tokenHint,
  enabled: row.enabled,
  waiting: row.dirtyAt !== null,
  lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
  lastCommit: row.lastCommit,
  lastError: row.lastError,
});

async function load(projectId: string) {
  const [row] = await userDb((tx) => tx.select().from(gitSync).where(eq(gitSync.projectId, projectId)).limit(1));
  return row ?? null;
}

/** The project's sync, or null when it has none. Managers only. */
export async function getGitSync(projectId: string): Promise<GitSyncState | null> {
  return readOnly(async () => {
    await requireProjectAccess(projectId, "manage");
    const row = await load(projectId);
    return row ? stateOf(row) : null;
  });
}

/** A folder to suggest: the project's title, as a folder name. */
export async function suggestGitFolder(projectId: string): Promise<string> {
  return readOnly(async () => {
    const { project } = await requireProjectAccess(projectId, "manage");
    return slugify(project.title) || "plotra";
  });
}

/**
 * Sets the sync up, or changes it: the repository, branch and folder, and a
 * token (needed the first time; kept when left empty after). Checks with
 * GitHub that the token can write there, then syncs once.
 */
export async function saveGitSync(projectId: string, input: { repo: string; branch?: string; path?: string; token?: string }): Promise<{ state: GitSyncState; outcome: SyncOutcome }> {
  const { user } = await readOnly(async () => {
    const session = await requireSession();
    await requireProjectAccess(projectId, "manage");
    await rateLimit("git-sync-settings", session.user.id, { limit: 30, windowSeconds: 3600 });
    return session;
  });
  const repo = String(input?.repo ?? "")
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  if (!REPO.test(repo)) throw new Error("Enter the repository as owner/name, as in github.com/owner/name.");
  const branch = String(input?.branch ?? "").trim() || "main";
  if (!BRANCH.test(branch) || branch.includes("..")) throw new Error("That isn't a branch name GitHub takes.");
  const path = cleanRepoPath(input?.path ?? "");
  const token = String(input?.token ?? "").trim();
  if (token.length > 400) throw new Error("That doesn't look like a GitHub token.");

  const existing = await readOnly(() => load(projectId));
  if (!token && !existing) throw new Error("Paste a GitHub token that can write to the repository.");
  if (token) {
    // Outside any transaction: GitHub can take a moment.
    const github = githubWith(token);
    const found = await github("GET", `/repos/${repo}`);
    if (found.status === 401) throw new Error("GitHub didn't accept that token.");
    if (found.status !== 200) throw new Error("The token can't see that repository. Check its name, and that the token is for it.");
    const permissions = (found.data as { permissions?: { push?: boolean } }).permissions;
    if (permissions && permissions.push === false) throw new Error("The token can read the repository but not write to it. Give it Contents: Read and write.");
    const ref = await github("GET", `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    if (ref.status === 409) throw new Error("The repository is empty. Add a first file (a README) on GitHub, then save again.");
    if (ref.status !== 200) throw new Error(`The repository has no branch called ${branch}.`);
  }

  await transaction(async () => {
    await requireProjectAccess(projectId, "manage");
    const values = {
      repo,
      branch,
      path,
      enabled: true,
      userId: user.id,
      ...(token && { tokenSealed: seal(token, "git-sync", tokenContext(projectId)), tokenHint: token.slice(-4) }),
      dirtyAt: new Date(),
      lastError: null,
    };
    if (existing) await userDb((tx) => tx.update(gitSync).set(values).where(eq(gitSync.projectId, projectId)));
    else await userDb((tx) => tx.insert(gitSync).values({ projectId, ...values, tokenSealed: values.tokenSealed!, tokenHint: values.tokenHint! }));
  });
  const outcome = await runGitSync(projectId);
  const state = await readOnly(async () => stateOf((await load(projectId))!));
  return { state, outcome };
}

/** Syncs now, whatever is waiting. */
export async function syncGitNow(projectId: string): Promise<{ state: GitSyncState; outcome: SyncOutcome }> {
  await readOnly(async () => {
    const { user } = await requireSession();
    await requireProjectAccess(projectId, "manage");
    await rateLimit("git-sync-now", user.id, { limit: 20, windowSeconds: 600 });
  });
  const outcome = await runGitSync(projectId);
  const state = await readOnly(async () => {
    const row = await load(projectId);
    if (!row) throw new Error("This project isn't synced to GitHub.");
    return stateOf(row);
  });
  return { state, outcome };
}

/** Pauses or resumes the sync. */
export async function setGitSyncEnabled(projectId: string, enabled: boolean): Promise<GitSyncState> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "manage");
    const [row] = await userDb((tx) => tx.update(gitSync).set({ enabled: enabled === true }).where(eq(gitSync.projectId, projectId)).returning());
    if (!row) throw new Error("This project isn't synced to GitHub.");
    return stateOf(row);
  });
}

/** Stops syncing and forgets the token. Nothing in the repository is touched. */
export async function removeGitSync(projectId: string): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "manage");
    await userDb((tx) => tx.delete(gitSync).where(eq(gitSync.projectId, projectId)));
  });
}
