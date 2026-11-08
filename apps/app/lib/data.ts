import "server-only";
import { auth } from "@plotra/auth";
import { schema } from "@plotra/db";
import { withUser } from "@plotra/db/rls";
import { and, asc, desc, eq, notInArray } from "drizzle-orm";
import { AsyncLocalStorage } from "node:async_hooks";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requestCache } from "./request-cache";
import { getProjectAccess } from "./access";

const { member, organization, project, projectMember } = schema;

// Keyed on the request's headers object so every server action, writes
// included, looks the session up once rather than once per access check.
const sessions = new WeakMap<object, ReturnType<typeof auth.api.getSession>>();

export type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

// A request made with an API token (lib/api) acts as the token's owner: the
// session is theirs, not a cookie's, for everything the request does.
const apiActor = new AsyncLocalStorage<Session>();

/** Runs `fn` as `session`'s user, whatever cookies came with the request. Only lib/api calls this. */
export function runAsApiUser<T>(session: Session, fn: () => Promise<T>): Promise<T> {
  return apiActor.run(session, fn);
}

/** True while handling a request made with an API token. */
export const isApiRequest = () => apiActor.getStore() !== undefined;

export const getSession = requestCache(async (): Promise<Session | null> => {
  const actor = apiActor.getStore();
  if (actor) return actor;
  const requestHeaders = await headers();
  let session = sessions.get(requestHeaders);
  if (!session) sessions.set(requestHeaders, (session = auth.api.getSession({ headers: requestHeaders })));
  return session;
});

export const requireSession = requestCache(async () => {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
});

/** Workspaces (Better Auth organizations) the current user belongs to. */
export const listWorkspaces = requestCache(async () => {
  const { user } = await requireSession();
  return withUser(user.id, (tx) =>
    tx
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, user.id))
    .orderBy(asc(organization.name)),
  );
});

export type Workspace = Awaited<ReturnType<typeof listWorkspaces>>[number];

/** The workspace for a URL slug, or a 404 if the user isn't a member. */
export const requireWorkspace = requestCache(async (slug: string) => {
  const workspace = (await listWorkspaces()).find((w) => w.slug === slug);
  if (!workspace) notFound();
  return workspace;
});

/** Every project of a workspace, for its members (who can all open them: plan.md 2.9). */
export const listProjects = requestCache(async (workspaceId: string) => {
  const { user } = await requireSession();
  return withUser(user.id, (tx) =>
    tx.select().from(project).where(eq(project.organizationId, workspaceId)).orderBy(desc(project.updatedAt)),
  );
});

/** Projects shared with the current user in workspaces they aren't a member of. */
export const listSharedProjects = requestCache(async () => {
  const { user } = await requireSession();
  return withUser(user.id, (tx) =>
    tx
      .select({
        id: project.id,
        slug: project.slug,
        title: project.title,
        type: project.type,
        updatedAt: project.updatedAt,
        role: projectMember.role,
        workspaceName: organization.name,
        workspaceSlug: organization.slug,
      })
      .from(projectMember)
      .innerJoin(project, eq(project.id, projectMember.projectId))
      .innerJoin(organization, eq(organization.id, project.organizationId))
      .where(
        and(
          eq(projectMember.userId, user.id),
          notInArray(project.organizationId, tx.select({ id: member.organizationId }).from(member).where(eq(member.userId, user.id))),
        ),
      )
      .orderBy(desc(project.updatedAt)),
  );
});

export type SharedProject = Awaited<ReturnType<typeof listSharedProjects>>[number];

/**
 * A project by URL, with the user's access to it. 404s when they can't read
 * it. The workspace doesn't have to be theirs: a guest reaches a project
 * shared with them through the same URL, with `role: null`.
 */
export const requireProject = requestCache(async (workspaceSlug: string, projectSlug: string) => {
  const { user } = await requireSession();
  const [found] = await withUser(user.id, (tx) =>
    tx
      .select({ id: project.id, workspace: { id: organization.id, name: organization.name, slug: organization.slug, logo: organization.logo } })
      .from(project)
      .innerJoin(organization, eq(organization.id, project.organizationId))
      .where(and(eq(organization.slug, workspaceSlug), eq(project.slug, projectSlug)))
      .limit(1),
  );
  const access = found ? await getProjectAccess(found.id) : null;
  if (!found || !access) notFound();
  return {
    workspace: { ...found.workspace, role: access.workspaceRole },
    project: access.project,
    actions: access.actions,
    isGuest: access.workspaceRole === null,
  };
});
