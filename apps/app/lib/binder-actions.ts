"use server";

import { schema } from "@plotra/db";
import { fromTemplate } from "./note-templates";
import {
  nodeKinds,
  scriptFormats,
  type NodeKind,
  type NodeProperties,
  type NodeStatus,
  type PropertyValue,
  type ScriptFormat,
} from "@plotra/db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { requireNodeAccess, requireProjectAccess } from "./access";
import { binderColumns, listNodes, withActions, type BinderNode } from "./binder";
import { requireSession } from "./data";
import { userDb, type Tx } from "./db";
import { normalizeTag } from "./doc-index";
import { logActivity } from "./notify";
import { recheckRoom } from "./agent/collab-service";
import { roomName } from "./collab/rooms";
import { assertUnlocked, guardNodeUpdate } from "./editorial-guard";
import { readOnly, transaction } from "./request-cache";
import { stagesOf } from "./stages";
import { isDocumentKind } from "./story";

const { node, project, propertyDef, link, entityType } = schema;

const MAX_TITLE = 200;
const MAX_SYNOPSIS = 2000;
const MAX_LIST = 50;
// Fractional-index keys stay short in practice; this only stops abuse.
const MAX_POSITION = 256;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type NodeRow = Parameters<typeof withActions>[1][number];

function cleanTitle(title: string) {
  const trimmed = title.trim().slice(0, MAX_TITLE);
  return trimmed || "Untitled";
}

function cleanList(values: string[], clean: (v: string) => string) {
  return [...new Set(values.map(clean).filter(Boolean))].slice(0, MAX_LIST);
}

function assertPosition(position: string) {
  if (!position || position.length > MAX_POSITION) throw new Error("Invalid position.");
}

/** Throws unless the user may add things under `parentId` (a live node they can edit, or the project root). */
async function assertCanCreateIn(projectId: string, parentId: string | null) {
  if (!parentId) {
    await requireProjectAccess(projectId, "edit");
    return;
  }
  await requireNodeAccess(projectId, parentId, "edit");
  const [parent] = await userDb((tx) => tx.select({ deletedAt: node.deletedAt }).from(node).where(eq(node.id, parentId)));
  if (parent?.deletedAt) throw new Error("That folder is in the trash.");
}

async function one(projectId: string, row: NodeRow, fresh = false): Promise<BinderNode> {
  const [withAccess] = await withActions(projectId, [row], fresh);
  if (!withAccess) throw new Error("That note is no longer visible to you.");
  return withAccess;
}

async function touchProject(tx: Tx, projectId: string) {
  await tx.update(project).set({ updatedAt: new Date() }).where(eq(project.id, projectId));
}

/** The whole binder again, for refreshing after someone else changed it. */
export async function getBinder(projectId: string): Promise<BinderNode[]> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    return listNodes(projectId);
  });
}

async function assertEntityType(projectId: string, typeId: string) {
  const [type] = await userDb((tx) =>
    tx.select({ id: entityType.id }).from(entityType).where(and(eq(entityType.id, typeId), eq(entityType.projectId, projectId))),
  );
  if (!type) throw new Error("That type no longer exists.");
}

