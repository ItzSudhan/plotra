"use server";

// Workspace administration (plan.md 2.1, 2.9): members and invitations. Every
// function checks permission itself: these are public endpoints, whoever
// renders them. Workspace settings need a workspace owner or admin. Writes to
// Better Auth's tables (members, invitations, the workspace itself) go through
// its API, which runs its own role checks too. Sharing one project is in
// lib/share-actions.ts.

import { auth } from "@plotra/auth";
import { db, schema } from "@plotra/db";
import { and, asc, desc, eq, gt, inArray, isNotNull, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { parseWorkspaceRole, type WorkspaceRole } from "./access";
import { requireAdmin } from "./workspace";
import { withAuthHeaders } from "./api/auth-session";
import { authErrorText } from "./auth-errors";
import { getSubscription } from "./billing/subscription";
import { requireSession, requireWorkspace } from "./data";
import { r2Delete } from "./r2";
import { slugify } from "./slug";
import { track } from "./analytics";
import { userDb } from "./db";
import { limitsFor } from "./quotas";
import { rateLimit } from "./rate-limit";
import { readOnly, transaction } from "./request-cache";
import { cloudOnly } from "./local-mode";

const { attachment, invitation, member, project, projectMember, user, version } = schema;

/** Calls Better Auth, rethrowing its errors as plain messages. From the phone app, with a brief session of its own (lib/api/auth-session.ts). */
async function betterAuth<T>(fn: (h: Headers) => Promise<T>): Promise<T> {
  try {
    return await withAuthHeaders(await headers(), fn);
  } catch (error) {
    const e = error as { body?: { code?: string; message?: string }; status?: number; message?: string };
    throw new Error(authErrorText({ ...e.body, message: e.body?.message ?? e.message }));
  }
}

// ── Members ─────────────────────────────────────────────────────────────────

export type MemberRow = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: WorkspaceRole;
  joinedAt: Date;
};

/** Everyone in the workspace. Any member may see who they write with; only owners and admins can change it. */
export async function listMembers(workspaceSlug: string): Promise<MemberRow[]> {
  return readOnly(async () => {
    const workspace = await requireWorkspace(workspaceSlug);
    const rows = await userDb((tx) =>
      tx
        .select({
          memberId: member.id,
          userId: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: member.role,
          joinedAt: member.createdAt,
        })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, workspace.id))
        .orderBy(asc(user.name)),
    );
    return rows.map((r) => ({ ...r, role: parseWorkspaceRole(r.role) }));
  });
}

export async function changeMemberRole(workspaceSlug: string, memberId: string, nextRole: WorkspaceRole) {
  return transaction(async () => {
    const { workspace, role } = await requireAdmin(workspaceSlug);
    if (!["member", "admin", "owner"].includes(nextRole)) throw new Error("Unknown role.");
    if (nextRole === "owner" && role !== "owner") throw new Error("Only owners can make someone an owner.");
    await betterAuth((h) =>
      auth.api.updateMemberRole({ body: { memberId, role: nextRole, organizationId: workspace.id }, headers: h }),
    );
  });
}

export async function removeMember(workspaceSlug: string, memberId: string) {
  return transaction(async () => {
    const { workspace, userId: me } = await requireAdmin(workspaceSlug);
    const [target] = await userDb((tx) =>
      tx
        .select({ userId: member.userId })
        .from(member)
        .where(and(eq(member.id, memberId), eq(member.organizationId, workspace.id)))
        .limit(1),
    );
    if (!target) throw new Error("That person isn't a member of this workspace.");
    if (target.userId === me) throw new Error("You can't remove yourself.");
    await betterAuth((h) =>
      auth.api.removeMember({ body: { memberIdOrEmail: memberId, organizationId: workspace.id }, headers: h }),
    );
    // Leaving the workspace means leaving all of it: projects shared with them one by one go too.
    await db
      .delete(projectMember)
      .where(
        and(
          eq(projectMember.userId, target.userId),
          inArray(projectMember.projectId, db.select({ id: project.id }).from(project).where(eq(project.organizationId, workspace.id))),
        ),
      );
  });
}

// ── Invitations ─────────────────────────────────────────────────────────────

export type InvitationRow = {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  createdAt: Date;
  inviterName: string | null;
};

