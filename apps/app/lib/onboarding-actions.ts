"use server";

import { schema } from "@plotra/db";
import type { ModuleId } from "@plotra/db/schema";
import { and, eq, like } from "drizzle-orm";
import { track } from "./analytics";
import { requireSession, requireWorkspace } from "./data";
import { userDb } from "./db";
import { seedFromAnswers } from "./onboarding/seed";
import { cleanAnswers } from "./onboarding/tracks";
import { assertCanAddProject } from "./quotas";
import { rateLimit } from "./rate-limit";
import { transaction } from "./request-cache";
import { writeSampleProject } from "./sample-project";
import { buildSample, type BuiltSample } from "./samples/build";
import { slugify } from "./slug";
import { trackVocabulary } from "./vocabulary";

// The Cold Open (onboarding-plan.md 2.1): a new project made from a few
// answers instead of a form. What was answered becomes notes that link to each
// other, and the project opens on its first document with the cursor in it.

const { project } = schema;

/**
 * The modules a new project needs beyond its type's own (lib/modules.ts): the
 * answers may have made a secret someone knows, a release, or a line that is
 * never revealed, and those live in "Releases & reveals".
 */
function modulesFor(built: BuiltSample): Partial<Record<ModuleId, boolean>> {
  const reveals = built.releases.length > 0 || built.knowledge.length > 0 || built.facts.some((fact) => fact.reveal);
  return reveals ? { releases: true } : {};
}

/**
 * Creates a project from the Cold Open's answers and returns where to open it.
 * With no answers it is a blank project of that type. For members of the
 * workspace only, counted against its project quota, and written in one
 * transaction as the signed-in user, like a sample (lib/sample-actions.ts).
 */
export async function createProjectFromAnswers(workspaceSlug: string, input: unknown): Promise<{ href: string }> {
  const created = await transaction(async () => {
    const { user } = await requireSession();
    // 404s for anyone who isn't a member of the workspace.
    const workspace = await requireWorkspace(workspaceSlug);
    // Never trusted as sent: strings only, cut to length, unknown choices dropped.
    const answers = cleanAnswers(input);
    await rateLimit("cold-open", user.id, { limit: 20, windowSeconds: 3600 });
    await assertCanAddProject(workspace.id);

    const seed = seedFromAnswers(answers);
    const projectId = crypto.randomUUID();
    const built = buildSample(seed, { projectId, userId: user.id, newId: () => crypto.randomUUID() });

    const slug = await userDb(async (tx) => {
      const base = slugify(seed.title) || "untitled";
      const taken = new Set(
        (await tx.select({ slug: project.slug }).from(project).where(and(eq(project.organizationId, workspace.id), like(project.slug, `${base}%`)))).map((row) => row.slug),
      );
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

      await writeSampleProject(
        tx,
        { id: projectId, workspaceId: workspace.id, slug, title: seed.title, type: seed.type, description: null, userId: user.id, settings: { track: seed.track, modules: modulesFor(built), vocabulary: trackVocabulary[seed.track] } },
        built,
      );
      return slug;
    });

    const answered = [answers.who, answers.where, answers.drive].filter(Boolean).length;
    return {
      userId: user.id,
      workspaceId: workspace.id,
      projectId,
      properties: { type: seed.type, track: seed.track, from: "cold_open", answered },
      // `caret=end`: the cursor goes after the links the first document opens with.
      href: `/w/${workspace.slug}/p/${slug}?open=${built.openNodeId}&caret=end`,
    };
  });

  // After the transaction has committed, so a failed project is never counted.
  await track("project_created", { userId: created.userId, workspaceId: created.workspaceId, projectId: created.projectId, properties: created.properties });
  return { href: created.href };
}
