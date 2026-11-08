"use server";

import { schema } from "@plotra/db";
import { and, eq, like } from "drizzle-orm";
import { requireProjectAccess } from "./access";
import { track } from "./analytics";
import { requireSession, requireWorkspace } from "./data";
import { userDb } from "./db";
import { duplicateTitle } from "./duplicate";
import { buildPublicCopyFile, importPlotraFile } from "./io/plotra-file";
import { assertCanAddProject } from "./quotas";
import { rateLimit } from "./rate-limit";
import { transaction } from "./request-cache";
import { slugify } from "./slug";

// "Duplicate" on a project card: a copy of a project in its own workspace.
// It goes the way a public copy does (lib/public-copy-actions.ts): the project
// packed as a `.plotra` file and imported, so every id is fresh and the Yjs
// documents are rewritten in place (lib/io/plotra-file.ts). It carries the
// notes outside the trash with their documents, properties, settings and story
// tools, and the files in them; not version history, comments or the trash.
// The duplicate shares the original's world rather than copying it.

const { project } = schema;

/**
 * Duplicates a project into the same workspace as "<title> (copy)" and
 * returns where to open it. For members of the workspace who can read the
 * project, counted against its project and storage limits like any new one.
 */
export async function duplicateProject(workspaceSlug: string, projectId: string): Promise<{ href: string; title: string }> {
  const created = await transaction(async () => {
    const { user } = await requireSession();
    // Projects are made by members of the workspace: a guest it was shared with can't.
    const workspace = await requireWorkspace(String(workspaceSlug));
    const { project: source } = await requireProjectAccess(String(projectId));
    if (source.organizationId !== workspace.id) throw new Error("That project isn't in this workspace.");
    await rateLimit("duplicate-project", user.id, { limit: 20, windowSeconds: 3600 });
    await assertCanAddProject(workspace.id);

    // Read with the server's connection once access is checked, as a public copy is.
    const file = await buildPublicCopyFile(source.id);
    const imported = await importPlotraFile(workspace.slug, file.data);

    const title = duplicateTitle(source.title);
    const slug = await userDb(async (tx) => {
      const base = slugify(title) || "untitled";
      const taken = new Set(
        (await tx.select({ slug: project.slug }).from(project).where(and(eq(project.organizationId, workspace.id), like(project.slug, `${base}%`)))).map((row) => row.slug),
      );
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
      await tx
        .update(project)
        .set({ title, slug, worldId: source.worldId && source.worldId !== source.id ? source.worldId : null })
        .where(eq(project.id, imported.projectId));
      return slug;
    });
    return { userId: user.id, workspaceId: workspace.id, projectId: imported.projectId, type: source.type, title, href: `/w/${workspace.slug}/p/${slug}` };
  });

  // After the transaction has committed, so a failed copy is never counted.
  await track("project_created", { userId: created.userId, workspaceId: created.workspaceId, projectId: created.projectId, properties: { type: created.type, from: "duplicate" } });
  return { href: created.href, title: created.title };
}
