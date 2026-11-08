import "server-only";
import { db, schema } from "@plotra/db";
import { and, asc, eq } from "drizzle-orm";
import { isLocalMode } from "./local-mode";
import { getStoreListing, listStore, type StoreEntry, type StoreListing, type StoreSort } from "./plugin-store-read";
import { remoteListing, remoteListStore } from "./plugin-store-remote";

// Where the plugin store's pages (app/plugins) read from: this server's own
// store on Plotra Cloud, plotra.ink's over the network in the desktop app
// (lib/plugin-store-remote.ts). Either way the pages get the same shapes.

const { userPlugin } = schema;

export async function browseStore(params: { query?: string; category?: string; sort?: StoreSort }): Promise<StoreEntry[]> {
  return isLocalMode ? remoteListStore(params) : listStore(params);
}

export async function openStoreListing(slug: string, viewerId: string | null): Promise<StoreListing | null> {
  if (!isLocalMode) return getStoreListing(slug, viewerId);
  const listing = await remoteListing(slug);
  if (!listing) return null;
  const [installed] = viewerId
    ? await db
        .select({ pluginId: userPlugin.id, releaseId: userPlugin.remoteReleaseId, access: userPlugin.access })
        .from(userPlugin)
        .where(and(eq(userPlugin.userId, viewerId), eq(userPlugin.remoteSlug, listing.slug)))
        .orderBy(asc(userPlugin.createdAt))
        .limit(1)
    : [];
  return { ...listing, mine: false, installed: installed ?? null };
}