export async function createNode(
  projectId: string,
  /** `id` lets the client show the node before this returns (a fresh UUID; a taken one fails the insert). */
  input: {
    id?: string;
    parentId: string | null;
    kind: NodeKind;
    title: string;
    position: string;
    /** The custom type of an `entity`. */
    entityTypeId?: string | null;
    /** The script format the document is written in (lib/modules.ts); prose when absent. */
    format?: ScriptFormat;
    /** A canvas made as a map (lib/canvas.ts). */
    board?: "map";
  },
): Promise<BinderNode> {
  return transaction(async () => {
    const { user } = await requireSession();
    if (!nodeKinds.includes(input.kind)) throw new Error("Unknown node kind.");
    if (input.id !== undefined && !UUID.test(input.id)) throw new Error("Invalid id.");
    if (input.format !== undefined && !scriptFormats.includes(input.format)) throw new Error("Unknown format.");
    assertPosition(input.position);
    await assertCanCreateIn(projectId, input.parentId);
    const typeId = input.kind === "entity" ? (input.entityTypeId ?? null) : null;
    if (typeId) await assertEntityType(projectId, typeId);
    // A kind with a template of the project's own starts as a copy of it (lib/note-templates.ts).
    const { project: owner } = await requireProjectAccess(projectId);
    const template = await fromTemplate(projectId, owner.settings, input.kind);

    const created = await userDb(async (tx) => {
      const [row] = await tx
        .insert(node)
        .values({
          ...(input.id && { id: input.id }),
          projectId,
          parentId: input.parentId,
          kind: input.kind,
          title: cleanTitle(input.title),
          position: input.position,
          entityTypeId: typeId,
          ...(input.format && input.format !== "prose" && { settings: { format: input.format } }),
          ...(input.kind === "canvas" && input.board === "map" && { settings: { board: "map" } }),
          createdById: user.id,
          // No content: the collab server seeds the body from the kind's template (lib/collab/seed), unless the project has a template note for it.
          ...(template && { ...template, settings: { ...(input.format && input.format !== "prose" && { format: input.format }), fromTemplate: true } }),
        })
        .returning(binderColumns);
      await touchProject(tx, projectId);
      return row as NodeRow;
    });
    await logActivity(projectId, "note_created", { nodeId: created.id, payload: { title: created.title } });
    return one(projectId, created, true);
  });
}

export async function updateNode(
  projectId: string,
  nodeId: string,
  patch: {
    title?: string;
    kind?: NodeKind;
    status?: NodeStatus;
    synopsis?: string | null;
    aliases?: string[];
    tags?: string[];
    /** Moves an `entity` to another custom type, or turns a note into one. */
    entityTypeId?: string | null;
  },
): Promise<BinderNode> {
  let locks = false;
  const updated = await transaction(async () => {
    const { project: found } = await requireNodeAccess(projectId, nodeId, "edit");
    await guardNodeUpdate(projectId, nodeId, patch);
    const values: Partial<typeof node.$inferInsert> = {};
    // The title as it was, for the activity feed ("renamed X to Y").
    let renamedFrom: string | null = null;
    if (patch.title !== undefined) {
      values.title = cleanTitle(patch.title);
      const [before] = await userDb((tx) => tx.select({ title: node.title }).from(node).where(eq(node.id, nodeId)));
      if (before && before.title !== values.title) renamedFrom = before.title;
    }
    if (patch.kind !== undefined) {
      if (!nodeKinds.includes(patch.kind)) throw new Error("Unknown node kind.");
      const [current] = await userDb((tx) => tx.select({ kind: node.kind }).from(node).where(eq(node.id, nodeId)));
      // Canvases and timelines aren't text documents, so they can't become one (or the reverse).
      if (current && current.kind !== patch.kind && (!isDocumentKind(current.kind) || !isDocumentKind(patch.kind))) {
        throw new Error("Canvases and timelines can't change kind.");
      }
      values.kind = patch.kind;
      if (patch.kind !== "entity") values.entityTypeId = null;
    }
    if (patch.entityTypeId !== undefined) {
      if (patch.entityTypeId) await assertEntityType(projectId, patch.entityTypeId);
      values.entityTypeId = patch.entityTypeId;
    }
    if (patch.status !== undefined) {
      const stage = stagesOf(found.settings).find((s) => s.id === patch.status);
      if (!stage) throw new Error("Unknown status.");
      values.status = patch.status;
      locks = stage.locked === true;
    }
    if (patch.synopsis !== undefined) values.synopsis = patch.synopsis?.slice(0, MAX_SYNOPSIS) || null;
    if (patch.aliases !== undefined) values.aliases = cleanList(patch.aliases, (a) => a.trim().slice(0, MAX_TITLE));
    if (patch.tags !== undefined) values.tags = cleanList(patch.tags, normalizeTag);

    const [updated] = await userDb((tx) => tx.update(node).set(values).where(eq(node.id, nodeId)).returning(binderColumns));
    if (renamedFrom !== null) await logActivity(projectId, "note_renamed", { nodeId, payload: { title: values.title, from: renamedFrom } });
    return one(projectId, updated as NodeRow);
  });
  // Into a locked stage: editors who have the note open lose write access now, not when their token runs out.
  if (locks) await recheckRoom(roomName({ kind: "node", id: nodeId }));
  return updated;
}

