import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingInterval } from "@plotra/db/schema";
import { isLocalMode } from "../local-mode";

// Creem (creem.io) is the merchant of record: it runs the checkout, charges
// the card, handles tax and sends the invoices. Plotra only starts a checkout,
// links to Creem's customer portal, and keeps a copy of each subscription's
// state from its webhooks (lib/billing/subscription.ts).
//
// The API is called with plain fetch: four calls don't need an SDK.

/**
 * Billing is on when a Creem key is set. Without one there are no plans at all
 * (self-hosting), and never in local mode: no limits, no hosted AI.
 */
export function billingEnabled(): boolean {
  if (isLocalMode) return false;
  return Boolean(process.env.CREEM_API_KEY?.trim());
}

/** The Creem product for each billing interval of Pro. */
export function proProducts(): Record<BillingInterval, string | null> {
  return {
    month: process.env.CREEM_PRODUCT_PRO_MONTHLY?.trim() || null,
    year: process.env.CREEM_PRODUCT_PRO_YEARLY?.trim() || null,
  };
}

/** Which interval of Pro a Creem product is, or null for a product that isn't ours to act on. */
export function intervalOfProduct(productId: string): BillingInterval | null {
  const products = proProducts();
  if (productId === products.month) return "month";
  if (productId === products.year) return "year";
  return null;
}

// A test-mode key talks to Creem's test API, where no money moves.
const baseUrl = (key: string) => (key.startsWith("creem_test_") ? "https://test-api.creem.io/v1" : "https://api.creem.io/v1");

async function creem<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const key = process.env.CREEM_API_KEY?.trim();
  if (!key) throw new Error("Billing isn't set up on this server.");
  let response: Response;
  try {
    response = await fetch(`${baseUrl(key)}${path}`, {
      method,
      headers: { "x-api-key": key, ...(body !== undefined && { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (cause) {
    console.error("[plotra] Creem couldn't be reached", cause);
    throw new Error("The payment provider couldn't be reached. Try again in a moment.");
  }
  if (!response.ok) {
    // Creem's answer goes to the log, not to the user: it can name the account.
    console.error(`[plotra] Creem ${method} ${path} answered ${response.status}: ${(await response.text()).slice(0, 500)}`);
    throw new Error("The payment provider answered with an error. Try again in a moment.");
  }
  return (await response.json()) as T;
}

// ── What Creem sends ────────────────────────────────────────────────────────
// Only the fields Plotra reads. `product` and `customer` are ids in some
// payloads and whole objects in others.

type Ref = string | { id: string; billing_period?: string } | null | undefined;

export type CreemSubscription = {
  id: string;
  status: string;
  product?: Ref;
  customer?: Ref;
  current_period_start_date?: string | null;
  current_period_end_date?: string | null;
  canceled_at?: string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CreemCheckout = {
  id: string;
  status: string;
  checkout_url?: string;
  product?: Ref;
  customer?: Ref;
  subscription?: string | CreemSubscription | null;
  metadata?: Record<string, unknown> | null;
};

export const refId = (ref: Ref): string | null => (typeof ref === "string" ? ref : (ref?.id ?? null));

// ── Calls ───────────────────────────────────────────────────────────────────

/**
 * Starts a checkout for a workspace and returns the page to send the buyer to.
 * The workspace's id travels in the metadata, which Creem copies onto the
 * subscription: that is how a webhook knows whose subscription it is.
 */
export async function createCheckout(input: { productId: string; workspaceId: string; userId: string; email: string; successUrl: string }): Promise<string> {
  const checkout = await creem<CreemCheckout>("POST", "/checkouts", {
    product_id: input.productId,
    request_id: `${input.workspaceId}:${crypto.randomUUID()}`,
    success_url: input.successUrl,
    customer: { email: input.email },
    metadata: { workspaceId: input.workspaceId, userId: input.userId },
  });
  if (!checkout.checkout_url) throw new Error("The payment provider didn't return a checkout page. Try again in a moment.");
  return checkout.checkout_url;
}

export const getCheckout = (checkoutId: string) => creem<CreemCheckout>("GET", `/checkouts?checkout_id=${encodeURIComponent(checkoutId)}`);

export const getSubscription = (subscriptionId: string) => creem<CreemSubscription>("GET", `/subscriptions?subscription_id=${encodeURIComponent(subscriptionId)}`);

/** A link to Creem's customer portal: invoices, and cancelling. */
export async function createPortalLink(customerId: string): Promise<string> {
  const { customer_portal_link: link } = await creem<{ customer_portal_link?: string }>("POST", "/customers/billing", { customer_id: customerId });
  if (!link) throw new Error("The payment provider didn't return a billing page. Try again in a moment.");
  return link;
}

// ── Webhooks ────────────────────────────────────────────────────────────────

/**
 * Whether a webhook really came from Creem: the `creem-signature` header is the
 * HMAC-SHA256 of the raw body, in hex, keyed with the webhook secret.
 * Compared in constant time; anything malformed is simply not a match.
 */
export function verifyWebhook(rawBody: string, signature: string | null, secret = process.env.CREEM_WEBHOOK_SECRET?.trim()): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(signature.trim(), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
