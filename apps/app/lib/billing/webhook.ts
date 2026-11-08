import "server-only";
import { db, schema } from "@plotra/db";
import { eq } from "drizzle-orm";
import { track } from "../analytics";
import { refId, type CreemCheckout, type CreemSubscription } from "./creem";
import { planOf } from "./plans";
import { applySubscription, readSubscription, workspaceOfSubscription, type Incoming } from "./subscription";

// What a Creem webhook means for a workspace (plan.md 8). The route
// (app/api/billing/webhook) checks the signature; this file only reads an
// event that has already been verified.

const { billingEvent } = schema;

export type CreemEvent = { id?: unknown; eventType?: unknown; object?: unknown };

// `subscription.expired` arrives with the object still marked "active": the period ended unpaid.
const statusOfEvent: Record<string, string | undefined> = { "subscription.expired": "expired" };

/** The subscription an event is about, as a row, or null when the event isn't one Plotra acts on. */
export async function incomingOf(type: string, object: unknown): Promise<Incoming | null> {
  if (!object || typeof object !== "object") return null;
  if (type === "checkout.completed") {
    const checkout = object as CreemCheckout;
    const sub = checkout.subscription;
    // A one-time purchase has no subscription; a bare id says nothing we can store.
    if (!sub || typeof sub === "string") return null;
    return readSubscription(sub, {
      workspaceId: typeof checkout.metadata?.workspaceId === "string" ? checkout.metadata.workspaceId : null,
      customerId: refId(checkout.customer),
      productId: refId(checkout.product),
    });
  }
  if (type.startsWith("subscription.")) {
    const sub = object as CreemSubscription;
    // Events after the first don't always repeat the metadata: the row already says whose it is.
    const known = typeof sub.metadata?.workspaceId === "string" ? null : sub.id ? await workspaceOfSubscription(sub.id) : null;
    return readSubscription(sub, { workspaceId: known, status: statusOfEvent[type] });
  }
  return null;
}

/**
 * Handles one verified event. Safe to call again with the same event: Creem
 * retries until it gets a 2xx, and an event already applied isn't applied twice.
 * Throws only when something failed that a retry could fix.
 */
export async function handleEvent(event: CreemEvent): Promise<"applied" | "ignored" | "duplicate"> {
  const id = typeof event.id === "string" ? event.id : "";
  const type = typeof event.eventType === "string" ? event.eventType : "";
  if (!id || !type) return "ignored";

  const [seen] = await db.select({ applied: billingEvent.applied }).from(billingEvent).where(eq(billingEvent.id, id)).limit(1);
  if (seen?.applied) return "duplicate";

  const incoming = await incomingOf(type, event.object);
  const applied = incoming ? await applySubscription(incoming) : false;
  // Recorded only once it has been dealt with, so a failure above is retried.
  await db
    .insert(billingEvent)
    .values({ id, type: type.slice(0, 100), workspaceId: incoming?.workspaceId ?? null, applied: true })
    .onConflictDoUpdate({ target: billingEvent.id, set: { applied: true } });

  if (applied && incoming && (type === "checkout.completed" || type === "subscription.canceled" || type === "subscription.scheduled_cancel")) {
    await track(type === "checkout.completed" ? "subscribed" : "subscription_canceled", { workspaceId: incoming.workspaceId, properties: { interval: incoming.interval, plan: planOf(incoming.status) } });
  }
  return applied ? "applied" : "ignored";
}
