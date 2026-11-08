import "server-only";
import { schema } from "@plotra/db";
import type { WorkflowStage } from "@plotra/db/schema";
import { eq } from "drizzle-orm";
import { getNodeAccess, requireProjectAccess } from "./access";
import { requireSession } from "./data";
import { userDb } from "./db";
import { checkStageChange, hasGates, isApprover, requiredReviewers, type ApprovalState, type ReviewRule } from "./editorial";
import { requestCache } from "./request-cache";
import { stageOf, stagesOf } from "./stages";

// Enforcement of the editorial workflow (plan.md 2.8 "Locked content needs an
// approver to change"). Every server action that changes a note asks here
// first, and so does the collab token endpoint, so a locked note is read-only
// whichever way it's reached. The rules themselves are in lib/editorial.ts.

const { approval, node, reviewRule } = schema;

type TreeRow = {
  id: string;
  parentId: string | null;
  title: string;
  status: string;
  tags: string[];
  contentTags: string[];
  deletedAt: Date | null;
};

/** The project's required-reviewer rules. */
export const loadReviewRules = requestCache(
  async (projectId: string): Promise<ReviewRule[]> =>
    userDb((tx) =>
      tx
        .select({ id: reviewRule.id, nodeId: reviewRule.nodeId, tag: reviewRule.tag, reviewerId: reviewRule.reviewerId })
        .from(reviewRule)
        .where(eq(reviewRule.projectId, projectId))
        .orderBy(reviewRule.createdAt),
    ),
);

/** What the rules look at, for every node of the project (seen by the user or not: a rule on a hidden folder still applies). */
const loadTree = requestCache(async (projectId: string): Promise<Map<string, TreeRow>> => {
  const rows = await userDb((tx) =>
    tx
      .select({
        id: node.id,
        parentId: node.parentId,
        title: node.title,
        status: node.status,
        tags: node.tags,
        contentTags: node.contentTags,
        deletedAt: node.deletedAt,
      })
      .from(node)
      .where(eq(node.projectId, projectId)),
  );
  return new Map(rows.map((r) => [r.id, r]));
});

function ancestorIds(tree: Map<string, TreeRow>, nodeId: string) {
  const ids: string[] = [];
  for (let id = tree.get(nodeId)?.parentId; id && !ids.includes(id); id = tree.get(id)?.parentId) ids.push(id);
  return ids;
}

/** Everything needed to decide who reviews what in a project, loaded once per request. */
export async function reviewContext(projectId: string) {
  const { project } = await requireProjectAccess(projectId);
  const stages = stagesOf(project.settings);
  const [tree, rules] = await Promise.all([loadTree(projectId), loadReviewRules(projectId)]);
  return {
    project,
    stages,
    tree,
    rules,
    /** The required reviewers of a note (empty for one that doesn't exist). */
    requiredFor(nodeId: string): string[] {
      const row = tree.get(nodeId);
      return row ? requiredReviewers(row, ancestorIds(tree, nodeId), rules) : [];
    },
  };
}

export type LockState = {
  /** The note's stage (unknown ids show under their own name). */
  stage: WorkflowStage;
  /** Its stage is a locked one. */
  locked: boolean;
  /** The current user is one of its approvers: a required reviewer, or someone who can manage it. */
  approver: boolean;
  /** Locked, and the current user isn't an approver: they may read and comment, nothing else. */
  readOnly: boolean;
  required: string[];
};

/** Whether a note is locked, and whether that binds the current user. */
export async function lockStateFor(projectId: string, nodeId: string): Promise<LockState> {
  const { user } = await requireSession();
  const { project } = await requireProjectAccess(projectId);
  const stages = stagesOf(project.settings);
  // Most workflows lock nothing: don't load anything for them.
  if (!hasGates(stages)) return { stage: stages[0], locked: false, approver: true, readOnly: false, required: [] };

  const context = await reviewContext(projectId);
  const row = context.tree.get(nodeId);
  const stage = stageOf(stages, row?.status ?? "");
  const required = context.requiredFor(nodeId);
  const canManage = (await getNodeAccess(projectId)).get(nodeId)?.actions.has("manage") ?? false;
  const approver = isApprover(required, user.id, canManage);
  const locked = stage.locked === true;
  return { stage, locked, approver, readOnly: locked && !approver, required };
}

const lockedMessage = (title: string, stage: WorkflowStage) =>
  `“${title}” is ${stage.label.toLowerCase()} and locked. Ask an approver to change it, or to move it out of “${stage.label}”.`;

/**
 * Throws when the note is locked for the current user. With `subtree`, also
 * when anything inside it is (trashing a folder takes its contents along).
 */
export async function assertUnlocked(projectId: string, nodeId: string, options: { subtree?: boolean } = {}): Promise<void> {
  const state = await lockStateFor(projectId, nodeId);
  // Nothing more to load for the common case: an unlocked note in a workflow that locks nothing.
  if (!state.readOnly && !options.subtree) return;
  const { project } = await requireProjectAccess(projectId);
  if (!stagesOf(project.settings).some((s) => s.locked)) return;
  const { tree, stages } = await reviewContext(projectId);
  if (state.readOnly) throw new Error(lockedMessage(tree.get(nodeId)?.title ?? "This", state.stage));
  if (!options.subtree) return;

  const children = new Map<string, string[]>();
  for (const row of tree.values()) if (row.parentId) children.set(row.parentId, [...(children.get(row.parentId) ?? []), row.id]);
  const stack = [...(children.get(nodeId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    const row = tree.get(id)!;
    stack.push(...(children.get(id) ?? []));
    if (row.deletedAt || !stageOf(stages, row.status).locked) continue;
    const inside = await lockStateFor(projectId, id);
    if (inside.readOnly) throw new Error(`“${row.title}” inside is locked, so this can't go. Ask an approver.`);
  }
}

/** A note's approvals, as the gate needs them. */
export async function loadApprovals(nodeId: string): Promise<ApprovalState[]> {
  return userDb((tx) => tx.select({ reviewerId: approval.reviewerId, status: approval.status }).from(approval).where(eq(approval.nodeId, nodeId)));
}

/**
 * The check `updateNode` makes before changing a note: refuses a locked note
 * to anyone but its approvers, and a move into an approval stage until every
 * required reviewer has approved (people who can manage the note may
 * override). Also drops the note's approvals when it goes back to a stage
 * before approval, so old approvals don't stay valid forever.
 */
export async function guardNodeUpdate(projectId: string, nodeId: string, patch: { status?: string }): Promise<void> {
  const { project } = await requireProjectAccess(projectId);
  const stages = stagesOf(project.settings);
  if (!hasGates(stages)) return;

  const { user } = await requireSession();
  const state = await lockStateFor(projectId, nodeId);
  const { tree } = await reviewContext(projectId);
  const current = tree.get(nodeId);
  if (!current) return;
  const moving = patch.status !== undefined && patch.status !== current.status;
  // Out of a locked stage is the one change an approver is needed for; everything else is simply refused.
  if (state.readOnly && !moving) throw new Error(lockedMessage(current.title, state.stage));
  if (!moving) return;

  const canManage = (await getNodeAccess(projectId)).get(nodeId)?.actions.has("manage") ?? false;
  const result = checkStageChange({
    stages,
    from: current.status,
    to: patch.status!,
    required: state.required,
    approvals: await loadApprovals(nodeId),
    userId: user.id,
    canManage,
  });
  if (!result.ok) throw new Error(result.reason);
  if (result.clearApprovals) await userDb((tx) => tx.delete(approval).where(eq(approval.nodeId, nodeId)));
}
