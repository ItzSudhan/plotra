import "server-only";
import { db, schema } from "@plotra/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { requestCache } from "../request-cache";
import { planOf, proLimits } from "./plans";
import { getSubscription } from "./subscription";

// Hosted AI credits (plan.md 8): a Pro workspace can run the agent on a model
// Plotra provides, up to an allowance each month, so nobody in it needs a key
// of their own. Someone's own key still wins, and uses no credits.
//
// A credit is a thousand tokens of input; output costs five times as much,
// which is roughly how providers price it. What a run used is written on its
// `agent_run` row when it ends, and a month's use is the sum of those rows:
// there is no separate ledger to drift out of step with the run log.

const { agentRun } = schema;

const OUTPUT_WEIGHT = 5;

/** What a run costs the workspace's allowance. */
export function creditsFor(usage: { inputTokens: number; outputTokens: number }): number {
  return Math.ceil((Math.max(0, usage.inputTokens) + OUTPUT_WEIGHT * Math.max(0, usage.outputTokens)) / 1000);
}

/** Credits a Pro workspace gets each month. */
export const monthlyAllowance = (): number => proLimits.aiCredits;

/**
 * The month `now` falls in, counted from `anchor` (when the subscription's
 * period began). Credits are monthly on a yearly subscription too, so the
 * windows are the anchor's day of the month, each month; a day the month
 * doesn't have (the 31st) falls on its last one.
 */
export function creditWindow(anchor: Date, now: Date = new Date()): { start: Date; end: Date } {
  const at = (months: number) => {
    const day = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + months, 1, anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds()));
    const last = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
    day.setUTCDate(Math.min(anchor.getUTCDate(), last));
    return day;
  };
  let months = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (now.getUTCMonth() - anchor.getUTCMonth());
  if (at(months) > now) months -= 1;
  months = Math.max(0, months);
  return { start: at(months), end: at(months + 1) };
}

export type CreditState = {
  allowance: number;
  used: number;
  /** Zero or more. */
  left: number;
  /** When the allowance is full again. */
  resetsAt: Date;
};

/** A workspace's hosted AI allowance this month, or null when it has none (Free, or billing off). */
export const getCreditState = requestCache(async (workspaceId: string): Promise<CreditState | null> => {
  const sub = await getSubscription(workspaceId);
  if (!sub || planOf(sub.status) !== "pro") return null;
  const allowance = monthlyAllowance();
  const { start, end } = creditWindow(sub.currentPeriodStart ?? sub.createdAt);
  const [row] = await db
    .select({ used: sql<number>`coalesce(sum(${agentRun.credits}), 0)::int` })
    .from(agentRun)
    .where(and(eq(agentRun.workspaceId, workspaceId), gte(agentRun.startedAt, start)));
  const used = row?.used ?? 0;
  return { allowance, used, left: Math.max(0, allowance - used), resetsAt: end };
});
