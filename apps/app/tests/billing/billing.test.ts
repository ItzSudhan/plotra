import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { verifyWebhook } from "@/lib/billing/creem";
import { creditWindow, creditsFor } from "@/lib/billing/credits";
import { planOf } from "@/lib/billing/plans";
import { readSubscription, shouldApply } from "@/lib/billing/subscription";
import { incomingOf } from "@/lib/billing/webhook";

// The parts of billing that decide who is on Pro and what a run costs, without
// a database or Creem: signatures, reading Creem's payloads, event ordering
// and the monthly credit window.

const MONTHLY = "prod_monthly";
const YEARLY = "prod_yearly";
const saved = { ...process.env };

beforeEach(() => {
  process.env.CREEM_API_KEY = "creem_test_key";
  process.env.CREEM_PRODUCT_PRO_MONTHLY = MONTHLY;
  process.env.CREEM_PRODUCT_PRO_YEARLY = YEARLY;
});
afterEach(() => {
  process.env = { ...saved };
});

describe("verifyWebhook", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "evt_1", eventType: "subscription.paid" });
  const sign = (text: string, key = secret) => createHmac("sha256", key).update(text).digest("hex");

  test("accepts Creem's HMAC of the raw body", () => {
    expect(verifyWebhook(body, sign(body), secret)).toBe(true);
  });
  test("refuses a changed body, another secret, and anything malformed", () => {
    expect(verifyWebhook(`${body} `, sign(body), secret)).toBe(false);
    expect(verifyWebhook(body, sign(body, "other"), secret)).toBe(false);
    expect(verifyWebhook(body, "not hex", secret)).toBe(false);
    expect(verifyWebhook(body, "", secret)).toBe(false);
    expect(verifyWebhook(body, null, secret)).toBe(false);
  });
  test("refuses everything when no secret is configured", () => {
    expect(verifyWebhook(body, sign(body, ""), "")).toBe(false);
    expect(verifyWebhook(body, sign(body), undefined)).toBe(false);
  });
});

describe("planOf", () => {
  test("Pro while paid, cancelling at the period's end, or retrying a payment", () => {
    for (const status of ["active", "trialing", "scheduled_cancel", "past_due"] as const) expect(planOf(status)).toBe("pro");
  });
  test("Free otherwise", () => {
    for (const status of ["canceled", "expired", "unpaid", "paused"] as const) expect(planOf(status)).toBe("free");
    expect(planOf(null)).toBe("free");
  });
});

describe("readSubscription", () => {
  const sub = {
    id: "sub_1",
    status: "active",
    product: { id: MONTHLY, billing_period: "every-month" },
    customer: { id: "cust_1" },
    current_period_start_date: "2026-10-03T10:00:00.000Z",
    current_period_end_date: "2026-11-03T10:00:00.000Z",
    canceled_at: null,
    updated_at: "2026-10-03T10:00:05.000Z",
    metadata: { workspaceId: "ws_1" },
  };

  test("reads a subscription event", () => {
    const row = readSubscription(sub);
    expect(row).toMatchObject({ workspaceId: "ws_1", creemSubscriptionId: "sub_1", creemCustomerId: "cust_1", creemProductId: MONTHLY, interval: "month", status: "active" });
    expect(row?.currentPeriodEnd?.toISOString()).toBe("2026-11-03T10:00:00.000Z");
  });
  test("the metadata's workspace wins over the one looked up", () => {
    expect(readSubscription(sub, { workspaceId: "ws_other" })?.workspaceId).toBe("ws_1");
    expect(readSubscription({ ...sub, metadata: null }, { workspaceId: "ws_known" })?.workspaceId).toBe("ws_known");
  });
  test("ignores another product, an unknown status and a subscription with no workspace", () => {
    expect(readSubscription({ ...sub, product: "prod_something_else" })).toBeNull();
    expect(readSubscription({ ...sub, status: "weird" })).toBeNull();
    expect(readSubscription({ ...sub, metadata: {} })).toBeNull();
  });
  test("an event's status replaces the object's", () => {
    expect(readSubscription(sub, { status: "expired" })?.status).toBe("expired");
  });
});

