import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { project } from "./project";
import { release } from "./world";

// Access and sharing (plan.md 2.9). Workspace members come from Better Auth's
// `member` table; this adds per-project sharing, which also covers guests from
// outside the workspace. The check that reads both is `can()` in
// apps/app/lib/access; Postgres row-level security backs it up with workspace
// and project isolation (migrations 0003_rls and 0006).

export const projectRoles = ["viewer", "commenter", "editor"] as const;
export type ProjectRole = (typeof projectRoles)[number];

/**
 * Someone a project is shared with. Added by email: `userId` is set straight
 * away when that address has an account, and otherwise when they open the
 * invitation link (`/share/<id>`) signed in with it.
 */
export const projectMember = pgTable(
  "project_member",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    // Lower-cased.
    email: text("email").notNull(),
    role: text("role").$type<ProjectRole>().default("viewer").notNull(),
    invitedById: text("invited_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("project_member_project_email_idx").on(t.projectId, t.email),
    index("project_member_user_idx").on(t.userId),
  ],
);

/**
 * A project's read-only links (plan.md 2.9): whoever has one can read the
 * project without an account, until it is switched off. A project can have a
 * few, each for an audience of its own (beat-the-competitors.md, 12): "Players"
 * as of the last session, "Patrons" a session ahead, "Everything" for a
 * co-author. Each shows the project as of a release, or all of it.
 */
export const shareLink = pgTable(
  "share_link",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    /** What the link is for, as its owners call it: "Players", "Patrons". */
    name: text("name"),
    // Unguessable, and replaced when the link is reset.
    token: text("token").notNull().unique(),
    enabled: boolean("enabled").default(true).notNull(),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Set by whoever runs the server, after a report (docs: Self-hosting, Reports
    // and takedowns). The app never clears it: the owner can't switch the link
    // back on or give it a new token, and while one of a project's links is down
    // none of its others open either.
    blockedAt: timestamp("blocked_at"),
    // Readers may copy the project into a workspace of their own (apps/app/lib/public-copy.ts):
    // its notes and story tools, not its comments, history or trash. Off until the owner says.
    allowCopy: boolean("allow_copy").default(false).notNull(),
    /** The release the link shows the project as of: what its audience knows by then, and nothing later (the spoiler horizon). Null: everything. */
    horizonReleaseId: text("horizon_release_id").references(() => release.id, { onDelete: "set null" }),
    /** Only notes and passages marked canon. */
    canonOnly: boolean("canon_only").default(false).notNull(),
    /** Shown in the public gallery of worlds (apps/app/app/worlds). Off until the owner says. */
    listed: boolean("listed").default(false).notNull(),
  },
  (t) => [index("share_link_project_idx").on(t.projectId)],
);
