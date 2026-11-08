import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openLocalDatabase } from "../src/local";

// A library's snapshot (apps/app/lib/library.ts) is PGlite's own dump of the
// database; restoring one fills an empty database folder from it.

const root = mkdtempSync(path.join(tmpdir(), "plotra-snapshot-"));
afterAll(() => {
  delete process.env.PLOTRA_RESTORE_SNAPSHOT;
  rmSync(root, { recursive: true, force: true });
});

test("a snapshot restores into an empty folder, migrations and all", async () => {
  const migrations = path.resolve(import.meta.dir, "../drizzle");
  const original = await openLocalDatabase(path.join(root, "Database"), migrations);
  await original.query(`insert into "user" (id, name, email, created_at, updated_at) values ('u1', 'Ana', 'ana@example.com', now(), now())`);
  const dump = await original.dumpDataDir("gzip");
  await original.close();
  const file = path.join(root, "snapshot.tar.gz");
  writeFileSync(file, new Uint8Array(await dump.arrayBuffer()));

  process.env.PLOTRA_RESTORE_SNAPSHOT = file;
  const restored = await openLocalDatabase(path.join(root, "Restored"), migrations);
  const { rows } = await restored.query<{ name: string }>(`select name from "user"`);
  expect(rows).toEqual([{ name: "Ana" }]);
  await restored.close();
  // Builds two databases from the migrations, which takes over bun's 5 s default on a CI runner.
}, 120_000);
