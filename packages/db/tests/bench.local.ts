// Not a test: a rough timing of the PGlite driver on a novel-sized project.
//   bun packages/db/tests/bench.local.ts <folder>
process.env.DATABASE_URL = `pglite:${process.argv[2] ?? "memory"}`;
const { db, schema } = await import("../src/index");
const { withUser } = await import("../src/rls");
const { sql, eq } = await import("drizzle-orm");

const words = "the dragon flew over the silent harbour while rain fell on the old town and nobody saw her".split(" ");
const prose = (n: number) => Array.from({ length: n }, (_, i) => words[(i * 7) % words.length]).join(" ");
const time = async <T>(label: string, fn: () => Promise<T>) => {
  const start = performance.now();
  const result = await fn();
  console.log(`${label}: ${(performance.now() - start).toFixed(0)} ms`);
  return result;
};

const now = new Date();
await time("open and migrate", () => db.execute(sql`select 1`));
await db.insert(schema.user).values({ id: "u", name: "u", email: "u@x", createdAt: now, updatedAt: now });
await db.insert(schema.organization).values({ id: "o", name: "o", slug: "o", createdAt: now });
await db.insert(schema.member).values({ id: "m", organizationId: "o", userId: "u", role: "owner", createdAt: now });
await db.insert(schema.project).values({ id: "p", organizationId: "o", slug: "p", title: "Novel" });

const SCENES = 300;
const text = prose(3000);
await time(`insert ${SCENES} scenes of 3,000 words (900,000 words)`, async () => {
  for (let i = 0; i < SCENES; i += 50) {
    await db.insert(schema.node).values(
      Array.from({ length: 50 }, (_, j) => ({ id: `n${i + j}`, projectId: "p", kind: "scene" as const, title: `Scene ${i + j}`, position: `a${String(i + j).padStart(4, "0")}`, text, wordCount: 3000 })),
    );
  }
});
await time("save one scene (update text, as a sync does)", () =>
  db.update(schema.node).set({ text: `${text} more`, wordCount: 3001 }).where(eq(schema.node.id, "n10")),
);
const runs = 20;
const start = performance.now();
for (let i = 0; i < runs; i++) await db.update(schema.node).set({ text: `${text} ${i}` }).where(eq(schema.node.id, `n${i}`));
console.log(`average save: ${((performance.now() - start) / runs).toFixed(0)} ms`);
await time("list the binder as the user (300 rows, RLS)", () =>
  withUser("u", (tx) => tx.select({ id: schema.node.id, title: schema.node.title }).from(schema.node).where(eq(schema.node.projectId, "p"))),
);
await time("full-text search across the novel", () =>
  db.execute(sql`select id from node where (setweight(to_tsvector('english', "title"), 'A') || setweight(to_tsvector('english', coalesce("synopsis", '')), 'B') || setweight(to_tsvector('english', "text"), 'C')) @@ websearch_to_tsquery('english', 'dragon harbour') limit 20`),
);
process.exit(0);
