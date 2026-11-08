import "server-only";
import { schema } from "@plotra/db";
import type { ProjectRole } from "@plotra/db/schema";
import { eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireSession } from "../data";
import { userDb } from "../db";
import { requestCache } from "../request-cache";
import { actionsFor, parseWorkspaceRole, type Action, type WorkspaceRole } from "./policy";

export * from "./policy";

const { member, node, project, projectMember } = schema;

type ProjectRow = typeof project.$inferSelect;

export type ProjectAccess = {
  project: ProjectRow;
  /** The user's role in the project's workspace; null for a guest. */
  workspaceRole: WorkspaceRole | null;
  /** What the project itself was shared with them as, if it was. */
  projectRole: ProjectRole | null;
  actions: Set<Action>;
};

/**
 * The project and what the current user may do in it. Null when it doesn't
 * exist or they have no way in. One query: every server action checks access.
 */
export const getProjectAccess = requestCache(async (projectId: string): Promise<ProjectAccess | null> => {
  const { user } = await requireSession();
  const [row] = await userDb((tx) =>
    tx
      .select({
        project,
        workspaceRole: sql<string | null>`(
          select ${member.role} from ${member}
          where ${member.organizationId} = ${project.organizationId} and ${member.userId} = ${user.id}
          limit 1)`,
        projectRole: sql<ProjectRole | null>`(
          select ${projectMember.role} from ${projectMember}
          where ${projectMember.projectId} = ${project.id} and ${projectMember.userId} = ${user.id}
          limit 1)`,
      })
      .from(project)
      .where(eq(project.id, projectId))
      .limit(1),
  );
  if (!row) return null;
  const workspaceRole = row.workspaceRole ? parseWorkspaceRole(row.workspaceRole) : null;
  const allowed = actionsFor(workspaceRole, row.projectRole);
  if (!allowed.has("read")) return null;
  return { project: row.project, workspaceRole, projectRole: row.projectRole, actions: allowed };
});

/**
 * The one access check (plan.md 2.9): may the signed-in user do `action` in
 * this project? Every server action, API route and the collab token endpoint
 * goes through it, directly or through the helpers below.
 */
export async function can(action: Action, projectId: string): Promise<boolean> {
  return (await getProjectAccess(projectId))?.actions.has(action) ?? false;
}

/** What the current user may do with a project (empty when they can't see it). */
export async function getProjectActions(projectId: string): Promise<Set<Action>> {
  return (await getProjectAccess(projectId))?.actions ?? new Set();
}

/** The project and the user's actions on it. 404s when it doesn't exist or they can't read it. */
export async function requireProjectAccess(projectId: string, action: Action = "read") {
  const access = await getProjectAccess(projectId);
  if (!access) notFound();
  if (!access.actions.has(action)) throw new Error(`You don't have permission to ${action} in this project.`);
  return access;
}

/** Access to one note: the project's, since notes don't have permissions of their own. */
export type NodeAccess = { actions: Set<Action> };

/**
 * Access to every node of a project. Uncached: use this after creating nodes
 * in the same request; otherwise use `getNodeAccess`.
 */
export async function loadNodeAccess(projectId: string): Promise<Map<string, NodeAccess>> {
  const access = await getProjectAccess(projectId);
  if (!access) return new Map();
  const nodes = await userDb((tx) => tx.select({ id: node.id }).from(node).where(eq(node.projectId, projectId)));
  const shared: NodeAccess = { actions: access.actions };
  return new Map(nodes.map((n) => [n.id, shared]));
}

/** Access to every node of a project, once per request. */
export const getNodeAccess = requestCache(loadNodeAccess);

/** Throws (404 for a note that isn't in this project) unless the user may perform `action` on the note. */
export async function requireNodeAccess(projectId: string, nodeId: string, action: Action = "read") {
  const found = await requireProjectAccess(projectId);
  const access = (await getNodeAccess(projectId)).get(nodeId);
  if (!access) notFound();
  if (!access.actions.has(action)) throw new Error(`You don't have permission to ${action} this.`);
  return { project: found.project, access };
}

/** Node ids (from a list) that are in this project, which the user can therefore read. */
export async function readableNodeIds(projectId: string, ids: Iterable<string>) {
  const access = await getNodeAccess(projectId);
  return new Set([...ids].filter((id) => access.has(id)));
}

/** Drops rows that point at notes outside this project. */
export async function filterReadable<T>(projectId: string, rows: T[], ...keys: Array<(row: T) => string | null>) {
  const access = await getNodeAccess(projectId);
  return rows.filter((row) => keys.every((key) => {
    const id = key(row);
    return id === null || access.has(id);
  }));
}
