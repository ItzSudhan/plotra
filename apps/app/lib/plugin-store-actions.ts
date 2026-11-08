"use server";

import { db, schema } from "@plotra/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { isApiRequest, requireSession } from "./data";
import { userDb } from "./db";
import { isLocalMode } from "./local-mode";
import { cleanPluginCode, MAX_PLUGINS, readPluginHeader } from "./plugins";
import { remoteListing } from "./plugin-store-remote";
import { cleanSlug, cleanText, isPluginCategory, MAX_ABOUT, MAX_LISTINGS, MAX_NOTES, MAX_SUMMARY } from "./plugin-store";
import { rateLimit } from "./rate-limit";
import { transaction } from "./request-cache";

// The plugin store's changes (plugin-store-plan.md, lib/plugin-store.ts), made
// as the signed-in person under row-level security: an author publishes and
// edits only their own listings, and anyone installs what isn't taken down.
// Installing copies a release's code into the person's own plugins
// (lib/plugin-actions.ts), which is all a workspace ever runs. The desktop app
// installs from plotra.ink's store instead (lib/plugin-store-remote.ts).

const { userPlugin, pluginListing, pluginRelease } = schema;

/** The person, signed in. Publishing and changing listings is for Plotra Cloud; the desktop app only installs, from plotra.ink. */
async function signedIn({ publishing = true } = {}) {
  if (isApiRequest()) throw new Error("Plugins are managed in the app, not through the API.");
  if (publishing && isLocalMode) throw new Error("Publish plugins from Plotra Cloud, at app.plotra.ink. The desktop app installs them.");
  return requireSession();
}

type ListingInput = { summary?: unknown; about?: unknown; category?: unknown };

function listingFields(input: ListingInput) {
  const summary = cleanText(input?.summary, MAX_SUMMARY);
  if (!summary) throw new Error("Say in a line what the plugin does.");
  const category = isPluginCategory(input?.category) ? input.category : "other";
  return { summary, about: cleanText(input?.about, MAX_ABOUT, { lines: true }), category };
}

/** Puts one of the person's plugins in the store, as its first release. Answers with its slug. */
export async function publishPlugin(input: { pluginId: string; slug: string } & ListingInput): Promise<string> {
  return transaction(async () => {
    const { user } = await signedIn();
    await rateLimit("plugin-publish", user.id, { limit: 20, windowSeconds: 3600 });
    const slug = cleanSlug(input?.slug);
    if (!slug) throw new Error("Its address takes 3 to 50 lowercase letters, digits and dashes, starting and ending with a letter or digit.");
    const fields = listingFields(input);
    // Every listing, taken down or not, holds on to its address.
    const [taken] = await db.select({ id: pluginListing.id }).from(pluginListing).where(eq(pluginListing.slug, slug)).limit(1);
    if (taken) throw new Error("That address is taken. Try another.");

    return userDb(async (tx) => {
      const [plugin] = await tx
        .select({ name: userPlugin.name, code: userPlugin.code, listingId: userPlugin.listingId })
        .from(userPlugin)
        .where(and(eq(userPlugin.id, String(input?.pluginId)), eq(userPlugin.userId, user.id)))
        .limit(1);
      if (!plugin) throw new Error("That plugin is gone.");
      if (plugin.listingId) throw new Error("That plugin is already in the store. Publish a new version of it instead.");
      const header = readPluginHeader(plugin.code);
      if (!header.version) throw new Error("Give it a version first: add “// @version 1.0” to its header.");
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(pluginListing).where(eq(pluginListing.authorId, user.id));
      if (Number(count) >= MAX_LISTINGS) throw new Error(`You have ${MAX_LISTINGS} plugins in the store, the most one person may.`);

      const [listing] = await tx
        .insert(pluginListing)
        .values({ slug, authorId: user.id, name: plugin.name, access: header.access, ...fields })
        .returning({ id: pluginListing.id });
      const [release] = await tx
        .insert(pluginRelease)
        .values({ listingId: listing.id, version: header.version, notes: "", code: cleanPluginCode(plugin.code), access: header.access })
        .returning({ id: pluginRelease.id });
      await tx.update(userPlugin).set({ listingId: listing.id, releaseId: release.id }).where(eq(userPlugin.id, String(input.pluginId)));
      return slug;
    });
  });
}

