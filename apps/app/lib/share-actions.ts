"use server";

// Project sharing (plan.md 2.9): add anyone by email as viewer, commenter or
// editor. This also covers people outside the workspace, who then see only
// that project. Needs `manage` on the project (workspace owners and admins).

import { db, schema } from "@plotra/db";
import { projectRoles, type ProjectRole } from "@plotra/db/schema";
import { and, asc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { parseWorkspaceRole, requireProjectAccess, type WorkspaceRole } from "./access";
import { track } from "./analytics";
import { requireSession } from "./data";
import { userDb } from "./db";
import { appLink, escapeHtml, sendEmail } from "./email";
import { logActivity, notify } from "./notify";
import { newShareToken } from "./public-link";
import { MAX_GUESTS } from "./billing/plans";
import { limitsFor } from "./quotas";
import { rateLimit } from "./rate-limit";
import { readOnly, transaction } from "./request-cache";
import { cloudOnly } from "./local-mode";

const { member, organization, projectMember, shareLink, user, release } = schema;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SharedWith = {
  id: string;
  userId: string | null;
  email: string;
  name: string | null;
  image: string | null;
  role: ProjectRole;
  /** Invited by email, and hasn't opened the invitation yet. */
  pending: boolean;
  /** Also a member of the workspace, where their workspace role already lets them edit. */
  isMember: boolean;
};

export type Sharing = {
  workspace: { name: string; slug: string };
  /** Workspace members: they can open and edit every project. */
  members: Array<{ userId: string; name: string; email: string; image: string | null; role: WorkspaceRole }>;
  shared: SharedWith[];
};

/** Who can open this project. Needs `manage`. */
export async function getSharing(projectId: string): Promise<Sharing> {
  return readOnly(async () => {
    const { project } = await requireProjectAccess(projectId, "manage");
    return userDb(async (tx) => {
      const [[workspace], members, shared] = await Promise.all([
        tx.select({ name: organization.name, slug: organization.slug }).from(organization).where(eq(organization.id, project.organizationId)),
        tx
          .select({ userId: user.id, name: user.name, email: user.email, image: user.image, role: member.role })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .where(eq(member.organizationId, project.organizationId))
          .orderBy(asc(user.name)),
        tx
          .select({
            id: projectMember.id,
            userId: projectMember.userId,
            email: projectMember.email,
            name: user.name,
            image: user.image,
            role: projectMember.role,
          })
          .from(projectMember)
          .leftJoin(user, eq(user.id, projectMember.userId))
          .where(eq(projectMember.projectId, projectId))
          .orderBy(asc(projectMember.createdAt)),
      ]);
      const memberIds = new Set(members.map((m) => m.userId));
      return {
        workspace,
        members: members.map((m) => ({ ...m, role: parseWorkspaceRole(m.role) })),
        shared: shared.map((s) => ({ ...s, pending: s.userId === null, isMember: s.userId !== null && memberIds.has(s.userId) })),
      };
    });
  });
}

function cleanRole(role: string): ProjectRole {
  if (!(projectRoles as readonly string[]).includes(role)) throw new Error("Unknown role.");
  return role as ProjectRole;
}

/**
 * Shares the project with an email address. Someone who already has a Plotra
 * account under a verified address gets access straight away; anyone else
 * gets it when they open the invitation link signed in with that address.
 * Sharing again with the same address changes their role.
 */
export async function shareProject(projectId: string, email: string, role: ProjectRole): Promise<{ pending: boolean }> {
  return transaction(async () => {
    cloudOnly("Sharing a project");
    const { user: me } = await requireSession();
    const { project } = await requireProjectAccess(projectId, "manage");
    const address = email.trim().toLowerCase();
    if (!EMAIL.test(address) || address.length > 254) throw new Error("Enter a valid email address.");
    const next = cleanRole(role);
    await rateLimit("share", me.id, { limit: 60, windowSeconds: 3600 });

    const [account] = await userDb((tx) =>
      tx.select({ id: user.id, emailVerified: user.emailVerified }).from(user).where(eq(user.email, address)).limit(1),
    );
    if (account?.id === me.id) throw new Error("That's you: you already have access.");

    // An unverified account could have been opened by anyone using that address,
    // so it has to prove it gets the mail, like someone with no account at all.
    const userId = account?.emailVerified ? account.id : null;
    const { guests, plan } = await limitsFor(project.organizationId);
    const guestLimit = Math.min(guests ?? MAX_GUESTS, MAX_GUESTS);
    const row = await userDb(async (tx) => {
      // Changing the role of someone it is already shared with adds nobody.
      if ((await tx.$count(projectMember, and(eq(projectMember.projectId, projectId), ne(projectMember.email, address)))) >= guestLimit) {
        throw new Error(
          plan === "free"
            ? `A project can be shared with ${guestLimit} people on the Free plan. Pro raises this: the workspace's owner can upgrade in Settings → Plan & billing.`
            : "This project is shared with as many people as it can be.",
        );
      }
      const [saved] = await tx
        .insert(projectMember)
        .values({ projectId, email: address, userId, role: next, invitedById: me.id })
        .onConflictDoUpdate({ target: [projectMember.projectId, projectMember.email], set: { role: next } })
        .returning({ id: projectMember.id, userId: projectMember.userId });
      return saved;
    });

    const inviter = me.name || me.email;
    const link = appLink(`/share/${row.id}`);
    const what = next === "viewer" ? "read" : next === "commenter" ? "read and comment on" : "edit";
    await sendEmail({
      to: address,
      subject: `${inviter} shared “${project.title}” with you on Plotra`,
      text: `${inviter} invited you to ${what} “${project.title}” on Plotra.\n\nOpen it: ${link}\n`,
      html: `<p>${escapeHtml(inviter)} invited you to ${what} <strong>${escapeHtml(project.title)}</strong> on Plotra.</p><p><a href="${escapeHtml(link)}">Open the project</a></p><p style="color:#888;font-size:12px">If you weren't expecting this, you can ignore this email.</p>`,
    });
    await track("project_shared", { userId: me.id, workspaceId: project.organizationId, projectId, properties: { role: next } });
    await logActivity(projectId, "project_shared", { payload: { role: next } });
    // Someone with an account also finds it under their bell; the email above already went out.
    await notify(projectId, [row.userId], "shared", { payload: { role: next }, emailed: true });
    return { pending: row.userId === null };
  });
}

export async function setProjectMemberRole(projectId: string, memberId: string, role: ProjectRole): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "manage");
    const next = cleanRole(role);
    const updated = await userDb((tx) =>
      tx
        .update(projectMember)
        .set({ role: next })
        .where(and(eq(projectMember.id, memberId), eq(projectMember.projectId, projectId)))
        .returning({ id: projectMember.id }),
    );
    if (!updated.length) throw new Error("They no longer have access.");
  });
}