export async function listInvitations(workspaceSlug: string): Promise<InvitationRow[]> {
  return readOnly(async () => {
    const { workspace } = await requireAdmin(workspaceSlug);
    const rows = await userDb((tx) =>
      tx
        .select({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
          inviterName: user.name,
        })
        .from(invitation)
        .leftJoin(user, eq(user.id, invitation.inviterId))
        .where(
          and(
            eq(invitation.organizationId, workspace.id),
            eq(invitation.status, "pending"),
            gt(invitation.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(invitation.createdAt)),
    );
    return rows.map((r) => ({ ...r, role: r.role ?? "member" }));
  });
}

/**
 * Invites someone to the workspace. Members can open and edit every project;
 * to let someone into one project only, share that project with them instead.
 */
export async function inviteMember(workspaceSlug: string, email: string, inviteRole: "member" | "admin") {
  return transaction(async () => {
    cloudOnly("Inviting people");
    const { workspace, userId: me } = await requireAdmin(workspaceSlug);
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error("Enter a valid email address.");
    if (inviteRole !== "member" && inviteRole !== "admin") throw new Error("Unknown role.");
    await rateLimit("invite", me, { limit: 40, windowSeconds: 3600 });
    await assertSeat(workspace.id, address);
    await betterAuth((h) =>
      auth.api.createInvitation({
        body: { email: address, role: inviteRole, organizationId: workspace.id, resend: true },
        headers: h,
      }),
    );
    await track("member_invited", { userId: me, workspaceId: workspace.id, properties: { role: inviteRole } });
  });
}

/**
 * Throws when the workspace has as many members as its plan allows (plan.md 8.2).
 * Invitations still open count, or ten could be sent for the last seat; one
 * already sent to this address doesn't, since inviting again only resends it.
 */
async function assertSeat(workspaceId: string, address: string): Promise<void> {
  const { members: limit, plan } = await limitsFor(workspaceId);
  if (limit === null) return;
  const [members, invited] = await Promise.all([
    db.$count(member, eq(member.organizationId, workspaceId)),
    db.$count(invitation, and(eq(invitation.organizationId, workspaceId), eq(invitation.status, "pending"), gt(invitation.expiresAt, new Date()), ne(invitation.email, address))),
  ]);
  if (members + invited < limit) return;
  const hint = plan === "free" ? " Pro raises this: an owner can upgrade under Plan & billing. To let someone into one project only, share that project with them instead." : "";
  throw new Error(`This workspace can have ${limit} members${plan === "free" ? " on the Free plan" : ""}, counting invitations still open.${hint}`);
}

export async function cancelInvitation(workspaceSlug: string, invitationId: string) {
  return transaction(async () => {
    const { workspace } = await requireAdmin(workspaceSlug);
    const [found] = await userDb((tx) =>
      tx
        .select({ id: invitation.id })
        .from(invitation)
        .where(and(eq(invitation.id, invitationId), eq(invitation.organizationId, workspace.id)))
        .limit(1),
    );
    if (!found) throw new Error("That invitation no longer exists.");
    await betterAuth((h) => auth.api.cancelInvitation({ body: { invitationId }, headers: h }));
  });
}

// ── The workspace itself ────────────────────────────────────────────────────

/**
 * Renames the workspace and changes its web address. Owners and admins.
 * Returns the address it ended up with, which links now use.
 */
export async function updateWorkspace(workspaceSlug: string, patch: { name: string; slug: string }): Promise<{ slug: string }> {
  return transaction(async () => {
    const { workspace } = await requireAdmin(workspaceSlug);
    const name = patch.name.trim();
    if (!name) throw new Error("Give the workspace a name.");
    if (name.length > 80) throw new Error("Keep the name under 80 characters.");
    const slug = slugify(patch.slug);
    if (!slug) throw new Error("Choose a web address: letters, numbers and dashes.");
    const data = { ...(name !== workspace.name && { name }), ...(slug !== workspace.slug && { slug }) };
    if (Object.keys(data).length) {
      await betterAuth((h) => auth.api.updateOrganization({ body: { data, organizationId: workspace.id }, headers: h }));
    }
    return { slug };
  });
}

/**
 * Leaves the workspace, and with it every project of it shared with you one by
 * one. Better Auth refuses for its only owner, who has to hand it over first.
 */
export async function leaveWorkspace(workspaceSlug: string): Promise<void> {
  return transaction(async () => {
    cloudOnly("Leaving a workspace");
    const { user: me } = await requireSession();
    const workspace = await requireWorkspace(workspaceSlug);
    await betterAuth((h) => auth.api.leaveOrganization({ body: { organizationId: workspace.id }, headers: h }));
    await db
      .delete(projectMember)
      .where(and(eq(projectMember.userId, me.id), inArray(projectMember.projectId, db.select({ id: project.id }).from(project).where(eq(project.organizationId, workspace.id)))));
  });
}

/** Subscriptions that would still be charged: a workspace has to stop paying before it can go. */
const stillCharging = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

/**
 * Deletes the workspace and every project in it, for everyone. Its owner only,
 * with its name typed back. Rows go by cascade; snapshots and uploads in
 * object storage once that has committed, as for a deleted project.
 */
export async function deleteWorkspace(workspaceSlug: string, typedName: string): Promise<void> {
  const keys = await transaction(async () => {
    const workspace = await requireWorkspace(workspaceSlug);
    if (parseWorkspaceRole(workspace.role) !== "owner") throw new Error("Only the workspace's owner can delete it.");
    if (typedName.trim() !== workspace.name.trim()) throw new Error("Type the workspace's name exactly to delete it.");
    const sub = await getSubscription(workspace.id);
    if (sub && stillCharging.has(sub.status)) throw new Error("This workspace is on Pro. Cancel the plan under Plan & billing first, so you aren't charged again.");
    const inWorkspace = db.select({ id: project.id }).from(project).where(eq(project.organizationId, workspace.id));
    const [snapshots, files] = await Promise.all([
      db.select({ key: version.r2Key }).from(version).where(and(inArray(version.projectId, inWorkspace), isNotNull(version.r2Key))),
      db.select({ key: attachment.r2Key }).from(attachment).where(and(inArray(attachment.projectId, inWorkspace), isNotNull(attachment.r2Key))),
    ]);
    await betterAuth((h) => auth.api.deleteOrganization({ body: { organizationId: workspace.id }, headers: h }));
    return [...snapshots, ...files].map((row) => row.key!);
  });
  for (let i = 0; i < keys.length; i += 50) await r2Delete(keys.slice(i, i + 50));
}
