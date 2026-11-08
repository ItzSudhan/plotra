import type { Client } from "./api";

// The plugin store, read through apps/app/app/api/mobile/plugins/store. Plugins
// run in Plotra on the web, never on the phone, and installing, switching and
// removing them happen there too: Plotra doesn't let an app's token add code
// that runs as you, so the phone only browses and opens the web for the rest.

export type PluginAccess = "read" | "write";

export type StoreEntry = {
  slug: string;
  name: string;
  summary: string;
  category: string;
  access: PluginAccess;
  author: string;
  version: string | null;
  installs: number;
  updatedAt: string;
};

export type StoreRelease = { id: string; version: string; notes: string; access: PluginAccess; size: number; createdAt: string };

export type StoreListing = Omit<StoreEntry, "version"> & { about: string; releases: StoreRelease[] };

export type StorePage = { official: StoreEntry[]; community: StoreEntry[]; unreachable: string | null };

export type StoreSort = "popular" | "new";

const path = "/api/mobile/plugins/store";

export const browsePlugins = (client: Client, { query = "", category = "", sort = "popular" }: { query?: string; category?: string; sort?: StoreSort } = {}) =>
  client.request<StorePage>(`${path}?${new URLSearchParams({ q: query, category, sort })}`);

export const readPlugin = (client: Client, slug: string) => client.request<{ listing: StoreListing }>(`${path}?${new URLSearchParams({ slug })}`).then((r) => r.listing);

// Copied from apps/app/lib/plugin-store.ts, so the phone says what the web says.
export const pluginCategories = [
  { id: "writing", label: "Writing tools" },
  { id: "export", label: "Export formats" },
  { id: "panels", label: "Panels and views" },
  { id: "worlds", label: "Worlds and kinds" },
  { id: "stats", label: "Stats and goals" },
  { id: "themes", label: "Themes" },
  { id: "other", label: "Other" },
] as const;

export const categoryLabel = (id: string) => pluginCategories.find((c) => c.id === id)?.label ?? "Other";

export const accessLabel = (access: string) => (access === "read" ? "Reads your notes" : "Reads and changes your notes");

/** What the web's store page and install dialog say a plugin may do (apps/app/app/plugins/[slug], components/plugins/store-actions.tsx). */
export const accessDetail = (access: string) =>
  access === "read"
    ? "It can read and search the notes in the project you have open. Plotra stops it from changing anything."
    : "It can read, add and change notes in the project you have open, as you could. Plotra keeps the earlier text of anything it changes, so you can go back.";

export const pluginPromise =
  "Plotra makes sure of this for every plugin: it only sees the project you have open, never your other projects or your account, and it can't send anything over the internet. You can switch it off or remove it at any time in Your settings → Plugins.";

/** Where on the web each thing is done. */
export const yourPluginsUrl = (server: string) => `${server}/settings#plugins`;
export const storePluginUrl = (server: string, slug: string) => `${server}/plugins/${encodeURIComponent(slug)}`;