/** Takes away what the project was shared with someone as. Applies on their next request (plan.md 2.9). */
export async function removeProjectMember(projectId: string, memberId: string): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "manage");
    await userDb((tx) => tx.delete(projectMember).where(and(eq(projectMember.id, memberId), eq(projectMember.projectId, projectId))));
  });
}

/** Lets a guest remove a project from their own list. */
export async function leaveProject(projectId: string): Promise<void> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    await requireProjectAccess(projectId);
    // The server's own connection: the row is theirs, whatever they can still see afterwards.
    await db.delete(projectMember).where(and(eq(projectMember.projectId, projectId), eq(projectMember.userId, me.id)));
  });
}

// ---- Read-only links (plan.md 2.9) ------------------------------------------------
// Links that open without an account, at /p/<token> (lib/public-read.ts). A
// project can have a few, each for an audience of its own: one shows
// everything, another the project as of a release (the spoiler horizon), for
// players or readers who mustn't see what comes later. Only people who manage
// the project can make, change, reset or remove them.

export type ShareLinkState = {
  id: string;
  /** What the link is for: "Players", "Patrons". */
  name: string | null;
  enabled: boolean;
  token: string;
  /** Readers may copy the project into a workspace of their own (lib/public-copy-actions.ts); only on a link that shows everything. */
  allowCopy: boolean;
  /** The release the link shows the project as of; null for everything. */
  horizonReleaseId: string | null;
  /** Only what's marked canon. */
  canonOnly: boolean;
  /** Shown in the public gallery (app/worlds). */
  listed: boolean;
};

const MAX_SHARE_LINKS = 5;

const linkColumns = {
  id: shareLink.id,
  name: shareLink.name,
  enabled: shareLink.enabled,
  token: shareLink.token,
  allowCopy: shareLink.allowCopy,
  horizonReleaseId: shareLink.horizonReleaseId,
  canonOnly: shareLink.canonOnly,
  listed: shareLink.listed,
};

const TAKEN_DOWN = "This project's public link was taken down after a report. Write to the people who run this server about it.";
const LIMIT = { limit: 60, windowSeconds: 3600 };

/** A project one of whose links was taken down after a report (lib/public-read.ts) has no public links: none switched on, none new, no new tokens. */
async function refuseIfTakenDown(projectId: string) {
  const [row] = await userDb((tx) => tx.select({ id: shareLink.id }).from(shareLink).where(and(eq(shareLink.projectId, projectId), isNotNull(shareLink.blockedAt))).limit(1));
  if (row) throw new Error(TAKEN_DOWN);
}

/** The project's read-only links, oldest first. Needs `manage`. A link taken down after a report shows as off. */
export async function listShareLinks(projectId: string): Promise<ShareLinkState[]> {
  return readOnly(async () => {
    await requireProjectAccess(projectId, "manage");
    const rows = await userDb((tx) =>
      tx
        .select({ ...linkColumns, blockedAt: shareLink.blockedAt })
        .from(shareLink)
        .where(eq(shareLink.projectId, projectId))
        .orderBy(asc(shareLink.createdAt)),
    );
    const down = rows.some((row) => row.blockedAt);
    return rows.map(({ blockedAt, ...row }) => ({ ...row, enabled: row.enabled && !blockedAt && !down }));
  });
}