describe("incomingOf", () => {
  test("checkout.completed: ids on the subscription, the workspace on the checkout", async () => {
    const row = await incomingOf("checkout.completed", {
      id: "ch_1",
      status: "completed",
      product: { id: YEARLY },
      customer: { id: "cust_1", email: "a@example.com" },
      subscription: { id: "sub_1", product: YEARLY, customer: "cust_1", status: "active", metadata: { workspaceId: "ws_1" } },
      metadata: { workspaceId: "ws_1" },
    });
    expect(row).toMatchObject({ workspaceId: "ws_1", creemSubscriptionId: "sub_1", creemCustomerId: "cust_1", interval: "year", status: "active" });
  });
  test("a one-time purchase and an unrelated event are not subscriptions", async () => {
    expect(await incomingOf("checkout.completed", { id: "ch_1", status: "completed", product: MONTHLY, customer: "cust_1", metadata: { workspaceId: "ws_1" } })).toBeNull();
    expect(await incomingOf("refund.created", { id: "ref_1" })).toBeNull();
    expect(await incomingOf("subscription.paid", null)).toBeNull();
  });
  test("subscription.expired ends Pro although the object still says active", async () => {
    const row = await incomingOf("subscription.expired", { id: "sub_1", status: "active", product: MONTHLY, customer: "cust_1", metadata: { workspaceId: "ws_1" } });
    expect(row?.status).toBe("expired");
    expect(planOf(row?.status)).toBe("free");
  });
});

describe("shouldApply", () => {
  const at = (iso: string) => new Date(iso);
  const stored = { creemSubscriptionId: "sub_1", creemUpdatedAt: at("2026-10-03T10:00:00Z") };

  test("the first thing heard about a workspace is stored", () => {
    expect(shouldApply(null, { creemSubscriptionId: "sub_1", creemUpdatedAt: null, status: "canceled" })).toBe(true);
  });
  test("an older event for the same subscription is dropped, a newer one applied", () => {
    expect(shouldApply(stored, { creemSubscriptionId: "sub_1", creemUpdatedAt: at("2026-10-03T09:00:00Z"), status: "active" })).toBe(false);
    expect(shouldApply(stored, { creemSubscriptionId: "sub_1", creemUpdatedAt: at("2026-10-03T11:00:00Z"), status: "canceled" })).toBe(true);
  });
  test("a late cancellation of an old subscription doesn't end a new one", () => {
    expect(shouldApply({ ...stored, creemSubscriptionId: "sub_new" }, { creemSubscriptionId: "sub_old", creemUpdatedAt: at("2026-10-04T00:00:00Z"), status: "canceled" })).toBe(false);
  });
  test("subscribing again replaces a cancelled subscription", () => {
    expect(shouldApply(stored, { creemSubscriptionId: "sub_2", creemUpdatedAt: at("2026-10-01T00:00:00Z"), status: "active" })).toBe(true);
  });
});

describe("credits", () => {
  test("a credit is a thousand input tokens; output counts five times", () => {
    expect(creditsFor({ inputTokens: 0, outputTokens: 0 })).toBe(0);
    expect(creditsFor({ inputTokens: 1, outputTokens: 0 })).toBe(1);
    expect(creditsFor({ inputTokens: 10_000, outputTokens: 2_000 })).toBe(20);
  });

  const window = (anchor: string, now: string) => {
    const { start, end } = creditWindow(new Date(anchor), new Date(now));
    return [start.toISOString(), end.toISOString()];
  };
  test("the first month starts at the anchor", () => {
    expect(window("2026-10-03T10:00:00Z", "2026-10-20T00:00:00Z")).toEqual(["2026-10-03T10:00:00.000Z", "2026-11-03T10:00:00.000Z"]);
  });
  test("a yearly subscription still gets a window each month", () => {
    expect(window("2026-10-03T10:00:00Z", "2027-03-03T09:59:00Z")).toEqual(["2027-02-03T10:00:00.000Z", "2027-03-03T10:00:00.000Z"]);
    expect(window("2026-10-03T10:00:00Z", "2027-03-03T10:00:00Z")).toEqual(["2027-03-03T10:00:00.000Z", "2027-04-03T10:00:00.000Z"]);
  });
  test("the 31st falls on a shorter month's last day", () => {
    expect(window("2026-01-31T00:00:00Z", "2026-02-15T00:00:00Z")).toEqual(["2026-01-31T00:00:00.000Z", "2026-02-28T00:00:00.000Z"]);
    expect(window("2026-01-31T00:00:00Z", "2026-03-01T00:00:00Z")).toEqual(["2026-02-28T00:00:00.000Z", "2026-03-31T00:00:00.000Z"]);
  });
  test("a clock behind the anchor doesn't go back before it", () => {
    expect(window("2026-10-03T10:00:00Z", "2026-10-01T00:00:00Z")[0]).toBe("2026-10-03T10:00:00.000Z");
  });
});
