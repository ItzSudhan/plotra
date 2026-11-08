import "server-only";
import { db, schema } from "@plotra/db";
import { sql } from "drizzle-orm";

// Usage events (plan.md 1 "Product analytics"): sign-up → first scene written
// → invited someone. Sponsors and open-source programs ask who uses the
// project, and this is how we know. Plain rows in Postgres, and a copy to
// PostHog when NEXT_PUBLIC_POSTHOG_KEY is set. Names only, never content.

export type EventName =
  | "signed_up"
  | "workspace_created"
  | "project_created"
  | "project_deleted"
  | "sample_project_created"
  | "first_scene_written"
  | "getting_started_step_done"
  | "getting_started_dismissed"
  | "project_shared"
  | "member_invited"
  | "imported"
  | "exported"
  | "ai_enabled"
  | "no_ai_promised"
  | "no_ai_lifted"
  | "agent_run"
  | "checkout_started"
  | "subscribed"
  | "subscription_canceled";

type EventInput = {
  userId?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  properties?: Record<string, string | number | boolean | null>;
};

/** Records an event. Never throws: analytics must not break the thing being measured. */
export async function track(name: EventName, input: EventInput = {}): Promise<void> {
  try {
    await db.insert(schema.event).values({
      name,
      userId: input.userId ?? null,
      workspaceId: input.workspaceId ?? null,
      projectId: input.projectId ?? null,
      properties: input.properties ?? null,
    });
  } catch (error) {
    console.error(`[plotra] couldn't record ${name}`, error);
  }
  forward(name, input);
}

// People this server instance has already counted for a once-only event.
const counted = new Set<string>();

/**
 * Records an event the first time it happens for a user and never again
 * ("first scene written"). The check and the insert are one statement, and an
 * instance that has already asked about someone doesn't ask again. Never throws.
 */
export async function trackOnce(name: EventName, input: EventInput & { userId: string }): Promise<void> {
  const key = `${name}:${input.userId}`;
  if (counted.has(key)) return;
  try {
    const result = await db.execute(sql`
      insert into event (name, user_id, workspace_id, project_id, properties)
      select ${name}::text, ${input.userId}::text, ${input.workspaceId ?? null}::text, ${input.projectId ?? null}::text, ${input.properties ? JSON.stringify(input.properties) : null}::jsonb
      where not exists (select 1 from event where user_id = ${input.userId}::text and name = ${name}::text)
      returning id`);
    // Bounded: a long-lived instance forgets and simply asks the database again.
    if (counted.size > 50_000) counted.clear();
    counted.add(key);
    if (result.rows.length) forward(name, input);
  } catch (error) {
    console.error(`[plotra] couldn't record ${name}`, error);
  }
}

/** Copies an event to PostHog, when it's configured. */
function forward(name: EventName, input: EventInput): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || !input.userId) return;
  const host = (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/$/, "");
  // Not awaited past a short timeout: a slow analytics host mustn't slow a request.
  void fetch(`${host}/i/v0/e/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      event: name,
      distinct_id: input.userId,
      properties: { ...input.properties, workspace_id: input.workspaceId ?? undefined, project_id: input.projectId ?? undefined },
    }),
    signal: AbortSignal.timeout(2000),
  }).catch(() => {});
}
