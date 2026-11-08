import "server-only";
import { db, schema } from "@plotra/db";
import type { PluginAccess } from "@plotra/db/schema";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { isPluginCategory } from "./plugin-store";

// What the plugin store's pages show (apps/app/app/plugins), read with the
// server's own connection like the public gallery (lib/gallery.ts): every
// listing here was published for everyone on the server, and counting who has
// one installed reads past each person's own plugins. Only counts leave here,
// never who.

const { pluginListing, pluginRelease, userPlugin, user } = schema;

export type StoreEntry = {
  slug: string;
  name: string;
  summary: string;
  category: string;
  access: PluginAccess;
  author: string;
  version: string | null;
  installs: number;
  updatedAt: Date;
};

export type StoreSort = "popular" | "new";

const installs = sql<number>`(select count(*)::int from user_plugin up where up.listing_id = ${pluginListing.id})`;
const latestVersion = sql<string | null>`(select r.version from plugin_release r where r.listing_id = ${pluginListing.id} order by r.created_at desc limit 1)`;

/** The listings anyone may install: not withdrawn, not taken down. */
export async function listStore({ query, category, sort }: { query?: string; category?: string; sort?: StoreSort } = {}, limit = 200): Promise<StoreEntry[]> {
  const words = String(query ?? "")
    .trim()
    .slice(0, 100)
    .replace(/[%_\\]/g, "");
  const rows = await db
    .select({
      slug: pluginListing.slug,
      name: pluginListing.name,
      summary: pluginListing.summary,
      category: pluginListing.category,
      access: pluginListing.access,
      author: user.name,
      version: latestVersion,
      installs,
      updatedAt: pluginListing.updatedAt,
    })
    .from(pluginListing)
    .innerJoin(user, eq(user.id, pluginListing.authorId))
    .where(
      and(
        isNull(pluginListing.blockedAt),
        isNull(pluginListing.withdrawnAt),
        isPluginCategory(category) ? eq(pluginListing.category, category) : undefined,
        words ? or(ilike(pluginListing.name, `%${words}%`), ilike(pluginListing.summary, `%${words}%`), ilike(pluginListing.slug, `%${words}%`)) : undefined,
      ),
    )
    .orderBy(...(sort === "new" ? [desc(pluginListing.createdAt)] : [desc(installs), desc(pluginListing.updatedAt)]))
    .limit(limit);
  return rows.map((row) => ({ ...row, installs: Number(row.installs) }));
}

export type StoreRelease = { id: string; version: string; notes: string; access: PluginAccess; size: number; createdAt: Date };

export type StoreListing = {
  slug: string;
  name: string;
  summary: string;
  about: string;
  category: string;
  access: PluginAccess;
  author: string;
  installs: number;
  withdrawn: boolean;
  createdAt: Date;
  updatedAt: Date;
  releases: StoreRelease[];
  /** The latest release's code, shown in full before anyone installs it. */
  code: string;
  /** The viewer published it. */
  mine: boolean;
  /** The viewer's own copy, if they have one. */
  installed: { pluginId: string; releaseId: string | null; access: PluginAccess } | null;
};

/** One listing, for its page. Null when there's none, or it was taken down (its author still sees theirs). */
export async function getStoreListing(slug: string, viewerId: string | null): Promise<StoreListing | null> {
  const [row] = await db
    .select({
      id: pluginListing.id,
      slug: pluginListing.slug,
      name: pluginListing.name,
      summary: pluginListing.summary,
      about: pluginListing.about,
      category: pluginListing.category,
      access: pluginListing.access,
      authorId: pluginListing.authorId,
      author: user.name,
      installs,
      withdrawnAt: pluginListing.withdrawnAt,
      blockedAt: pluginListing.blockedAt,
      createdAt: pluginListing.createdAt,
      updatedAt: pluginListing.updatedAt,
    })
    .from(pluginListing)
    .innerJoin(user, eq(user.id, pluginListing.authorId))
    .where(eq(pluginListing.slug, String(slug).toLowerCase()))
    .limit(1);
  if (!row) return null;
  const mine = viewerId !== null && row.authorId === viewerId;
  if (row.blockedAt && !mine) return null;

  const [releases, [latest], installed] = await Promise.all([
    db
      .select({ id: pluginRelease.id, version: pluginRelease.version, notes: pluginRelease.notes, access: pluginRelease.access, size: sql<number>`length(${pluginRelease.code})::int`, createdAt: pluginRelease.createdAt })
      .from(pluginRelease)
      .where(eq(pluginRelease.listingId, row.id))
      .orderBy(desc(pluginRelease.createdAt))
      .limit(100),
    db.select({ code: pluginRelease.code }).from(pluginRelease).where(eq(pluginRelease.listingId, row.id)).orderBy(desc(pluginRelease.createdAt)).limit(1),
    viewerId
      ? db
          .select({ pluginId: userPlugin.id, releaseId: userPlugin.releaseId, access: userPlugin.access })
          .from(userPlugin)
          .where(and(eq(userPlugin.userId, viewerId), eq(userPlugin.listingId, row.id)))
          .orderBy(asc(userPlugin.createdAt))
          .limit(1)
      : Promise.resolve([]),
  ]);

  return {
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    about: row.about,
    category: row.category,
    access: row.access,
    author: row.author,
    installs: Number(row.installs),
    withdrawn: row.withdrawnAt !== null || row.blockedAt !== null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    releases: releases.map((r) => ({ ...r, size: Number(r.size) })),
    code: latest?.code ?? "",
    mine,
    installed: installed[0] ?? null,
  };
}
