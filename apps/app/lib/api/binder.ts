import "server-only";
import { schema } from "@plotra/db";
import {
  canonStatuses,
  knowledgeLayers,
  nodeKinds,
  type CanonStatus,
  type KnowledgeLayer,
  type NodeKind,
  type ProjectLabel,
  type PropertyType,
  type PropertyValue,
} from "@plotra/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { countWithin } from "@/components/workspace/binder-moves";
import { requireNodeAccess, requireProjectAccess } from "../access";
import { listNodes } from "../binder";
import { createNode, deleteNode, duplicateNode, emptyTrash, moveNode, restoreNode, setNodeLabel, setNodeProperties, updateNode } from "../binder-actions";
import { userDb } from "../db";
import { revealMap } from "../horizon";
import { defaultFormat, enabledModules } from "../modules";
import { readOnly, transaction } from "../request-cache";
import { stagesOf } from "../stages";
import { indexNodes, isTrashed, lastPosition, positionAfter } from "../tree";
import { kindLabel } from "../vocabulary";
import { setNodeCanon, setNodeReveal } from "../world-actions";
import { defaultChannels } from "../world";
import { placeFor, type MoveTo } from "./binder-place";
import { ApiError } from "./handler";
import { createApiNote, creatableKinds, listApiReleases, toNote, type ApiNote, type CreatableKind, type NewNote } from "./notes";

// The binder for the phone app (apps/mobile) and the API: moving notes, the
// trash, making every kind of note, and a note's details (custom fields,
// canon, reveal, label). Each one calls the web's own server action, so the
// permissions, positions and initial state are the web's.

const { activity, entityType, propertyDef, user } = schema;

// ---- Making notes ---------------------------------------------------------------

export type NewApiNode = NewNote & { entityTypeId?: string | null; board?: "map" };

/** The kinds of note this project can make, named as the project names them, and its world page types. */
export async function apiBinderOptions(projectId: string) {
  return readOnly(async () => {
    const { project: found } = await requireProjectAccess(projectId);
    const modules = enabledModules(found.type, found.settings);
    // As the web's "+ New" (components/workspace/workspace-provider.tsx creatableKinds); world pages are made per type.
    const kinds: NodeKind[] = ["scene", "chapter", "folder", "note", "character", "location", "research", "canvas", "timeline"];
    if (modules.has("interactive")) kinds.push("dialogue");
    const types = modules.has("world") || modules.has("interactive")
      ? (await userDb((tx) => tx.select({ id: entityType.id, name: entityType.name, color: entityType.color, position: entityType.position }).from(entityType).where(eq(entityType.projectId, projectId)))).sort(
          (a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0),
        )
      : [];
    return {
      kinds: kinds.map((kind) => ({ kind, label: kindLabel(kind, found.settings) })),
      entityTypes: types.map((t) => ({ id: t.id, name: t.name, color: t.color })),
      stages: stagesOf(found.settings).map((s) => ({ id: s.id, label: s.label, color: s.color })),
      labels: found.settings.labels ?? [],
    };
  });
}

/**
 * Makes a note. With text, tags or a synopsis, a text kind is made from them
 * as before (createApiNote); otherwise, and for every other kind, as the
 * web's "+ New" makes it (createNode): the project's template for the kind,
 * a screenplay's scenes in screenplay, a board or timeline ready to use.
 */
