"use server";

// The Stats view's data (plan.md 2.3, Phase 10): words written per day. Both
// counts come from what writers' browsers report as typed (`recordMyWriting`,
// from components/stats/session.ts), so a paste, an import, a restored version
// or the agent's edits are never counted as writing: a person's own count
// (`writer_hour`, theirs alone to read), and the project's, the sum of
// everyone's who can edit it (`writing_hour`). Before 19 October 2026 the
// project's count was taken from each save's change in length, pastes and all;
// those hours are still in it.

import { db, schema } from "@plotra/db";
import { and, eq, gt, sql } from "drizzle-orm";
import { requireProjectAccess } from "./access";
import { requireSession } from "./data";
import { rateLimit } from "./rate-limit";
import { userDb } from "./db";
import { readOnly, transaction } from "./request-cache";
import { safeTimeZone, todayIn, type WritingDay } from "./stats";

const { writerHour, writingHour } = schema;

/** Whose words: everyone's in the project, or only the reader's own typing. */
export type StatsScope = "project" | "me";

// A year back: enough for the 90-day chart and for a streak worth being proud of.
const WINDOW_DAYS = 366;

export type WritingStats = {
  /** Days something was written, oldest first, cut at midnight in `timeZone`. */
  days: WritingDay[];
  /** Today in that time zone. */
  today: string;
  timeZone: string;
};

/**
 * Words added and removed per day: the project's, whoever wrote them, or
 * (`scope: "me"`) only what the reader typed. `timeZone` is the reader's (an
 * IANA name from the browser), so "today" ends at their midnight rather than
 * at UTC's.
 */
export async function getWritingStats(projectId: string, timeZone?: string, scope: StatsScope = "project"): Promise<WritingStats> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    const zone = safeTimeZone(timeZone);
    const table = scope === "me" ? writerHour : writingHour;
    const day = sql<string>`to_char(${table.hour} at time zone ${zone}, 'YYYY-MM-DD')`;
    // Row-level security keeps "me" to the reader's own rows; the filter says so too.
    const mine = scope === "me" ? eq(writerHour.userId, (await requireSession()).user.id) : undefined;
    const days = await userDb((tx) =>
      tx
        .select({
          day,
          added: sql<number>`sum(${table.wordsAdded})::int`,
          removed: sql<number>`sum(${table.wordsRemoved})::int`,
        })
        .from(table)
        .where(and(eq(table.projectId, projectId), gt(table.hour, sql`now() - make_interval(days => ${WINDOW_DAYS})`), mine))
        // By position: the time zone is a bound parameter, and Postgres won't take two
        // separately bound copies of the expression for the same one.
        .groupBy(sql`1`)
        .orderBy(sql`1`),
    );
    return { days, today: todayIn(zone), timeZone: zone };
  });
}

/** The most one report may carry: a few minutes of very fast typing, not a pasted book. */
const MAX_REPORTED = 5_000;
const REPORT_LIMIT = { limit: 240, windowSeconds: 3600 };

/**
 * Adds what the signed-in person typed in a project since their browser last
 * reported, to the current hour: to their own count, and, when they can edit
 * the project (anyone else's typing changes nothing), to the project's.
 */
export async function recordMyWriting(projectId: string, added: number, removed: number): Promise<void> {
  return transaction(async () => {
    const { user } = await requireSession();
    const access = await requireProjectAccess(projectId);
    const clamp = (n: number) => (Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 0), MAX_REPORTED) : 0);
    const plus = clamp(added);
    const minus = clamp(removed);
    if (!plus && !minus) return;
    await rateLimit("writing-report", user.id, REPORT_LIMIT);
    await userDb((tx) =>
      tx
        .insert(writerHour)
        .values({ projectId, userId: user.id, hour: sql`date_trunc('hour', now())`, wordsAdded: plus, wordsRemoved: minus })
        .onConflictDoUpdate({
          target: [writerHour.projectId, writerHour.userId, writerHour.hour],
          set: { wordsAdded: sql`${writerHour.wordsAdded} + ${plus}`, wordsRemoved: sql`${writerHour.wordsRemoved} + ${minus}` },
        }),
    );
    if (!access.actions.has("edit")) return;
    // The project's count is read-only for the user connection (everyone in the project reads it): written here, after the check above.
    await db
      .insert(writingHour)
      .values({ projectId, hour: sql`date_trunc('hour', now())`, wordsAdded: plus, wordsRemoved: minus })
      .onConflictDoUpdate({
        target: [writingHour.projectId, writingHour.hour],
        set: { wordsAdded: sql`${writingHour.wordsAdded} + ${plus}`, wordsRemoved: sql`${writingHour.wordsRemoved} + ${minus}` },
      });
  });
}
