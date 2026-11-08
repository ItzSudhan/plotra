import "server-only";
import { db, schema } from "@plotra/db";
import type { ActivityPayload, ActivityVerb, EmailPreference, NotificationPayload, NotificationType } from "@plotra/db/schema";
import { and, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { after } from "next/server";
import { requireSession } from "./data";
import { userDb, type Tx } from "./db";
import { appLink, escapeHtml, sendEmail } from "./email";
import { describe } from "./notify-text";
import { checkRateLimit } from "./rate-limit";
import { gitSyncSoon } from "./git-sync";
import { emitWebhook, verbEvents } from "./webhooks";

// Notifications and the activity feed (plan.md 2.6, Phase 10). Every write goes
// through this file, so what is recorded, and how little of it, is decided in
// one place: who did what to which note, by id and title. Never the text of a
// comment or a document.
//
// The rows are written inside the calling action's transaction, as the actor,
// so they roll back with it. Emails go out after the response (`after`), from
// the rows that actually committed.

const { activity, member, node, notification, organization, project, projectMember, user, userPref } = schema;

// Resend's free tier is 100 emails a day and 3,000 a month, shared with
// invitations and sharing emails. Notifications keep well inside it: when the
// day's budget is spent, the rest wait for the next digest instead of failing.
const EMAIL_BUDGET = { limit: 60, windowSeconds: 86_400 };
// One busy thread mustn't fill someone's inbox, whatever they chose.
const PER_PERSON = { limit: 12, windowSeconds: 3600 };
// What a digest still mentions. Anything older has been seen under the bell or wasn't wanted.
const DIGEST_WINDOW_MS = 7 * 86_400_000;
const DIGEST_ITEMS = 20;

/**
 * Runs `write` so that its failure can't take the caller's transaction with it:
 * a feed entry is never worth losing the comment it describes. A failed
 * statement poisons a Postgres transaction, hence the savepoint. Call it with
 * `await`, not beside other writes in a `Promise.all`: rolling back to the
 * savepoint would undo those too.
 */
async function quietly(what: string, write: (tx: Tx) => Promise<unknown>): Promise<boolean> {
  try {
    return await userDb(async (tx) => {
      await tx.execute(sql`savepoint plotra_notify`);
      try {
        await write(tx);
        await tx.execute(sql`release savepoint plotra_notify`);
        return true;
      } catch (error) {
        await tx.execute(sql`rollback to savepoint plotra_notify`);
        console.error(`[plotra] couldn't record ${what}`, error);
        return false;
      }
    });
  } catch (error) {
    console.error(`[plotra] couldn't record ${what}`, error);
    return false;
  }
}

/**
 * Adds a row to the project's activity feed, by the signed-in user, and tells
 * the project's webhooks (lib/webhooks.ts) once the action has committed. Never throws.
 */
export async function logActivity(projectId: string, verb: ActivityVerb, input: { nodeId?: string | null; payload?: ActivityPayload } = {}): Promise<void> {
  const { user: me } = await requireSession();
  await quietly(`activity ${verb}`, (tx) =>
    tx.insert(activity).values({ projectId, actorId: me.id, verb, nodeId: input.nodeId ?? null, payload: input.payload ?? {} }),
  );
  await emitWebhook(projectId, verbEvents[verb], { nodeId: input.nodeId, actorId: me.id, data: { ...input.payload } });
  await gitSyncSoon(projectId);
}

/**
 * Tells people about something the signed-in user did in a project. The actor
 * is never among the recipients, and nobody is told twice. Never throws.
 */
export async function notify(
  projectId: string,
  recipients: Iterable<string | null | undefined>,
  type: NotificationType,
  /** `emailed`: the caller sends its own email about this (sharing does), so none follows from here. */
  input: { nodeId?: string | null; payload?: NotificationPayload; emailed?: boolean } = {},
): Promise<void> {
  const { user: me } = await requireSession();
  const to = [...new Set([...recipients].filter((id): id is string => Boolean(id) && id !== me.id))];
  if (!to.length) return;
  // Ids are made here, not read back: the actor can't see rows addressed to someone else (RLS).
  const rows = to.map((userId) => ({
    id: crypto.randomUUID(),
    userId,
    projectId,
    type,
    actorId: me.id,
    nodeId: input.nodeId ?? null,
    payload: input.payload ?? {},
    emailedAt: input.emailed ? new Date() : null,
  }));
  const written = await quietly(`notification ${type}`, (tx) => tx.insert(notification).values(rows));
  if (written && !input.emailed) deliverLater(rows.map((r) => r.id));
}

/**
 * The same for something that happens outside a project (a workspace
 * invitation being accepted). There is no project for row-level security to
 * check the write against, so it goes through the server's own connection:
 * callers must have checked for themselves that `actorId` did the thing.
 */
export async function notifyOutsideProject(actorId: string, recipients: string[], type: NotificationType, payload: NotificationPayload): Promise<void> {
  const to = [...new Set(recipients.filter((id) => id && id !== actorId))];
  if (!to.length) return;
  const rows = to.map((userId) => ({ id: crypto.randomUUID(), userId, projectId: null, type, actorId, nodeId: null, payload }));
  try {
    await db.insert(notification).values(rows);
    deliverLater(rows.map((r) => r.id));
  } catch (error) {
    console.error(`[plotra] couldn't record notification ${type}`, error);
  }
}

export type ProjectPerson = { id: string; name: string; image: string | null; guest: boolean };

/**
 * Everyone who works in a project: the members of its workspace, and the
 * guests it is shared with who have accepted (an invitation not yet taken up
 * has no account behind it). The comment box suggests these, and names
 * written with "@" are matched against them.
 */
export async function projectPeople(projectId: string, workspaceId: string): Promise<ProjectPerson[]> {
  const [members, guests] = await Promise.all([
    userDb((tx) =>
      tx.select({ id: user.id, name: user.name, image: user.image }).from(member).innerJoin(user, eq(user.id, member.userId)).where(eq(member.organizationId, workspaceId)),
    ),
    userDb((tx) =>
      tx
        .select({ id: user.id, name: user.name, image: user.image })
        .from(projectMember)
        .innerJoin(user, eq(user.id, projectMember.userId))
        .where(eq(projectMember.projectId, projectId)),
    ),
  ]);
  const people = new Map<string, ProjectPerson>();
  for (const p of members) people.set(p.id, { ...p, guest: false });
  for (const p of guests) if (!people.has(p.id)) people.set(p.id, { ...p, guest: true });
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** People named with "@Name" in a comment: the project's people, the same list the comment box suggests. */
export async function mentionedIn(projectId: string, workspaceId: string, body: string): Promise<string[]> {
  if (!body.includes("@")) return [];
  const people = await projectPeople(projectId, workspaceId);
  // Longest names first, so "@Ann Lee" isn't taken for "@Ann". The comments panel highlights the same way.
  const byLength = people.filter((p) => p.name).sort((a, b) => b.name.length - a.name.length);
  const text = body.toLowerCase();
  const found = new Set<string>();
  for (let at = text.indexOf("@"); at >= 0; at = text.indexOf("@", at + 1)) {
    const match = byLength.find((p) => text.startsWith(p.name.toLowerCase(), at + 1));
    if (match) found.add(match.id);
  }
  return [...found];
}

// ---- Email ----------------------------------------------------------------------

type Pending = {
  id: string;
  userId: string;
  email: string;
  type: NotificationType;
  nodeId: string | null;
  payload: NotificationPayload;
  actorName: string | null;
  projectTitle: string | null;
  projectSlug: string | null;
  workspaceSlug: string | null;
  preference: EmailPreference | null;
};

const pendingColumns = {
  id: notification.id,
  userId: notification.userId,
  email: user.email,
  type: notification.type,
  nodeId: notification.nodeId,
  payload: notification.payload,
  actorName: sql<string | null>`(select a.name from "user" a where a.id = ${notification.actorId})`,
  projectTitle: project.title,
  projectSlug: project.slug,
  workspaceSlug: organization.slug,
  preference: userPref.emailNotifications,
};

/** Unread notifications that haven't been emailed, with what an email needs to describe them. Owner connection. */
function pending(where: ReturnType<typeof and>): Promise<Pending[]> {
  return db
    .select(pendingColumns)
    .from(notification)
    .innerJoin(user, eq(user.id, notification.userId))
    .leftJoin(project, eq(project.id, notification.projectId))
    .leftJoin(organization, eq(organization.id, project.organizationId))
    .leftJoin(userPref, eq(userPref.userId, notification.userId))
    .where(and(isNull(notification.readAt), isNull(notification.emailedAt), where))
    .orderBy(notification.createdAt);
}

function linkFor(n: Pick<Pending, "nodeId" | "payload" | "projectSlug" | "workspaceSlug">): string {
  if (n.workspaceSlug && n.projectSlug) return appLink(`/w/${n.workspaceSlug}/p/${n.projectSlug}${n.nodeId ? `?open=${n.nodeId}` : ""}`);
  if (n.payload.workspaceSlug) return appLink(`/w/${n.payload.workspaceSlug}`);
  return appLink("/");
}

const footer = () => ({
  text: `\nChoose how often you get these, or turn them off: ${appLink("/settings")}\n`,
  html: `<p style="color:#888;font-size:12px">Choose how often you get these, or turn them off, in <a href="${escapeHtml(appLink("/settings"))}">your settings</a>.</p>`,
});

/** Spends one email from the day's budget and the person's own; false when either is used up. */
async function mayEmail(userId: string): Promise<boolean> {
  if (!(await checkRateLimit("notify-email", userId, PER_PERSON)).ok) return false;
  return (await checkRateLimit("notify-email", "everyone", EMAIL_BUDGET)).ok;
}

const markEmailed = (ids: string[]) => db.update(notification).set({ emailedAt: new Date() }).where(inArray(notification.id, ids));

/**
 * After the response: emails the notifications just written to the people who
 * asked for one email each. Whatever isn't sent now (another preference, a
 * spent budget, a provider error) stays unsent and goes into the next digest.
 */
function deliverLater(ids: string[]) {
  try {
    after(async () => {
      try {
        // Only rows that committed are found: an action that failed sends nothing.
        for (const n of await pending(inArray(notification.id, ids))) {
          if (n.preference !== "each" || !(await mayEmail(n.userId))) continue;
          const sentence = describe(n);
          const link = linkFor(n);
          const foot = footer();
          await sendEmail({
            to: n.email,
            subject: sentence.replace(/\.$/, ""),
            text: `${sentence}\n\nOpen it: ${link}\n${foot.text}`,
            html: `<p>${escapeHtml(sentence)}</p><p><a href="${escapeHtml(link)}">Open it in Plotra</a></p>${foot.html}`,
          });
          await markEmailed([n.id]);
        }
      } catch (error) {
        console.error("[plotra] couldn't email a notification", error);
      }
    });
  } catch {
    // Not inside a request (a script, a test): the digest picks these up.
  }
}

/**
 * The daily digest (app/api/cron/digest): one email per person listing what
 * they haven't read and haven't been emailed about. For people on "each one"
 * it carries whatever the limits held back. Returns how many emails went out.
 */
export async function sendDigests(): Promise<{ sent: number; held: number }> {
  const since = new Date(Date.now() - DIGEST_WINDOW_MS);
  // Leave the last few minutes alone: an "each one" email for them may still be on its way.
  const until = new Date(Date.now() - 5 * 60_000);
  const rows = await pending(and(gt(notification.createdAt, since), lt(notification.createdAt, until)));
  const byUser = new Map<string, Pending[]>();
  for (const row of rows) {
    if (row.preference === "off") continue;
    byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
  }

  let sent = 0;
  let held = 0;
  for (const items of byUser.values()) {
    if (!(await mayEmail(items[0].userId))) {
      held++;
      continue;
    }
    const shown = items.slice(-DIGEST_ITEMS).reverse();
    const more = items.length - shown.length;
    const foot = footer();
    const subject = items.length === 1 ? describe(items[0]).replace(/\.$/, "") : `${items.length} new things in your Plotra projects`;
    try {
      await sendEmail({
        to: items[0].email,
        subject,
        text: `${shown.map((n) => `- ${describe(n)}\n  ${linkFor(n)}`).join("\n")}${more > 0 ? `\n\nAnd ${more} more.` : ""}\n${foot.text}`,
        html: `<ul>${shown.map((n) => `<li><a href="${escapeHtml(linkFor(n))}">${escapeHtml(describe(n))}</a></li>`).join("")}</ul>${more > 0 ? `<p>And ${more} more.</p>` : ""}${foot.html}`,
      });
      await markEmailed(items.map((n) => n.id));
      sent++;
    } catch (error) {
      console.error("[plotra] couldn't send a digest", error);
      held++;
    }
  }
  // Read or not, a notification from before the window will never be emailed; stop looking at it.
  await db
    .update(notification)
    .set({ emailedAt: new Date() })
    .where(and(isNull(notification.emailedAt), lt(notification.createdAt, since)));
  return { sent, held };
}

/** The title of a note, for a payload. Empty when it's gone. */
export async function titleOf(nodeId: string): Promise<string> {
  const [row] = await userDb((tx) => tx.select({ title: node.title }).from(node).where(eq(node.id, nodeId)).limit(1));
  return row?.title ?? "";
}
