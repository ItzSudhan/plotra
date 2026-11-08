import { index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { node } from "./node";
import { project } from "./project";

// Polish (plan.md 2.6 "Activity feed & notifications", 2.3 "session goals",
// Phase 10): what happened in a project, who should hear about it, how they
// want to be told, and how much was written when.

export const notificationTypes = [
  // Someone wrote "@You" in a comment.
  "mention",
  // Someone replied in a thread you started or took part in.
  "reply",
  // A project was shared with you.
  "shared",
  // Someone you invited joined the workspace.
  "invite_accepted",
  // You are a required reviewer of a note someone asked to have approved.
  "review_requested",
  // A reviewer approved a note you sent for review, or asked for changes.
  "review_decided",
  // Someone accepted or rejected a change you suggested.
  "suggestion_decided",
  // Someone wrote "@You" in the project's chat, or a note's.
  "chat_mention",
] as const;
export type NotificationType = (typeof notificationTypes)[number];

/**
 * Names and ids, never content: a notification says who did what to which
 * note, and the note itself says the rest once it's opened. The same goes for
 * the emails built from these rows.
 */
export type NotificationPayload = {
  /** The note's title when the notification was written (the note may be renamed or gone later). */
  title?: string;
  /** The comment thread to reveal when the note opens. */
  threadId?: string;
  /** `chat_mention`: open the chat (the note's, when there's a note). */
  chat?: boolean;
  /** `shared`: the role the project was shared as. */
  role?: string;
  /** `review_decided`: "approved" or "changes". `suggestion_decided`: "accepted" or "rejected". `review_requested`: the stage asked for. */
  decision?: string;
  stage?: string;
  /** `invite_accepted` has no project: the workspace that was joined. */
  workspace?: string;
  workspaceSlug?: string;
};

/** One thing one person should hear about. Shown under the bell, and emailed according to `user_pref`. */
export const notification = pgTable(
  "notification",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // The recipient.
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Null only for what happens outside any project (an accepted workspace invitation).
    projectId: text("project_id").references(() => project.id, { onDelete: "cascade" }),
    type: text("type").$type<NotificationType>().notNull(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    nodeId: text("node_id").references(() => node.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<NotificationPayload>().default({}).notNull(),
    readAt: timestamp("read_at"),
    // Set once it has gone out by email, on its own or in a digest, so it's never sent twice.
    emailedAt: timestamp("emailed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("notification_user_idx").on(t.userId, t.createdAt), index("notification_unsent_idx").on(t.emailedAt, t.createdAt)],
);

export const activityVerbs = [
  "note_created",
  "note_renamed",
  "note_trashed",
  "note_restored",
  "version_named",
  "version_restored",
  "release_cut",
  "comment_added",
  "project_shared",
] as const;
export type ActivityVerb = (typeof activityVerbs)[number];

export type ActivityPayload = {
  /** The note's (or release's) title at the time. */
  title?: string;
  /** `note_renamed`: what it was called before. */
  from?: string;
  /** `version_named` / `version_restored`: the version's name. */
  name?: string;
  /** `project_shared`: the role, and nothing about who (their address isn't everyone's business). */
  role?: string;
  /** `release_cut`: how many notes were snapshotted. */
  count?: number;
};

/** The project's feed: one row per thing someone did, for everyone who can read the project. */
export const activity = pgTable(
  "activity",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    verb: text("verb").$type<ActivityVerb>().notNull(),
    // Kept (as null) when the note is deleted for good: the row still says what happened, by title.
    nodeId: text("node_id").references(() => node.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<ActivityPayload>().default({}).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("activity_project_idx").on(t.projectId, t.createdAt)],
);

export const emailPreferences = ["off", "each", "daily"] as const;
export type EmailPreference = (typeof emailPreferences)[number];

/**
 * Where someone is in the "Getting started" checklist (onboarding-plan.md 2.3):
 * the steps they have done, by id (apps/app/lib/onboarding/steps.ts), and
 * whether they closed it for good.
 */
export type GettingStarted = {
  done?: string[];
  dismissed?: boolean;
  /** A sample's try-out is closed on its own. */
  dismissedTryout?: boolean;
  /** The desktop app's "Plotra on your desktop" card, for a cloud account (desktop-onboarding-plan.md, step 3). */
  dismissedDesktop?: boolean;
};

/**
 * How someone has arranged the ribbon (onboarding-plan.md 3): views they
 * pinned beside the ones their project's track starts with, the ones of those
 * they took off, and whether they'd rather see every view.
 */
export type RibbonPrefs = { pinned?: string[]; hidden?: string[]; all?: boolean; /** The views in the ribbon, top to bottom, where the person has moved them. */ order?: string[] };

/**
 * The rest of how someone has set the shell up for themselves
 * (onboarding-plan.md 4, apps/app/lib/shell-prefs.ts): the inspector's tabs,
 * how the page they write on looks, whether empty notes offer a prompt, and
 * whether the interface animates.
 */
export type ShellPrefs = {
  inspector?: { split?: boolean; hidden?: string[]; order?: string[] };
  editor?: { font?: string; size?: string; width?: string; spacing?: string; paragraphs?: string };
  prompts?: boolean;
  /** Animations (apps/app/lib/motion.ts). Only `false` is stored: they are on unless switched off. */
  motion?: boolean;
  /** Interface size (apps/app/lib/ui-size.ts). Left out for the default, Comfortable. */
  uiSize?: "compact" | "comfortable" | "large" | "larger";
  /** The blocks of the project home: the ones taken off, and the order of the rest. */
  home?: { hidden?: string[]; order?: string[] };
  /** Shortcuts the person changed, by command or formatting id: the new keys, or null for none. */
  hotkeys?: Record<string, string | null>;
  /** Pieces of the interface the person took away: status-bar items, toolbar and binder buttons, menu entries and palette commands, by id. */
  hide?: string[];
  /** The person's order of the status bar's items, the formatting toolbar's buttons and the binder header's buttons, by id. */
  order?: { status?: string[]; toolbar?: string[]; binder?: string[] };
  /** What happens as you type. Only `false` is stored: each is on unless switched off. */
  typing?: { markdown?: boolean; quotes?: boolean; autolink?: boolean; spellcheck?: boolean; wikilinks?: boolean };
  /** How a project opens for the person: in focus mode, with typewriter scrolling. Only `true` is stored. */
  start?: { focus?: boolean; typewriter?: boolean };
  /** The paper the Read view lays pages out on and prints to. Letter unless A4 is chosen. */
  paper?: "a4";
  /** The "Work like…" preset last applied, by id; cleared by nothing, it only labels where the setup started. */
  preset?: string;
  /** Colours and CSS of the person's own (apps/app/lib/themes.ts). */
  theme?: { palette?: string; accent?: string; css?: string };
  /** What each view remembers: the graph's filters, the outline's columns, the corkboard's card size… by "view.setting". */
  views?: Record<string, unknown>;
  /** Export layout (apps/app/lib/io/compile.ts): the settings last used, and presets the person saved. */
  compile?: { last?: Record<string, unknown>; presets?: Array<{ id: string; title: string; options: Record<string, unknown> }> };
  /** Story structures the person saved from their own folders (apps/app/lib/beat-sheets.ts), to build again in any project. */
  beatSheets?: Array<{ id: string; title: string; description: string; acts: Array<{ title: string; beats: Array<{ title: string; synopsis: string; at: number }> }> }>;
};

/** A person's own settings that aren't Better Auth's: how notifications reach them, and their writing goals. */
export const userPref = pgTable("user_pref", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // No row means "daily": one digest a day at most, and only when something is unread.
  emailNotifications: text("email_notifications").$type<EmailPreference>().default("daily").notNull(),
  // Words a day, and words per sitting; null when no goal is set.
  dailyGoal: integer("daily_goal"),
  sessionGoal: integer("session_goal"),
  gettingStarted: jsonb("getting_started").$type<GettingStarted>().default({}).notNull(),
  ribbon: jsonb("ribbon").$type<RibbonPrefs>().default({}).notNull(),
  shell: jsonb("shell").$type<ShellPrefs>().default({}).notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Words written in a project, per hour (UTC): everyone's typing added up, as
 * their browsers report it (apps/app/lib/stats-actions.ts), so pastes and
 * restores don't count. Hours before 19 October 2026 were each save's change in
 * length instead. Hours rather than days so the stats view can cut days in the
 * reader's own time zone.
 */
export const writingHour = pgTable(
  "writing_hour",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    // Sums of the increases and of the decreases, kept apart: a day of cutting is still a day of work.
    wordsAdded: integer("words_added").default(0).notNull(),
    wordsRemoved: integer("words_removed").default(0).notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.hour] })],
);

/**
 * One person's writing in a project, per hour (UTC). Reported by their own
 * browser, which can tell typing from a paste, a drop or a restored version:
 * only typing counts. Private to the writer (row-level security), unlike the
 * project's totals above.
 */
export const writerHour = pgTable(
  "writer_hour",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    wordsAdded: integer("words_added").default(0).notNull(),
    wordsRemoved: integer("words_removed").default(0).notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId, t.hour] })],
);