/** Makes a new read-only link, switched on. The first is called nothing; others are named so they can be told apart. */
export async function createShareLink(projectId: string, input: { name?: string | null } = {}): Promise<ShareLinkState> {
  return transaction(async () => {
    cloudOnly("A public read link");
    const { user: me } = await requireSession();
    await requireProjectAccess(projectId, "manage");
    await rateLimit("share-link", me.id, LIMIT);
    await refuseIfTakenDown(projectId);
    const count = await userDb((tx) => tx.$count(shareLink, eq(shareLink.projectId, projectId)));
    if (count >= MAX_SHARE_LINKS) throw new Error(`A project can have ${MAX_SHARE_LINKS} public links. Remove one first.`);
    const name = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim().slice(0, 60) || null : null;
    const [row] = await userDb((tx) => tx.insert(shareLink).values({ projectId, token: newShareToken(), enabled: true, name, createdById: me.id }).returning(linkColumns));
    return row;
  });
}

export type ShareLinkPatch = { name?: string | null; enabled?: boolean; allowCopy?: boolean; horizonReleaseId?: string | null; canonOnly?: boolean; listed?: boolean };

/**
 * Changes a link: its name, whether it works, what it shows (as of a release,
 * canon only), whether readers may copy the project, whether it's in the
 * gallery. A link that doesn't show everything can't be copied from: a copy
 * holds the whole project, spoilers included.
 */
export async function updateShareLink(projectId: string, linkId: string, patch: ShareLinkPatch): Promise<ShareLinkState> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    await requireProjectAccess(projectId, "manage");
    await rateLimit("share-link", me.id, LIMIT);
    const set: Partial<typeof shareLink.$inferInsert> = {};
    if (patch.name !== undefined) set.name = typeof patch.name === "string" ? patch.name.replace(/\s+/g, " ").trim().slice(0, 60) || null : null;
    if (typeof patch.enabled === "boolean") {
      if (patch.enabled) {
        cloudOnly("A public read link");
        await refuseIfTakenDown(projectId);
      }
      set.enabled = patch.enabled;
    }
    if (patch.horizonReleaseId !== undefined) {
      if (patch.horizonReleaseId === null) set.horizonReleaseId = null;
      else {
        const [found] = await userDb((tx) =>
          tx.select({ id: release.id }).from(release).where(and(eq(release.id, String(patch.horizonReleaseId)), eq(release.projectId, projectId))).limit(1),
        );
        if (!found) throw new Error("That release isn't in this project.");
        set.horizonReleaseId = found.id;
      }
    }
    if (typeof patch.canonOnly === "boolean") set.canonOnly = patch.canonOnly;
    if (typeof patch.listed === "boolean") set.listed = patch.listed;
    if (typeof patch.allowCopy === "boolean") set.allowCopy = patch.allowCopy;
    const [current] = await userDb((tx) =>
      tx.select({ horizonReleaseId: shareLink.horizonReleaseId, canonOnly: shareLink.canonOnly, allowCopy: shareLink.allowCopy }).from(shareLink).where(and(eq(shareLink.id, String(linkId)), eq(shareLink.projectId, projectId))).limit(1),
    );
    if (!current) throw new Error("That link isn't there any more.");
    const limited = (set.horizonReleaseId ?? (patch.horizonReleaseId === undefined ? current.horizonReleaseId : null)) !== null || (set.canonOnly ?? current.canonOnly);
    if (limited && (set.allowCopy ?? current.allowCopy)) {
      if (patch.allowCopy) throw new Error("A copy holds the whole project, spoilers and all, so it can only be offered on a link that shows everything.");
      set.allowCopy = false;
    }
    const [row] = await userDb((tx) => tx.update(shareLink).set(set).where(and(eq(shareLink.id, String(linkId)), eq(shareLink.projectId, projectId))).returning(linkColumns));
    return row;
  });
}

/** Gives a link a new token. The old one stops working at once. */
export async function resetShareLink(projectId: string, linkId: string): Promise<ShareLinkState> {
  return transaction(async () => {
    cloudOnly("A public read link");
    const { user: me } = await requireSession();
    await requireProjectAccess(projectId, "manage");
    await rateLimit("share-link", me.id, LIMIT);
    await refuseIfTakenDown(projectId);
    const [row] = await userDb((tx) =>
      tx.update(shareLink).set({ token: newShareToken() }).where(and(eq(shareLink.id, String(linkId)), eq(shareLink.projectId, projectId))).returning(linkColumns),
    );
    if (!row) throw new Error("That link isn't there any more.");
    return row;
  });
}

/** Removes a link for good: its address stops working, and can't come back. A link taken down after a report stays, so the takedown does. */
export async function deleteShareLink(projectId: string, linkId: string): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "manage");
    await userDb((tx) => tx.delete(shareLink).where(and(eq(shareLink.id, String(linkId)), eq(shareLink.projectId, projectId), isNull(shareLink.blockedAt))));
  });
}
