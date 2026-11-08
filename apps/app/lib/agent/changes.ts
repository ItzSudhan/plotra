import "server-only";
import { schema } from "@plotra/db";
import { withUser } from "@plotra/db/rls";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { ydocToValue } from "../collab/ydoc";
import { userDb } from "../db";
import { indexDocument } from "../doc-index";
import { assertStorage } from "../quotas";
import { insertVersion, loadSnapshot, makeRoom } from "../versions";
import type { WriteContext } from "./write";

// What a run changed, and how to take it back (plan.md 2.11 "Checkpoints").
//
// Every write tool records a row in `agent_change` with what was there before:
// for a note's text, a version snapshot taken the first time the run touches
// it; for everything else, the old values. "Undo run" (lib/agent/undo.ts)
// walks the rows backwards.

const { agentChange, node, project, version } = schema;

/** The kinds of change a tool can record. `undo.ts` has one way back for each. */
export type ChangeAction =
  | "content"
  | "create"
  | "update"
  | "properties"
  | "move"
  | "trash"
  | "canon"
  | "relationship-create"
  | "relationship-update"
  | "relationship-delete"
  | "thread-create"
  | "scene-thread"
  | "event-create"
  | "event-update"
  | "event-delete"
  | "cards-add"
  | "comment"
  | "knowledge-create"
  | "setup-create";

export type ChangeInput = {
  action: ChangeAction;
  nodeId?: string | null;
  /** What was there before, in whatever shape the way back needs. */
  before?: Record<string, unknown>;
  beforeVersionId?: string;
  /** One line for the run's list of changes: "Renamed Chapter 3 to The Crossing". */
  summary: string;
};

/** Records one change of the run. Call it from inside the tool's transaction, after the change succeeded. */
export async function recordChange(context: WriteContext, change: ChangeInput): Promise<void> {
  await userDb((tx) =>
    tx.insert(agentChange).values({
      projectId: context.projectId,
      runId: context.runId,
      nodeId: change.nodeId ?? null,
      action: change.action,
      before: change.before ?? null,
      beforeVersionId: change.beforeVersionId ?? null,
      summary: change.summary.slice(0, 300),
    }),
  );
}

const wordsOf = (state: Uint8Array) => {
  try {
    return indexDocument(ydocToValue(state)).words;
  } catch {
    return 0;
  }
};

/**
 * Keeps the note as it is, before the run first changes its content: a version
 * in its history, and the change row that points at it. Later edits by the
 * same run find the row and do nothing. Throws when the workspace's storage is
 * full: an edit that couldn't be undone isn't made.
 */
export async function checkpoint(context: WriteContext, nodeId: string, state: Uint8Array): Promise<void> {
  const [existing] = await userDb((tx) =>
    tx
      .select({ id: agentChange.id })
      .from(agentChange)
      .where(and(eq(agentChange.runId, context.runId), eq(agentChange.nodeId, nodeId), eq(agentChange.action, "content")))
      .limit(1),
  );
  if (existing) return;
  const [owner] = await userDb((tx) => tx.select({ workspaceId: project.organizationId, title: node.title }).from(node).innerJoin(project, eq(project.id, node.projectId)).where(eq(node.id, nodeId)).limit(1));
  if (!owner) throw new Error("That note no longer exists.");
  // Old automatic snapshots give way to the checkpoint; an edit that couldn't be undone still isn't made.
  await makeRoom(owner.workspaceId, state.length);
  await assertStorage(owner.workspaceId, state.length);
  const saved = await userDb((tx) =>
    insertVersion(tx, {
      projectId: context.projectId,
      nodeId,
      name: `Before AI · for ${context.userName}`.slice(0, 80),
      auto: false,
      state,
      wordCount: wordsOf(state),
      createdById: context.userId,
    }),
  );
  await recordChange(context, { action: "content", nodeId, beforeVersionId: saved.id, summary: `Edited the text of ${owner.title}` });
}

export type RunChange = {
  id: string;
  action: ChangeAction;
  nodeId: string | null;
  before: Record<string, unknown> | null;
  beforeVersionId: string | null;
  summary: string | null;
};

/** A run's changes, oldest first, as the current user may see them. */
export async function listChanges(runId: string): Promise<RunChange[]> {
  const rows = await userDb((tx) =>
    tx
      .select({ id: agentChange.id, action: agentChange.action, nodeId: agentChange.nodeId, before: agentChange.before, beforeVersionId: agentChange.beforeVersionId, summary: agentChange.summary })
      .from(agentChange)
      .where(eq(agentChange.runId, runId))
      .orderBy(asc(agentChange.createdAt), asc(agentChange.id)),
  );
  return rows as RunChange[];
}

/** How many notes a run has changed so far: what "more than a handful" is counted from. */
export async function notesTouched(runId: string): Promise<number> {
  const rows = await userDb((tx) => tx.selectDistinct({ nodeId: agentChange.nodeId }).from(agentChange).where(and(eq(agentChange.runId, runId), isNotNull(agentChange.nodeId))));
  return rows.length;
}

/** Whether a run changed anything at all. Carries the user id itself: it is asked about a run that ended without saying so. */
export async function runChangedAnything(userId: string, runId: string): Promise<boolean> {
  const rows = await withUser(userId, (tx) => tx.select({ id: agentChange.id }).from(agentChange).where(eq(agentChange.runId, runId)).limit(1));
  return rows.length > 0;
}

/**
 * Once a run has ended: a version of every note whose text it changed, named
 * for who it worked for, so the history reads "AI, for Sam" where the agent
 * wrote (plan.md 2.11). Runs after the response has streamed, so it carries
 * the user id itself. Skipped without a word when storage is full: the
 * checkpoint before the run is the one that matters.
 */
export async function versionRunResults(context: WriteContext): Promise<string[]> {
  return withUser(context.userId, async (tx) => {
    const touched = await tx
      .select({ nodeId: agentChange.nodeId })
      .from(agentChange)
      .where(and(eq(agentChange.runId, context.runId), eq(agentChange.action, "content"), isNotNull(agentChange.nodeId)));
    const ids = [...new Set(touched.map((row) => row.nodeId).filter((id): id is string => !!id))];
    if (!ids.length) return [];
    const rows = await tx
      .select({ id: node.id, ydoc: node.ydoc, workspaceId: project.organizationId })
      .from(node)
      .innerJoin(project, eq(project.id, node.projectId))
      .where(inArray(node.id, ids));
    for (const row of rows) {
      if (!row.ydoc?.length) continue;
      if (!(await makeRoom(row.workspaceId, row.ydoc.length))) break;
      await insertVersion(tx, {
        projectId: context.projectId,
        nodeId: row.id,
        name: `AI, for ${context.userName}`.slice(0, 80),
        auto: false,
        state: row.ydoc,
        wordCount: wordsOf(row.ydoc),
        createdById: context.userId,
      });
    }
    return ids;
  });
}

/** The saved state a checkpoint points at, as a document value. */
export async function checkpointValue(versionId: string) {
  const [row] = await userDb((tx) => tx.select({ snapshot: version.snapshot, r2Key: version.r2Key, nodeId: version.nodeId }).from(version).where(eq(version.id, versionId)).limit(1));
  if (!row) return null;
  const state = await loadSnapshot(row);
  return { nodeId: row.nodeId, state, value: ydocToValue(state) };
}
