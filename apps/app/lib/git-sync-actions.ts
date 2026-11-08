"use server";

import { auth, githubLinking } from "@plotra/auth";
import { db, schema } from "@plotra/db";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { requireProjectAccess } from "./access";
import { requireSession } from "./data";
import { userDb } from "./db";
import { LINKED_HINT, cleanRepoPath, githubWith, runGitSync, tokenContext, type GitHubRequest, type SyncOutcome } from "./git-sync";
import { isLocalMode } from "./local-mode";
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

// A person can link their GitHub account (Better Auth's account linking,
// packages/auth/src/index.ts, with the `repo` scope) instead of pasting a
// token: then they pick one of their repositories, or make a new one, and the
// project's sync keeps its own sealed copy of the token.

export type GitHubConnection = {
  /** Whether this server can link GitHub accounts. */
  available: boolean;
  /** Their GitHub username, when linked. */
  login: string | null;
  /** Where on GitHub they choose which repositories Plotra can use (a GitHub App's installation), when known. */
  installUrl: string | null;
};

const installUrl = () => {
  const slug = process.env.GITHUB_APP_SLUG?.trim();
  return slug && /^[a-z0-9-]+$/i.test(slug) ? `https://github.com/apps/${slug}/installations/new` : null;
};

export type GitHubRepo = { fullName: string; private: boolean; defaultBranch: string; empty: boolean };

/** The signed-in person's linked GitHub token, or null. */
async function linkedToken(): Promise<string | null> {
  if (!githubLinking || isLocalMode) return null;
  const requestHeaders = await headers();
  const accounts = await auth.api.listUserAccounts({ headers: requestHeaders });
  const linked = accounts.find((a) => a.providerId === "github");
  if (!linked) return null;
  try {
    const { accessToken } = await auth.api.getAccessToken({ body: { accountId: linked.id }, headers: requestHeaders });
    return accessToken ?? null;
  } catch {
    return null;
  }
}

async function requireLinked(): Promise<GitHubRequest> {
  const token = await linkedToken();
  if (!token) throw new Error("Connect your GitHub account first.");
  return githubWith(token);
}

/** Whether GitHub can be linked here, and as whom it is. */
export async function getGitHubConnection(): Promise<GitHubConnection> {
  await requireSession();
  if (!githubLinking || isLocalMode) return { available: false, login: null, installUrl: null };
  const token = await linkedToken();
  if (!token) return { available: true, login: null, installUrl: installUrl() };
  const me = await githubWith(token)("GET", "/user");
  // A token GitHub no longer takes (revoked there) is as good as none.
  if (me.status !== 200) return { available: true, login: null, installUrl: installUrl() };
  return { available: true, login: (me.data as { login: string }).login, installUrl: installUrl() };
}

/** The linked account's repositories it can write to, most recently changed first. */
export async function listGitHubRepos(): Promise<GitHubRepo[]> {
  const { user } = await requireSession();
  await rateLimit("github-repos", user.id, { limit: 60, windowSeconds: 600 });
  const github = await requireLinked();
  const repos: GitHubRepo[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await github("GET", `/user/repos?sort=pushed&per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`);
    if (res.status !== 200) throw new Error("GitHub didn't list your repositories. Connect GitHub again.");
    const batch = res.data as Array<{ full_name: string; private: boolean; default_branch: string; size: number; archived: boolean; permissions?: { push?: boolean } }>;
    for (const r of batch) {
      if (r.archived || r.permissions?.push === false) continue;
      repos.push({ fullName: r.full_name, private: r.private, defaultBranch: r.default_branch || "main", empty: r.size === 0 });
    }
    if (batch.length < 100) break;
  }
  return repos;
}

/** Makes a new repository on the linked account, with a README so it has a branch to write to. */
export async function createGitHubRepo(input: { name: string; private?: boolean }): Promise<GitHubRepo> {
  const { user } = await requireSession();
  await rateLimit("github-create-repo", user.id, { limit: 10, windowSeconds: 3600 });
  const name = String(input?.name ?? "").trim();
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name) || name === "." || name === "..") throw new Error("A repository name can have letters, numbers, dots, dashes and underscores.");
  const github = await requireLinked();
  const res = await github("POST", "/user/repos", {
    name,
    private: input?.private !== false,
    auto_init: true,
    description: "Kept up to date by Plotra.",
  });
  if (res.status === 422) throw new Error(`You already have a repository called ${name}. Pick it from the list, or choose another name.`);
  if (res.status !== 201) {
    console.error("[plotra] GitHub refused to make a repository", res.status, res.data);
    throw new Error(await whyNoNewRepo(github));
  }
  const repo = res.data as { full_name: string; private: boolean; default_branch: string };
  return { fullName: repo.full_name, private: repo.private, defaultBranch: repo.default_branch || "main", empty: false };
}