export async function createAnyApiNote(projectId: string, input: NewApiNode): Promise<ApiNote> {
  const kind = (input.kind ?? "note") as NodeKind;
  if (!nodeKinds.includes(kind)) throw new ApiError(400, `kind must be one of: ${nodeKinds.join(", ")}.`);
  if (typeof input.title !== "string") throw new ApiError(400, "Give the note a title.");
  const hasText = typeof input.markdown === "string" && input.markdown.trim().length > 0;
  const withExtras = hasText || (Array.isArray(input.tags) && input.tags.length > 0) || (typeof input.synopsis === "string" && input.synopsis.trim().length > 0);
  if (withExtras && creatableKinds.includes(kind as CreatableKind) && !input.entityTypeId) return createApiNote(projectId, input);
  if (hasText) throw new ApiError(400, `Only these can start with text: ${creatableKinds.join(", ")}. Make it, then write to it.`);
  if (!input.title.trim()) throw new ApiError(400, "Give the note a title.");

  const created = await transaction(async () => {
    const { project: found } = await requireProjectAccess(projectId);
    const modules = enabledModules(found.type, found.settings);
    if (kind === "dialogue" && !modules.has("interactive")) throw new ApiError(400, "Dialogues are for interactive projects. Turn on Interactive in the project's settings.");
    const parentId = input.parentId ?? null;
    const index = indexNodes(await listNodes(projectId));
    if (parentId && (!index.byId.has(parentId) || isTrashed(index, parentId))) throw new ApiError(404, "That folder isn't in the binder any more.");
    const node = await createNode(projectId, {
      parentId,
      kind,
      title: input.title,
      position: lastPosition(index, parentId),
      ...(kind === "entity" && input.entityTypeId && { entityTypeId: input.entityTypeId }),
      ...(kind === "scene" && defaultFormat(found.type, found.settings) !== "prose" && { format: defaultFormat(found.type, found.settings) }),
      ...(kind === "canvas" && input.board === "map" && { board: "map" as const }),
    });
    const tags = Array.isArray(input.tags) ? input.tags.filter((t): t is string => typeof t === "string") : [];
    const synopsis = typeof input.synopsis === "string" ? input.synopsis.trim() : "";
    if (tags.length || synopsis) return updateNode(projectId, node.id, { ...(tags.length && { tags }), ...(synopsis && { synopsis }) });
    return node;
  });
  return toNote(created);
}

/** A copy of a note and everything inside it, just after it. Returns the copies, the copy of the note first. */
export async function duplicateApiNote(projectId: string, nodeId: string): Promise<ApiNote[]> {
  const copies = await transaction(async () => {
    const index = indexNodes(await listNodes(projectId));
    if (!index.byId.has(nodeId) || isTrashed(index, nodeId)) throw new ApiError(404, "Not found.");
    return duplicateNode(projectId, nodeId, positionAfter(index, nodeId));
  });
  return copies.map(toNote);
}

// ---- Moving ---------------------------------------------------------------------

/** Moves a note: a step up or down, into a folder (at the end), or next to another note. */
export async function moveApiNote(projectId: string, nodeId: string, to: MoveTo): Promise<ApiNote> {
  if (!to || typeof to !== "object") throw new ApiError(400, "Say where to move it.");
  return toNote(
    await transaction(async () => {
      await requireNodeAccess(projectId, nodeId, "edit");
      const index = indexNodes(await listNodes(projectId));
      const result = placeFor(index, nodeId, to);
      if ("error" in result) throw new ApiError(result.error === "Not found." ? 404 : 400, result.error);
      return moveNode(projectId, nodeId, result.place);
    }),
  );
}

// ---- The trash ------------------------------------------------------------------

export type ApiTrashed = ApiNote & {
  trashedAt: Date;
  /** Who moved it there, when the project's activity says. */
  trashedBy: string | null;
  /** How many notes inside it went with it. */
  inside: number;
};

/** What's in the project's trash, the latest first: each note that went in on its own, not what went in with its folder. */
export async function listApiTrash(projectId: string): Promise<{ notes: ApiTrashed[]; canEmpty: boolean }> {
  return readOnly(async () => {
    const { actions } = await requireProjectAccess(projectId);
    const index = indexNodes(await listNodes(projectId));
    const top = [...index.byId.values()]
      .filter((n) => n.deletedAt && !(n.parentId && isTrashed(index, n.parentId)))
      .sort((a, b) => +new Date(b.deletedAt!) - +new Date(a.deletedAt!));
    const by = new Map<string, string | null>();
    if (top.length) {
      try {
        const rows = await userDb((tx) =>
          tx
            .select({ nodeId: activity.nodeId, name: user.name })
            .from(activity)
            .leftJoin(user, eq(user.id, activity.actorId))
            .where(and(eq(activity.projectId, projectId), eq(activity.verb, "note_trashed"), inArray(activity.nodeId, top.map((n) => n.id))))
            .orderBy(desc(activity.createdAt)),
        );
        for (const r of rows) if (r.nodeId && !by.has(r.nodeId)) by.set(r.nodeId, r.name);
      } catch {
        // Who did it is a nicety; the trash shows without it.
      }
    }
    return {
      notes: top.map((n) => ({ ...toNote(n), trashedAt: n.deletedAt!, trashedBy: by.get(n.id) ?? null, inside: countWithin(index, n.id) - 1 })),
      canEmpty: actions.has("delete"),
    };
  });
}

