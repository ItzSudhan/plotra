"use server";

// Plan & billing for a workspace (plan.md 8). Owners and admins see the plan
// and what the workspace uses; only an owner can start a checkout or open the
// billing portal, since that is where money is spent and cancelled. Every
// function checks for itself: these are public endpoints, whoever renders them.

import { db, schema } from "@plotra/db";
import { billingIntervals, type BillingInterval, type SubscriptionStatus } from "@plotra/db/schema";
import { eq } from "drizzle-orm";
import { hostedSettings } from "../agent/settings";
import { track } from "../analytics";
import { requireSession } from "../data";
import { appLink } from "../email";
import { getStorageUsage, limitsFor } from "../quotas";
import { rateLimit } from "../rate-limit";
import { readOnly, transaction } from "../request-cache";
import { requireAdmin } from "../workspace";
import { billingEnabled, createCheckout, createPortalLink, getCheckout, getSubscription as fetchSubscription, proProducts, refId } from "./creem";
import { getCreditState } from "./credits";
import { planOf, type PlanId } from "./plans";
import { applySubscription, getSubscription, readSubscription } from "./subscription";

const { member, project } = schema;

type Meter = { used: number; limit: number | null };

export type BillingView = {
  plan: PlanId;
  /** Null on Free with no subscription behind it. */
  status: SubscriptionStatus | null;
  interval: BillingInterval | null;
  /** When the paid period ends: the next charge, or the last day of Pro when it is cancelling. */
  periodEnd: string | null;
  /** Only an owner can pay, cancel or see invoices. */
  canManage: boolean;
  /** There is a Creem customer to open the portal for. */
  hasCustomer: boolean;
  /** Which intervals this server sells (a product id is set for each). */
  sells: Record<BillingInterval, boolean>;
  /** A hosted model is configured, so Pro really does include AI here. */
  hostedAi: boolean;
  usage: { projects: Meter; storage: Meter; members: Meter; credits: { used: number; allowance: number; resetsAt: string } | null };
};

/** What the Plan & billing tab shows. Null where billing is off: the tab isn't there at all. */
export async function getBilling(workspaceSlug: string): Promise<BillingView | null> {
  return readOnly(async () => {
    const { workspace, role } = await requireAdmin(workspaceSlug);
    if (!billingEnabled()) return null;
    const [sub, limits, projects, members, storage, credits] = await Promise.all([
      getSubscription(workspace.id),
      limitsFor(workspace.id),
      db.$count(project, eq(project.organizationId, workspace.id)),
      db.$count(member, eq(member.organizationId, workspace.id)),
      getStorageUsage(workspace.id),
      getCreditState(workspace.id),
    ]);
    const products = proProducts();
    const hostedAi = hostedSettings() !== null;
    return {
      plan: planOf(sub?.status),
      status: sub?.status ?? null,
      interval: sub?.interval ?? null,
      periodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      canManage: role === "owner",
      hasCustomer: Boolean(sub?.creemCustomerId),
      sells: { month: Boolean(products.month), year: Boolean(products.year) },
      hostedAi,
      usage: {
        projects: { used: projects, limit: limits.projects },
        storage: { used: storage, limit: limits.storageBytes },
        members: { used: members, limit: limits.members },
        credits: credits && hostedAi ? { used: credits.used, allowance: credits.allowance, resetsAt: credits.resetsAt.toISOString() } : null,
      },
    };
  });
}

async function requireOwner(workspaceSlug: string) {
  const admin = await requireAdmin(workspaceSlug);
  if (admin.role !== "owner") throw new Error("Only an owner of the workspace can change its plan.");
  if (!billingEnabled()) throw new Error("Billing isn't set up on this server.");
  return admin;
}

/** Starts a checkout for Pro and returns Creem's page to send the owner to. */
export async function startCheckout(workspaceSlug: string, interval: BillingInterval): Promise<{ url: string }> {
  return transaction(async () => {
    const { workspace, userId } = await requireOwner(workspaceSlug);
    const { user } = await requireSession();
    if (!billingIntervals.includes(interval)) throw new Error("Choose monthly or yearly.");
    const productId = proProducts()[interval];
    if (!productId) throw new Error(`Pro isn't sold ${interval === "year" ? "yearly" : "monthly"} here.`);
    // Two subscriptions for one workspace would both be charged.
    if (planOf((await getSubscription(workspace.id))?.status) === "pro") throw new Error("This workspace is already on Pro.");
    await rateLimit("checkout", userId, { limit: 20, windowSeconds: 3600 });
    const url = await createCheckout({
      productId,
      workspaceId: workspace.id,
      userId,
      email: user.email,
      // Creem adds `checkout_id` and its other ids to this address when it sends the buyer back.
      successUrl: appLink(`/w/${workspace.slug}/settings?tab=billing`),
    });
    await track("checkout_started", { userId, workspaceId: workspace.id, properties: { interval } });
    return { url };
  });
}

/** A link to Creem's customer portal for this workspace's subscription: invoices, and cancelling. */
export async function openBillingPortal(workspaceSlug: string): Promise<{ url: string }> {
  return transaction(async () => {
    const { workspace, userId } = await requireOwner(workspaceSlug);
    const sub = await getSubscription(workspace.id);
    if (!sub) throw new Error("This workspace has no subscription to manage.");
    await rateLimit("billing-portal", userId, { limit: 30, windowSeconds: 3600 });
    return { url: await createPortalLink(sub.creemCustomerId) };
  });
}

/**
 * Called when a buyer lands back from the checkout: asks Creem about that
 * checkout directly, so the workspace is on Pro at once and not whenever the
 * webhook arrives. What is stored comes from Creem's answer, never from the
 * address the browser was sent back to, and only if Creem says the checkout
 * was for this workspace. Never throws: the webhook will do the same job.
 */
export async function confirmCheckout(workspaceSlug: string, checkoutId: string): Promise<void> {
  try {
    const { workspace, userId } = await requireAdmin(workspaceSlug);
    if (!billingEnabled() || !/^[\w-]{1,100}$/.test(checkoutId)) return;
    if (planOf((await getSubscription(workspace.id))?.status) === "pro") return;
    await rateLimit("checkout-confirm", userId, { limit: 30, windowSeconds: 3600 });
    const checkout = await getCheckout(checkoutId);
    if (checkout.status !== "completed" || checkout.metadata?.workspaceId !== workspace.id || !checkout.subscription) return;
    // The checkout names its subscription, in full or by id; either way the subscription itself has the dates.
    const sub = await fetchSubscription(typeof checkout.subscription === "string" ? checkout.subscription : checkout.subscription.id);
    const incoming = readSubscription(sub, { workspaceId: workspace.id, customerId: refId(checkout.customer), productId: refId(checkout.product) });
    if (incoming) await applySubscription(incoming);
  } catch (error) {
    console.error("[plotra] couldn't confirm a checkout on return", error);
  }
}
