import { describe, expect, test } from "bun:test";
import { blobSha, cleanRepoPath, commitFiles, type GitHubRequest } from "@/lib/git-sync";

// Keeping a project in a GitHub repository (lib/git-sync.ts): Git's file ids,
// folders, and one commit of what changed, against a GitHub kept in memory.

const bytes = (text: string) => new TextEncoder().encode(text);

/** Enough of GitHub's Git data API for a commit: one branch, a tree of blobs. */
function fakeGitHub(initial: Record<string, string>) {
  let files = new Map(Object.entries(initial).map(([path, text]) => [path, text]));
  let head = "c0";
  const commits: Array<{ message: string; changes: unknown[] }> = [];
  const request: GitHubRequest = async (method, path, body) => {
    if (method === "GET" && path.endsWith("/git/ref/heads/main")) return { status: 200, data: { object: { sha: head } } };
    if (method === "GET" && path.includes("/git/commits/")) return { status: 200, data: { tree: { sha: `t-${head}` } } };
    if (method === "GET" && path.includes("/git/trees/")) return { status: 200, data: { tree: [...files].map(([p, text]) => ({ path: p, type: "blob", sha: blobSha(bytes(text)) })) } };
    if (method === "POST" && path.endsWith("/git/trees")) {
      const tree = (body as { tree: Array<{ path: string; content?: string; sha?: string | null }> }).tree;
      const next = new Map(files);
      for (const entry of tree) {
        if (entry.sha === null) next.delete(entry.path);
        else next.set(entry.path, entry.content ?? "");
      }
      files = next;
      commits.push({ message: "", changes: tree });
      return { status: 201, data: { sha: `t${commits.length}` } };
    }
    if (method === "POST" && path.endsWith("/git/commits")) {
      commits.at(-1)!.message = (body as { message: string }).message;
      return { status: 201, data: { sha: `c${commits.length}` } };
    }
    if (method === "PATCH" && path.endsWith("/git/refs/heads/main")) {
      head = (body as { sha: string }).sha;
      return { status: 200, data: {} };
    }
    return { status: 404, data: { message: "Not Found" } };
  };
  return { request, files: () => files, commits };
}

describe("a GitHub sync", () => {
  test("Git's id of a file", () => {
    expect(blobSha(bytes(""))).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
    expect(blobSha(bytes("hello\n"))).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });

  test("a folder as typed: slashes trimmed, and never out of the repository", () => {
    expect(cleanRepoPath(" /books\\\\The Night/ ")).toBe("books/The Night");
    expect(cleanRepoPath("")).toBe("");
    expect(() => cleanRepoPath("a/../../etc")).toThrow("can't go up");
  });

  test("one commit of what changed: new and changed files written, gone Markdown files deleted, everything else left alone", async () => {
    const github = fakeGitHub({ "README.md": "Mine.", "book/Act 1/The brawl.md": "Swords.", "book/Cut.md": "Old.", "book/map.png": "PNG" });
    const files = new Map([
      ["Act 1/The brawl.md", bytes("Swords.")],
      ["Act 1/The prince.md", bytes("Peace.")],
    ]);
    const first = await commitFiles(github.request, "me/novel", "main", "book", files, "Update from Plotra (2 files)");
    expect(first).toEqual({ commit: "c1", changed: 2 });
    expect([...github.files().keys()].sort()).toEqual(["README.md", "book/Act 1/The brawl.md", "book/Act 1/The prince.md", "book/map.png"]);
    expect(github.commits[0].message).toBe("Update from Plotra (2 files)");

    // Nothing changed: no commit at all.
    expect(await commitFiles(github.request, "me/novel", "main", "book", files, "again")).toEqual({ commit: null, changed: 0 });
    expect(github.commits).toHaveLength(1);
  });

  test("GitHub's refusals become words a person can act on", async () => {
    const empty: GitHubRequest = async () => ({ status: 409, data: { message: "Git Repository is empty." } });
    await expect(commitFiles(empty, "me/novel", "main", "", new Map(), "x")).rejects.toThrow("The repository is empty");
    const expired: GitHubRequest = async () => ({ status: 401, data: {} });
    await expect(commitFiles(expired, "me/novel", "main", "", new Map(), "x")).rejects.toThrow("didn't accept the token");
  });
});

describe("a sealed token", () => {
  test("opens for what it was sealed for, and nowhere else", async () => {
    process.env.BETTER_AUTH_SECRET ||= "a-test-secret-that-is-long-enough";
    const { seal, unseal } = await import("@/lib/secrets");
    const sealed = seal("github_pat_123", "git-sync", "git-sync:p1");
    expect(sealed).not.toContain("github_pat_123");
    expect(unseal(sealed, "git-sync", "git-sync:p1")).toBe("github_pat_123");
    expect(() => unseal(sealed, "git-sync", "git-sync:p2")).toThrow("can't be read");
    expect(() => unseal(`${sealed}x`, "git-sync", "git-sync:p1")).toThrow("can't be read");
  });
});
