import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { project } from "./project";

export const apiTokenScopes = ["read", "write"] as const;
export type ApiTokenScope = (typeof apiTokenScopes)[number];

/**
 * A personal access token for the API and the MCP server (apps/app/lib/api).
 * It acts as the person who made it, with their own access to their own
 * projects, and no more: `read` can only look; `write` can also create and
 * change notes. Only a hash of the token is kept; the token itself is shown
 * once, when it's made.
 */
export const apiToken = pgTable(
  "api_token",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** SHA-256 of the token, hex. */
    tokenHash: text("token_hash").notNull().unique(),
    /** The token's first characters, to tell tokens apart in a list. */
    prefix: text("prefix").notNull(),
    scope: text("scope").$type<ApiTokenScope>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    /**
     * Set when an app connected through OAuth (apps/app/lib/api/oauth-server.ts)
     * rather than the person making a token: the token is an hour's access for
     * that app, and `refreshHash` is how it gets the next one.
     */
    clientId: text("client_id").references((): AnyPgColumn => oauthClient.id, { onDelete: "cascade" }),
    /** SHA-256 of the refresh token, hex. Replaced each time it's used. */
    refreshHash: text("refresh_hash").unique(),
    refreshExpiresAt: timestamp("refresh_expires_at"),
  },
  (t) => [index("api_token_user_idx").on(t.userId)],
);

/**
 * An app that registered itself to ask people for access through OAuth
 * (apps/app/lib/api/oauth-server.ts): Claude's connectors, Claude Code, and
 * other MCP clients. Anyone can register one; it can do nothing until a
 * signed-in person approves it. Only the server's own connection reads it.
 */
