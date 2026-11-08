import "server-only";
import { db } from "@plotra/db";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";

// Rate limits for the expensive or abusable things: web clipping, uploads,
// invitations, imports, AI runs (plan.md Phase 8 "Production"). Sign-in and
// sign-up are limited by Better Auth itself (packages/auth).
//
// A fixed window per key, kept in Postgres so the limit holds across serverless
// instances. One statement per check.

export type Limit = { limit: number; windowSeconds: number };

/** Counts one use of `what` by `who`; false when they're over the limit. */
export async function checkRateLimit(what: string, who: string, { limit, windowSeconds }: Limit): Promise<{ ok: boolean; retryAfterSeconds: number }> {
  const key = `${what}:${who}`.slice(0, 200);
  const result = await db.execute<{ count: number; wait: number }>(sql`
    insert into throttle (key, count, reset_at)
    values (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    on conflict (key) do update set
      count = case when throttle.reset_at <= now() then 1 else throttle.count + 1 end,
      reset_at = case when throttle.reset_at <= now() then now() + make_interval(secs => ${windowSeconds}) else throttle.reset_at end
    returning count, ceil(extract(epoch from (reset_at - now())))::int as wait`);
  const row = result.rows[0];
  // Old windows are only ever replaced by the same key, so sweep the abandoned ones now and then.
  if (Math.random() < 0.01) void db.execute(sql`delete from throttle where reset_at < now() - interval '1 day'`).catch(() => {});
  return { ok: row.count <= limit, retryAfterSeconds: Math.max(1, row.wait) };
}

/** Throws a message for the user when `who` is over the limit for `what`. */
export async function rateLimit(what: string, who: string, limit: Limit): Promise<void> {
  const { ok, retryAfterSeconds } = await checkRateLimit(what, who, limit);
  if (ok) return;
  const minutes = Math.ceil(retryAfterSeconds / 60);
  throw new Error(`That's a lot in a short time. Try again in ${minutes <= 1 ? "a minute" : `${minutes} minutes`}.`);
}

/** The caller's address, for limiting requests that aren't signed in. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
