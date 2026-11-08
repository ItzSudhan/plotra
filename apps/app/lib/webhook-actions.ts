"use server";

import { schema } from "@plotra/db";
import { webhookEvents, type WebhookEvent } from "@plotra/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { requireProjectAccess } from "./access";
import { requireSession } from "./data";
import { userDb } from "./db";
import { rateLimit } from "./rate-limit";
import { readOnly, transaction } from "./request-cache";
import { deliver, MAX_WEBHOOKS, newWebhookSecret, parseWebhookUrl, type DeliveryResult, type WebhookPayload } from "./webhooks";

// A project's webhooks (lib/webhooks.ts), for the people who manage it:
// Project settings → Webhooks. Each function checks `manage` itself.

const { webhook } = schema;

export type WebhookRow = {
  id: string;
  url: string;
  secret: string;
  /** Empty: every event. */
  events: WebhookEvent[];
  enabled: boolean;
  createdAt: string;
  lastDeliveryAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
  failures: number;
};

const columns = {
  id: webhook.id,
  url: webhook.url,
  secret: webhook.secret,
  events: webhook.events,
  enabled: webhook.enabled,
  createdAt: webhook.createdAt,
  lastDeliveryAt: webhook.lastDeliveryAt,
  lastStatus: webhook.lastStatus,
  lastError: webhook.lastError,
  failures: webhook.failures,
};

const toRow = (row: { createdAt: Date; lastDeliveryAt: Date | null } & Omit<WebhookRow, "createdAt" | "lastDeliveryAt">): WebhookRow => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  lastDeliveryAt: row.lastDeliveryAt?.toISOString() ?? null,
});

const cleanEvents = (events: unknown): WebhookEvent[] => {
  if (!Array.isArray(events)) return [];
  const picked = webhookEvents.filter((event) => events.includes(event));
  // Every event chosen is the same as none chosen: both mean all of them, including any added later.
  return picked.length === webhookEvents.length ? [] : picked;
};

const LIMIT = { limit: 60, windowSeconds: 3600 };

/** The project's webhooks, oldest first. Managers only. */
export async function listWebhooks(projectId: string): Promise<WebhookRow[]> {
  return readOnly(async () => {
    await requireProjectAccess(projectId, "manage");
    const rows = await userDb((tx) => tx.select(columns).from(webhook).where(eq(webhook.projectId, projectId)).orderBy(asc(webhook.createdAt)));
    return rows.map(toRow);
  });
}

/** Adds a webhook, with a new secret. */
export async function createWebhook(projectId: string, input: { url: string; events?: WebhookEvent[] }): Promise<WebhookRow> {
  return transaction(async () => {
    const { user } = await requireSession();
    await requireProjectAccess(projectId, "manage");
    await rateLimit("webhooks", user.id, LIMIT);
    const url = parseWebhookUrl(input?.url).toString();
    const existing = await userDb((tx) => tx.$count(webhook, eq(webhook.projectId, projectId)));
    if (existing >= MAX_WEBHOOKS) throw new Error(`A project can have ${MAX_WEBHOOKS} webhooks. Remove one first.`);
    const [row] = await userDb((tx) =>
      tx.insert(webhook).values({ projectId, url, secret: newWebhookSecret(), events: cleanEvents(input?.events), createdById: user.id }).returning(columns),
    );
    return toRow(row);
  });
}

/** Changes a webhook's address, events or switch. Switching it back on clears its failures. */
export async function updateWebhook(projectId: string, id: string, patch: { url?: string; events?: WebhookEvent[]; enabled?: boolean }): Promise<WebhookRow> {
  return transaction(async () => {
    const { user } = await requireSession();
    await requireProjectAccess(projectId, "manage");
    await rateLimit("webhooks", user.id, LIMIT);
    const set: Partial<typeof webhook.$inferInsert> = {};
    if (patch?.url !== undefined) set.url = parseWebhookUrl(patch.url).toString();
    if (patch?.events !== undefined) set.events = cleanEvents(patch.events);
    if (typeof patch?.enabled === "boolean") {
      set.enabled = patch.enabled;
      if (patch.enabled) Object.assign(set, { failures: 0, lastError: null });
    }
    const [row] = await userDb((tx) => tx.update(webhook).set(set).where(and(eq(webhook.id, String(id)), eq(webhook.projectId, projectId))).returning(columns));
    if (!row) throw new Error("That webhook isn't there any more.");
    return toRow(row);
  });
}

/** Gives a webhook a new secret. Deliveries signed with the old one stop at once. */
export async function rotateWebhookSecret(projectId: string, id: string): Promise<WebhookRow> {
  return transaction(async () => {
    const { user } = await requireSession();
    await requireProjectAccess(projectId, "manage");
    await rateLimit("webhooks", user.id, LIMIT);
    const [row] = await userDb((tx) =>
      tx.update(webhook).set({ secret: newWebhookSecret() }).where(and(eq(webhook.id, String(id)), eq(webhook.projectId, projectId))).returning(columns),
    );
    if (!row) throw new Error("That webhook isn't there any more.");
    return toRow(row);
  });
}

export async function deleteWebhook(projectId: string, id: string): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "manage");
    await userDb((tx) => tx.delete(webhook).where(and(eq(webhook.id, String(id)), eq(webhook.projectId, projectId))));
  });
}

/** Sends a `ping` now, once, and says how the receiver answered. */
export async function testWebhook(projectId: string, id: string): Promise<DeliveryResult> {
  const hook = await readOnly(async () => {
    const { user } = await requireSession();
    const { project } = await requireProjectAccess(projectId, "manage");
    await rateLimit("webhook-test", user.id, { limit: 30, windowSeconds: 600 });
    const [row] = await userDb((tx) => tx.select({ id: webhook.id, url: webhook.url, secret: webhook.secret }).from(webhook).where(and(eq(webhook.id, String(id)), eq(webhook.projectId, projectId))).limit(1));
    if (!row) throw new Error("That webhook isn't there any more.");
    return { ...row, project: { id: project.id, title: project.title }, actor: { id: user.id, name: user.name } };
  });
  const payload: WebhookPayload = { id: crypto.randomUUID(), type: "ping", createdAt: new Date().toISOString(), project: hook.project, note: null, actor: hook.actor, data: {} };
  // Outside the scope above: the call can take seconds, and a transaction shouldn't sit open meanwhile.
  return deliver(hook, payload, { retries: false });
}
