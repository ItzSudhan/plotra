import { beforeAll, describe, expect, test } from "bun:test";

// The PGlite driver (local-mode-plan.md, phase 1), on a database that lives in memory.
process.env.DATABASE_URL = "pglite:memory";
delete process.env.DATABASE_DRIVER;

const { db, driver, schema } = await import("../src/index");
const { withUser } = await import("../src/rls");
const { eq, sql } = await import("drizzle-orm");

const now = new Date();

beforeAll(async () => {
  for (const id of ["ana", "ben"]) {
    await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com`, createdAt: now, updatedAt: now });
    await db.insert(schema.organization).values({ id: `org-${id}`, name: id, slug: `ws-${id}`, createdAt: now });
    await db.insert(schema.member).values({ id: `m-${id}`, organizationId: `org-${id}`, userId: id, role: "owner", createdAt: now });
    await db.insert(schema.project).values({ id: `p-${id}`, organizationId: `org-${id}`, slug: `book-${id}`, title: `${id}'s book` });
  }
});

describe("the PGlite driver", () => {
  test("is chosen for a pglite: URL", () => {
    expect(driver).toBe("pglite");
  });

  test("runs every migration, row-level security included", async () => {
    const roles = await db.execute(sql`select 1 from pg_roles where rolname = 'plotra_app'`);
    expect(roles.rows.length).toBe(1);
  });

  test("withUser sees only the user's own workspaces", async () => {
    const seen = await withUser("ana", (tx) => tx.select({ id: schema.project.id }).from(schema.project));
    expect(seen.map((p) => p.id)).toEqual(["p-ana"]);
  });

  test("the owner sees everything outside a transaction", async () => {
    const all = await db.select({ id: schema.project.id }).from(schema.project);
    expect(all.length).toBe(2);
  });

  test("an owner query inside withUser joins its transaction as the owner, without waiting forever", async () => {
    const result = await withUser("ana", async (tx) => {
      const mine = await tx.select({ id: schema.project.id }).from(schema.project);
      const everyone = await db.select({ id: schema.project.id }).from(schema.project);
      const mineAgain = await tx.select({ id: schema.project.id }).from(schema.project);
      return { mine: mine.length, everyone: everyone.length, mineAgain: mineAgain.length };
    });
    expect(result).toEqual({ mine: 1, everyone: 2, mineAgain: 1 });
  });

  test("owner and user statements running side by side keep their own roles", async () => {
    const result = await withUser("ben", async (tx) => {
      const runs = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          i % 2 ? db.select({ id: schema.project.id }).from(schema.project) : tx.select({ id: schema.project.id }).from(schema.project),
        ),
      );
      return runs.map((r) => r.length);
    });
    expect(result).toEqual([1, 2, 1, 2, 1, 2, 1, 2, 1, 2]);
  });

  test("a nested withUser joins the open transaction", async () => {
    const seen = await withUser("ana", () => withUser("ana", (tx) => tx.select({ id: schema.project.id }).from(schema.project)));
    expect(seen.length).toBe(1);
  });

  test("transactions on separate requests wait their turn", async () => {
    const [a, b] = await Promise.all([
      withUser("ana", (tx) => tx.select({ id: schema.project.id }).from(schema.project)),
      withUser("ben", (tx) => tx.select({ id: schema.project.id }).from(schema.project)),
    ]);
    expect([a[0]?.id, b[0]?.id]).toEqual(["p-ana", "p-ben"]);
  });

  test("a failed withUser rolls back what it wrote", async () => {
    await expect(
      withUser("ana", async (tx) => {
        await tx.update(schema.project).set({ title: "Renamed" }).where(eq(schema.project.id, "p-ana"));
        throw new Error("stop");
      }),
    ).rejects.toThrow("stop");
    const [row] = await db.select({ title: schema.project.title }).from(schema.project).where(eq(schema.project.id, "p-ana"));
    expect(row?.title).toBe("ana's book");
  });

  test("a user can't write into someone else's workspace", async () => {
    await expect(
      withUser("ana", (tx) => tx.insert(schema.project).values({ id: "p-x", organizationId: "org-ben", slug: "x", title: "x" })),
    ).rejects.toThrow();
  });

  test("db.transaction nests with savepoints", async () => {
    await db.transaction(async (tx) => {
      await tx.update(schema.project).set({ title: "Kept" }).where(eq(schema.project.id, "p-ben"));
      await tx
        .transaction(async (inner) => {
          await inner.update(schema.project).set({ title: "Dropped" }).where(eq(schema.project.id, "p-ben"));
          throw new Error("undo");
        })
        .catch(() => {});
    });
    const [row] = await db.select({ title: schema.project.title }).from(schema.project).where(eq(schema.project.id, "p-ben"));
    expect(row?.title).toBe("Kept");
  });

  test("full-text search works", async () => {
    const rows = await db.execute(sql`select to_tsvector('english', 'The dragons were flying') @@ to_tsquery('english', 'dragon') as hit`);
    expect(rows.rows[0]).toEqual({ hit: true });
  });

  test("timestamps come back as dates", async () => {
    const [row] = await db.select({ createdAt: schema.project.createdAt }).from(schema.project).limit(1);
    expect(row?.createdAt).toBeInstanceOf(Date);
  });
});
