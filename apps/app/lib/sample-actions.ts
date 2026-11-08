"use server";

import { schema } from "@plotra/db";
import { and, eq, like } from "drizzle-orm";
import { track } from "./analytics";
import { requireSession, requireWorkspace } from "./data";
import { userDb } from "./db";
import { allSuggested } from "./modules";
import { sampleTrack } from "./onboarding/steps";
import { assertCanAddProject } from "./quotas";
import { rateLimit } from "./rate-limit";
import { transaction } from "./request-cache";
import { writeSampleProject } from "./sample-project";
import { buildSample, isSampleId, samples } from "./samples";
import { slugify } from "./slug";

// Sample projects (plan.md Phase 8 "Onboarding"): a new account can open a
// small, finished project instead of an empty one. The samples are data in
// lib/samples; this writes one into a new project of the workspace.

const { project } = schema;

/**
 * Creates a project from a sample and returns where to open it. For members
 * of the workspace only, and counted against its project quota like any other
 * project. Everything is written in one transaction, as the signed-in user:
 * row-level security checks the workspace again on every insert.
 */
export async function createSampleProject(workspaceSlug: string, sampleId: string): Promise<{ href: string }> {
  const created = await transaction(async () => {
    const { user } = await requireSession();
    // 404s for anyone who isn't a member of the workspace.
    const workspace = await requireWorkspace(workspaceSlug);
    if (!isSampleId(sampleId)) throw new Error("That sample doesn't exist.");
    const sample = samples[sampleId];
    // A sample is a few hundred rows; nobody needs many of them in an hour.
    await rateLimit("sample-project", user.id, { limit: 10, windowSeconds: 3600 });
    await assertCanAddProject(workspace.id);

    const projectId = crypto.randomUUID();
    const built = buildSample(sample, { projectId, userId: user.id, newId: () => crypto.randomUUID() });

    const slug = await userDb(async (tx) => {
      const base = slugify(sample.title) || "sample";
      const taken = new Set(
        (await tx.select({ slug: project.slug }).from(project).where(and(eq(project.organizationId, workspace.id), like(project.slug, `${base}%`)))).map((row) => row.slug),
      );
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

      await writeSampleProject(tx, { id: projectId, workspaceId: workspace.id, slug, title: sample.title, type: sample.type, description: sample.logline, userId: user.id, settings: { track: sampleTrack(sample.id), modules: allSuggested(sample.type) } }, built);
      return slug;
    });

    return { userId: user.id, workspaceId: workspace.id, projectId, href: `/w/${workspace.slug}/p/${slug}?open=${built.openNodeId}` };
  });

  // After the transaction has committed, so a failed sample is never counted.
  await track("sample_project_created", { userId: created.userId, workspaceId: created.workspaceId, projectId: created.projectId, properties: { sample: sampleId } });
  return { href: created.href };
}
