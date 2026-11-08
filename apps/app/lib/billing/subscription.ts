import "server-only";
import { db, schema } from "@plotra/db";
import { subscriptionStatuses, type BillingInterval, type SubscriptionStatus } from "@plotra/db/schema";
import { eq } from "drizzle-orm";
import { requestCache } from "../request-cache";
import { billingEnabled, intervalOfProduct, refId, type CreemSubscription } from "./creem";
import { planOf, type PlanId } from "./plans";

// The copy of each workspace's subscription (plan.md 8). Creem is the source
// of truth; this table follows it through webhooks, and through one direct
// check when a buyer comes back from the checkout before the webhook has.
//
// Read and written on the server's own connection: no user request can write
// a subscription, and a plan isn't a secret from anyone who can open the
// workspace's projects.

const { subscription } = schema;

export type SubscriptionRow = typeof subscription.$inferSelect;

/** A workspace's subscription row, whatever state it is in. */
export const getSubscription = requestCache(async (workspaceId: string): Promise<SubscriptionRow | null> => {
  if (!billingEnabled()) return null;
  const [row] = await db.select().from(subscription).where(eq(subscription.workspaceId, workspaceId)).limit(1);
  return row ?? null;
});

/** The plan a workspace is on. Always Free where billing is off; the limits then come from env alone (lib/quotas.ts). */
export async function getPlan(workspaceId: string): Promise<PlanId> {
  return planOf((await getSubscription(workspaceId))?.status);
}

const isStatus = (value: string): value is SubscriptionStatus => (subscriptionStatuses as readonly string[]).includes(value);

const date = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** A subscription as Creem describes it, in the shape of a row. */
export type Incoming = {
  workspaceId: string;
  creemSubscriptionId: string;
  creemCustomerId: string;
  creemProductId: string;
  interval: BillingInterval;
  status: SubscriptionStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  creemUpdatedAt: Date | null;
};

/**
 * Reads a Creem subscription. Null when it isn't one of Pro's products (the
 * same Creem store may sell other things) or is missing what a row needs.
 * `status` overrides the object's own where the event says more than the
 * object does (`subscription.expired` arrives still marked "active").
 * `customerId` and `productId` fill in for payloads that carry them elsewhere.
 */
export function readSubscription(sub: CreemSubscription, fallback: { workspaceId?: string | null; customerId?: string | null; productId?: string | null; status?: string } = {}): Incoming | null {
  const workspaceId = typeof sub.metadata?.workspaceId === "string" ? sub.metadata.workspaceId : fallback.workspaceId;
  const productId = refId(sub.product) ?? fallback.productId;
  const customerId = refId(sub.customer) ?? fallback.customerId;
  const status = fallback.status ?? sub.status;
  if (!sub.id || !workspaceId || !productId || !customerId || !isStatus(status)) return null;
  const interval = intervalOfProduct(productId);
  if (!interval) return null;
  return {
    workspaceId,
    creemSubscriptionId: sub.id,
    creemCustomerId: customerId,
    creemProductId: productId,
    interval,
    status,
    currentPeriodStart: date(sub.current_period_start_date),
    currentPeriodEnd: date(sub.current_period_end_date),
    canceledAt: date(sub.canceled_at),
    creemUpdatedAt: date(sub.updated_at),
  };
}

/**
 * Whether what Creem just said should replace what is stored. Webhooks can
 * arrive late and out of order, and a workspace that subscribes again gets a
 * new subscription while events for the old one may still be on their way.
 */
export function shouldApply(existing: Pick<SubscriptionRow, "creemSubscriptionId" | "creemUpdatedAt"> | null, incoming: Pick<Incoming, "creemSubscriptionId" | "creemUpdatedAt" | "status">): boolean {
  if (!existing) return true;
  // Another subscription takes the workspace over only by being a paid one: a late "canceled" for an old one changes nothing.
  if (existing.creemSubscriptionId !== incoming.creemSubscriptionId) return planOf(incoming.status) === "pro";
  if (!existing.creemUpdatedAt || !incoming.creemUpdatedAt) return true;
  return incoming.creemUpdatedAt >= existing.creemUpdatedAt;
}

/** The workspace a Creem subscription is stored against, for events that don't carry the metadata. */
export async function workspaceOfSubscription(creemSubscriptionId: string): Promise<string | null> {
  const [row] = await db.select({ workspaceId: subscription.workspaceId }).from(subscription).where(eq(subscription.creemSubscriptionId, creemSubscriptionId)).limit(1);
  return row?.workspaceId ?? null;
}

/** Stores what Creem said about a subscription. Returns whether anything was written. */
export async function applySubscription(incoming: Incoming): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(subscription).where(eq(subscription.workspaceId, incoming.workspaceId)).for("update").limit(1);
    if (!shouldApply(existing ?? null, incoming)) return false;
    if (!existing) {
      // The workspace may have been deleted between the payment and the webhook: nothing to attach it to.
      const [workspace] = await tx.select({ id: schema.organization.id }).from(schema.organization).where(eq(schema.organization.id, incoming.workspaceId)).limit(1);
      if (!workspace) return false;
      await tx.insert(subscription).values(incoming);
      return true;
    }
    const same = existing.creemSubscriptionId === incoming.creemSubscriptionId;
    await tx
      .update(subscription)
      .set({
        ...incoming,
        // Some events leave the period out; what is known about the same subscription is kept.
        currentPeriodStart: incoming.currentPeriodStart ?? (same ? existing.currentPeriodStart : null),
        currentPeriodEnd: incoming.currentPeriodEnd ?? (same ? existing.currentPeriodEnd : null),
        creemUpdatedAt: incoming.creemUpdatedAt ?? (same ? existing.creemUpdatedAt : null),
        ...(!same && { createdAt: new Date() }),
      })
      .where(eq(subscription.workspaceId, incoming.workspaceId));
    return true;
  });
}