/** Takes a note out of the trash. If its folder is still there, it comes back at the end of the top level, as on the web. */
export async function restoreApiNote(projectId: string, nodeId: string): Promise<ApiNote> {
  return toNote(
    await transaction(async () => {
      const index = indexNodes(await listNodes(projectId));
      const found = index.byId.get(nodeId);
      if (!found) throw new ApiError(404, "Not found.");
      if (!found.deletedAt) throw new ApiError(400, "It isn't in the trash.");
      return restoreNode(projectId, nodeId, lastPosition(index, null));
    }),
  );
}

/** Deletes a note in the trash, and what's inside it, for good. */
export async function deleteApiNote(projectId: string, nodeId: string): Promise<void> {
  await deleteNode(projectId, nodeId);
}

/** Deletes everything in the trash for good. Returns how many notes went. */
export async function emptyApiTrash(projectId: string): Promise<number> {
  return (await emptyTrash(projectId)).length;
}

// ---- A note's details -----------------------------------------------------------

export type ApiField = { key: string; label: string; type: PropertyType; choices?: string[]; nodeKinds?: string[]; multiple?: boolean };

export type ApiNoteDetails = {
  note: ApiNote;
  /** Its custom fields: its world page type's, or the project's for its kind, in order. */
  fields: ApiField[];
  values: Record<string, PropertyValue>;
  /** The project's statuses (stages), in order. */
  stages: { id: string; label: string; color: string }[];
  /** Null when the project doesn't use canon (the World module is off). */
  canon: CanonStatus | null;
  /** Null when the project has no releases module. */
  reveal: { releaseId: string | null; channel: string | null; layer: KnowledgeLayer; inheritedFrom: { id: string; title: string } | null; channels: string[] } | null;
  label: string | null;
  labels: ProjectLabel[];
  entityTypeId: string | null;
  /** The types a world page can be, when it's one. */
  entityTypes: { id: string; name: string }[];
};

const byPosition = <T extends { position: string }>(a: T, b: T) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0);