/** Gives a note one of the project's colour labels (`ProjectSettings.labels`), or takes its label off. */
export async function setNodeLabel(projectId: string, nodeId: string, labelId: string | null): Promise<BinderNode> {
  return transaction(async () => {
    const { project: found } = await requireNodeAccess(projectId, nodeId, "edit");
    await assertUnlocked(projectId, nodeId);
    if (labelId !== null && !found.settings?.labels?.some((label) => label.id === labelId)) throw new Error("This project has no such label.");
    const [updated] = await userDb(async (tx) => {
      const [current] = await tx.select({ settings: node.settings }).from(node).where(eq(node.id, nodeId));
      const settings = { ...current?.settings };
      if (labelId === null) delete settings.label;
      else settings.label = labelId;
      return tx.update(node).set({ settings }).where(eq(node.id, nodeId)).returning(binderColumns);
    });
    return one(projectId, updated as NodeRow);
  });
}

function cleanPropertyValue(type: string, value: unknown): PropertyValue {
  if (value === null || value === undefined || value === "") return null;
  switch (type) {
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case "checkbox":
      return Boolean(value);
    case "multi_select":
      return Array.isArray(value) ? cleanList(value.map(String), (v) => v.trim().slice(0, 80)) : null;
    case "node":
      if (Array.isArray(value)) return cleanList(value.map(String), (v) => v.slice(0, 64));
      return String(value).slice(0, 64);
    default:
      return String(value).slice(0, 2000);
  }
}

/** Rebuilds the links a node's `node`-typed properties make, so they show in backlinks and the graph. */
async function syncPropertyLinks(tx: Tx, projectId: string, nodeId: string, properties: NodeProperties, nodeTypedKeys: string[]) {
  await tx.delete(link).where(and(eq(link.sourceNodeId, nodeId), eq(link.kind, "property")));
  const targets = nodeTypedKeys.flatMap((key) => {
    const value = properties[key];
    return (Array.isArray(value) ? value : value ? [String(value)] : []).map((target) => ({ key, target }));
  });
  if (!targets.length) return;
  const existing = new Set(
    (
      await tx
        .select({ id: node.id })
        .from(node)
        .where(and(eq(node.projectId, projectId), inArray(node.id, targets.map((t) => t.target))))
    ).map((r) => r.id),
  );
  const rows = targets
    .filter((t) => existing.has(t.target) && t.target !== nodeId)
    .map((t, ordinal) => ({ projectId, sourceNodeId: nodeId, targetNodeId: t.target, kind: "property" as const, context: t.key, ordinal }));
  if (rows.length) await tx.insert(link).values(rows);
}