/** Publishes the author's plugin as it is now, as a new release of its listing. */
export async function publishVersion(input: { pluginId: string; notes?: unknown }): Promise<{ slug: string; version: string }> {
  return transaction(async () => {
    const { user } = await signedIn();
    await rateLimit("plugin-publish", user.id, { limit: 20, windowSeconds: 3600 });
    const notes = cleanText(input?.notes, MAX_NOTES, { lines: true });

    return userDb(async (tx) => {
      const [row] = await tx
        .select({ name: userPlugin.name, code: userPlugin.code, listingId: pluginListing.id, slug: pluginListing.slug, authorId: pluginListing.authorId, blockedAt: pluginListing.blockedAt })
        .from(userPlugin)
        .innerJoin(pluginListing, eq(pluginListing.id, userPlugin.listingId))
        .where(and(eq(userPlugin.id, String(input?.pluginId)), eq(userPlugin.userId, user.id)))
        .limit(1);
      if (!row || row.authorId !== user.id) throw new Error("Only a plugin you published can get a new version.");
      if (row.blockedAt) throw new Error("This plugin was taken down after a report. Write to the people who run this server about it.");
      const header = readPluginHeader(row.code);
      if (!header.version) throw new Error("Give it a version: add “// @version …” to its header.");

      const [latest] = await tx.select({ version: pluginRelease.version, code: pluginRelease.code }).from(pluginRelease).where(eq(pluginRelease.listingId, row.listingId)).orderBy(desc(pluginRelease.createdAt)).limit(1);
      if (latest?.code === row.code) throw new Error(`Nothing has changed since version ${latest.version}.`);
      const [same] = await tx.select({ id: pluginRelease.id }).from(pluginRelease).where(and(eq(pluginRelease.listingId, row.listingId), eq(pluginRelease.version, header.version))).limit(1);
      if (same) throw new Error(`Version ${header.version} is already published. Raise @version in its header.`);

      const [release] = await tx
        .insert(pluginRelease)
        .values({ listingId: row.listingId, version: header.version, notes, code: cleanPluginCode(row.code), access: header.access })
        .returning({ id: pluginRelease.id });
      await tx.update(pluginListing).set({ name: row.name, access: header.access, updatedAt: new Date() }).where(eq(pluginListing.id, row.listingId));
      await tx.update(userPlugin).set({ releaseId: release.id }).where(eq(userPlugin.id, String(input.pluginId)));
      return { slug: row.slug, version: header.version };
    });
  });
}

/** Changes what the store says about one of the person's listings. */
export async function editListing(input: { slug: string } & ListingInput): Promise<void> {
  return transaction(async () => {
    const { user } = await signedIn();
    const fields = listingFields(input);
    const done = await userDb((tx) =>
      tx
        .update(pluginListing)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(pluginListing.slug, String(input?.slug)), eq(pluginListing.authorId, user.id)))
        .returning({ id: pluginListing.id }),
    );
    if (!done.length) throw new Error("Only its author can change a plugin's page, and not once it's taken down.");
  });
}

/** Takes one of the person's listings out of the store, or puts it back. Copies already installed keep working. */
export async function setListingWithdrawn(slug: string, withdrawn: boolean): Promise<void> {
  return transaction(async () => {
    const { user } = await signedIn();
    const done = await userDb((tx) =>
      tx
        .update(pluginListing)
        .set({ withdrawnAt: withdrawn === true ? new Date() : null })
        .where(and(eq(pluginListing.slug, String(slug)), eq(pluginListing.authorId, user.id)))
        .returning({ id: pluginListing.id }),
    );
    if (!done.length) throw new Error("Only its author can do that, and not once it's taken down.");
  });
}

async function latestRelease(tx: Parameters<Parameters<typeof userDb>[0]>[0], listingId: string) {
  const [release] = await tx
    .select({ id: pluginRelease.id, version: pluginRelease.version, code: pluginRelease.code, access: pluginRelease.access })
    .from(pluginRelease)
    .where(eq(pluginRelease.listingId, listingId))
    .orderBy(desc(pluginRelease.createdAt))
    .limit(1);
  if (!release) throw new Error("This plugin has no version to install.");
  return release;
}

/** Installs a plugin from the store: its latest release becomes one of the person's plugins, switched on. */
export async function installPlugin(slug: string): Promise<{ id: string; name: string }> {
  return transaction(async () => {
    const { user } = await signedIn({ publishing: false });
    await rateLimit("plugins", user.id, { limit: 60, windowSeconds: 3600 });
    if (isLocalMode) return installRemote(user.id, slug);
    return userDb(async (tx) => {
      // Row-level security hides a listing taken down.
      const [listing] = await tx
        .select({ id: pluginListing.id, name: pluginListing.name, summary: pluginListing.summary, withdrawnAt: pluginListing.withdrawnAt, blockedAt: pluginListing.blockedAt })
        .from(pluginListing)
        .where(eq(pluginListing.slug, String(slug)))
        .limit(1);
      if (!listing || listing.blockedAt) throw new Error("There's no such plugin in the store.");
      if (listing.withdrawnAt) throw new Error("Its author took this plugin out of the store.");
      const mine = await tx.select({ id: userPlugin.id, listingId: userPlugin.listingId }).from(userPlugin).where(eq(userPlugin.userId, user.id));
      if (mine.some((p) => p.listingId === listing.id)) throw new Error("You have this plugin already. Find it in Your settings → Plugins.");
      if (mine.length >= MAX_PLUGINS) throw new Error(`That's ${MAX_PLUGINS} plugins. Remove one first.`);
      const release = await latestRelease(tx, listing.id);
      const header = readPluginHeader(release.code);
      const [row] = await tx
        .insert(userPlugin)
        .values({
          userId: user.id,
          name: listing.name,
          description: listing.summary || header.description,
          version: release.version,
          access: release.access,
          code: release.code,
          listingId: listing.id,
          releaseId: release.id,
        })
        .returning({ id: userPlugin.id, name: userPlugin.name });
      return row;
    });
  });
}

