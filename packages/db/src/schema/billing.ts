import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth";

// Paid plans (plan.md 8): a workspace is on Free until it has a subscription
// here. Creem is the merchant of record and the source of truth; these rows
// are a copy kept up to date by its webhooks (apps/app/lib/billing). Nothing
// about a card or an invoice is stored, only ids and the subscription's state.
//
// Both tables are written by the server's own connection, after a verified
// webhook or a check with Creem's API. No user request writes them.

// Creem's statuses, plus `expired` for a subscription that has ended for good.
export const subscriptionStatuses = ["active", "trialing", "scheduled_cancel", "past_due", "unpaid", "paused", "canceled", "expired"] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

export const billingIntervals = ["month", "year"] as const;
export type BillingInterval = (typeof billingIntervals)[number];

/** A workspace's subscription: one row per workspace, replaced when it subscribes again. */
export const subscription = pgTable(
  "subscription",
  {
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    creemSubscriptionId: text("creem_subscription_id").notNull().unique(),
    creemCustomerId: text("creem_customer_id").notNull(),
    creemProductId: text("creem_product_id").notNull(),
    interval: text("interval").$type<BillingInterval>().notNull(),
    status: text("status").$type<SubscriptionStatus>().notNull(),
    // The period paid for. Hosted AI credits are counted within it.
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    // Creem's own `updated_at`: an event older than what is stored is ignored, since webhooks can arrive out of order.
    creemUpdatedAt: timestamp("creem_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("subscription_customer_idx").on(t.creemCustomerId)],
);

/** Webhook events already handled, by Creem's event id: a redelivery is acknowledged and not applied twice. */
export const billingEvent = pgTable("billing_event", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  workspaceId: text("workspace_id"),
  applied: boolean("applied").default(false).notNull(),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
});
