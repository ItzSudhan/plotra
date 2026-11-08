import { describe, expect, test } from "bun:test";

// Undo for a deleted comment (lib/comment-restore.ts): the token deleting hands
// back carries the comment and its thread exactly, and only the person who
// deleted, in the same project, within the time allowed, can spend it.

process.env.BETTER_AUTH_SECRET ??= "a-test-secret-long-enough-to-sign";

const { restoreToken, readRestoreToken, RESTORE_SECONDS } = await import("@/lib/comment-restore");

const comment = {
  id: "c1",
  threadId: "t1",
  authorId: "ana",
  body: "Is this the right year?",
  createdAt: new Date("2026-10-01T10:00:00Z"),
  editedAt: new Date("2026-10-02T11:30:00Z"),
};
const thread = {
  id: "t1",
  nodeId: "n1",
  anchor: { start: "AQID", end: "BAUG" },
  quote: "In the spring of 1912",
  reaction: null,
  resolvedAt: null,
  resolvedById: null,
  createdById: "ana",
  createdAt: new Date("2026-10-01T10:00:00Z"),
};

describe("comment restore tokens", () => {
  test("bring back the comment and its thread as they were", () => {
    const token = restoreToken({ projectId: "p1", nodeId: "n1", by: "ana", comment, thread });
    expect(readRestoreToken(token, "p1", "ana")).toEqual({ projectId: "p1", nodeId: "n1", by: "ana", comment, thread });
  });

  test("work without a thread when replies are left on it", () => {
    const reply = { ...comment, editedAt: null };
    const token = restoreToken({ projectId: "p1", nodeId: "n1", by: "ana", comment: reply, thread: null });
    expect(readRestoreToken(token, "p1", "ana")).toMatchObject({ comment: reply, thread: null });
  });

  test("are only for the person who deleted, in the same project", () => {
    const token = restoreToken({ projectId: "p1", nodeId: "n1", by: "ana", comment, thread });
    expect(readRestoreToken(token, "p1", "ben")).toBeNull();
    expect(readRestoreToken(token, "p2", "ana")).toBeNull();
  });

  test("run out", () => {
    const old = restoreToken({ projectId: "p1", nodeId: "n1", by: "ana", comment, thread }, Date.now() - (RESTORE_SECONDS + 5) * 1000);
    expect(readRestoreToken(old, "p1", "ana")).toBeNull();
  });

  test("can't be altered or made up", () => {
    const token = restoreToken({ projectId: "p1", nodeId: "n1", by: "ana", comment, thread });
    const [body, mac] = token.split(".");
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    claims.comment.body = "Words Ana never wrote";
    const forged = `${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${mac}`;
    expect(readRestoreToken(forged, "p1", "ana")).toBeNull();
    expect(readRestoreToken("not-a-token", "p1", "ana")).toBeNull();
  });

  test("refuse a thread that doesn't match its comment", () => {
    const token = restoreToken({ projectId: "p1", nodeId: "n1", by: "ana", comment, thread: { ...thread, id: "t2" } });
    expect(readRestoreToken(token, "p1", "ana")).toBeNull();
  });
});
