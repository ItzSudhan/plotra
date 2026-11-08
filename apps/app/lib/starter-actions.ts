"use server";

import { schema } from "@plotra/db";
import { and, eq, like } from "drizzle-orm";
import { track } from "./analytics";
import { requireSession, requireWorkspace } from "./data";
import { userDb } from "./db";
import { trackOf } from "./onboarding/tracks";
import { assertCanAddProject } from "./quotas";
import { rateLimit } from "./rate-limit";
import { transaction } from "./request-cache";
import { writeSampleProject } from "./sample-project";
import { buildSample } from "./samples/build";
import { isStarterId } from "./starters/catalog";
import { starters } from "./starters/starters";
import { slugify } from "./slug";
import { trackVocabulary } from "./vocabulary";

// Starter templates (lib/starters): a new project with a structure for its
// kind of writing and none of the writing. Written like a sample
// (lib/sample-actions.ts), in one transaction as the signed-in user.

const { project } = schema;

/**
 * Creates a project from a starter template and returns where to open it: on
 * its first scene. For members of the workspace only, and counted against its
 * project quota like any other project. `title`, when given, is what the
 * project is called (and its address made from) instead of the starter's name:
 * the title typed into "New project".
 */
export async function createStarterProject(workspaceSlug: string, starterId: string, title?: string): Promise<{ href: string }> {
  const created = await transaction(async () => {
    const { user } = await requireSession();
    // 404s for anyone who isn't a member of the workspace.
    const workspace = await requireWorkspace(workspaceSlug);
    if (!isStarterId(starterId)) throw new Error("That starter doesn't exist.");
    const starter = starters[starterId];
    const typed = typeof title === "string" ? title.trim() : "";
    if (typed.length > 120) throw new Error("Keep the title under 120 characters.");
    const projectTitle = typed || starter.title;
    await rateLimit("starter-project", user.id, { limit: 20, windowSeconds: 3600 });
    await assertCanAddProject(workspace.id);

    const projectId = crypto.randomUUID();
    const built = buildSample(starter, { projectId, userId: user.id, newId: () => crypto.randomUUID() });
    const onTrack = trackOf(starter.type);

    const slug = await userDb(async (tx) => {
      const base = slugify(projectTitle) || "untitled";
      const taken = new Set(
        (await tx.select({ slug: project.slug }).from(project).where(and(eq(project.organizationId, workspace.id), like(project.slug, `${base}%`)))).map((row) => row.slug),
      );
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

      await writeSampleProject(
        tx,
        {
          id: projectId,
          workspaceId: workspace.id,
          slug,
          title: projectTitle,
          type: starter.type,
          description: null,
          userId: user.id,
          settings: {
            track: onTrack,
            // A starter that ships its parts as releases (books, sessions, episodes) needs "Releases & reveals".
            modules: built.releases.length ? { releases: true } : {},
            vocabulary: trackVocabulary[onTrack],
          },
        },
        built,
      );
      return slug;
    });

    return { userId: user.id, workspaceId: workspace.id, projectId, type: starter.type, href: `/w/${workspace.slug}/p/${slug}?open=${built.openNodeId}` };
  });

  // After the transaction has committed, so a failed project is never counted.
  await track("project_created", {
    userId: created.userId,
    workspaceId: created.workspaceId,
    projectId: created.projectId,
    properties: { type: created.type, from: "starter", starter: starterId },
  });
  return { href: created.href };
}
