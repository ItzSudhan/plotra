import "server-only";
import { db, schema } from "@plotra/db";
import type { ActivityVerb, WebhookEvent } from "@plotra/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { createHmac, randomBytes } from "node:crypto";
import { guardedFetch, looksPrivate } from "./agent/base-url";
import { isLocalMode } from "./local-mode";
import { checkRateLimit } from "./rate-limit";
import { currentScope } from "./request-cache";

// Webhooks (beat-the-competitors.md, 10): a project's managers give Plotra a
// URL, and Plotra posts to it when something happens in the project: a note
// made, renamed, saved, trashed or restored, a comment, a named or restored
// version, a release cut, the project shared. One JSON body per event, with
// ids and titles and never the text (whoever wants the text asks the API for
// it, with a token: lib/api), signed so the receiver can tell it came from here.
//
// Delivery happens after the response, and only for actions that went through:
// an event raised inside a transaction that rolls back is never sent. Each
// delivery is tried three times; a hook that fails MAX_FAILURES times in a row
// switches itself off, and its managers see why in Project settings.
//
// The URL is called by this server, so on the hosted version it must lead to
// the public internet (the same checks as model URLs: lib/agent/base-url.ts).
// A self-hosted server may allow its own network with WEBHOOK_ALLOW_PRIVATE_URLS.

const { webhook, project, node, user } = schema;

/** The events an activity entry raises (lib/notify.ts `logActivity`). */
export const verbEvents: Record<ActivityVerb, WebhookEvent> = {
  note_created: "note.created",
  note_renamed: "note.renamed",
  note_trashed: "note.trashed",
  note_restored: "note.restored",
  version_named: "version.named",
  version_restored: "version.restored",
  release_cut: "release.cut",
  comment_added: "comment.added",
  project_shared: "project.shared",
};

export type WebhookPayload = {
  /** This delivery's own id, the same on every retry: a receiver can skip one it has seen. */
  id: string;
  type: WebhookEvent | "ping";
  createdAt: string;
  project: { id: string; title: string };
  note: { id: string; title: string; kind: string } | null;
  /** Who did it; null when nobody can be named (a save doesn't say who typed). */
  actor: { id: string; name: string } | null;
  data: Record<string, string | number | boolean | null>;
};

export const MAX_WEBHOOKS = 10;
export const MAX_FAILURES = 20;
const TIMEOUT_MS = 10_000;
/** Waits before the second and third tries. */
const RETRIES_MS = [2_000, 10_000];
/** How often one note's saves are told: a writer saves every few seconds. */
const UPDATED_EVERY_SECONDS = 300;

/** Whether this server may post to addresses on its own network: self-hosting, or the desktop app. */
export const privateWebhooksAllowed = () => isLocalMode || process.env.WEBHOOK_ALLOW_PRIVATE_URLS === "true";

/** A URL a manager typed, checked: https (or http on a network the server may call), no credentials, not private unless allowed. */
export function parseWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    throw new Error("That doesn't look like a URL. It should start with https://.");
  }
  const privateOk = privateWebhooksAllowed();
  if (url.protocol !== "https:" && !(url.protocol === "http:" && privateOk)) throw new Error("A webhook's URL has to start with https://.");
  if (url.username || url.password) throw new Error("Take the name and password out of the URL. To check that a delivery is real, use its signature.");
  if (url.toString().length > 2000) throw new Error("That URL is too long.");
  if (!privateOk && looksPrivate(url)) throw new Error("That address is on a private network, which this server can't post to.");
  url.hash = "";
  return url;
}

export const newWebhookSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

/**
 * The `Plotra-Signature` header: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`.
 * A receiver computes the same with the hook's secret, compares, and refuses
 * a timestamp more than a few minutes old.
 */
export function signature(secret: string, body: string, timestamp: number): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

