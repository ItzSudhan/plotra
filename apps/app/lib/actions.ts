"use server";

import { db, schema } from "@plotra/db";
import { projectTypes, type ProjectType } from "@plotra/db/schema";
import { and, eq, like } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { redirect } from "next/navigation";
import { track } from "./analytics";
import { requireSession, requireWorkspace } from "./data";
import { publicMessage } from "./errors";
import { typeFormat } from "./modules";
import { assertCanAddProject } from "./quotas";
import { slugify } from "./slug";

const { project, node } = schema;

export type CreateProjectState = { error?: string } | null;

export async function createProject(
  workspaceSlug: string,
  _: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const { user } = await requireSession();
  const workspace = await requireWorkspace(workspaceSlug);

  const title = String(formData.get("title") ?? "").trim();
  const type = String(formData.get("type") ?? "novel") as ProjectType;
  if (!title) return { error: "Give your project a title." };
  if (title.length > 120) return { error: "Keep the title under 120 characters." };
  if (!projectTypes.includes(type)) return { error: "Pick a project type." };
  try {
    await assertCanAddProject(workspace.id);
  } catch (error) {
    return { error: publicMessage(error) };
  }

  const slug = await uniqueProjectSlug(workspace.id, slugify(title) || "untitled");
  // A new project starts with one empty scene, and opens on it with the cursor
  // in the text (plan.md Phase 8 "Onboarding": writing within two minutes).
  const sceneId = crypto.randomUUID();
  const format = typeFormat[type];
  await db.transaction(async (tx) => {
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
  });
  await track("project_created", { userId: user.id, workspaceId: workspace.id, properties: { type } });

  redirect(`/w/${workspace.slug}/p/${slug}?open=${sceneId}`);
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
