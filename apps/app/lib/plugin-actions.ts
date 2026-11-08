"use server";

import { schema } from "@plotra/db";
import { and, asc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { ApiError } from "./api/handler";
import { createApiNote, listApiNotes, readApiNote, searchApiNotes, updateApiNote, writeApiNoteText, type NewNote, type NotePatch, type TextChange } from "./api/notes";
import { isApiRequest, requireSession } from "./data";
import { isLocalMode } from "./local-mode";
import { remoteStatus } from "./plugin-store-remote";
import { userDb } from "./db";
import { publicMessage } from "./errors";
import { cleanPluginCode, isServerMethod, MAX_PLUGINS, pluginName, readPluginHeader, writeMethods, type PluginAccess } from "./plugins";
import { checkRateLimit, rateLimit } from "./rate-limit";
import { readOnly, transaction } from "./request-cache";
import { createEntityType, getWorld } from "./world-actions";

// A person's plugins (lib/plugins.ts): kept in Your settings → Plugins, theirs
// alone (row-level security: user_plugin_own), and run by the workspace in
// sandboxed frames. Some came from the plugin store (lib/plugin-store-actions.ts). A plugin's calls on the project come here, to
// `pluginCall`, and go to the API's own functions (lib/api/notes.ts) as the
// signed-in person: a plugin can do what they can, in the project open in
// front of them, and no more.

const { userPlugin, pluginListing, pluginRelease } = schema;

/** Where a plugin came from in the store, if it did (lib/plugin-store.ts). */
export type PluginStoreLink = {
  slug: string;
  /** The person published it: they publish its versions rather than get them. */
  own: boolean;
  withdrawn: boolean;
  /** Taken down after a report: it doesn't run. */
  blocked: boolean;
  latest: { id: string; version: string; access: PluginAccess } | null;
  /** A newer release than the one installed. */
  update: boolean;
  /** Its code differs from the release it came from (the author's own changes). */
  changed: boolean;
  /** What the store page says, for its author to change. */
  page: { summary: string; about: string; category: string } | null;
};

export type PluginRow = { id: string; name: string; description: string; version: string; enabled: boolean; size: number; updatedAt: string; access: PluginAccess; store: PluginStoreLink | null };
export type PluginCode = { id: string; name: string; version: string; code: string };

const columns = {
  id: userPlugin.id,
  name: userPlugin.name,
  description: userPlugin.description,
  version: userPlugin.version,
  enabled: userPlugin.enabled,
  size: sql<number>`length(${userPlugin.code})::int`,
  updatedAt: userPlugin.updatedAt,
  access: userPlugin.access,
};

type BaseRow = { id: string; name: string; description: string; version: string; enabled: boolean; size: number; updatedAt: Date; access: PluginAccess };
const toRow = (row: BaseRow, store: PluginStoreLink | null = null): PluginRow => ({ ...row, size: Number(row.size), updatedAt: row.updatedAt.toISOString(), store });

/** Plugins are the person's, signed in; an API token can't see or change them. */
function assertSignedIn() {
  if (isApiRequest()) throw new Error("Plugins are managed in Your settings, not through the API.");
}

/** The person's plugins, without their code, with where each came from in the store. */
export async function listPlugins(): Promise<PluginRow[]> {
  return readOnly(async () => {
    assertSignedIn();
    const { user } = await requireSession();
    const rows = await userDb((tx) =>
      tx
        .select({
          ...columns,
          listingId: userPlugin.listingId,
          releaseId: userPlugin.releaseId,
          remoteSlug: userPlugin.remoteSlug,
          remoteReleaseId: userPlugin.remoteReleaseId,
          // Row-level security hides a listing taken down from all but its author.
          seen: pluginListing.id,
          slug: pluginListing.slug,
          authorId: pluginListing.authorId,
          withdrawnAt: pluginListing.withdrawnAt,
          blockedAt: pluginListing.blockedAt,
          summary: pluginListing.summary,
          about: pluginListing.about,
          category: pluginListing.category,
          latest: sql<{ id: string; version: string; access: PluginAccess } | null>`(select json_build_object('id', lr.id, 'version', lr.version, 'access', lr.access) from plugin_release lr where lr.listing_id = ${pluginListing.id} order by lr.created_at desc limit 1)`,
          changed: sql<boolean>`coalesce(${pluginRelease.code} <> ${userPlugin.code}, false)`,
        })
        .from(userPlugin)
        .leftJoin(pluginListing, eq(pluginListing.id, userPlugin.listingId))
        .leftJoin(pluginRelease, eq(pluginRelease.id, userPlugin.releaseId))
        .where(eq(userPlugin.userId, user.id))
        .orderBy(asc(userPlugin.createdAt)),
    );
    // The desktop app's plugins from plotra.ink: where each stands there, when it can be asked.
    const remote = isLocalMode ? await remoteStatus(rows.flatMap((r) => (r.remoteSlug ? [r.remoteSlug] : [])), { fresh: true }) : new Map();
    return rows.map(({ listingId, releaseId, remoteSlug, remoteReleaseId, seen, slug, authorId, withdrawnAt, blockedAt, summary, about, category, latest, changed, ...row }) => {
      if (remoteSlug) {
        const there = remote.get(remoteSlug);
        return toRow(row, {
          slug: remoteSlug,
          own: false,
          withdrawn: there?.status === "withdrawn",
          blocked: there?.status === "blocked",
          latest: there?.latest ?? null,
          update: !!there?.latest && there.latest.id !== remoteReleaseId,
          changed: false,
          page: null,
        });
      }
      if (!listingId) return toRow(row);
      if (!seen || !slug) return toRow(row, { slug: "", own: false, withdrawn: false, blocked: true, latest: null, update: false, changed: false, page: null });
      const own = authorId === user.id;
      return toRow(row, {
        slug,
        own,
        withdrawn: withdrawnAt !== null,
        blocked: blockedAt !== null,
        latest,
        update: !!latest && latest.id !== releaseId && !own,
        changed: Boolean(changed),
        page: own ? { summary: summary ?? "", about: about ?? "", category: category ?? "other" } : null,
      });
    });
  });
}

/**
 * The plugins that are on, with their code: what a workspace runs. A plugin
 * installed from a listing that was taken down doesn't run.
 */
export async function loadPlugins(): Promise<PluginCode[]> {
  return readOnly(async () => {
    assertSignedIn();
    const { user } = await requireSession();
    const rows = await userDb((tx) =>
      tx
        .select({ id: userPlugin.id, name: userPlugin.name, version: userPlugin.version, code: userPlugin.code, remoteSlug: userPlugin.remoteSlug })
        .from(userPlugin)
        .leftJoin(pluginListing, eq(pluginListing.id, userPlugin.listingId))
        .where(and(eq(userPlugin.userId, user.id), eq(userPlugin.enabled, true), or(isNull(userPlugin.listingId), and(isNotNull(pluginListing.id), or(isNull(pluginListing.blockedAt), eq(pluginListing.authorId, user.id))))))
        .orderBy(asc(userPlugin.createdAt)),
    );
    // The desktop app: a plugin plotra.ink took down stops here too, once the
    // store can be asked. Offline, everything runs as it is.
    const remote = isLocalMode ? await remoteStatus(rows.flatMap((r) => (r.remoteSlug ? [r.remoteSlug] : []))) : new Map();
    return rows.filter((r) => !r.remoteSlug || remote.get(r.remoteSlug)?.status !== "blocked").map((r) => ({ id: r.id, name: r.name, version: r.version, code: r.code }));
  });
}

/** One plugin's code, to read or change it. */
export async function getPluginCode(id: string): Promise<string> {
  return readOnly(async () => {
    assertSignedIn();
    const { user } = await requireSession();
    const [row] = await userDb((tx) => tx.select({ code: userPlugin.code }).from(userPlugin).where(and(eq(userPlugin.id, String(id)), eq(userPlugin.userId, user.id))).limit(1));
    if (!row) throw new Error("That plugin is gone.");
    return row.code;
  });
}

/** Adds a plugin from its code. Its name comes from its header, else the file's name. */
export async function addPlugin(input: { code: string; fileName?: string | null }): Promise<PluginRow> {
  return transaction(async () => {
    assertSignedIn();
    const { user } = await requireSession();
    await rateLimit("plugins", user.id, { limit: 60, windowSeconds: 3600 });
    const code = cleanPluginCode(input?.code);
    const header = readPluginHeader(code);
    return userDb(async (tx) => {
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(userPlugin).where(eq(userPlugin.userId, user.id));
      if (Number(count) >= MAX_PLUGINS) throw new Error(`That's ${MAX_PLUGINS} plugins. Remove one first.`);
      const [row] = await tx
        .insert(userPlugin)
        .values({ userId: user.id, name: pluginName(code, null, input?.fileName), description: header.description, version: header.version, access: header.access, code })
        .returning(columns);
      return toRow(row);
    });
  });
}

/**
 * Replaces a plugin's code, keeping whether it's on. A plugin installed from
 * the store becomes the person's own copy: it leaves its listing and gets no
 * more updates. The author's own stays linked, to publish as a new version.
 */
export async function updatePluginCode(id: string, rawCode: string): Promise<PluginRow> {
  return transaction(async () => {
    assertSignedIn();
    const { user } = await requireSession();
    await rateLimit("plugins", user.id, { limit: 60, windowSeconds: 3600 });
    const code = cleanPluginCode(rawCode);
    const header = readPluginHeader(code);
    const [row] = await userDb((tx) =>
      tx
        .update(userPlugin)
        .set({
          code,
          description: header.description,
          version: header.version,
          access: header.access,
          ...(header.name && { name: header.name }),
          // Someone else's listing: this is their copy now. A listing gone from sight (taken down) counts as someone else's.
          listingId: sql`case when exists (select 1 from plugin_listing l where l.id = ${userPlugin.listingId} and l.author_id = ${user.id}) then ${userPlugin.listingId} else null end`,
          releaseId: sql`case when exists (select 1 from plugin_listing l where l.id = ${userPlugin.listingId} and l.author_id = ${user.id}) then ${userPlugin.releaseId} else null end`,
          // From plotra.ink's store, in the desktop app: the person's own copy now, too.
          remoteSlug: null,
          remoteReleaseId: null,
          updatedAt: new Date(),
        })
        .where(and(eq(userPlugin.id, String(id)), eq(userPlugin.userId, user.id)))
        .returning(columns),
    );
    if (!row) throw new Error("That plugin is gone.");
    return toRow(row);
  });
}

/** Switches a plugin on or off. */
export async function setPluginEnabled(id: string, enabled: boolean): Promise<PluginRow> {
  return transaction(async () => {
    assertSignedIn();
    const { user } = await requireSession();
    const [row] = await userDb((tx) =>
      tx
        .update(userPlugin)
        .set({ enabled: enabled === true })
        .where(and(eq(userPlugin.id, String(id)), eq(userPlugin.userId, user.id)))
        .returning(columns),
    );
    if (!row) throw new Error("That plugin is gone.");
    return toRow(row);
  });
}

export async function removePlugin(id: string): Promise<void> {
  return transaction(async () => {
    assertSignedIn();
    const { user } = await requireSession();
    await userDb((tx) => tx.delete(userPlugin).where(and(eq(userPlugin.id, String(id)), eq(userPlugin.userId, user.id))));
  });
}

export type PluginCallResult = { ok: true; value: unknown } | { ok: false; error: string };

/** Dates as ISO strings, and nothing a plugin's frame can't be sent. */
const plain = (value: unknown): unknown => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

const object = <T,>(value: unknown): T => (value && typeof value === "object" && !Array.isArray(value) ? (value as T) : ({} as T));
const id = (value: unknown) => {
  if (typeof value !== "string" || !value || value.length > 100) throw new ApiError(400, "Pass a note's id, as notes.list gives it.");
  return value;
};

/**
 * A plugin's call on the open project, made as the signed-in person. Answers
 * with what happened rather than throwing, so the plugin gets the message.
 */
export async function pluginCall(projectId: string, pluginId: string, method: string, args: unknown[]): Promise<PluginCallResult> {
  try {
    if (!isServerMethod(method)) throw new ApiError(400, `Plugins can't call ${String(method).slice(0, 40)}.`);
    if (typeof projectId !== "string" || !projectId) throw new ApiError(400, "No project is open.");
    if (typeof pluginId !== "string" || !pluginId) throw new ApiError(400, "Which plugin is calling?");
    const list = Array.isArray(args) ? args : [];
    const { user, access } = await readOnly(async () => {
      assertSignedIn();
      const { user } = await requireSession();
      const [row] = await userDb((tx) => tx.select({ access: userPlugin.access }).from(userPlugin).where(and(eq(userPlugin.id, pluginId), eq(userPlugin.userId, user.id))).limit(1));
      return { user, access: row?.access };
    });
    if (!access) throw new ApiError(404, "This plugin was removed. Reload the page to stop it.");
    // `@access read` in its header (lib/plugins.ts): it may look, never change.
    if (access === "read" && writeMethods.includes(method)) throw new ApiError(403, "This plugin is only allowed to read your notes, so it can't change anything.");
    const { ok } = await checkRateLimit("plugin-call", user.id, { limit: 600, windowSeconds: 60 });
    if (!ok) throw new ApiError(429, "That's a lot of calls in a short time. Wait a minute.");

    switch (method) {
      case "notes.list":
        return { ok: true, value: plain(await listApiNotes(projectId)) };
      case "notes.read":
        return { ok: true, value: plain(await readApiNote(projectId, id(list[0]))) };
      case "notes.search": {
        const query = typeof list[0] === "string" ? list[0].slice(0, 500) : "";
        if (!query.trim()) throw new ApiError(400, "Search for some words.");
        const limit = Math.min(50, Math.max(1, Math.floor(Number(list[1]) || 20)));
        return { ok: true, value: plain(await searchApiNotes(projectId, query, limit)) };
      }
      case "notes.create":
        return { ok: true, value: plain(await createApiNote(projectId, object<NewNote>(list[0]))) };
      case "notes.update":
        return { ok: true, value: plain(await updateApiNote(projectId, id(list[0]), object<NotePatch>(list[1]))) };
      case "notes.write":
        return { ok: true, value: plain(await writeApiNoteText(projectId, id(list[0]), object<TextChange>(list[1]))) };
      case "kinds.list": {
        const world = await getWorld(projectId);
        return { ok: true, value: plain(world.entityTypes.map(({ id, name, plural, icon, color, schema }) => ({ id, name, plural, icon, color, fields: schema }))) };
      }
      case "kinds.add": {
        const kind = object<{ name?: unknown; plural?: unknown; icon?: unknown; color?: unknown; fields?: unknown }>(list[0]);
        if (typeof kind.name !== "string" || !kind.name.trim()) throw new ApiError(400, "Give the kind a name.");
        const made = await createEntityType(projectId, {
          name: kind.name.trim().slice(0, 80),
          ...(typeof kind.plural === "string" && kind.plural.trim() && { plural: kind.plural.trim().slice(0, 80) }),
          ...(typeof kind.icon === "string" && { icon: kind.icon }),
          ...(typeof kind.color === "string" && { color: kind.color }),
          ...(Array.isArray(kind.fields) && { schema: kind.fields as never }),
        });
        return { ok: true, value: plain({ id: made.id, name: made.name, plural: made.plural, icon: made.icon, color: made.color, fields: made.schema }) };
      }
    }
  } catch (error) {
    return { ok: false, error: error instanceof ApiError ? error.message : publicMessage(error, "That didn't work.") };
  }
}