/** Brings an installed plugin up to its listing's latest release, keeping whether it's on. */
export async function updateInstalledPlugin(pluginId: string): Promise<{ version: string }> {
  return transaction(async () => {
    const { user } = await signedIn({ publishing: false });
    await rateLimit("plugins", user.id, { limit: 60, windowSeconds: 3600 });
    if (isLocalMode) return updateRemote(user.id, pluginId);
    return userDb(async (tx) => {
      const [row] = await tx
        .select({ releaseId: userPlugin.releaseId, listingId: pluginListing.id, name: pluginListing.name, summary: pluginListing.summary, authorId: pluginListing.authorId, blockedAt: pluginListing.blockedAt })
        .from(userPlugin)
        .leftJoin(pluginListing, eq(pluginListing.id, userPlugin.listingId))
        .where(and(eq(userPlugin.id, String(pluginId)), eq(userPlugin.userId, user.id)))
        .limit(1);
      if (!row) throw new Error("That plugin is gone.");
      if (!row.listingId || row.blockedAt) throw new Error("This plugin isn't in the store, so it has no updates.");
      if (row.authorId === user.id) throw new Error("This is your own plugin: publish its versions rather than update it.");
      const release = await latestRelease(tx, row.listingId);
      if (release.id === row.releaseId) return { version: release.version };
      const header = readPluginHeader(release.code);
      await tx
        .update(userPlugin)
        .set({ code: release.code, version: release.version, access: release.access, releaseId: release.id, name: row.name ?? undefined, description: row.summary || header.description, updatedAt: new Date() })
        .where(eq(userPlugin.id, String(pluginId)));
      return { version: release.version };
    });
  });
}

/** The desktop app's install: plotra.ink's latest release, copied into the library with its slug and release there. */
async function installRemote(userId: string, slug: string): Promise<{ id: string; name: string }> {
  // Asked before the library's transaction opens, so the network never holds it.
  const listing = await remoteListing(slug);
  if (!listing) throw new Error("There's no such plugin in the store.");
  if (listing.withdrawn) throw new Error("Its author took this plugin out of the store.");
  const release = listing.releases[0];
  if (!release) throw new Error("This plugin has no version to install.");
  const code = cleanPluginCode(listing.code);
  const header = readPluginHeader(code);
  return userDb(async (tx) => {
    const mine = await tx.select({ remoteSlug: userPlugin.remoteSlug }).from(userPlugin).where(eq(userPlugin.userId, userId));
    if (mine.some((p) => p.remoteSlug === listing.slug)) throw new Error("You have this plugin already. Find it in Your settings → Plugins.");
    if (mine.length >= MAX_PLUGINS) throw new Error(`That's ${MAX_PLUGINS} plugins. Remove one first.`);
    const [row] = await tx
      .insert(userPlugin)
      .values({ userId, name: listing.name, description: listing.summary || header.description, version: release.version, access: release.access, code, remoteSlug: listing.slug, remoteReleaseId: release.id })
      .returning({ id: userPlugin.id, name: userPlugin.name });
    return row;
  });
}

/** The desktop app's update: plotra.ink's latest release in place of the one installed. */
async function updateRemote(userId: string, pluginId: string): Promise<{ version: string }> {
  const [row] = await userDb((tx) =>
    tx
      .select({ remoteSlug: userPlugin.remoteSlug, remoteReleaseId: userPlugin.remoteReleaseId })
      .from(userPlugin)
      .where(and(eq(userPlugin.id, String(pluginId)), eq(userPlugin.userId, userId)))
      .limit(1),
  );
  if (!row) throw new Error("That plugin is gone.");
  if (!row.remoteSlug) throw new Error("This plugin isn't from the store, so it has no updates.");
  const listing = await remoteListing(row.remoteSlug);
  const release = listing?.releases[0];
  if (!listing || !release) throw new Error("This plugin isn't in the store any more, so it has no updates.");
  if (release.id === row.remoteReleaseId) return { version: release.version };
  const code = cleanPluginCode(listing.code);
  const header = readPluginHeader(code);
  await userDb((tx) =>
    tx
      .update(userPlugin)
      .set({ code, version: release.version, access: release.access, remoteReleaseId: release.id, name: listing.name, description: listing.summary || header.description, updatedAt: new Date() })
      .where(and(eq(userPlugin.id, String(pluginId)), eq(userPlugin.userId, userId))),
  );
  return { version: release.version };
}
