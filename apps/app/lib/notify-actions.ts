"use server";

// What the bell, the Activity view and Settings → Notifications read and
// change (plan.md 2.6, Phase 10). The rows are written by lib/notify.ts.

import { db, schema } from "@plotra/db";
import { emailPreferences, type ActivityPayload, type ActivityVerb, type EmailPreference, type GettingStarted, type NotificationPayload, type NotificationType, type RibbonPrefs, type ShellPrefs } from "@plotra/db/schema";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { requireProjectAccess } from "./access";
import { track } from "./analytics";
import { requireSession } from "./data";
import { userDb } from "./db";
import { notifyOutsideProject } from "./notify";
import { isStepId, stepView } from "./onboarding/steps";
import { readOnly, transaction } from "./request-cache";
import { cleanRibbon } from "./ribbon";
import { cleanShell } from "./shell-prefs";

const { activity, invitation, notification, organization, project, user, userPref } = schema;

const PAGE = 40;

export type NotificationRow = {
  id: string;
  type: NotificationType;
  projectId: string | null;
  nodeId: string | null;
  payload: NotificationPayload;
  readAt: Date | null;
  createdAt: Date;
  actorName: string | null;
  actorImage: string | null;
  /** Null when the notification isn't about a project, or the project is no longer open to you. */
  projectTitle: string | null;
  projectSlug: string | null;
  workspaceSlug: string | null;
};

export type Notifications = { items: NotificationRow[]; unread: number };

/** Your latest notifications, in every project, and how many are unread. */
export async function listNotifications(): Promise<Notifications> {
  return readOnly(async () => {
    const { user: me } = await requireSession();
    return userDb(async (tx) => {
      const [items, unread] = await Promise.all([
        tx
          .select({
            id: notification.id,
            type: notification.type,
            projectId: notification.projectId,
            nodeId: notification.nodeId,
            payload: notification.payload,
            readAt: notification.readAt,
            createdAt: notification.createdAt,
            actorName: user.name,
            actorImage: user.image,
            projectTitle: project.title,
            projectSlug: project.slug,
            workspaceSlug: organization.slug,
          })
          .from(notification)
          .leftJoin(user, eq(user.id, notification.actorId))
          .leftJoin(project, eq(project.id, notification.projectId))
          .leftJoin(organization, eq(organization.id, project.organizationId))
          .where(eq(notification.userId, me.id))
          .orderBy(desc(notification.createdAt))
          .limit(PAGE),
        tx.$count(notification, and(eq(notification.userId, me.id), isNull(notification.readAt))),
      ]);
      return { items, unread };
    });
  });
}

/** Marks one of your notifications read, or all of them with `null`. */
export async function markNotificationsRead(id: string | null): Promise<void> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    await userDb((tx) =>
      tx
        .update(notification)
        .set({ readAt: new Date() })
        .where(and(eq(notification.userId, me.id), isNull(notification.readAt), id ? eq(notification.id, id) : undefined)),
    );
  });
}

export type ActivityRow = {
  id: string;
  verb: ActivityVerb;
  nodeId: string | null;
  payload: ActivityPayload;
  createdAt: Date;
  actorId: string | null;
  actorName: string | null;
  actorImage: string | null;
};

/** The project's feed, newest first. `before` pages further back. */
export async function getActivity(projectId: string, before?: Date | null): Promise<ActivityRow[]> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    const cursor = before ? new Date(before) : null;
    return userDb((tx) =>
      tx
        .select({
          id: activity.id,
          verb: activity.verb,
          nodeId: activity.nodeId,
          payload: activity.payload,
          createdAt: activity.createdAt,
          actorId: activity.actorId,
          actorName: user.name,
          actorImage: user.image,
        })
        .from(activity)
        .leftJoin(user, eq(user.id, activity.actorId))
        .where(and(eq(activity.projectId, projectId), cursor && !Number.isNaN(cursor.getTime()) ? lt(activity.createdAt, cursor) : undefined))
        .orderBy(desc(activity.createdAt))
        .limit(PAGE),
    );
  });
}

// ---- Preferences ----------------------------------------------------------------

