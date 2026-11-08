import "server-only";
import { db, schema } from "@plotra/db";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { Tx } from "./db";
import { getStorageUsage, limitsFor } from "./quotas";
import { r2Delete, r2Enabled, r2Get, r2Put } from "./r2";

// Version history storage (plan.md 2.6): a version is a whole Yjs state.
// Snapshots go to R2 when it's configured and into Postgres otherwise.
//
// Automatic snapshots are a rolling history: when a workspace's storage is
// full, the oldest of them give way to whatever is being saved (`makeRoom`).
// Named versions, release snapshots and each note's latest automatic snapshot
// are never dropped to make room.

const { project, version } = schema;

/** How often the collab sync keeps an automatic snapshot of a document that's being edited, unless the project says (`settings.autoVersionMinutes`). */
export const AUTO_EVERY_MINUTES = 30;
/** The choices Project settings offers, in minutes; 0 is none. */
export const autoVersionChoices = [0, 10, 30, 60, 180] as const;
/** Automatic snapshots kept per document; named ones are kept until deleted. */
const AUTO_KEEP = 40;

type NewVersion = {
  projectId: string;
  nodeId: string;
  name: string | null;
  auto: boolean;
  state: Uint8Array;
  wordCount: number;
  createdById: string | null;
};

/** Stores a snapshot and returns the row values that point at it. */
async function storeSnapshot(id: string, projectId: string, state: Uint8Array) {
  if (!r2Enabled()) return { snapshot: state, r2Key: null };
  const key = `versions/${projectId}/${id}.ydoc`;
  await r2Put(key, state);
  return { snapshot: null, r2Key: key };
}

/** Inserts a version on `tx` (the user's, under RLS, or the owner connection for system snapshots). */
export async function insertVersion(tx: Tx | typeof db, input: NewVersion) {
  const id = crypto.randomUUID();
  const stored = await storeSnapshot(id, input.projectId, input.state);
  const [row] = await tx
    .insert(version)
    .values({
      id,
      projectId: input.projectId,
      nodeId: input.nodeId,
      name: input.name,
      auto: input.auto,
      ...stored,
      size: input.state.length,
      wordCount: input.wordCount,
      createdById: input.createdById,
    })
    .returning({ id: version.id, createdAt: version.createdAt });
  return row;
}

/**
 * Inserts many versions at once: the snapshots are stored side by side, then
 * one insert writes every row. For cutting a release, which snapshots every
 * note. `extra` is set on every row.
 */
export async function insertVersions(tx: Tx, inputs: NewVersion[], extra: { releaseId?: string | null; titles?: Map<string, string> } = {}): Promise<number> {
  if (!inputs.length) return 0;
  const rows = await Promise.all(
    inputs.map(async (input) => {
      const id = crypto.randomUUID();
      return {
        id,
        projectId: input.projectId,
        nodeId: input.nodeId,
        name: input.name,
        auto: input.auto,
        releaseId: extra.releaseId ?? null,
        title: extra.titles?.get(input.nodeId) ?? null,
        ...(await storeSnapshot(id, input.projectId, input.state)),
        size: input.state.length,
        wordCount: input.wordCount,
        createdById: input.createdById,
      };
    }),
  );
  await tx.insert(version).values(rows);
  return rows.length;
}

export async function loadSnapshot(row: { snapshot: Uint8Array | null; r2Key: string | null }): Promise<Uint8Array> {
  if (row.snapshot?.length) return row.snapshot;
  if (row.r2Key) return r2Get(row.r2Key);
  throw new Error("This version's snapshot is missing.");
}

export async function deleteSnapshots(keys: Array<string | null>) {
  await r2Delete(keys.filter((k): k is string => !!k));
}

/**
 * Called by the collab content sync (trusted, owner connection): keeps an
 * automatic snapshot when the document has none from the last half hour, and
 * prunes the oldest automatic ones.
 */
export async function autoVersion(projectId: string, nodeId: string, state: Uint8Array, wordCount: number) {
  const [owner] = await db.select({ workspaceId: project.organizationId, settings: project.settings }).from(project).where(eq(project.id, projectId));
  if (!owner) return;
  const minutes = owner.settings.autoVersionMinutes ?? AUTO_EVERY_MINUTES;
  // The project keeps none: named versions and "Before AI" ones still are.
  if (!minutes) return;
  const since = new Date(Date.now() - minutes * 60_000);
  const [recent] = await db
    .select({ id: version.id })
    .from(version)
    .where(and(eq(version.nodeId, nodeId), gt(version.createdAt, since)))
    .limit(1);
  if (recent) return;
  // Automatic snapshots count against the workspace's storage too (plan.md
  // 8.2). Older ones make room for this one; when they can't (the space is
  // taken by files and named versions) it is skipped: the content sync that
  // called us has already saved the text, and must not fail over history.
  if (!(await makeRoom(owner.workspaceId, state.length))) return;
  await insertVersion(db, { projectId, nodeId, name: null, auto: true, state, wordCount, createdById: null });

  const old = await db
    .select({ id: version.id, r2Key: version.r2Key })
    .from(version)
    .where(and(eq(version.nodeId, nodeId), eq(version.auto, true)))
    .orderBy(desc(version.createdAt))
    .offset(AUTO_KEEP);
  if (!old.length) return;
  await db.delete(version).where(inArray(version.id, old.map((v) => v.id)));
  await deleteSnapshots(old.map((v) => v.r2Key));
}

/** Automatic snapshots looked at in one go when making room. */
const PRUNE_BATCH = 500;

/**
 * Makes room in a workspace's storage for `adding` more bytes by dropping its
 * oldest automatic snapshots, oldest first, never a note's latest one. Returns
 * whether the bytes fit now (always, where storage has no limit). Runs on the
 * owner connection: it is the system tidying its own history, not a person
 * deleting something.
 */
export async function makeRoom(workspaceId: string, adding: number): Promise<boolean> {
  const limit = (await limitsFor(workspaceId)).storageBytes;
  if (limit === null) return true;
  const over = (await getStorageUsage(workspaceId)) + adding - limit;
  if (over <= 0) return true;

  const result = await db.execute<{ id: string; r2_key: string | null; size: number }>(sql`
    select id, r2_key, size::float8 as size from (
      select v.id, v.r2_key, v.size, v.created_at,
        row_number() over (partition by v.node_id order by v.created_at desc) as newest
      from ${version} v join ${project} p on p.id = v.project_id
      where p.organization_id = ${workspaceId} and v.auto = true and v.release_id is null
    ) candidates
    where newest > 1
    order by created_at asc
    limit ${PRUNE_BATCH}`);
  const dropped: Array<{ id: string; r2Key: string | null }> = [];
  let freed = 0;
  for (const row of result.rows) {
    if (freed >= over) break;
    dropped.push({ id: row.id, r2Key: row.r2_key });
    freed += Number(row.size);
  }
  if (dropped.length) {
    await db.delete(version).where(inArray(version.id, dropped.map((v) => v.id)));
    await deleteSnapshots(dropped.map((v) => v.r2Key));
  }
  return freed >= over;
}