/** Sets (or clears, with null) typed property values on a node. */
export async function setNodeProperties(
  projectId: string,
  nodeId: string,
  patch: Record<string, unknown>,
): Promise<BinderNode> {
  return transaction(async () => {
    await requireNodeAccess(projectId, nodeId, "edit");
    await assertUnlocked(projectId, nodeId);
    const updated = await userDb(async (tx) => {
      const [current] = await tx
        .select({ kind: node.kind, properties: node.properties, entityTypeId: node.entityTypeId })
        .from(node)
        .where(eq(node.id, nodeId));
      // A custom entity's fields come from its type's schema; every other kind's from its template.
      const defs: Array<{ key: string; type: string }> = current.entityTypeId
        ? ((await tx.select({ schema: entityType.schema }).from(entityType).where(eq(entityType.id, current.entityTypeId)))[0]?.schema ?? [])
        : await tx
            .select({ key: propertyDef.key, type: propertyDef.type })
            .from(propertyDef)
            .where(and(eq(propertyDef.projectId, projectId), eq(propertyDef.nodeKind, current.kind)));
      const types = new Map(defs.map((d) => [d.key, d.type]));
      const next: NodeProperties = { ...current.properties };
      for (const [key, value] of Object.entries(patch)) {
        const type = types.get(key);
        if (!type) throw new Error(`“${key}” isn't a property of this kind of note.`);
        const clean = cleanPropertyValue(type, value);
        if (clean === null || (Array.isArray(clean) && clean.length === 0)) delete next[key];
        else next[key] = clean;
      }
      const [row] = await tx.update(node).set({ properties: next }).where(eq(node.id, nodeId)).returning(binderColumns);
      await syncPropertyLinks(
        tx,
        projectId,
        nodeId,
        next,
        defs.filter((d) => d.type === "node").map((d) => d.key),
      );
      return row as NodeRow;
    });
    return one(projectId, updated);
  });
}

export async function moveNode(
  projectId: string,
  nodeId: string,
  to: { parentId: string | null; position: string },
): Promise<BinderNode> {
  return transaction(async () => {
    await requireNodeAccess(projectId, nodeId, "edit");
    await assertUnlocked(projectId, nodeId);
    assertPosition(to.position);
    await assertCanCreateIn(projectId, to.parentId);

    const moved = await userDb(async (tx) => {
      // Refuse to move a node into itself or one of its own descendants.
      const parents = new Map(
        (await tx.select({ id: node.id, parentId: node.parentId }).from(node).where(eq(node.projectId, projectId))).map(
          (row) => [row.id, row.parentId],
        ),
      );
      for (let cursor = to.parentId; cursor; cursor = parents.get(cursor) ?? null) {
        if (cursor === nodeId) throw new Error("Can't move a folder inside itself.");
      }
      const [row] = await tx
        .update(node)
        .set({ parentId: to.parentId, position: to.position })
        .where(eq(node.id, nodeId))
        .returning(binderColumns);
      return row as NodeRow;
    });
    return one(projectId, moved);
  });
}

export async function trashNode(projectId: string, nodeId: string): Promise<BinderNode> {
  return transaction(async () => {
    await requireNodeAccess(projectId, nodeId, "delete");
    await assertUnlocked(projectId, nodeId, { subtree: true });
    const [trashed] = await userDb((tx) =>
      tx.update(node).set({ deletedAt: new Date() }).where(eq(node.id, nodeId)).returning(binderColumns),
    );
    await logActivity(projectId, "note_trashed", { nodeId, payload: { title: (trashed as NodeRow).title } });
    return one(projectId, trashed as NodeRow);
  });
}

/** Restores a node. If its parent is still in the trash, it comes back at the root. */
export async function restoreNode(projectId: string, nodeId: string, rootPosition: string): Promise<BinderNode> {
  return transaction(async () => {
    await requireNodeAccess(projectId, nodeId, "delete");
    assertPosition(rootPosition);

    const restored = await userDb(async (tx) => {
      const all = new Map(
        (
          await tx
            .select({ id: node.id, parentId: node.parentId, deletedAt: node.deletedAt })
            .from(node)
            .where(eq(node.projectId, projectId))
        ).map((row) => [row.id, row]),
      );
      let parentGone = false;
      for (let cursor = all.get(all.get(nodeId)?.parentId ?? ""); cursor; cursor = all.get(cursor.parentId ?? "")) {
        if (cursor.deletedAt) {
          parentGone = true;
          break;
        }
      }
      if (parentGone) await requireProjectAccess(projectId, "edit");
      const [row] = await tx
        .update(node)
        .set(parentGone ? { deletedAt: null, parentId: null, position: rootPosition } : { deletedAt: null })
        .where(eq(node.id, nodeId))
        .returning(binderColumns);
      return row as NodeRow;
    });
    await logActivity(projectId, "note_restored", { nodeId, payload: { title: restored.title } });
    return one(projectId, restored, true);
  });
}

