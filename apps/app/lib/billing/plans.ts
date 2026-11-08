import type { BillingInterval, SubscriptionStatus } from "@plotra/db/schema";

// The plans (plan.md 8). Nothing here imports server code, so the settings
// page and the server agree on one table.
//
// A plan is limits and an AI allowance, never a locked feature: every module
// works on Free. Going back to Free deletes nothing and makes nothing
// read-only; it only stops more being added past the Free limits.
//
// Plans exist only where billing is switched on (CREEM_API_KEY, lib/billing/creem.ts).
// A self-hosted Plotra has no plans and no limits.

export type PlanId = "free" | "pro";

export type Limits = {
  /** Projects in one workspace. Null means no limit, here and below. */
  projects: number | null;
  /** Attachments and version snapshots of one workspace together, in bytes. */
  storageBytes: number | null;
  /** One uploaded file, in bytes. */
  fileBytes: number | null;
  /** Workspace members, the owner included. Pending invitations count. */
  members: number | null;
  /** People one project is shared with from outside the workspace. */
  guests: number | null;
  /** Hosted AI credits per month (lib/billing/credits.ts). Zero: bring your own key. */
  aiCredits: number;
};

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** One project can't be shared with more people than this on any plan. */
export const MAX_GUESTS = 200;

/** Free's limits, which keep the hosted version inside its providers' free tiers. */
export const freeLimits: Limits = {
  projects: 10,
  storageBytes: 50 * MB,
  fileBytes: 10 * MB,
  members: 3,
  guests: 5,
  aiCredits: 0,
};

/** Pro's limits. */
export const proLimits: Limits = {
  projects: null,
  storageBytes: 50 * GB,
  fileBytes: 100 * MB,
  members: 25,
  guests: MAX_GUESTS,
  aiCredits: 1500,
};

/** Prices in US dollars, shown in settings. What is charged is the Creem product's own price. */
export const proPrice: Record<BillingInterval, { amount: number; label: string; note: string }> = {
  month: { amount: 10, label: "$10 a month", note: "Billed monthly" },
  year: { amount: 96, label: "$96 a year", note: "$8 a month, billed yearly" },
};

/** Statuses a workspace keeps Pro in: paid up, cancelling at the period's end, or a payment being retried. */
const entitled: ReadonlySet<SubscriptionStatus> = new Set(["active", "trialing", "scheduled_cancel", "past_due"]);

/** The plan a subscription's status gives. No subscription is Free. */
export const planOf = (status: SubscriptionStatus | null | undefined): PlanId => (status && entitled.has(status) ? "pro" : "free");

export const planLabel: Record<PlanId, string> = { free: "Free", pro: "Pro" };