/** `gettingStarted` is the checklist's state (onboarding-plan.md 2.3); it is changed through `updateGettingStarted`. */
export type UserPrefs = {
  emailNotifications: EmailPreference;
  dailyGoal: number | null;
  sessionGoal: number | null;
  gettingStarted: GettingStarted;
  /** How they arranged the ribbon (lib/ribbon.ts); changed through `updateRibbon`. */
  ribbon: RibbonPrefs;
  /** The inspector's tabs and the look of the page (lib/shell-prefs.ts); changed through `updateShell`. */
  shell: ShellPrefs;
};
type OwnPrefs = Omit<UserPrefs, "gettingStarted" | "ribbon" | "shell">;

const defaults: UserPrefs = { emailNotifications: "daily", dailyGoal: null, sessionGoal: null, gettingStarted: {}, ribbon: {}, shell: {} };
const prefColumns = {
  emailNotifications: userPref.emailNotifications,
  dailyGoal: userPref.dailyGoal,
  sessionGoal: userPref.sessionGoal,
  gettingStarted: userPref.gettingStarted,
  ribbon: userPref.ribbon,
  shell: userPref.shell,
};

/** How you want to be emailed, and your writing goals. */
export async function getUserPrefs(): Promise<UserPrefs> {
  return readOnly(async () => {
    const { user: me } = await requireSession();
    const [row] = await userDb((tx) =>
      tx
        .select(prefColumns)
        .from(userPref)
        .where(eq(userPref.userId, me.id))
        .limit(1),
    );
    return row ?? defaults;
  });
}

const MAX_GOAL = 100_000;

function cleanGoal(value: number | null): number | null {
  if (value === null) return null;
  const words = Math.round(Number(value));
  if (!Number.isFinite(words) || words < 0 || words > MAX_GOAL) throw new Error("A goal is a number of words, up to 100,000.");
  return words || null;
}

export async function updateUserPrefs(patch: Partial<OwnPrefs>): Promise<UserPrefs> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    const values: Partial<OwnPrefs> = {};
    if (patch.emailNotifications !== undefined) {
      if (!emailPreferences.includes(patch.emailNotifications)) throw new Error("Choose off, each one or a daily digest.");
      values.emailNotifications = patch.emailNotifications;
    }
    if (patch.dailyGoal !== undefined) values.dailyGoal = cleanGoal(patch.dailyGoal);
    if (patch.sessionGoal !== undefined) values.sessionGoal = cleanGoal(patch.sessionGoal);
    const [saved] = await userDb((tx) =>
      tx
        .insert(userPref)
        .values({ userId: me.id, ...values })
        // `updatedAt` is listed so a patch with nothing in it is still a valid statement.
        .onConflictDoUpdate({ target: userPref.userId, set: { ...values, updatedAt: new Date() } })
        .returning(prefColumns),
    );
    return saved;
  });
}

/**
 * Ticks steps of the "Getting started" checklist, or closes and reopens it
 * (onboarding-plan.md 2.3). Steps are only ever added: one that was done stays
 * done. Returns the state after the change.
 */
