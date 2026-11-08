import "server-only";
import type { CanonStatus, NodeKind } from "@plotra/db/schema";
import { moveNode, restoreNode, setNodeProperties, trashNode, updateNode } from "../binder-actions";
import { listNodes } from "../binder";
import { canvasMaps } from "../canvas";
import { transaction } from "../request-cache";
import {
  createRelationship,
  createTimelineEvent,
  deleteRelationship,
  deleteThread,
  deleteTimelineEvent,
  setSceneThread,
  updateRelationship,
  updateTimelineEvent,
} from "../story-actions";
import { indexNodes, isTrashed, lastPosition } from "../tree";
import { deleteComment } from "../workflow-actions";
import { deleteKnowledge, deleteSetup, setNodeCanon } from "../world-actions";
import { checkpointValue, type RunChange } from "./changes";
import { editBoard, restoreDocument, type WriteContext } from "./write";

// "Undo run" (plan.md 2.11 "Checkpoints"): takes back everything a run
// changed, newest change first. Each way back is the same server action a
// person would use, run as the person undoing, so it passes through the same
// access checks and editorial locks. A change that can't be undone any more
// (the note was deleted since, someone locked it) is reported and the rest
// still go.

type Before = Record<string, unknown>;
const str = (value: unknown) => (typeof value === "string" ? value : "");
const strOrNull = (value: unknown) => (typeof value === "string" ? value : null);

async function undoOne(context: WriteContext, change: RunChange, created: ReadonlySet<string>): Promise<void> {
  const { projectId } = context;
  const before: Before = change.before ?? {};
  const nodeId = change.nodeId;
  switch (change.action) {
    case "content": {
      // A note the run itself created goes to the trash whole; its text needs no restoring.
      if (!nodeId || created.has(nodeId) || !change.beforeVersionId) return;
      const saved = await checkpointValue(change.beforeVersionId);
      if (!saved) throw new Error("its checkpoint is no longer in the version history");
      await restoreDocument(context, nodeId, saved.value);
      return;
    }
    case "create": {
      if (!nodeId) return;
      const index = indexNodes(await listNodes(projectId));
      if (index.byId.has(nodeId) && !isTrashed(index, nodeId)) await trashNode(projectId, nodeId);
      return;
    }
    case "update":
      if (nodeId) {
        await updateNode(projectId, nodeId, {
          ...(typeof before.title === "string" && { title: before.title }),
          ...(typeof before.kind === "string" && { kind: before.kind as NodeKind }),
          ...(typeof before.status === "string" && { status: before.status }),
          ...("synopsis" in before && { synopsis: strOrNull(before.synopsis) }),
          ...(Array.isArray(before.tags) && { tags: before.tags.map(String) }),
          ...(Array.isArray(before.aliases) && { aliases: before.aliases.map(String) }),
        });
      }
      return;
    case "properties":
      if (nodeId && before.values && typeof before.values === "object") await setNodeProperties(projectId, nodeId, before.values as Record<string, unknown>);
      return;
    case "move":
      if (nodeId) await moveNode(projectId, nodeId, { parentId: strOrNull(before.parentId), position: str(before.position) });
      return;
    case "trash":
      if (nodeId) await restoreNode(projectId, nodeId, lastPosition(indexNodes(await listNodes(projectId)), null));
      return;
    case "canon":
      if (nodeId && typeof before.canon === "string") {
        await setNodeCanon(projectId, nodeId, { canon: before.canon as CanonStatus, reason: "Undoing a change made by the AI" });
      }
      return;
    case "relationship-create":
      await deleteRelationship(projectId, str(before.id));
      return;
    case "relationship-update":
      await updateRelationship(projectId, str(before.id), { type: str(before.type), label: strOrNull(before.label), directed: Boolean(before.directed) });
      return;
    case "relationship-delete":
      await createRelationship(projectId, {
        fromNodeId: str(before.fromNodeId),
        toNodeId: str(before.toNodeId),
        type: str(before.type),
        label: strOrNull(before.label),
        directed: Boolean(before.directed),
      });
      return;
    case "thread-create":
      await deleteThread(projectId, str(before.id));
      return;
    case "scene-thread":
      if (nodeId) await setSceneThread(projectId, nodeId, str(before.threadId), strOrNull(before.note));
      return;
    case "event-create":
      await deleteTimelineEvent(projectId, str(before.timelineId), str(before.id));
      return;
    case "event-update":
      await updateTimelineEvent(projectId, str(before.timelineId), str(before.id), before.values as Parameters<typeof updateTimelineEvent>[3]);
      return;
    case "event-delete":
      await createTimelineEvent(projectId, str(before.timelineId), before.values as Parameters<typeof createTimelineEvent>[2]);
      return;
    case "cards-add": {
      if (!nodeId || !Array.isArray(before.cardIds)) return;
      const ids = new Set(before.cardIds.map(String));
      await editBoard(context, nodeId, (doc) => {
        const { cards, edges } = canvasMaps(doc);
        doc.transact(() => {
          for (const id of ids) cards.delete(id);
          // An arrow can't point at a card that is gone.
          for (const [edgeId, edge] of edges.entries()) if (ids.has(edge.source) || ids.has(edge.target)) edges.delete(edgeId);
        });
      });
      return;
    }
    case "comment":
      await deleteComment(projectId, str(before.commentId));
      return;
    case "knowledge-create":
      await deleteKnowledge(projectId, str(before.id));
      return;
    case "setup-create":
      await deleteSetup(projectId, str(before.id));
      return;
  }
}

export type UndoResult = {
  undone: number;
  /** Changes that couldn't be taken back, each with why. */
  failed: string[];
  /** Notes the undo touched, for the browser to refresh. */
  nodeIds: string[];
};

/** Takes back a run's changes, newest first. */
export async function undoChanges(context: WriteContext, changes: RunChange[]): Promise<UndoResult> {
  const created = new Set(changes.filter((c) => c.action === "create" && c.nodeId).map((c) => c.nodeId as string));
  const failed: string[] = [];
  let undone = 0;
  for (const change of [...changes].reverse()) {
    try {
      // Each in its own transaction: one that fails leaves the others undone, not half of everything.
      await transaction(() => undoOne(context, change, created));
      undone++;
    } catch (error) {
      const why = error instanceof Error && error.message ? error.message : "it couldn't be changed back";
      failed.push(`${change.summary ?? change.action}: ${why}`);
    }
  }
  return { undone, failed, nodeIds: [...new Set(changes.map((c) => c.nodeId).filter((id): id is string => !!id))] };
}
