import "server-only";
import { db, schema } from "@plotra/db";
import { and, eq, isNull } from "drizzle-orm";

const { organization, project, projectMember } = schema;

export type ShareInvitation =
  | { status: "ok"; workspaceSlug: string; projectSlug: string; title: string }
  | { status: "wrong-account"; email: string }
  | { status: "missing" };

/**
 * Opens a sharing invitation (`/share/<id>`). The link went to the invited
 * address, so opening it signed in under that address proves the account owns
 * it, and the access is tied to the account from then on.
 *
 * Runs on the server's own connection: before this, the project isn't visible
 * to the account at all.
 */
export async function claimShare(id: string, me: { id: string; email: string }): Promise<ShareInvitation> {
  const [row] = await db
    .select({
      userId: projectMember.userId,
      email: projectMember.email,
      title: project.title,
      projectSlug: project.slug,
      workspaceSlug: organization.slug,
    })
    .from(projectMember)
    .innerJoin(project, eq(project.id, projectMember.projectId))
    .innerJoin(organization, eq(organization.id, project.organizationId))
    .where(eq(projectMember.id, id))
    .limit(1);
  if (!row) return { status: "missing" };
  const mine = row.userId === me.id || (row.userId === null && row.email === me.email.toLowerCase());
  if (!mine) return { status: "wrong-account", email: maskEmail(row.email) };
  if (row.userId === null) {
    await db.update(projectMember).set({ userId: me.id }).where(and(eq(projectMember.id, id), isNull(projectMember.userId)));
  }
  return { status: "ok", workspaceSlug: row.workspaceSlug, projectSlug: row.projectSlug, title: row.title };
}

/** Enough of an address to recognise it as yours, not enough to learn it from a forwarded link. */
function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, name.length - 2)))}@${domain}`;
}