export async function updateGettingStarted(patch: { done?: string[]; dismissed?: boolean; dismissedTryout?: boolean }): Promise<GettingStarted> {
  const result = await transaction(async () => {
    const { user: me } = await requireSession();
    // Anyone can call a server action with anything: only known step ids are kept.
    const reached = Array.isArray(patch.done) ? patch.done.filter(isStepId) : [];
    return userDb(async (tx) => {
      const [row] = await tx.select({ gettingStarted: userPref.gettingStarted, ribbon: userPref.ribbon }).from(userPref).where(eq(userPref.userId, me.id)).limit(1).for("update");
      const before = row?.gettingStarted ?? {};
      const had = new Set(before.done ?? []);
      const added = [...new Set(reached)].filter((id) => !had.has(id));
      const flag = (given: unknown, was: boolean | undefined) => (typeof given === "boolean" ? given : (was ?? false));
      const next: GettingStarted = {
        done: [...had, ...added],
        dismissed: flag(patch.dismissed, before.dismissed),
        dismissedTryout: flag(patch.dismissedTryout, before.dismissedTryout),
      };
      // A step that is about a view puts that view in the ribbon: the ribbon fills with what the person has used.
      const views = added.map((id) => stepView[id]).filter((view) => view !== undefined);
      const ribbonBefore = row?.ribbon ?? {};
      const ribbon: RibbonPrefs = { ...ribbonBefore, pinned: [...new Set([...(ribbonBefore.pinned ?? []), ...views])], hidden: (ribbonBefore.hidden ?? []).filter((id) => !views.includes(id)) };
      await tx
        .insert(userPref)
        .values({ userId: me.id, gettingStarted: next, ribbon })
        .onConflictDoUpdate({ target: userPref.userId, set: { gettingStarted: next, ribbon, updatedAt: new Date() } });
      return { userId: me.id, next, added, dismissedNow: next.dismissed === true && !before.dismissed };
    });
  });
  // After the transaction has committed, so nothing is counted that wasn't saved.
  for (const step of result.added) await track("getting_started_step_done", { userId: result.userId, properties: { step } });
  if (result.dismissedNow) await track("getting_started_dismissed", { userId: result.userId, properties: { done: result.next.done?.length ?? 0 } });
  return result.next;
}

/**
 * Tells whoever sent a workspace invitation that it was accepted. Called by
 * the invitation page right after Better Auth accepts it; everything is
 * checked again here, since anyone can call a server action: the invitation
 * must be accepted, and addressed to the caller.
 */
export async function announceInviteAccepted(invitationId: string): Promise<void> {
  const { user: me } = await requireSession();
  // Better Auth's tables, on the server's own connection like Better Auth itself.
  const [row] = await db
    .select({ inviterId: invitation.inviterId, workspace: organization.name, workspaceSlug: organization.slug })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(and(eq(invitation.id, String(invitationId)), eq(invitation.status, "accepted"), eq(sql`lower(${invitation.email})`, me.email.toLowerCase())))
    .limit(1);
  if (!row) return;
  // Once per invitation, however often this is called.
  const [told] = await db
    .select({ id: notification.id })
    .from(notification)
    .where(and(eq(notification.userId, row.inviterId), eq(notification.actorId, me.id), eq(notification.type, "invite_accepted"), sql`${notification.payload}->>'workspaceSlug' = ${row.workspaceSlug}`))
    .limit(1);
  if (told) return;
  await notifyOutsideProject(me.id, [row.inviterId], "invite_accepted", { workspace: row.workspace, workspaceSlug: row.workspaceSlug });
}

/** Saves how the ribbon is arranged: what is pinned, what was taken off, and whether every view is shown. */
export async function updateRibbon(input: RibbonPrefs): Promise<RibbonPrefs> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    const ribbon = cleanRibbon(input);
    await userDb((tx) =>
      tx
        .insert(userPref)
        .values({ userId: me.id, ribbon })
        .onConflictDoUpdate({ target: userPref.userId, set: { ribbon, updatedAt: new Date() } }),
    );
    return ribbon;
  });
}

/**
 * Switches animations on or off for the person, everywhere they sign in
 * (lib/motion.ts). Only that one setting changes, whatever else the shell
 * holds: the settings page doesn't load the rest to send back.
 */
export async function updateMotion(on: boolean): Promise<ShellPrefs> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    return userDb(async (tx) => {
      const [row] = await tx.select({ shell: userPref.shell }).from(userPref).where(eq(userPref.userId, me.id)).limit(1).for("update");
      const shell = cleanShell({ ...row?.shell, motion: on ? undefined : false });
      await tx
        .insert(userPref)
        .values({ userId: me.id, shell })
        .onConflictDoUpdate({ target: userPref.userId, set: { shell, updatedAt: new Date() } });
      return shell;
    });
  });
}

/** Saves how the inspector is arranged, how the page looks and whether empty notes offer a prompt. */
export async function updateShell(input: ShellPrefs): Promise<ShellPrefs> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    const shell = cleanShell(input);
    await userDb((tx) =>
      tx
        .insert(userPref)
        .values({ userId: me.id, shell })
        .onConflictDoUpdate({ target: userPref.userId, set: { shell, updatedAt: new Date() } }),
    );
    return shell;
  });
}
