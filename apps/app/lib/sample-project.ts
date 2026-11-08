import "server-only";
import { schema } from "@plotra/db";
import type { Tx } from "@plotra/db/rls";
import type { ProjectSettings, ProjectType } from "@plotra/db/schema";
import { eq } from "drizzle-orm";
import { valueToYdoc } from "./collab/ydoc";
import type { BuiltSample } from "./samples/build";

const { project, node, propertyDef, entityType, calendar, release, link, fact, plotThread, sceneThread, relationship, timelineEvent, knowledge, setupPayoff } = schema;

/**
 * Writes a built sample (lib/samples/build.ts) into a new project, on the
 * caller's transaction: all of it lands or none of it does. Not an endpoint;
 * `createSampleProject` (lib/sample-actions.ts) does the access checks.
 */
export async function writeSampleProject(
  tx: Tx,
  input: { id: string; workspaceId: string; slug: string; title: string; type: ProjectType; description: string | null; userId: string; settings?: ProjectSettings },
  built: BuiltSample,
): Promise<void> {
  await tx.insert(project).values({
    id: input.id,
    organizationId: input.workspaceId,
    slug: input.slug,
    title: input.title,
    type: input.type,
    description: input.description,
    ...(input.settings && { settings: input.settings }),
    createdById: input.userId,
  });
  // The same templates and entity types a blank project gets on first open
  // (ensureDefaultPropertyDefs, ensureWorldDefaults), which then find nothing to add.
  if (built.propertyDefs.length) await tx.insert(propertyDef).values(built.propertyDefs);
  if (built.entityTypes.length) await tx.insert(entityType).values(built.entityTypes);
  if (built.calendars.length) await tx.insert(calendar).values(built.calendars);
  // Releases and notes point at each other (a note is revealed by a release, a
  // release ships a folder): releases go in first without their folder.
  if (built.releases.length) await tx.insert(release).values(built.releases.map((r) => ({ ...r, nodeId: null })));
  await tx.insert(node).values(
    // Each note carries its Yjs snapshot, so the collab server starts from it (lib/collab/sync.ts).
    built.nodes.map(({ content, ...row }) => ({ ...row, ...(content && { ydoc: valueToYdoc(content) }) })),
  );
  for (const r of built.releases) if (r.nodeId) await tx.update(release).set({ nodeId: r.nodeId }).where(eq(release.id, r.id));
  if (built.links.length) await tx.insert(link).values(built.links);
  if (built.facts.length) await tx.insert(fact).values(built.facts);
  if (built.threads.length) await tx.insert(plotThread).values(built.threads);
  if (built.cells.length) await tx.insert(sceneThread).values(built.cells);
  if (built.relationships.length) await tx.insert(relationship).values(built.relationships);
  if (built.events.length) await tx.insert(timelineEvent).values(built.events);
  if (built.knowledge.length) await tx.insert(knowledge).values(built.knowledge);
  if (built.setups.length) await tx.insert(setupPayoff).values(built.setups);
}