/**
 * Why GitHub wouldn't make a repository, from Plotra's installation on the
 * person's account (a GitHub App's user token reaches only what it's installed on).
 */
async function whyNoNewRepo(github: GitHubRequest): Promise<string> {
  const fallback = "GitHub didn't make the repository. Make one on GitHub, let Plotra use it, then pick it from the list.";
  const res = await github("GET", "/user/installations");
  if (res.status !== 200) return fallback;
  const slug = process.env.GITHUB_APP_SLUG?.trim();
  const all = (res.data as { installations?: Array<{ id: number; app_slug: string; repository_selection: string; permissions?: Record<string, string>; account?: { type?: string } }> }).installations ?? [];
  const mine = all.find((i) => (!slug || i.app_slug === slug) && i.account?.type === "User");
  if (!mine) return "Plotra isn't installed on your GitHub account yet. Use \"Choose which ones on GitHub\" to install it, then try again.";
  if (mine.permissions?.administration !== "write")
    return `Plotra needs your OK on GitHub to make repositories. Accept its new permissions at github.com/settings/installations/${mine.id}, then try again.`;
  if (mine.repository_selection !== "all")
    return `GitHub only lets Plotra make repositories when it can use all of yours. Change that at github.com/settings/installations/${mine.id}, or make the repository on GitHub, add it there, and pick it from the list.`;
  return fallback;
}

/**
 * Unlinks the person's GitHub account. Projects already copying to GitHub
 * keep their own copy of the token; to stop those, stop them, or revoke
 * Plotra on GitHub.
 */
export async function disconnectGitHub(): Promise<void> {
  const { user } = await requireSession();
  // Their own row only. Not Better Auth's unlink: it asks for a sign-in from the last day.
  await db.delete(schema.account).where(and(eq(schema.account.userId, user.id), eq(schema.account.providerId, "github")));
}

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
export async function saveGitSync(
  projectId: string,
  input: { repo: string; branch?: string; path?: string; token?: string; /** Use the linked GitHub account's token. */ useGitHub?: boolean },
): Promise<{ state: GitSyncState; outcome: SyncOutcome }> {
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
  let token = String(input?.token ?? "").trim();
  const viaGitHub = input?.useGitHub === true;
  if (token.length > 400) throw new Error("That doesn't look like a GitHub token.");
  if (viaGitHub) {
    const linked = await linkedToken();
    if (!linked) throw new Error("Connect your GitHub account first.");
    token = linked;
  }

  const existing = await readOnly(() => load(projectId));
  if (!token && !existing) throw new Error("Paste a GitHub token that can write to the repository.");
  if (token) {
    // Outside any transaction: GitHub can take a moment.
    const github = githubWith(token);
    const found = await github("GET", `/repos/${repo}`);
    if (found.status === 401) throw new Error("GitHub didn't accept that token.");
    if (found.status !== 200)
      throw new Error(
        viaGitHub
          ? "Plotra can't see that repository. Check its name, and that Plotra is allowed to use it on GitHub."
          : "The token can't see that repository. Check its name, and that the token is for it.",
      );
    const permissions = (found.data as { permissions?: { push?: boolean } }).permissions;
    if (permissions && permissions.push === false) throw new Error("The token can read the repository but not write to it. Give it Contents: Read and write.");
    let ref = await github("GET", `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    if (ref.status === 409) {
      // An empty repository has no branch yet: a README makes it.
      const readme = await github("PUT", `/repos/${repo}/contents/README.md`, {
        message: "Start the repository",
        content: Buffer.from(`# ${repo.split("/")[1]}\n\nKept up to date by Plotra.\n`).toString("base64"),
        branch,
      });
      if (readme.status !== 201) throw new Error("The repository is empty. Add a first file (a README) on GitHub, then save again.");
      ref = await github("GET", `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    }
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
      ...(token && { tokenSealed: seal(token, "git-sync", tokenContext(projectId)), tokenHint: viaGitHub ? LINKED_HINT : token.slice(-4) }),
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
