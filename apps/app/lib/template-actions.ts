"use server";

import { schema } from "@plotra/db";
import { and, asc, eq, isNull, like } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { track } from "./analytics";
import { gregorian } from "./calendar";
import { requireSession, requireWorkspace } from "./data";
import { userDb } from "./db";
import { defaultFormat } from "./modules";
import { assertCanAddProject } from "./quotas";
import { rateLimit } from "./rate-limit";
import { transaction } from "./request-cache";
import { writeSampleProject } from "./sample-project";
import type { BuiltNode, BuiltSample } from "./samples/build";
import { slugify } from "./slug";

// Project templates (onboarding-plan.md 4.2). A template is a project its
// managers have marked as one (`settings.template`). Starting from it copies
// the project's shape and none of its writing: its type, modules, words,
// labels and workflow; its property definitions, kinds and calendars; and the
// folders and chapters of its binder, empty.

const { project, node, propertyDef, entityType, calendar } = schema;

/**
 * Creates a project shaped like a template of the same workspace and returns
 * where to open it. For members of the workspace, counted against its project
 * quota, and written in one transaction like a sample.
 */
export async function createProjectFromTemplate(workspaceSlug: string, templateId: string): Promise<{ href: string }> {
  const created = await transaction(async () => {
    const { user } = await requireSession();
    // 404s for anyone who isn't a member of the workspace.
    const workspace = await requireWorkspace(workspaceSlug);
    await rateLimit("from-template", user.id, { limit: 20, windowSeconds: 3600 });
    await assertCanAddProject(workspace.id);

    return userDb(async (tx) => {
      // Row-level security already limits this to what the person can read; the workspace has to be this one.
      const [source] = await tx
        .select()
        .from(project)
        .where(and(eq(project.id, String(templateId)), eq(project.organizationId, workspace.id)))
        .limit(1);
      if (!source?.settings?.template) throw new Error("That template isn't in this workspace any more.");

      const projectId = crypto.randomUUID();
      const [defs, types, calendars, containers] = await Promise.all([
        tx.select().from(propertyDef).where(eq(propertyDef.projectId, source.id)),
        tx.select().from(entityType).where(eq(entityType.projectId, source.id)),
        tx.select().from(calendar).where(eq(calendar.projectId, source.id)),
        tx
          .select({ id: node.id, parentId: node.parentId, kind: node.kind, title: node.title, position: node.position })
          .from(node)
          .where(and(eq(node.projectId, source.id), isNull(node.deletedAt)))
          .orderBy(asc(node.position)),
      ]);

      // The binder's skeleton: folders and chapters whose every ancestor is one too (so nothing hangs off a trashed or skipped note).
      const byId = new Map(containers.map((row) => [row.id, row]));
      const isContainer = (row: (typeof containers)[number]) => row.kind === "folder" || row.kind === "chapter";
      const kept = (row: (typeof containers)[number] | undefined): boolean => Boolean(row) && isContainer(row!) && (row!.parentId === null || kept(byId.get(row!.parentId)));
      const skeleton = containers.filter((row) => kept(row));
      const ids = new Map(skeleton.map((row) => [row.id, crypto.randomUUID()]));

      const format = defaultFormat(source.type, source.settings);
      const blank = (row: Pick<BuiltNode, "id" | "parentId" | "kind" | "title" | "position"> & { settings?: BuiltNode["settings"] }): BuiltNode => ({
        projectId,
        aliases: [],
        entityTypeId: null,
        canon: "draft",
        revealReleaseId: null,
        layer: "truth",
        synopsis: null,
        properties: {},
        settings: {},
        text: "",
        headings: [],
        contentTags: [],
        wordCount: 0,
        createdById: user.id,
        // No content: the collab server seeds a note's body from its kind's template.
        content: null,
        ...row,
      });
      // Somewhere to start writing: an empty scene in the first chapter, or the first folder, or on its own.
      const home = skeleton.find((row) => row.kind === "chapter") ?? skeleton[0];
      const sceneId = crypto.randomUUID();
      const nodes: BuiltNode[] = [
        ...skeleton.map((row) => blank({ id: ids.get(row.id)!, parentId: row.parentId ? ids.get(row.parentId)! : null, kind: row.kind, title: row.title, position: row.position })),
        blank({
          id: sceneId,
          parentId: home ? ids.get(home.id)! : null,
          kind: "scene",
          title: "Untitled scene",
          // First inside its container; after everything else at the root.
          position: generateKeyBetween(home ? null : (skeleton.filter((row) => row.parentId === null).at(-1)?.position ?? null), null),
          ...(format !== "prose" && { settings: { format } }),
        }),
      ];

      const built: BuiltSample = {
        openNodeId: sceneId,
        ids: new Map(),
        propertyDefs: defs.map((def) => ({ projectId, nodeKind: def.nodeKind, key: def.key, label: def.label, type: def.type, options: def.options, position: def.position })),
        entityTypes: types.map((type) => ({ id: crypto.randomUUID(), projectId, name: type.name, plural: type.plural, icon: type.icon, color: type.color, schema: type.schema, builtin: type.builtin, position: type.position })),
        calendars: calendars.map((c) => ({ id: crypto.randomUUID(), projectId, name: c.name, definition: c.definition })),
        releases: [],
        nodes,
        links: [],
        facts: [],
        threads: [],
        cells: [],
        relationships: [],
        events: [],
        knowledge: [],
        setups: [],
        calendar: gregorian,
      };

      const base = slugify(`${source.title} copy`) || "untitled";
      const taken = new Set((await tx.select({ slug: project.slug }).from(project).where(and(eq(project.organizationId, workspace.id), like(project.slug, `${base}%`)))).map((row) => row.slug));
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

      // The new project is a project, not another template.
      const settings = { ...source.settings };
      delete settings.template;
      // Its note templates are notes of the template project's, which don't come along.
      delete settings.noteTemplates;
      await writeSampleProject(
        tx,
        { id: projectId, workspaceId: workspace.id, slug, title: `Untitled, from ${source.title}`.slice(0, 120), type: source.type, description: null, userId: user.id, settings },
        built,
      );
      return { userId: user.id, workspaceId: workspace.id, projectId, type: source.type, href: `/w/${workspace.slug}/p/${slug}?open=${sceneId}` };
    });
  });

  // After the transaction has committed, so a failed project is never counted.
  await track("project_created", { userId: created.userId, workspaceId: created.workspaceId, projectId: created.projectId, properties: { type: created.type, from: "template" } });
  return { href: created.href };
}
