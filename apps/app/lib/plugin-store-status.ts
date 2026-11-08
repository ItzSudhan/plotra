import "server-only";
import { db, schema } from "@plotra/db";
import type { PluginAccess } from "@plotra/db/schema";
import { desc, eq, inArray, sql } from "drizzle-orm";

// Where each of a few store plugins stands, for the desktop app's copies
// (GET /api/store/status): still in the store, withdrawn by its author, taken
// down, or gone, and its latest release. Read with the server's own
// connection, like the store's pages (lib/plugin-store-read.ts).

const { pluginListing, pluginRelease } = schema;

export type StoreStatus = {
  status: "available" | "withdrawn" | "blocked" | "missing";
  latest: { id: string; version: string; access: PluginAccess } | null;
};

/** One entry per slug asked for; a taken-down plugin's latest release isn't given. */
export async function storeStatus(slugs: string[]): Promise<Record<string, StoreStatus>> {
  const result: Record<string, StoreStatus> = {};
  for (const slug of slugs) result[slug] = { status: "missing", latest: null };
  if (slugs.length === 0) return result;

  const latest = db
    .select({ id: pluginRelease.id, version: pluginRelease.version, access: pluginRelease.access })
    .from(pluginRelease)
    .where(eq(pluginRelease.listingId, pluginListing.id))
    .orderBy(desc(pluginRelease.createdAt))
    .limit(1)
    .as("latest");
  const rows = await db
    .select({ slug: pluginListing.slug, withdrawnAt: pluginListing.withdrawnAt, blockedAt: pluginListing.blockedAt, id: latest.id, version: latest.version, access: latest.access })
    .from(pluginListing)
    .leftJoinLateral(latest, sql`true`)
    .where(inArray(pluginListing.slug, slugs));

  for (const row of rows) {
    if (row.blockedAt) result[row.slug] = { status: "blocked", latest: null };
    else result[row.slug] = { status: row.withdrawnAt ? "withdrawn" : "available", latest: row.id && row.version && row.access ? { id: row.id, version: row.version, access: row.access } : null };
  }
  return result;
}
