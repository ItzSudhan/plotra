import "server-only";
import { db, schema } from "@plotra/db";
import { projectTypes, type ProjectType } from "@plotra/db/schema";
import { and, eq, like } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { track } from "./analytics";
import { requireSession, requireWorkspace } from "./data";
import { typeFormat } from "./modules";
import { assertCanAddProject } from "./quotas";
import { slugify } from "./slug";

// Starting an empty project: the web's "New project" (lib/actions.ts
// createProject) and the phone app (app/api/mobile/settings/new-project) both
// come here. Not a server action itself: callers decide where to go next.

const { project, node } = schema;

/** Creates the project with one empty scene. Throws a message fit to show when the input or the quota says no. */
export async function startEmptyProject(workspaceSlug: string, input: { title: unknown; type: unknown }) {
  const { user } = await requireSession();
  const workspace = await requireWorkspace(workspaceSlug);

  const title = String(input.title ?? "").trim();
  const type = String(input.type ?? "novel") as ProjectType;
  if (!title) throw new Error("Give your project a title.");
  if (title.length > 120) throw new Error("Keep the title under 120 characters.");
  if (!projectTypes.includes(type)) throw new Error("Pick a project type.");
  await assertCanAddProject(workspace.id);

  const slug = await uniqueProjectSlug(workspace.id, slugify(title) || "untitled");
  // A new project starts with one empty scene, and opens on it with the cursor
  // in the text (plan.md Phase 8 "Onboarding": writing within two minutes).
  const sceneId = crypto.randomUUID();
  const format = typeFormat[type];
  const projectId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(project)
      .values({
        organizationId: workspace.id,
        slug,
        title,
        type,
        createdById: user.id,
      })
      .returning({ id: project.id });
    await tx.insert(node).values({
      id: sceneId,
      projectId: created.id,
      kind: "scene",
      title: "Untitled scene",
      position: generateKeyBetween(null, null),
      // Scenes are written in the type's format: a screenplay's first scene is a screenplay page.
      ...(format !== "prose" && { settings: { format } }),
      createdById: user.id,
    });
    return created.id;
  });
  await track("project_created", { userId: user.id, workspaceId: workspace.id, properties: { type } });
  return { projectId, sceneId, slug, workspaceSlug: workspace.slug, title, type };
}

async function uniqueProjectSlug(workspaceId: string, base: string) {
  const taken = new Set(
    (
      await db
        .select({ slug: project.slug })
        .from(project)
        .where(and(eq(project.organizationId, workspaceId), like(project.slug, `${base}%`)))
    ).map((row) => row.slug),
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
