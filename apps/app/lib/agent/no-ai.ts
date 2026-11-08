import "server-only";
import { db, schema } from "@plotra/db";
import { eq } from "drizzle-orm";
import { requestCache } from "../request-cache";

// A firm "no AI" (beat-the-competitors.md, 14). Two levels:
//
// - The server: `PLOTRA_NO_AI=1` removes AI from the whole instance. No
//   workspace can switch it on, nobody can add a key, and the AI settings say
//   whoever runs the server took it out. For self-hosters who want none.
// - A workspace: its owner promises no AI. While the promise stands nobody can
//   switch AI on, admins included, and everyone in the workspace sees it on
//   its home page. Only the owner can lift it, and lifting it is not quiet:
//   AI stays off for NOTICE_DAYS more, and the home page says who lifted it,
//   when, and when AI may come back.
//
// lib/agent/availability.ts reads both before anything about AI is shown or run.

const { workspaceSettings, user } = schema;

/** Whether whoever runs this server has taken AI out of it altogether. */
export function aiRemoved(): boolean {
  return ["1", "true", "yes", "on"].includes((process.env.PLOTRA_NO_AI ?? "").trim().toLowerCase());
}

/** How long AI stays off after the owner lifts the promise. */
export const NOTICE_DAYS = 7;
/** How long the home page keeps saying the promise was lifted, counted from the lifting. */
const SHOWN_DAYS = 30;
const DAY = 86_400_000;

export type NoAiPromise = {
  /** In force: nobody can switch AI on. Also true during the notice after it's lifted. */
  active: boolean;
  since: string;
  byName: string | null;
  /** When the owner lifted it, and who: null while it stands. */
  liftedAt: string | null;
  liftedByName: string | null;
  /** When AI may be switched on again, once lifted. */
  endsAt: string | null;
};

/** The promise as of `now`, from its row's dates: null when there is none to show. */
export function promiseState(
  row: { since: Date | null; liftedAt: Date | null; byName?: string | null; liftedByName?: string | null },
  now = Date.now(),
): NoAiPromise | null {
  if (!row.since) return null;
  const lifted = row.liftedAt?.getTime() ?? null;
  // Long lifted: nothing left to show.
  if (lifted !== null && now >= lifted + SHOWN_DAYS * DAY) return null;
  const endsAt = lifted === null ? null : lifted + NOTICE_DAYS * DAY;
  return {
    active: endsAt === null || now < endsAt,
    since: row.since.toISOString(),
    byName: row.byName ?? null,
    liftedAt: lifted === null ? null : new Date(lifted).toISOString(),
    liftedByName: row.liftedByName ?? null,
    endsAt: endsAt === null ? null : new Date(endsAt).toISOString(),
  };
}

/**
 * The workspace's AI switch and its promise, read with the server's own
 * connection: only after the caller has established that the person can see
 * the workspace or one of its projects. Neither is a secret.
 */
export const workspaceAiPolicy = requestCache(async (workspaceId: string): Promise<{ enabled: boolean; promise: NoAiPromise | null }> => {
  const [row] = await db
    .select({
      aiEnabled: workspaceSettings.aiEnabled,
      since: workspaceSettings.noAiSince,
      byId: workspaceSettings.noAiById,
      liftedAt: workspaceSettings.noAiLiftedAt,
      liftedById: workspaceSettings.noAiLiftedById,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1);
  if (!row) return { enabled: false, promise: null };
  let promise = promiseState(row);
  if (promise) {
    const nameOf = async (id: string | null) =>
      id ? ((await db.select({ name: user.name }).from(user).where(eq(user.id, id)).limit(1))[0]?.name ?? null) : null;
    const [byName, liftedByName] = await Promise.all([nameOf(row.byId), nameOf(row.liftedById)]);
    promise = { ...promise, byName, liftedByName };
  }
  return { enabled: row.aiEnabled && !aiRemoved() && !promise?.active, promise };
});
