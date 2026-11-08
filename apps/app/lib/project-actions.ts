"use server";

import { cleanLabels, cleanVocabulary } from "./vocabulary";
import { AUTO_EVERY_MINUTES, autoVersionChoices } from "./versions";
import { cleanFrontMatter, type FrontMatter } from "./io/front-matter";
import { schema } from "@plotra/db";
import {
  moduleIds,
  projectTypes,
  scriptFormats,
  type ModuleId,
  type NodeKind,
  type ProjectSettings,
  type ProjectType,
  type WorkflowStage,
} from "@plotra/db/schema";
import { and, asc, eq, isNotNull, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { getProjectActions, requireProjectAccess } from "./access";
import { track } from "./analytics";
import { isApiRequest, requireSession } from "./data";
import { userDb } from "./db";
import { r2Delete } from "./r2";
import { readOnly, transaction } from "./request-cache";
import { cleanStages } from "./stages";
import { isDocumentKind } from "./story";

// Project settings (plan.md 2.8 "Project types & modules"): the type, which
// modules are on, the default script format, the editorial workflow, reveal
// channels, languages and the shared world bible.

const { project, version, attachment, node } = schema;

const LOCALE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const MAX_TITLE = 120;

export type ProjectConfig = {
  title: string;
  description: string | null;
  type: ProjectType;
  settings: ProjectSettings;
  worldId: string | null;
};

export type SettingsPatch = {
  modules?: Partial<Record<ModuleId, boolean | null>>;
  format?: ProjectSettings["format"] | null;
  stages?: WorkflowStage[] | null;
  channels?: string[];
  sourceLocale?: string | null;
  locales?: string[];
  citationStyle?: ProjectSettings["citationStyle"];
  wordTarget?: number | null;
  /** The project's own words for kinds of note; a kind left out, or set to the app's word, goes back to it. */
  vocabulary?: Record<string, string>;
  /** Whether the project is offered in its workspace as a template for new ones. */
  template?: boolean;
  /** The project's colour labels, as a whole list. */
  labels?: Array<{ id?: string; name: string; color: string }>;
  /** Copyright page, dedication and epigraph, as a whole (lib/io/front-matter.ts). */
  frontMatter?: FrontMatter;
  /** Minutes between automatic versions (lib/versions.ts); 0 for none, null for the default. */
  autoVersionMinutes?: number | null;
  /** The note new notes of one kind start as a copy of (lib/note-templates.ts), or null to stop: one kind at a time. */
  noteTemplate?: { kind: NodeKind; nodeId: string | null };
};

const cleanNames = (values: unknown, max: number, length: number) =>
  Array.isArray(values) ? [...new Set(values.map((v) => String(v).trim().slice(0, length)).filter(Boolean))].slice(0, max) : [];

export async function getProjectConfig(projectId: string): Promise<ProjectConfig> {
  return readOnly(async () => {
    const { project: found } = await requireProjectAccess(projectId);
    return { title: found.title, description: found.description, type: found.type, settings: found.settings, worldId: found.worldId };
  });
}

/**
 * Merges a patch into the project's settings. Modules, the workflow and the
 * default format change the project for everyone, so they need `manage`;
 * channels, languages and the citation style need `edit`.
 */
export async function updateProjectSettings(projectId: string, patch: SettingsPatch): Promise<ProjectSettings> {
  const saved = await transaction(async () => {
    const structural =
      patch.modules !== undefined ||
      patch.stages !== undefined ||
      patch.format !== undefined ||
      patch.vocabulary !== undefined ||
      patch.labels !== undefined ||
      patch.template !== undefined ||
      patch.autoVersionMinutes !== undefined ||
      patch.noteTemplate !== undefined;
    const { project: found } = await requireProjectAccess(projectId, structural ? "manage" : "edit");
    const next: ProjectSettings = { ...found.settings };

    if (patch.modules) {
      const modules = { ...next.modules };
      for (const id of moduleIds) {
        const value = patch.modules[id];
        if (value === null) delete modules[id];
        else if (typeof value === "boolean") modules[id] = value;
      }
      next.modules = modules;
    }
    if (patch.format !== undefined) {
      if (patch.format === null) delete next.format;
      else if (scriptFormats.includes(patch.format)) next.format = patch.format;
      else throw new Error("Unknown format.");
    }
    if (patch.stages !== undefined) {
      if (patch.stages === null) delete next.stages;
      else next.stages = cleanStages(patch.stages);
    }
    if (patch.template === true) next.template = true;
    else if (patch.template === false) delete next.template;
    if (patch.vocabulary !== undefined) next.vocabulary = cleanVocabulary(patch.vocabulary);
    if (patch.labels !== undefined) next.labels = cleanLabels(patch.labels, () => crypto.randomUUID());
    if (patch.channels !== undefined) next.channels = cleanNames(patch.channels, 20, 40);
    if (patch.locales !== undefined) {
      const locales = cleanNames(patch.locales, 30, 20);
      if (locales.some((l) => !LOCALE.test(l))) throw new Error("Languages are codes like fr, de or pt-BR.");
      next.locales = locales;
    }
    if (patch.sourceLocale !== undefined) {
      if (patch.sourceLocale === null) delete next.sourceLocale;
      else if (LOCALE.test(patch.sourceLocale)) next.sourceLocale = patch.sourceLocale;
      else throw new Error("Languages are codes like en, fr or pt-BR.");
    }
    if (patch.citationStyle !== undefined) {
      if (!["apa", "mla", "chicago"].includes(patch.citationStyle)) throw new Error("Unknown citation style.");
      next.citationStyle = patch.citationStyle;
    }

    if (patch.noteTemplate !== undefined) {
      const { kind, nodeId } = patch.noteTemplate ?? {};
      if (!kind || !isDocumentKind(kind) || kind === "folder") throw new Error("Only a kind of text note can have a template.");
      const templates = { ...next.noteTemplates };
      if (nodeId === null) delete templates[kind];
      else {
        const [row] = await userDb((tx) =>
          tx.select({ kind: node.kind, deletedAt: node.deletedAt }).from(node).where(and(eq(node.id, String(nodeId)), eq(node.projectId, projectId))).limit(1),
        );
        if (!row || row.deletedAt) throw new Error("That note isn't in this project any more.");
        if (row.kind !== kind) throw new Error("A template is a note of the kind it's for.");
        templates[kind] = String(nodeId);
      }
      if (Object.keys(templates).length) next.noteTemplates = templates;
      else delete next.noteTemplates;
    }
    if (patch.autoVersionMinutes !== undefined) {
      if (patch.autoVersionMinutes === null || patch.autoVersionMinutes === AUTO_EVERY_MINUTES) delete next.autoVersionMinutes;
      else if ((autoVersionChoices as readonly number[]).includes(patch.autoVersionMinutes)) next.autoVersionMinutes = patch.autoVersionMinutes;
      else throw new Error("Choose how often versions are kept.");
    }
    if (patch.frontMatter !== undefined) {
      const front = cleanFrontMatter(patch.frontMatter);
      if (Object.keys(front).length) next.frontMatter = front;
      else delete next.frontMatter;
    }

    if (patch.wordTarget !== undefined) {
      const words = Math.round(Number(patch.wordTarget));
      if (patch.wordTarget === null || words === 0) delete next.wordTarget;
      else if (Number.isFinite(words) && words > 0 && words <= 10_000_000) next.wordTarget = words;
      else throw new Error("A target is a number of words.");
    }

    await userDb((tx) => tx.update(project).set({ settings: next }).where(eq(project.id, projectId)));
    return next;
  });
  // The page comes back re-rendered in this same response: one round trip, not a second one for `router.refresh()`.
  // Not for the phone app's API calls: there's no page, and refresh() throws outside a server action.
  if (!isApiRequest()) refresh();
  return saved;
}

/** Title, description, type and the shared world bible. Needs `manage`. */
export async function updateProject(
  projectId: string,
  patch: { title?: string; description?: string | null; type?: ProjectType; worldId?: string | null },
): Promise<void> {
  await transaction(async () => {
    const { project: found } = await requireProjectAccess(projectId, "manage");
    const values: Partial<typeof project.$inferInsert> = {};
    if (patch.title !== undefined) {
      const title = patch.title.trim().slice(0, MAX_TITLE);
      if (!title) throw new Error("Give the project a title.");
      values.title = title;
    }
    if (patch.description !== undefined) values.description = patch.description?.trim().slice(0, 2000) || null;
    if (patch.type !== undefined) {
      if (!projectTypes.includes(patch.type)) throw new Error("Unknown project type.");
      values.type = patch.type;
    }
    if (patch.worldId !== undefined) {
      if (patch.worldId) {
        if (patch.worldId === projectId) throw new Error("A project can't share its own world with itself.");
        const [world] = await userDb((tx) =>
          tx
            .select({ id: project.id, worldId: project.worldId })
            .from(project)
            .where(and(eq(project.id, patch.worldId!), eq(project.organizationId, found.organizationId))),
        );
        if (!world || !(await getProjectActions(world.id)).has("read")) throw new Error("That project isn't available.");
        // One level only: a world's own world isn't followed.
        if (world.worldId) throw new Error("That project uses a shared world itself. Link to that world instead.");
      }
      values.worldId = patch.worldId;
    }
    if (Object.keys(values).length) await userDb((tx) => tx.update(project).set(values).where(eq(project.id, projectId)));
  });
  if (!isApiRequest()) refresh();
}

/**
 * Deletes the project and everything in it, for everyone it's shared with.
 * Needs `manage`, and the title typed back so a slip can't do it. The rows go
 * by cascade (projects that used it as their world just lose the link); its
 * snapshots and uploads in object storage go once that has committed.
 */
export async function deleteProject(projectId: string, typedTitle: string): Promise<void> {
  const { user } = await requireSession();
  const { keys, workspaceId } = await transaction(async () => {
    const { project: found } = await requireProjectAccess(projectId, "manage");
    if (typedTitle.trim() !== found.title.trim()) throw new Error("Type the project's title exactly to delete it.");
    return userDb(async (tx) => {
      const snapshots = await tx.select({ key: version.r2Key }).from(version).where(and(eq(version.projectId, projectId), isNotNull(version.r2Key)));
      const files = await tx.select({ key: attachment.r2Key }).from(attachment).where(and(eq(attachment.projectId, projectId), isNotNull(attachment.r2Key)));
      await tx.delete(project).where(eq(project.id, projectId));
      return { keys: [...snapshots, ...files].map((row) => row.key!), workspaceId: found.organizationId };
    });
  });
  // A few at a time: a long-lived project can hold thousands of snapshots.
  for (let i = 0; i < keys.length; i += 50) await r2Delete(keys.slice(i, i + 50));
  await track("project_deleted", { userId: user.id, workspaceId, projectId });
}

export type WorldCandidate = { id: string; title: string; type: ProjectType; slug: string };

/** Other projects in the workspace this one could use as its shared world bible. */
export async function listWorldCandidates(projectId: string): Promise<WorldCandidate[]> {
  return readOnly(async () => {
    const { project: found } = await requireProjectAccess(projectId);
    const rows = await userDb((tx) =>
      tx
        .select({ id: project.id, title: project.title, type: project.type, slug: project.slug, worldId: project.worldId })
        .from(project)
        .where(and(eq(project.organizationId, found.organizationId), ne(project.id, projectId)))
        .orderBy(asc(project.title)),
    );
    const readable = await Promise.all(rows.map(async (r) => (await getProjectActions(r.id)).has("read")));
    return rows.filter((r, i) => readable[i] && !r.worldId).map(({ id, title, type, slug }) => ({ id, title, type, slug }));
  });
}