export const oauthClient = pgTable("oauth_client", {
  /** The client_id. */
  id: text("id").primaryKey(),
  /** SHA-256 of its secret, hex, for a client that asked for one. Most are public and prove themselves with PKCE. */
  secretHash: text("secret_hash"),
  name: text("name").notNull(),
  /** Where it may be sent back to, exactly. */
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
  clientUri: text("client_uri"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** A one-time code handed to an approved app, swapped for tokens within minutes. Only its hash is kept. */
export const oauthCode = pgTable(
  "oauth_code",
  {
    codeHash: text("code_hash").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    redirectUri: text("redirect_uri").notNull(),
    /** PKCE, S256. */
    codeChallenge: text("code_challenge").notNull(),
    scope: text("scope").$type<ApiTokenScope>().notNull(),
    resource: text("resource"),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (t) => [index("oauth_code_expires_idx").on(t.expiresAt)],
);

/** What a webhook can be told about (apps/app/lib/webhooks.ts). */
export const webhookEvents = [
  "note.created",
  "note.updated",
  "note.renamed",
  "note.trashed",
  "note.restored",
  "comment.added",
  "version.named",
  "version.restored",
  "release.cut",
  "project.shared",
] as const;
export type WebhookEvent = (typeof webhookEvents)[number];

/**
 * A URL a project's managers asked Plotra to tell when something happens in
 * the project (apps/app/lib/webhooks.ts): a signed JSON POST per event, with
 * ids and titles, never the text. `events` empty means every event. After
 * enough failures in a row it switches itself off.
 */
export const webhook = pgTable(
  "webhook",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** Signs each delivery (HMAC-SHA256), so the receiver knows it came from here. */
    secret: text("secret").notNull(),
    events: jsonb("events").$type<WebhookEvent[]>().default([]).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastDeliveryAt: timestamp("last_delivery_at"),
    /** The receiver's HTTP status for the last delivery, or null when it couldn't be reached. */
    lastStatus: integer("last_status"),
    lastError: text("last_error"),
    /** Deliveries that failed in a row since the last one that worked. */
    failures: integer("failures").default(0).notNull(),
  },
  (t) => [index("webhook_project_idx").on(t.projectId)],
);

/**
 * A project kept in a GitHub repository as Markdown files (apps/app/lib/git-sync.ts):
 * the files of a Markdown export, in a folder of the repository, committed
 * when they change. The token is sealed with the server's secret and never
 * shown again; the sync reads the project as the person who set it up.
 */
export const gitSync = pgTable("git_sync", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => project.id, { onDelete: "cascade" }),
  /** "owner/name". */
  repo: text("repo").notNull(),
  branch: text("branch").default("main").notNull(),
  /** The folder in the repository the files go in; empty for its top. */
  path: text("path").default("").notNull(),
  tokenSealed: text("token_sealed").notNull(),
  /** The token's last four characters, to tell it apart. */
  tokenHint: text("token_hint").notNull(),
  /** Whose access the sync reads the project with. */
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  enabled: boolean("enabled").default(true).notNull(),
  /** A change not yet in the repository. */
  dirtyAt: timestamp("dirty_at"),
  lastSyncedAt: timestamp("last_synced_at"),
  lastCommit: text("last_commit"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * A person's own plugin (apps/app/lib/plugins.ts): a script that adds
 * commands, panels and export formats. It runs in a sandboxed frame in their
 * browser, in every project they open, and acts with their access through a
 * small message API. Theirs alone: no one else sees or runs it.
 */
export const userPlugin = pgTable(
  "user_plugin",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    version: text("version").default("").notNull(),
    code: text("code").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    /** From the header's `@access`: a `read` plugin's calls that change anything are refused (apps/app/lib/plugin-actions.ts). */
    access: text("access").$type<PluginAccess>().default("write").notNull(),
    /** The store listing it was installed from, or published as by its author. */
    listingId: text("listing_id").references((): AnyPgColumn => pluginListing.id, { onDelete: "set null" }),
    /** The release its code is, while it's linked to a listing. */
    releaseId: text("release_id").references((): AnyPgColumn => pluginRelease.id, { onDelete: "set null" }),
    /**
     * In the desktop app (local mode), a plugin installed from plotra.ink's
     * store: its slug and release there. Not keys: the listing lives on
     * another server (apps/app/lib/plugin-store-remote.ts).
     */
    remoteSlug: text("remote_slug"),
    remoteReleaseId: text("remote_release_id"),
    /**
     * One of Plotra's own plugins, shipped with the app (apps/app/lib/official-plugins):
     * its slug. Cleared when the person edits it, as for a store plugin.
     */
    officialSlug: text("official_slug"),
    /** What the plugin keeps for itself through `plotra.storage` (apps/app/lib/plugin-actions.ts). */
    storage: jsonb("storage").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("user_plugin_user_idx").on(t.userId), index("user_plugin_listing_idx").on(t.listingId)],
);

export const pluginAccessLevels = ["read", "write"] as const;
export type PluginAccess = (typeof pluginAccessLevels)[number];

/**
 * A plugin in the store (plugin-store-plan.md): published by its author from
 * one of their own plugins, for anyone on the server to install. Installing
 * copies a release's code into the person's own plugins (`user_plugin`).
 */
export const pluginListing = pgTable(
  "plugin_listing",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Its address: /plugins/<slug>. Never changes. */
    slug: text("slug").notNull().unique(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    summary: text("summary").default("").notNull(),
    /** A longer description, as plain text. */
    about: text("about").default("").notNull(),
    category: text("category").default("other").notNull(),
    /** The latest release's access. */
    access: text("access").$type<PluginAccess>().default("write").notNull(),
    /** Its author took it out of the store; copies already installed keep working. */
    withdrawnAt: timestamp("withdrawn_at"),
    // Set by whoever runs the server, after a report (docs: Self-hosting,
    // Reports and takedowns). The app never clears it. Installed copies stop
    // running at once (apps/app/lib/plugin-actions.ts `loadPlugins`).
    blockedAt: timestamp("blocked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("plugin_listing_author_idx").on(t.authorId)],
);

/** One published version of a listing. Never changed or deleted, so what someone installed can always be read. */
export const pluginRelease = pgTable(
  "plugin_release",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    listingId: text("listing_id")
      .notNull()
      .references(() => pluginListing.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    /** What changed, in the author's words. */
    notes: text("notes").default("").notNull(),
    code: text("code").notNull(),
    access: text("access").$type<PluginAccess>().default("write").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("plugin_release_version_idx").on(t.listingId, t.version), index("plugin_release_listing_idx").on(t.listingId, t.createdAt)],
);
