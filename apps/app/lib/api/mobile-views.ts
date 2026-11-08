import "server-only";
import { schema } from "@plotra/db";
import type { CanonStatus, EntityField, NodeKind, NodeProperties, NodeSettings, PropertyOptions, PropertyType } from "@plotra/db/schema";
import { eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { requireNodeAccess, requireProjectAccess } from "../access";
import { listNodes } from "../binder";
import { moveNode, setNodeProperties } from "../binder-actions";
import { userDb } from "../db";
import { getNodeLinks, listPropertyDefs } from "../knowledge-actions";
import { readOnly } from "../request-cache";
import { getStory, type CalendarRow, type PlotThread, type SceneThreadCell } from "../story-actions";
import { indexNodes, liveChildren, type BinderNode } from "../tree";
import { ApiError } from "./handler";

// What the phone's story views need (app/api/mobile/views, and
// apps/mobile/src/lib/views-api.ts on the other end): the timeline, the
// corkboard, the plot grid and the codex. They're the web's own server
// functions (lib/story-actions.ts, lib/knowledge-actions.ts,
// lib/binder-actions.ts), called as the token's owner, so the same access
// checks apply. This file only shapes what goes over the wire.

const { entityType } = schema;

/** A note as the views see it: what the binder list has, plus its fields and board settings. */
export type ViewNode = {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
  synopsis: string | null;
  tags: string[];
  aliases: string[];
  status: string | null;
  wordCount: number;
  updatedAt: Date;
  canEdit: boolean;
  revealReleaseId: string | null;
  position: string;
  properties: NodeProperties;
  settings: NodeSettings;
  entityTypeId: string | null;
  canon: CanonStatus;
  /** Its colour label (project settings), if it has one. */
  label: { name: string; color: string } | null;
};

export type ViewPropertyDef = { id: string; nodeKind: NodeKind; key: string; label: string; type: PropertyType; options: PropertyOptions; position: string };
export type ViewEntityType = { id: string; name: string; plural: string; icon: string; color: string; schema: EntityField[]; position: string };

export type ViewsData = {
  /** Every live note, in binder order. */
  nodes: ViewNode[];
  threads: PlotThread[];
  cells: SceneThreadCell[];
  calendars: CalendarRow[];
  propertyDefs: ViewPropertyDef[];
  entityTypes: ViewEntityType[];
  /** Whether the caller may change project-wide things: add a plot thread, say. */
  canEditProject: boolean;
};

/** Everything the four views draw from, in one request, so the phone can keep it for offline. */
export async function getMobileViews(projectId: string): Promise<ViewsData> {
  return readOnly(async () => {
    const access = await requireProjectAccess(projectId);
    const labels = new Map((access.project.settings?.labels ?? []).map((l) => [l.id, l]));
    const [all, story, defs, types] = await Promise.all([
      listNodes(projectId),
      getStory(projectId),
      listPropertyDefs(projectId),
      userDb((tx) =>
        tx
          .select({ id: entityType.id, name: entityType.name, plural: entityType.plural, icon: entityType.icon, color: entityType.color, schema: entityType.schema, position: entityType.position })
          .from(entityType)
          .where(eq(entityType.projectId, projectId)),
      ),
    ]);
    const index = indexNodes(all);
    const nodes: ViewNode[] = [];
    const walk = (parentId: string | null) => {
      for (const n of liveChildren(index, parentId)) {
        nodes.push(toViewNode(n, labels));
        walk(n.id);
      }
    };
    walk(null);
    return {
      nodes,
      threads: story.threads,
      cells: story.cells,
      calendars: story.calendars,
      propertyDefs: defs.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0)),
      entityTypes: types.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0)),
      canEditProject: access.actions.has("edit"),
    };
  });
}

export function toViewNode(n: BinderNode, labels: Map<string, { name: string; color: string }> = new Map()): ViewNode {
  const labelId = typeof n.settings?.label === "string" ? n.settings.label : null;
  const label = labelId ? labels.get(labelId) : undefined;
  return {
    id: n.id,
    parentId: n.parentId,
    kind: n.kind,
    title: n.title,
    synopsis: n.synopsis,
    tags: n.tags,
    aliases: n.aliases,
    status: n.status,
    wordCount: n.wordCount,
    updatedAt: n.updatedAt,
    canEdit: n.actions.includes("edit"),
    revealReleaseId: n.revealReleaseId,
    position: n.position,
    properties: n.properties ?? {},
    settings: n.settings ?? {},
    entityTypeId: n.entityTypeId,
    canon: n.canon,
    label: label ? { name: label.name, color: label.color } : null,
  };
}

/** The notes that link to this one (its "Mentioned in"), first link of each with its context. */
export async function getMobileBacklinks(projectId: string, nodeId: string): Promise<Array<{ id: string; context: string | null }>> {
  const { backlinks } = await getNodeLinks(projectId, nodeId);
  const seen = new Map<string, string | null>();
  for (const b of backlinks) if (!seen.has(b.sourceNodeId)) seen.set(b.sourceNodeId, b.context ?? null);
  return [...seen].map(([id, context]) => ({ id, context }));
}

/** Sets fields on a note (null clears one), as the web's inspector does. */
export async function setMobileProperties(projectId: string, nodeId: string, patch: unknown): Promise<ViewNode> {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new ApiError(400, "Send the fields to set, as { key: value }.");
  return toViewNode(await setNodeProperties(projectId, nodeId, patch as Record<string, unknown>));
}

/**
 * Moves a note among its siblings: right after `afterId`, or first when that's
 * null. The phone sends where, not a position key, so it needn't know how
 * positions are made. The note stays in the same folder.
 */
export async function moveMobileNote(projectId: string, nodeId: string, afterId: string | null): Promise<ViewNode> {
  const siblings = await readOnly(async () => {
    await requireNodeAccess(projectId, nodeId, "edit");
    const index = indexNodes(await listNodes(projectId));
    const self = index.byId.get(nodeId);
    if (!self) throw new ApiError(404, "Not found.");
    return { parentId: self.parentId, list: liveChildren(index, self.parentId).filter((n) => n.id !== nodeId) };
  });
  const at = afterId ? siblings.list.findIndex((n) => n.id === afterId) : -1;
  if (afterId && at < 0) throw new ApiError(400, "That card isn't in the same place any more. Pull to refresh and try again.");
  const before = at >= 0 ? siblings.list[at].position : null;
  const after = siblings.list[at + 1]?.position ?? null;
  return toViewNode(await moveNode(projectId, nodeId, { parentId: siblings.parentId, position: generateKeyBetween(before, after) }));
}
