import { describe, expect, mock, test } from "bun:test";

// Read-only links for an audience (lib/public-link.ts, lib/public-read.ts):
// the project as of a release, canon only. The rules need no database; the
// reader itself runs on PGlite in a process of its own, like the other
// database tests (tests/io/plotra-file.test.ts).

const RUN = process.env.PLOTRA_PUBLIC_LINKS === "1";
if (RUN) {
  process.env.DATABASE_URL = "pglite:memory";
  delete process.env.DATABASE_DRIVER;
}

if (!RUN) {
  const { audienceOf, audienceRows, everyone } = await import("@/lib/public-link");
  const { computeHorizon } = await import("@/lib/horizon");
  const { NEVER } = await import("@/lib/world");

  const row = (id: string, parentId: string | null, extra: Record<string, unknown> = {}) => ({ id, parentId, kind: "scene" as const, title: id, position: "a0", entityTypeId: null, deletedAt: null, revealReleaseId: null, canon: "draft", ...extra });
  const releases = [
    { id: "s1", position: "a0", nodeId: null },
    { id: "s2", position: "a1", nodeId: null },
  ];
  const rows = [
    row("book", null, { kind: "folder" }),
    row("one", "book", { revealReleaseId: "s1", canon: "canon" }),
    row("two", "book", { revealReleaseId: "s2", canon: "canon" }),
    row("secret", null),
    row("draft", "book", { revealReleaseId: "s1" }),
  ];

  describe("a link for an audience", () => {
    test("as of a release: what's revealed by then, and the folders holding it", () => {
      const audience = audienceOf(computeHorizon(rows, releases, "s1"), false, NEVER);
      expect(audienceRows(rows, audience).map((r) => r.id)).toEqual(["book", "one", "draft"]);
      expect(audience.knows(rows[0])).toBe(false);
      expect(audience.knows(rows[1])).toBe(true);
    });

    test("canon only, with or without a release", () => {
      expect(audienceRows(rows, audienceOf(null, true, NEVER)).map((r) => r.id)).toEqual(["book", "one", "two"]);
      expect(audienceRows(rows, audienceOf(computeHorizon(rows, releases, "s1"), true, NEVER)).map((r) => r.id)).toEqual(["book", "one"]);
    });

    test("passages: later releases, Never and non-canon stay out; untagged ones are in", () => {
      const audience = audienceOf(computeHorizon(rows, releases, "s1"), true, NEVER);
      expect(audience.showBlock(null)).toBe(true);
      expect(audience.showBlock({ reveal: "s1" })).toBe(true);
      expect(audience.showBlock({ reveal: "s2" })).toBe(false);
      expect(audience.showBlock({ reveal: NEVER })).toBe(false);
      expect(audience.showBlock({ canon: "draft" })).toBe(false);
      expect(everyone.showBlock({ reveal: NEVER })).toBe(true);
    });

    test("the reader, in a process of its own on PGlite", () => {
      const run = Bun.spawnSync([process.execPath, "test", import.meta.path], {
        cwd: `${import.meta.dir}/../..`,
        env: { ...process.env, PLOTRA_PUBLIC_LINKS: "1", DATABASE_URL: "pglite:memory" },
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = `${run.stdout.toString()}\n${run.stderr.toString()}`;
      if (run.exitCode !== 0) console.error(output);
      expect(run.exitCode).toBe(0);
      expect(output).toContain(" 0 fail");
    }, 120_000);
  });
} else {
  mock.module("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ ok: true, retryAfterSeconds: 0 }), clientIp: async () => "127.0.0.1", rateLimit: async () => {} }));
  const { db, schema } = await import("@plotra/db");
  const { eq } = await import("drizzle-orm");
  const { loadPublicNote, openPublicLink } = await import("@/lib/public-read");
  const { newShareToken } = await import("@/lib/public-link");
  const { valueToYdoc } = await import("@/lib/collab/ydoc");
  const { NEVER } = await import("@/lib/world");

  const now = new Date();
  const { user, organization, project, node, release, shareLink } = schema;
  await db.insert(user).values({ id: "gm", name: "GM", email: "gm@example.com", createdAt: now, updatedAt: now });
  await db.insert(organization).values({ id: "org", name: "Table", slug: "table", createdAt: now });
  await db.insert(project).values({ id: "p1", organizationId: "org", slug: "campaign", title: "The Campaign", type: "ttrpg" });
  await db.insert(release).values([
    { id: "s1", projectId: "p1", title: "Session 1", position: "a0" },
    { id: "s2", projectId: "p1", title: "Session 2", position: "a1" },
  ]);
  const ids = { tavern: crypto.randomUUID(), villain: crypto.randomUUID(), places: crypto.randomUUID() };
  await db.insert(node).values([
    { id: ids.places, projectId: "p1", kind: "folder", title: "Places", position: "a0" },
    {
      id: ids.tavern,
      projectId: "p1",
      parentId: ids.places,
      kind: "location",
      title: "The Prancing Pony",
      position: "a0",
      revealReleaseId: "s1",
      ydoc: valueToYdoc([
        { type: "p", children: [{ text: "A warm inn." }] },
        { type: "p", reveal: "s2", children: [{ text: "Its cellar hides a door." }] },
        { type: "p", reveal: NEVER, children: [{ text: "The GM's note." }] },
      ]),
    },
    { id: ids.villain, projectId: "p1", kind: "character", title: "The Lich", position: "a1", revealReleaseId: "s2" },
  ]);
  const players = newShareToken();
  const everything = newShareToken();
  await db.insert(shareLink).values([
    { projectId: "p1", token: players, name: "Players", horizonReleaseId: "s1" },
    { projectId: "p1", token: everything, name: "Co-GM" },
  ]);
  const text = (n: { children?: unknown[]; text?: string }): string => (typeof n.text === "string" ? n.text : (n.children ?? []).map((c) => text(c as never)).join(""));

  describe("the public reader", () => {
    test("a players' link shows the world as of its session: no later notes, no later passages, nothing marked Never", async () => {
      const link = await openPublicLink(players);
      if (link.status !== "ok") throw new Error(link.status);
      expect(link.asOf).toEqual({ id: "s1", title: "Session 1" });
      expect(link.rows.map((r) => r.title).sort()).toEqual(["Places", "The Prancing Pony"]);
      const tavern = await loadPublicNote(link, ids.tavern);
      expect(tavern!.value.map(text)).toEqual(["A warm inn."]);
      expect(await loadPublicNote(link, ids.villain)).toBeNull();
    });

    test("another link of the same project shows everything", async () => {
      const link = await openPublicLink(everything);
      if (link.status !== "ok") throw new Error(link.status);
      expect(link.asOf).toBeNull();
      expect(link.rows).toHaveLength(3);
      expect((await loadPublicNote(link, ids.tavern))!.value.map(text)).toEqual(["A warm inn.", "Its cellar hides a door.", "The GM's note."]);
    });

    test("one link taken down takes the project's others with it", async () => {
      await db.update(shareLink).set({ blockedAt: new Date() }).where(eq(shareLink.token, players));
      expect((await openPublicLink(everything)).status).toBe("missing");
    });
  });
}