export type DeliveryResult = { ok: boolean; status: number | null; error: string | null };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One try: the receiver's status, or why it couldn't be reached. */
async function attempt(url: string, secret: string, payload: WebhookPayload, body: string): Promise<DeliveryResult> {
  const timestamp = Math.floor(Date.now() / 1000);
  const send = privateWebhooksAllowed() ? fetch : guardedFetch;
  try {
    const res = await send(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "user-agent": "Plotra-Webhooks/1",
        "plotra-event": payload.type,
        "plotra-delivery": payload.id,
        "plotra-signature": signature(secret, body, timestamp),
      },
      body,
    });
    await res.body?.cancel().catch(() => {});
    const ok = res.status >= 200 && res.status < 300;
    return { ok, status: res.status, error: ok ? null : `The receiver answered ${res.status}${res.status >= 300 && res.status < 400 ? " (a redirect, which isn't followed)" : ""}.` };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { ok: false, status: null, error: timedOut ? "No answer within 10 seconds." : error instanceof Error ? error.message.slice(0, 300) : "Couldn't reach it." };
  }
}

/** Whether another try could go differently: no answer, a server error, too many requests. */
const worthRetrying = (result: DeliveryResult) => result.status === null || result.status >= 500 || result.status === 408 || result.status === 429;

/** Delivers one payload to one hook, with retries, and records how it went on the hook. */
export async function deliver(hook: { id: string; url: string; secret: string }, payload: WebhookPayload, { retries = true } = {}): Promise<DeliveryResult> {
  const body = JSON.stringify(payload);
  let result = await attempt(hook.url, hook.secret, payload, body);
  for (const delay of retries ? RETRIES_MS : []) {
    if (result.ok || !worthRetrying(result)) break;
    await wait(delay);
    result = await attempt(hook.url, hook.secret, payload, body);
  }
  await db
    .update(webhook)
    .set({
      lastDeliveryAt: new Date(),
      lastStatus: result.status,
      lastError: result.error,
      failures: result.ok ? 0 : sql`${webhook.failures} + 1`,
      // Enough failures in a row and it stops being called. A success leaves the switch as its managers set it.
      enabled: result.ok ? sql`${webhook.enabled}` : sql`${webhook.enabled} and ${webhook.failures} + 1 < ${MAX_FAILURES}`,
    })
    .where(eq(webhook.id, hook.id))
    .catch((error) => console.error(`[plotra] couldn't record webhook ${hook.id}'s delivery`, error));
  return result;
}

/** Runs `work` after the response, once the action it was raised in has committed; at once outside a request. */
export function afterCommit(work: () => Promise<void>) {
  const run = () => {
    try {
      after(work);
    } catch {
      // Not inside a request (a script, a test): no response to wait for.
      void work();
    }
  };
  const scope = currentScope();
  if (scope && !scope.ended) scope.onEnd.push(async (ok) => void (ok && run()));
  else run();
}

/**
 * Tells the project's webhooks about an event. Never throws, and costs one
 * indexed read when the project has none. `note.updated` is told at most once
 * every five minutes per note.
 */
export async function emitWebhook(
  projectId: string,
  type: WebhookEvent,
  input: { nodeId?: string | null; actorId?: string | null; data?: WebhookPayload["data"] } = {},
): Promise<void> {
  try {
    const hooks = (
      await db.select({ id: webhook.id, url: webhook.url, secret: webhook.secret, events: webhook.events }).from(webhook).where(and(eq(webhook.projectId, projectId), eq(webhook.enabled, true)))
    ).filter((hook) => hook.events.length === 0 || hook.events.includes(type));
    if (!hooks.length) return;
    if (type === "note.updated" && input.nodeId) {
      const { ok } = await checkRateLimit("webhook-note-updated", input.nodeId, { limit: 1, windowSeconds: UPDATED_EVERY_SECONDS });
      if (!ok) return;
    }

    const [[about], [note], [actor]] = await Promise.all([
      db.select({ id: project.id, title: project.title }).from(project).where(eq(project.id, projectId)).limit(1),
      input.nodeId ? db.select({ id: node.id, title: node.title, kind: node.kind }).from(node).where(and(eq(node.id, input.nodeId), eq(node.projectId, projectId))).limit(1) : Promise.resolve([]),
      input.actorId ? db.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, input.actorId)).limit(1) : Promise.resolve([]),
    ]);
    if (!about) return;
    const payload: WebhookPayload = {
      id: crypto.randomUUID(),
      type,
      createdAt: new Date().toISOString(),
      project: about,
      note: note ?? null,
      actor: actor ?? null,
      data: input.data ?? {},
    };
    afterCommit(async () => {
      for (const hook of hooks) await deliver(hook, payload);
    });
  } catch (error) {
    console.error(`[plotra] couldn't raise webhook ${type} for ${projectId}`, error);
  }
}