export async function readApiNoteDetails(projectId: string, nodeId: string): Promise<ApiNoteDetails> {
  return readOnly(async () => {
    const { project: found } = await requireNodeAccess(projectId, nodeId);
    const nodes = await listNodes(projectId);
    const index = indexNodes(nodes);
    const n = index.byId.get(nodeId);
    if (!n || isTrashed(index, nodeId)) throw new ApiError(404, "Not found.");
    const modules = enabledModules(found.type, found.settings);
    const types = n.kind === "entity" || modules.has("world") ? await userDb((tx) => tx.select({ id: entityType.id, name: entityType.name, schema: entityType.schema, position: entityType.position }).from(entityType).where(eq(entityType.projectId, projectId))) : [];
    types.sort(byPosition);
    // The same fields setNodeProperties accepts: the type's schema for a world page, else the kind's template.
    let fields: ApiField[];
    if (n.entityTypeId) {
      fields = (types.find((t) => t.id === n.entityTypeId)?.schema ?? []).map((f) => ({ key: f.key, label: f.label, type: f.type, ...optionsOf(f.options) }));
    } else {
      const defs = await userDb((tx) =>
        tx
          .select({ key: propertyDef.key, label: propertyDef.label, type: propertyDef.type, options: propertyDef.options, position: propertyDef.position })
          .from(propertyDef)
          .where(and(eq(propertyDef.projectId, projectId), eq(propertyDef.nodeKind, n.kind))),
      );
      fields = defs.sort(byPosition).map((d) => ({ key: d.key, label: d.label, type: d.type, ...optionsOf(d.options) }));
    }
    let reveal: ApiNoteDetails["reveal"] = null;
    if (modules.has("releases")) {
      const releases = await listApiReleases(projectId);
      const inherited = n.revealReleaseId ? null : (revealMap(nodes, releases).get(n.id) ?? null);
      const from = inherited ? releases.find((r) => r.id === inherited) : undefined;
      reveal = {
        releaseId: n.revealReleaseId,
        channel: n.revealChannel,
        layer: n.layer,
        inheritedFrom: from ? { id: from.id, title: from.title } : null,
        channels: found.settings.channels?.length ? found.settings.channels : defaultChannels,
      };
    }
    const label = typeof n.settings?.label === "string" ? n.settings.label : null;
    return {
      note: toNote(n),
      fields,
      values: n.properties ?? {},
      stages: stagesOf(found.settings).map((s) => ({ id: s.id, label: s.label, color: s.color })),
      canon: modules.has("world") ? n.canon : null,
      reveal,
      label: label && found.settings.labels?.some((l) => l.id === label) ? label : null,
      labels: found.settings.labels ?? [],
      entityTypeId: n.entityTypeId,
      entityTypes: n.kind === "entity" ? types.map((t) => ({ id: t.id, name: t.name })) : [],
    };
  });
}

function optionsOf(options: { choices?: string[]; nodeKinds?: string[]; multiple?: boolean } | undefined) {
  return {
    ...(options?.choices?.length && { choices: options.choices }),
    ...(options?.nodeKinds?.length && { nodeKinds: options.nodeKinds }),
    ...(options?.multiple && { multiple: true }),
  };
}

export type DetailsPatch = {
  /** Field values by key; null clears one. */
  properties?: Record<string, unknown>;
  canon?: CanonStatus;
  /** Needed to retcon: what changed and why. */
  canonReason?: string;
  canonReleaseId?: string | null;
  reveal?: { releaseId?: string | null; channel?: string | null; layer?: KnowledgeLayer };
  label?: string | null;
  entityTypeId?: string;
};

/** Changes a note's fields, canon, reveal, label or world page type, all or nothing, and returns its details. */
export async function updateApiNoteDetails(projectId: string, nodeId: string, patch: DetailsPatch): Promise<ApiNoteDetails> {
  if (patch.canon !== undefined && !canonStatuses.includes(patch.canon)) throw new ApiError(400, `canon must be one of: ${canonStatuses.join(", ")}.`);
  if (patch.reveal?.layer !== undefined && !knowledgeLayers.includes(patch.reveal.layer)) throw new ApiError(400, 'layer must be "truth" or "belief".');
  if (patch.properties !== undefined && (typeof patch.properties !== "object" || patch.properties === null || Array.isArray(patch.properties))) throw new ApiError(400, "properties must be an object.");
  await transaction(async () => {
    const index = indexNodes(await listNodes(projectId));
    const n = index.byId.get(nodeId);
    if (!n || isTrashed(index, nodeId)) throw new ApiError(404, "Not found.");
    // The type first: the fields that follow are the new type's.
    if (patch.entityTypeId !== undefined && n.kind === "entity" && patch.entityTypeId !== n.entityTypeId) await updateNode(projectId, nodeId, { entityTypeId: patch.entityTypeId });
    if (patch.properties && Object.keys(patch.properties).length) await setNodeProperties(projectId, nodeId, patch.properties);
    if (patch.canon !== undefined && patch.canon !== n.canon) await setNodeCanon(projectId, nodeId, { canon: patch.canon, reason: patch.canonReason, releaseId: patch.canonReleaseId ?? null });
    if (patch.reveal && Object.keys(patch.reveal).length) await setNodeReveal(projectId, nodeId, patch.reveal);
    if (patch.label !== undefined) await setNodeLabel(projectId, nodeId, patch.label);
  });
  return readApiNoteDetails(projectId, nodeId);
}