/** Permanently deletes a trashed node and everything inside it. */
export async function deleteNode(projectId: string, nodeId: string): Promise<void> {
  return transaction(async () => {
    await requireNodeAccess(projectId, nodeId, "delete");
    await userDb(async (tx) => {
      const [row] = await tx.select({ deletedAt: node.deletedAt }).from(node).where(eq(node.id, nodeId));
      if (!row?.deletedAt) throw new Error("Move it to the trash first.");
      await tx.delete(node).where(eq(node.id, nodeId));
    });
  });
}

/** Deletes everything in the trash. Returns the ids that went. */
export async function emptyTrash(projectId: string): Promise<string[]> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "delete");
    return userDb(async (tx) => {
      const trashed = await tx
        .select({ id: node.id })
        .from(node)
        .where(and(eq(node.projectId, projectId), isNotNull(node.deletedAt)));
      const ids = trashed.map((row) => row.id);
      if (ids.length) await tx.delete(node).where(inArray(node.id, ids));
      return ids;
    });
  });
}

export async function duplicateNode(projectId: string, nodeId: string, position: string): Promise<BinderNode[]> {
  return transaction(async () => {
    const { user } = await requireSession();
    const { project: found } = await requireNodeAccess(projectId, nodeId, "read");
    assertPosition(position);
    // A copy is a new draft: one of a note in a locked stage starts at the first stage, where it can be
    // edited, rather than in a lock whose reviewers (set on the original) wouldn't follow it.
    const stages = stagesOf(found.settings);
    const lockedStages = new Set(stages.filter((stage) => stage.locked).map((stage) => stage.id));
    const statusOf = (status: string) => (lockedStages.has(status) ? stages[0].id : status);

    const rows = await userDb(async (tx) => {
      const all = await tx.select().from(node).where(eq(node.projectId, projectId));
      const source = all.find((n) => n.id === nodeId)!;
      await assertCanCreateIn(projectId, source.parentId);
      // Copy the whole subtree, keeping each child's order.
      const children = new Map<string, typeof all>();
      for (const row of all) {
        if (!row.parentId || row.deletedAt) continue;
        children.set(row.parentId, [...(children.get(row.parentId) ?? []), row]);
      }

      const copies: Array<typeof node.$inferInsert> = [];
      const copy = (row: (typeof all)[number], parentId: string | null, at: string, title: string) => {
        const id = crypto.randomUUID();
        copies.push({
          id,
          projectId,
          parentId,
          kind: row.kind,
          title,
          aliases: row.aliases,
          position: at,
          status: statusOf(row.status),
          entityTypeId: row.entityTypeId,
          canon: row.canon,
          revealReleaseId: row.revealReleaseId,
          revealChannel: row.revealChannel,
          layer: row.layer,
          settings: row.settings,
          synopsis: row.synopsis,
          tags: row.tags,
          properties: row.properties,
          content: row.content,
          ydoc: row.ydoc,
          text: row.text,
          headings: row.headings,
          contentTags: row.contentTags,
          wordCount: row.wordCount,
          createdById: user.id,
        });
        for (const child of children.get(row.id) ?? []) copy(child, id, child.position, child.title);
      };
      copy(source, source.parentId, position, cleanTitle(`${source.title} copy`));
      const inserted = await tx.insert(node).values(copies).returning(binderColumns);
      await touchProject(tx, projectId);
      return inserted as NodeRow[];
    });
    return withActions(projectId, rows, true);
  });
}
