import "server-only";
import { db, schema } from "@plotra/db";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { isLocalMode } from "./local-mode";
import { OFFICIAL_AUTHOR, officialPlugin, officialPlugins, officialReleaseId, type OfficialPlugin } from "./official-plugins";
import { isPluginCategory } from "./plugin-store";
import { getStoreListing, listStore, type StoreEntry, type StoreListing, type StoreSort } from "./plugin-store-read";
import { remoteListing, remoteListStore } from "./plugin-store-remote";

// Where the plugin store's pages (app/plugins) read from: this server's own
// store on Plotra Cloud, plotra.ink's over the network in the desktop app
// (lib/plugin-store-remote.ts). Either way the pages get the same shapes.
// Plotra's own plugins (lib/official-plugins) ship with the app, so they're
// here everywhere, offline too, ahead of what people published.

const { userPlugin } = schema;

export async function browseStore(params: { query?: string; category?: string; sort?: StoreSort }): Promise<StoreEntry[]> {
  return isLocalMode ? remoteListStore(params) : listStore(params);
}

/** How many people have each of Plotra's own plugins, on this server (in the desktop app, this library). */
async function officialInstalls(slugs: string[]): Promise<Map<string, number>> {
  if (!slugs.length) return new Map();
  const rows = await db
    .select({ slug: userPlugin.officialSlug, count: sql<number>`count(*)::int` })
    .from(userPlugin)
    .where(and(isNotNull(userPlugin.officialSlug), inArray(userPlugin.officialSlug, slugs)))
    .groupBy(userPlugin.officialSlug);
  return new Map(rows.map((r) => [r.slug ?? "", Number(r.count)]));
}

const entry = (plugin: OfficialPlugin, installs: number): StoreEntry => ({
  slug: plugin.slug,
  name: plugin.name,
  summary: plugin.summary,
  category: plugin.category,
  access: plugin.access,
  author: OFFICIAL_AUTHOR,
  version: plugin.version,
  installs,
  updatedAt: plugin.releasedAt,
});

/** Plotra's own plugins that match the store's search and category. */
export async function browseOfficial({ query, category, sort }: { query?: string; category?: string; sort?: StoreSort }): Promise<StoreEntry[]> {
  const words = String(query ?? "").trim().toLowerCase().slice(0, 100);
  const found = officialPlugins.filter(
    (p) => (!isPluginCategory(category) || p.category === category) && (!words || [p.name, p.summary, p.slug].some((text) => text.toLowerCase().includes(words))),
  );
  const installs = await officialInstalls(found.map((p) => p.slug)).catch(() => new Map<string, number>());
  const entries = found.map((p) => entry(p, installs.get(p.slug) ?? 0));
  if (sort === "new") return entries.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return entries.sort((a, b) => b.installs - a.installs);
}

export async function openStoreListing(slug: string, viewerId: string | null): Promise<StoreListing | null> {
  const official = officialPlugin(slug);
  if (official) return officialListing(official, viewerId);
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

/** One of Plotra's own plugins as a store page. The viewer's copy counts as its release by the version it has. */
async function officialListing(plugin: OfficialPlugin, viewerId: string | null): Promise<StoreListing> {
  const [installs, [installed]] = await Promise.all([
    officialInstalls([plugin.slug]),
    viewerId
      ? db
          .select({ pluginId: userPlugin.id, version: userPlugin.version, access: userPlugin.access })
          .from(userPlugin)
          .where(and(eq(userPlugin.userId, viewerId), eq(userPlugin.officialSlug, plugin.slug)))
          .orderBy(asc(userPlugin.createdAt))
          .limit(1)
      : Promise.resolve([]),
  ]);
  return {
    slug: plugin.slug,
    name: plugin.name,
    summary: plugin.summary,
    about: plugin.about,
    category: plugin.category,
    access: plugin.access,
    author: OFFICIAL_AUTHOR,
    installs: installs.get(plugin.slug) ?? 0,
    withdrawn: false,
    createdAt: plugin.releasedAt,
    updatedAt: plugin.releasedAt,
    releases: [{ id: plugin.releaseId, version: plugin.version, notes: plugin.notes, access: plugin.access, size: plugin.code.length, createdAt: plugin.releasedAt }],
    code: plugin.code,
    mine: false,
    installed: installed ? { pluginId: installed.pluginId, releaseId: officialReleaseId(plugin.slug, installed.version), access: installed.access } : null,
  };
}
