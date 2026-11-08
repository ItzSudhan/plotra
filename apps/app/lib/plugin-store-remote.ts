import "server-only";
import { UserError } from "./errors";
import type { PluginAccess } from "./plugins";
import { cleanSlug, isPluginCategory, type PluginCategory } from "./plugin-store";
import type { StoreEntry, StoreListing, StoreRelease, StoreSort } from "./plugin-store-read";

// The desktop app's plugin store (local mode): plotra.ink's, read over its
// public API (app/api/store). The library has no store of its own; what's
// installed from this one is copied into the person's plugins with its slug
// and release there (`user_plugin.remote_slug`). Every answer is checked
// field by field: nothing from the network is trusted as it comes.

/** Where the store is. `PLOTRA_STORE_URL` points the desktop app at another server, for testing. */
export const storeUrl = () => (process.env.PLOTRA_STORE_URL || "https://app.plotra.ink").replace(/\/+$/, "");

const TIMEOUT_MS = 8000;
const STATUS_TIMEOUT_MS = 3000;

/** A UserError, so its message reaches the person in a production build (lib/errors.ts). */
export class StoreUnreachable extends UserError {
  constructor(message = "Couldn't reach the plugin store on plotra.ink. Check you're online, then try again.") {
    super(message);
  }
}

/** The store answered, but is busy (429) or having trouble (5xx): the person isn't offline, so don't say they are. */
export class StoreBusy extends StoreUnreachable {
  constructor(status = 429) {
    super(
      status === 429
        ? "The plugin store on plotra.ink is busy right now. Wait a minute, then try again."
        : "The plugin store on plotra.ink is having trouble right now. Try again in a few minutes.",
    );
  }
}

async function get(path: string, timeout = TIMEOUT_MS): Promise<{ status: number; body: unknown }> {
  let response: Response;
  try {
    response = await fetch(`${storeUrl()}${path}`, { signal: AbortSignal.timeout(timeout), headers: { accept: "application/json" }, cache: "no-store" });
  } catch {
    throw new StoreUnreachable();
  }
  if (response.status >= 500 || response.status === 429) throw new StoreBusy(response.status);
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
const date = (value: unknown) => {
  const parsed = typeof value === "string" ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(0);
};
const access = (value: unknown): PluginAccess => (value === "read" ? "read" : "write");
const category = (value: unknown): PluginCategory => (isPluginCategory(value) ? value : "other");
const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

export function parseEntry(raw: unknown): StoreEntry | null {
  const row = record(raw);
  const slug = cleanSlug(row.slug);
  if (!slug) return null;
  return {
    slug,
    name: str(row.name, 80) || slug,
    summary: str(row.summary, 300),
    category: category(row.category),
    access: access(row.access),
    author: str(row.author, 100),
    version: str(row.version, 30) || null,
    installs: num(row.installs),
    updatedAt: date(row.updatedAt),
  };
}

export function parseListing(raw: unknown): Omit<StoreListing, "mine" | "installed"> | null {
  const row = record(raw);
  const entry = parseEntry(row);
  if (!entry) return null;
  const releases: StoreRelease[] = (Array.isArray(row.releases) ? row.releases : []).slice(0, 100).flatMap((item) => {
    const r = record(item);
    const id = str(r.id, 100);
    const version = str(r.version, 30);
    return id && version ? [{ id, version, notes: str(r.notes, 2000), access: access(r.access), size: num(r.size), createdAt: date(r.createdAt) }] : [];
  });
  return {
    slug: entry.slug,
    name: entry.name,
    summary: entry.summary,
    about: str(row.about, 5000),
    category: entry.category,
    access: entry.access,
    author: entry.author,
    installs: entry.installs,
    withdrawn: row.withdrawn === true,
    createdAt: date(row.createdAt),
    updatedAt: entry.updatedAt,
    releases,
    code: typeof row.code === "string" ? row.code : "",
  };
}

export type RemoteStatus = { status: "available" | "withdrawn" | "blocked" | "missing"; latest: { id: string; version: string; access: PluginAccess } | null };

export function parseStatus(raw: unknown): RemoteStatus {
  const row = record(raw);
  const status = row.status === "available" || row.status === "withdrawn" || row.status === "blocked" ? row.status : "missing";
  const latest = record(row.latest);
  const id = str(latest.id, 100);
  const version = str(latest.version, 30);
  return { status, latest: status !== "blocked" && id && version ? { id, version, access: access(latest.access) } : null };
}

/** The store's front page, from plotra.ink. */
export async function remoteListStore({ query, category: cat, sort }: { query?: string; category?: string; sort?: StoreSort }): Promise<StoreEntry[]> {
  const params = new URLSearchParams();
  if (query) params.set("q", query.slice(0, 100));
  if (cat) params.set("category", cat);
  if (sort === "new") params.set("sort", "new");
  const { body } = await get(`/api/store/plugins?${params}`);
  const list = record(body).plugins;
  return (Array.isArray(list) ? list : []).slice(0, 200).flatMap((item) => parseEntry(item) ?? []);
}

/** One plugin, from plotra.ink; null when there's none (or it was taken down). */
export async function remoteListing(slug: string): Promise<Omit<StoreListing, "mine" | "installed"> | null> {
  const clean = cleanSlug(slug);
  if (!clean) return null;
  const { status, body } = await get(`/api/store/plugins/${clean}`);
  if (status === 404) return null;
  if (status !== 200) throw new StoreBusy(status);
  return parseListing(body);
}

// Asked every time a project opens, so kept a while: a takedown reaches the
// desktop app within minutes, and opening projects doesn't wait on the network.
const STATUS_TTL_MS = 10 * 60_000;
const statusCache = new Map<string, { at: number; value: RemoteStatus }>();

/**
 * Where each plugin stands on plotra.ink. Slugs the store can't be asked
 * about (offline, slow) are left out: their plugins keep running as they are.
 */
export async function remoteStatus(slugs: string[], { fresh = false } = {}): Promise<Map<string, RemoteStatus>> {
  const out = new Map<string, RemoteStatus>();
  const now = Date.now();
  const ask: string[] = [];
  for (const slug of new Set(slugs.map((s) => cleanSlug(s)).filter((s): s is string => s !== null))) {
    const cached = statusCache.get(slug);
    if (!fresh && cached && now - cached.at < STATUS_TTL_MS) out.set(slug, cached.value);
    else ask.push(slug);
  }
  for (let i = 0; i < ask.length; i += 50) {
    const batch = ask.slice(i, i + 50);
    try {
      const { status, body } = await get(`/api/store/status?slugs=${batch.join(",")}`, STATUS_TIMEOUT_MS);
      if (status !== 200) continue;
      const plugins = record(record(body).plugins);
      for (const slug of batch) {
        if (!(slug in plugins)) continue;
        const value = parseStatus(plugins[slug]);
        statusCache.set(slug, { at: now, value });
        out.set(slug, value);
      }
    } catch {
      // Offline: what was cached before, if anything, stands.
      for (const slug of batch) {
        const cached = statusCache.get(slug);
        if (cached) out.set(slug, cached.value);
      }
    }
  }
  return out;
}

/** For tests. */
export const clearStatusCache = () => statusCache.clear();
