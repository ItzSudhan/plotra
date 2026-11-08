"use server";

import { schema } from "@plotra/db";
import type { Answer, ApprovalStatus, CanonStatus, NodeKind, Question } from "@plotra/db/schema";
import { and, asc, desc, eq, gt, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import * as Y from "yjs";
import { getNodeAccess, parseWorkspaceRole, requireNodeAccess, requireProjectAccess } from "./access";
import { indexCanvas } from "./canvas";
import { ydocToValue } from "./collab/ydoc";
import { requireSession } from "./data";
import { userDb, type Tx } from "./db";
import { indexDocument, normalizeTag } from "./doc-index";
import {
  allApproved,
  cleanAnswers,
  cleanQuestions,
  compareNote,
  isLocked,
  nextApprovalStage,
  summarizeResponses,
  type QuestionSummary,
  type ReviewRule,
} from "./editorial";
import { reviewContext } from "./editorial-guard";
import { logActivity, notify } from "./notify";
import { readOnly, transaction } from "./request-cache";
import { deleteSnapshots, insertVersions, loadSnapshot, makeRoom } from "./versions";
import { assertStorage } from "./quotas";

// Review, editorial and approval (plan.md 2.8, Phase 7): required reviewers,
// approvals, beta readers, questionnaires and the changelog per release. The
// rules are in lib/editorial.ts; what a locked note refuses is enforced in
// lib/editorial-guard.ts, which the binder and world actions call.

const { approval, member, node, projectMember, questionnaire, questionnaireResponse, release, retcon, reviewRule, user, version } = schema;

const MAX_NOTE = 2000;
const MAX_TITLE = 120;
const MAX_INTRO = 2000;

async function assertMember(tx: Tx, workspaceId: string, userId: string) {
  const [found] = await tx
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, userId)))
    .limit(1);
  if (!found) throw new Error("That person isn't a member of this workspace.");
  return parseWorkspaceRole(found.role);
}

// ---- Required reviewers and approvals ------------------------------------------------------

export type ApprovalRow = {
  nodeId: string;
  reviewerId: string;
  status: ApprovalStatus;
  /** The stage the note moves to once everyone has approved. */
  targetStage: string | null;
  note: string | null;
  requestedById: string | null;
  createdAt: Date;
  decidedAt: Date | null;
};

export type NodeReview = {
  /** The note's stage is a locked one: read-only for everyone but its approvers. */
  locked: boolean;
  /** Who has to approve it before it enters an approval stage. */
  required: string[];
  approvals: ApprovalRow[];
};

export type ReviewState = {
  rules: ReviewRule[];
  /** Per note, for the notes that are locked, need a reviewer or have approvals. */
  nodes: Record<string, NodeReview>;
};

const approvalColumns = {
  nodeId: approval.nodeId,
  reviewerId: approval.reviewerId,
  status: approval.status,
  targetStage: approval.targetStage,
  note: approval.note,
  requestedById: approval.requestedById,
  createdAt: approval.createdAt,
  decidedAt: approval.decidedAt,
};

/** Rules, locks and approvals of a project, for the notes the user can see. */
export async function getReviewState(projectId: string): Promise<ReviewState> {
  return readOnly(async () => {
    const context = await reviewContext(projectId);
    const access = await getNodeAccess(projectId);
    const rows = await userDb((tx) => tx.select(approvalColumns).from(approval).where(eq(approval.projectId, projectId)).orderBy(asc(approval.createdAt)));
    const byNode = new Map<string, ApprovalRow[]>();
    for (const row of rows) byNode.set(row.nodeId, [...(byNode.get(row.nodeId) ?? []), row]);

    const nodes: Record<string, NodeReview> = {};
    for (const row of context.tree.values()) {
      if (!access.has(row.id)) continue;
      const locked = isLocked(context.stages, row.status);
      const required = context.rules.length ? context.requiredFor(row.id) : [];
      const approvals = byNode.get(row.id) ?? [];
      if (locked || required.length || approvals.length) nodes[row.id] = { locked, required, approvals };
    }
    // A rule on a folder the user can't see would give its title away.
    return { rules: context.rules.filter((r) => !r.nodeId || access.has(r.nodeId)), nodes };
  });
}

/** Makes someone a required reviewer of a folder, a tag or (with neither) the whole project. Needs `manage`. */
export async function createReviewRule(
  projectId: string,
  input: { nodeId?: string | null; tag?: string | null; reviewerId: string },
): Promise<ReviewRule> {
  return transaction(async () => {
    const { project: found } = await requireProjectAccess(projectId, "manage");
    const nodeId = input.nodeId || null;
    const tag = input.tag ? normalizeTag(input.tag) || null : null;
    if (nodeId) await requireNodeAccess(projectId, nodeId);
    return userDb(async (tx) => {
      await assertMember(tx, found.organizationId, input.reviewerId);
      const existing = await tx
        .select({ nodeId: reviewRule.nodeId, tag: reviewRule.tag })
        .from(reviewRule)
        .where(and(eq(reviewRule.projectId, projectId), eq(reviewRule.reviewerId, input.reviewerId)));
      if (existing.some((r) => r.nodeId === nodeId && r.tag === tag)) throw new Error("That rule already exists.");
      const [row] = await tx
        .insert(reviewRule)
        .values({ projectId, nodeId, tag, reviewerId: input.reviewerId })
        .returning({ id: reviewRule.id, nodeId: reviewRule.nodeId, tag: reviewRule.tag, reviewerId: reviewRule.reviewerId });
      return row;
    });
  });
}

export async function deleteReviewRule(projectId: string, ruleId: string): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "manage");
    await userDb((tx) => tx.delete(reviewRule).where(and(eq(reviewRule.id, ruleId), eq(reviewRule.projectId, projectId))));
  });
}

/**
 * Asks every required reviewer of a note to approve it. Earlier decisions are
 * reset to pending: the note has changed, so it's reviewed again. Once they've
 * all approved, the note moves to `targetStage` (by default the next stage
 * that needs approval).
 */
export async function requestReview(projectId: string, nodeId: string, targetStage?: string): Promise<{ reviewers: string[]; targetStage: string }> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    await requireNodeAccess(projectId, nodeId, "edit");
    const context = await reviewContext(projectId);
    const current = context.tree.get(nodeId);
    if (!current) throw new Error("That note no longer exists.");
    const target = targetStage ? context.stages.find((s) => s.id === targetStage) : nextApprovalStage(context.stages, current.status);
    if (!target) {
      throw new Error(targetStage ? "Unknown stage." : "No stage of this workflow needs approval. Mark one in Project settings → Workflow.");
    }
    if (target.id === current.status) throw new Error(`It's already in “${target.label}”.`);
    const reviewers = context.requiredFor(nodeId);
    if (!reviewers.length) throw new Error("Nobody is required to review this note. Add a rule under Reviews → Rules, or just move it.");

    await userDb(async (tx) => {
      // Reviewers a rule no longer names drop out of the request.
      const stale = (await tx.select({ id: approval.id, reviewerId: approval.reviewerId }).from(approval).where(eq(approval.nodeId, nodeId))).filter(
        (r) => !reviewers.includes(r.reviewerId),
      );
      if (stale.length) await tx.delete(approval).where(inArray(approval.id, stale.map((r) => r.id)));
      const pending = { status: "pending" as const, targetStage: target.id, note: null, requestedById: me.id, createdAt: new Date(), decidedAt: null };
      await tx
        .insert(approval)
        .values(reviewers.map((reviewerId) => ({ projectId, nodeId, reviewerId, ...pending })))
        .onConflictDoUpdate({ target: [approval.nodeId, approval.reviewerId], set: pending });
    });
    await notify(projectId, reviewers, "review_requested", { nodeId, payload: { title: current.title, stage: target.label } });
    return { reviewers, targetStage: target.id };
  });
}

/** Withdraws a review request: the note's approvals are cleared. */
export async function cancelReview(projectId: string, nodeId: string): Promise<void> {
  return transaction(async () => {
    await requireNodeAccess(projectId, nodeId, "edit");
    await userDb((tx) => tx.delete(approval).where(and(eq(approval.nodeId, nodeId), eq(approval.projectId, projectId))));
  });
}

/**
 * A required reviewer approves a note or asks for changes. When the last one
 * approves, the note moves to the stage the request was for.
 */
export async function decideApproval(
  projectId: string,
  nodeId: string,
  decision: "approved" | "changes",
  note?: string | null,
): Promise<{ movedTo: string | null }> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    await requireNodeAccess(projectId, nodeId);
    if (decision !== "approved" && decision !== "changes") throw new Error("Unknown decision.");
    const context = await reviewContext(projectId);
    const current = context.tree.get(nodeId);
    if (!current) throw new Error("That note no longer exists.");
    const required = context.requiredFor(nodeId);

    let requestedById: string | null = null;
    const result = await userDb(async (tx) => {
      const rows = await tx.select(approvalColumns).from(approval).where(eq(approval.nodeId, nodeId));
      const mine = rows.find((r) => r.reviewerId === me.id);
      requestedById = mine?.requestedById ?? rows.find((r) => r.requestedById)?.requestedById ?? null;
      // A reviewer a rule named after the request was made can still decide.
      if (!mine && !required.includes(me.id)) throw new Error("You aren't a reviewer of this note.");
      const targetStage = mine?.targetStage ?? rows[0]?.targetStage ?? nextApprovalStage(context.stages, current.status)?.id ?? null;
      const decided = { status: decision, note: note?.trim().slice(0, MAX_NOTE) || null, decidedAt: new Date() };
      await tx
        .insert(approval)
        .values({ projectId, nodeId, reviewerId: me.id, targetStage, ...decided })
        .onConflictDoUpdate({ target: [approval.nodeId, approval.reviewerId], set: decided });
      if (decision !== "approved") return { movedTo: null };

      const after = [...rows.filter((r) => r.reviewerId !== me.id), { reviewerId: me.id, status: decision }];
      const target = context.stages.find((s) => s.id === targetStage);
      if (!required.length || !allApproved(required, after) || !target || target.id === current.status) return { movedTo: null };
      await tx.update(node).set({ status: target.id }).where(eq(node.id, nodeId));
      return { movedTo: target.id };
    });
    // Whoever asked for the review hears each decision as it's made.
    await notify(projectId, [requestedById], "review_decided", { nodeId, payload: { title: current.title, decision } });
    return result;
  });
}

/**
 * The approver of last resort: someone who can manage the note moves it into
 * its approval stage without waiting for the reviewers. Their approvals stay
 * as they are; requests still open are closed.
 */
export async function approveAsManager(projectId: string, nodeId: string, targetStage?: string): Promise<{ movedTo: string }> {
  return transaction(async () => {
    await requireNodeAccess(projectId, nodeId, "manage");
    const context = await reviewContext(projectId);
    const current = context.tree.get(nodeId);
    if (!current) throw new Error("That note no longer exists.");
    return userDb(async (tx) => {
      const rows = await tx.select({ targetStage: approval.targetStage }).from(approval).where(eq(approval.nodeId, nodeId));
      const wanted = targetStage ?? rows.find((r) => r.targetStage)?.targetStage ?? nextApprovalStage(context.stages, current.status)?.id;
      const target = context.stages.find((s) => s.id === wanted);
      if (!target) throw new Error("No stage of this workflow needs approval.");
      await tx.update(node).set({ status: target.id }).where(eq(node.id, nodeId));
      await tx.delete(approval).where(and(eq(approval.nodeId, nodeId), ne(approval.status, "approved")));
      return { movedTo: target.id };
    });
  });
}

// ---- Beta readers -----------------------------------------------------------------------------
//
// A beta reader is someone the project is shared with as a viewer or commenter
// (plan.md 2.9): usually a guest from outside the workspace, who sees only this
// project. They read, comment, react to passages and answer questionnaires.
// Adding and removing them is project sharing
// (lib/share-actions.ts); this only lists them for the Reviews view.

export type ReaderRow = {
  /** The sharing row's id, for changing or removing their access. */
  id: string;
  userId: string | null;
  name: string | null;
  email: string;
  image: string | null;
  role: "viewer" | "commenter";
  /** Invited by email, and hasn't opened the invitation yet. */
  pending: boolean;
};

/** Everyone the project is shared with to read or comment. Needs `manage`. */
export async function listReaders(projectId: string): Promise<ReaderRow[]> {
  return readOnly(async () => {
    await requireProjectAccess(projectId, "manage");
    const rows = await userDb((tx) =>
      tx
        .select({
          id: projectMember.id,
          userId: projectMember.userId,
          name: user.name,
          email: projectMember.email,
          image: user.image,
          role: projectMember.role,
        })
        .from(projectMember)
        .leftJoin(user, eq(user.id, projectMember.userId))
        .where(and(eq(projectMember.projectId, projectId), ne(projectMember.role, "editor")))
        .orderBy(asc(projectMember.createdAt)),
    );
    return rows.map((r) => ({ ...r, role: r.role as ReaderRow["role"], pending: r.userId === null }));
  });
}

// ---- Questionnaires ------------------------------------------------------------------------------

export type QuestionnaireRow = {
  id: string;
  /** The chapter or folder it's about; null for the whole project. */
  nodeId: string | null;
  title: string;
  intro: string | null;
  questions: Question[];
  open: boolean;
  createdById: string | null;
  createdAt: Date;
  /** Open, and the user may comment on what it's about. */
  canAnswer: boolean;
  /** The user's own answers, if they've responded. */
  myAnswers: Record<string, Answer> | null;
  /** How many people have responded; only authors are told. */
  responses: number | null;
};

const questionnaireColumns = {
  id: questionnaire.id,
  nodeId: questionnaire.nodeId,
  title: questionnaire.title,
  intro: questionnaire.intro,
  questions: questionnaire.questions,
  open: questionnaire.open,
  createdById: questionnaire.createdById,
  createdAt: questionnaire.createdAt,
};

/** The questionnaires the user can see: about the whole project, or about a note they can read. */
export async function listQuestionnaires(projectId: string): Promise<QuestionnaireRow[]> {
  return readOnly(async () => {
    const { user: me } = await requireSession();
    const { actions } = await requireProjectAccess(projectId);
    const access = await getNodeAccess(projectId);
    const [rows, responses] = await userDb((tx) =>
      Promise.all([
        tx.select(questionnaireColumns).from(questionnaire).where(eq(questionnaire.projectId, projectId)).orderBy(desc(questionnaire.createdAt)),
        tx
          .select({ questionnaireId: questionnaireResponse.questionnaireId, userId: questionnaireResponse.userId, answers: questionnaireResponse.answers })
          .from(questionnaireResponse)
          .where(eq(questionnaireResponse.projectId, projectId)),
      ]),
    );
    const isAuthor = actions.has("edit");
    return rows
      .filter((q) => !q.nodeId || access.has(q.nodeId))
      .map((q) => {
        const mayComment = q.nodeId ? access.get(q.nodeId)!.actions.has("comment") : actions.has("comment");
        const answered = responses.filter((r) => r.questionnaireId === q.id);
        return {
          ...q,
          canAnswer: q.open && mayComment,
          myAnswers: answered.find((r) => r.userId === me.id)?.answers ?? null,
          responses: isAuthor ? answered.length : null,
        };
      });
  });
}

export type QuestionnaireInput = { nodeId?: string | null; title: string; intro?: string | null; questions: Question[] };

/** Creates a questionnaire, or (with `id`) changes one. Authors only: needs `edit` on the project. */
export async function saveQuestionnaire(projectId: string, input: QuestionnaireInput & { id?: string }): Promise<{ id: string }> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    await requireProjectAccess(projectId, "edit");
    const nodeId = input.nodeId || null;
    if (nodeId) await requireNodeAccess(projectId, nodeId);
    const title = input.title.trim().slice(0, MAX_TITLE);
    if (!title) throw new Error("Give the questionnaire a title.");
    const values = { nodeId, title, intro: input.intro?.trim().slice(0, MAX_INTRO) || null, questions: cleanQuestions(input.questions) };
    return userDb(async (tx) => {
      if (!input.id) {
        const [row] = await tx.insert(questionnaire).values({ projectId, ...values, createdById: me.id }).returning({ id: questionnaire.id });
        return row;
      }
      const [row] = await tx
        .update(questionnaire)
        .set(values)
        .where(and(eq(questionnaire.id, input.id), eq(questionnaire.projectId, projectId)))
        .returning({ id: questionnaire.id });
      if (!row) throw new Error("That questionnaire no longer exists.");
      return row;
    });
  });
}

/** Opens or closes a questionnaire to answers. */
export async function setQuestionnaireOpen(projectId: string, id: string, open: boolean): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    await userDb((tx) => tx.update(questionnaire).set({ open: !!open }).where(and(eq(questionnaire.id, id), eq(questionnaire.projectId, projectId))));
  });
}

export async function deleteQuestionnaire(projectId: string, id: string): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    await userDb((tx) => tx.delete(questionnaire).where(and(eq(questionnaire.id, id), eq(questionnaire.projectId, projectId))));
  });
}

/** A reader's answers. They answer once, and may change their answers while the questionnaire is open. */
export async function submitResponse(projectId: string, id: string, answers: Record<string, Answer>): Promise<void> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    const { actions } = await requireProjectAccess(projectId);
    const [found] = await userDb((tx) =>
      tx
        .select({ nodeId: questionnaire.nodeId, questions: questionnaire.questions, open: questionnaire.open })
        .from(questionnaire)
        .where(and(eq(questionnaire.id, id), eq(questionnaire.projectId, projectId))),
    );
    if (!found) throw new Error("That questionnaire no longer exists.");
    if (found.nodeId) await requireNodeAccess(projectId, found.nodeId, "comment");
    else if (!actions.has("comment")) throw new Error("You don't have permission to comment in this project.");
    if (!found.open) throw new Error("This questionnaire is closed.");
    const clean = cleanAnswers(found.questions, answers);
    if (!Object.keys(clean).length) throw new Error("Answer at least one question.");
    await userDb((tx) =>
      tx
        .insert(questionnaireResponse)
        .values({ projectId, questionnaireId: id, userId: me.id, answers: clean })
        .onConflictDoUpdate({
          target: [questionnaireResponse.questionnaireId, questionnaireResponse.userId],
          set: { answers: clean, submittedAt: new Date() },
        }),
    );
  });
}

export type QuestionnaireResults = { respondents: string[]; summary: QuestionSummary[] };

/** Everyone's answers, per question. Authors only. */
export async function getQuestionnaireResults(projectId: string, id: string): Promise<QuestionnaireResults> {
  return readOnly(async () => {
    await requireProjectAccess(projectId, "edit");
    const [found] = await userDb((tx) =>
      tx
        .select({ nodeId: questionnaire.nodeId, questions: questionnaire.questions })
        .from(questionnaire)
        .where(and(eq(questionnaire.id, id), eq(questionnaire.projectId, projectId))),
    );
    if (!found) throw new Error("That questionnaire no longer exists.");
    if (found.nodeId) await requireNodeAccess(projectId, found.nodeId);
    const responses = await userDb((tx) =>
      tx
        .select({ userId: questionnaireResponse.userId, answers: questionnaireResponse.answers })
        .from(questionnaireResponse)
        .where(eq(questionnaireResponse.questionnaireId, id))
        .orderBy(asc(questionnaireResponse.submittedAt)),
    );
    return { respondents: responses.map((r) => r.userId), summary: summarizeResponses(found.questions, responses) };
  });
}

// ---- Changelog per release ------------------------------------------------------------------------

const SNAPSHOT_BATCH = 20;
/** Notes compared in one changelog; a project with more changed notes than this says so. */
const MAX_COMPARED = 400;
// Snapshots are stamped by the database and notes by the app, so allow for their clocks to differ.
const CLOCK_SLACK_MS = 2 * 60 * 1000;

const releaseVersionName = (title: string) => `Release: ${title}`.slice(0, 80);

/** The text a snapshot held, derived the way the collab sync derives a note's `text`. */
function snapshotText(kind: NodeKind, state: Uint8Array): string {
  if (kind !== "canvas") return indexDocument(ydocToValue(state)).text;
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  const { text } = indexCanvas(doc);
  doc.destroy();
  return text;
}

/**
 * Cuts a release: keeps a snapshot of every note as it stands, so the
 * changelog can later say what changed since (plan.md 2.8 "Changelog per
 * release"). Cutting it again replaces the snapshots. Needs `manage`.
 */
export async function cutRelease(projectId: string, releaseId: string): Promise<{ snapshots: number; releasedAt: Date }> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    await requireProjectAccess(projectId, "manage");
    const { tree } = await reviewContext(projectId);
    const [found] = await userDb((tx) =>
      tx.select({ title: release.title }).from(release).where(and(eq(release.id, releaseId), eq(release.projectId, projectId))),
    );
    if (!found) throw new Error("That release no longer exists.");

    // The snapshots count against the workspace's storage (plan.md 8.2), less the ones a re-cut replaces.
    const [sizes] = await userDb((tx) =>
      tx
        .select({
          adding: sql<number>`coalesce(sum(octet_length(${node.ydoc})) filter (where ${node.deletedAt} is null), 0)::float8`,
          replacing: sql<number>`coalesce((select sum(${version.size}) from ${version} where ${version.projectId} = ${projectId} and ${version.releaseId} = ${releaseId}), 0)::float8`,
        })
        .from(node)
        .where(and(eq(node.projectId, projectId), isNotNull(node.ydoc))),
    );
    const needed = Math.max(0, (sizes?.adding ?? 0) - (sizes?.replacing ?? 0));
    const { project: owner } = await requireProjectAccess(projectId);
    await makeRoom(owner.organizationId, needed);
    await assertStorage(owner.organizationId, needed);

    const old = await userDb((tx) =>
      tx
        .delete(version)
        .where(and(eq(version.projectId, projectId), eq(version.releaseId, releaseId)))
        .returning({ r2Key: version.r2Key }),
    );

    const trashed = (id: string) => {
      for (let row = tree.get(id), hops = 0; row && hops < 100; row = row.parentId ? tree.get(row.parentId) : undefined, hops++) {
        if (row.deletedAt) return true;
      }
      return false;
    };
    const written = await userDb((tx) => tx.select({ id: node.id }).from(node).where(and(eq(node.projectId, projectId), isNotNull(node.ydoc))));
    const ids = written.map((n) => n.id).filter((id) => !trashed(id));

    const name = releaseVersionName(found.title);
    let snapshots = 0;
    // A batch at a time, so a long manuscript is never all in memory at once. Within a batch the
    // snapshots are stored side by side and written in one insert, with the title each note has now.
    for (let i = 0; i < ids.length; i += SNAPSHOT_BATCH) {
      snapshots += await userDb(async (tx) => {
        const rows = await tx
          .select({ id: node.id, title: node.title, ydoc: node.ydoc, wordCount: node.wordCount })
          .from(node)
          .where(inArray(node.id, ids.slice(i, i + SNAPSHOT_BATCH)));
        const written = rows.filter((row) => row.ydoc?.length);
        return insertVersions(
          tx,
          written.map((row) => ({ projectId, nodeId: row.id, name, auto: false, state: row.ydoc!, wordCount: row.wordCount, createdById: me.id })),
          { releaseId, titles: new Map(written.map((row) => [row.id, row.title])) },
        );
      });
    }
    const releasedAt = new Date();
    await userDb((tx) => tx.update(release).set({ releasedAt }).where(eq(release.id, releaseId)));
    await deleteSnapshots(old.map((v) => v.r2Key));
    await logActivity(projectId, "release_cut", { payload: { title: found.title, count: snapshots } });
    return { snapshots, releasedAt };
  });
}

export type ChangelogEntry = {
  nodeId: string;
  title: string;
  /** The title the note had in the release, when it has been renamed since. */
  renamedFrom: string | null;
  kind: NodeKind;
  change: "added" | "changed" | "removed";
  wordsBefore: number;
  wordsAfter: number;
  canon: CanonStatus;
  /** The release's snapshot of the note: what it said then. Null for added notes. */
  versionId: string | null;
  /** With `until`: the later release's snapshot. Null means "as it is now" (or gone). */
  untilVersionId: string | null;
};

export type ChangelogRetcon = {
  id: string;
  nodeId: string;
  title: string;
  reason: string;
  releaseId: string | null;
  previousCanon: CanonStatus | null;
  createdAt: Date;
};

export type Changelog = {
  releaseId: string;
  /** When the release was cut; null if it hasn't been, and then there's nothing to compare with. */
  releasedAt: Date | null;
  /** The later release compared against, or null for "now". */
  untilId: string | null;
  /** Notes that would be snapshotted if the release were cut now. */
  cuttable: number;
  entries: ChangelogEntry[];
  unchanged: number;
  retcons: ChangelogRetcon[];
  /** More notes changed than one changelog compares; the rest are left out. */
  truncated: boolean;
};

/**
 * What changed in the notes the user can read since a release was cut: notes
 * added, changed (by how many words) and removed, plus the retcons recorded
 * since. With `untilId`, compares against that later release's snapshots
 * instead of the notes as they are now.
 */
export async function getChangelog(projectId: string, releaseId: string, untilId?: string | null): Promise<Changelog> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    const access = await getNodeAccess(projectId);
    const releases = await userDb((tx) =>
      tx
        .select({ id: release.id, releasedAt: release.releasedAt })
        .from(release)
        .where(and(eq(release.projectId, projectId), inArray(release.id, untilId ? [releaseId, untilId] : [releaseId]))),
    );
    const from = releases.find((r) => r.id === releaseId);
    const until = untilId ? releases.find((r) => r.id === untilId) : undefined;
    if (!from) throw new Error("That release no longer exists.");
    if (untilId && !until?.releasedAt) throw new Error("The release to compare with hasn't been cut yet.");

    const notes = await userDb((tx) =>
      tx
        .select({
          id: node.id,
          parentId: node.parentId,
          title: node.title,
          kind: node.kind,
          canon: node.canon,
          wordCount: node.wordCount,
          written: sql<boolean>`${node.ydoc} is not null`,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
          deletedAt: node.deletedAt,
        })
        .from(node)
        .where(eq(node.projectId, projectId)),
    );
    const byId = new Map(notes.map((n) => [n.id, n]));
    const trashed = (id: string) => {
      for (let n = byId.get(id), hops = 0; n && hops < 100; n = n.parentId ? byId.get(n.parentId) : undefined, hops++) if (n.deletedAt) return true;
      return false;
    };
    const readable = notes.filter((n) => access.has(n.id));
    const result: Changelog = {
      releaseId,
      releasedAt: from.releasedAt,
      untilId: until?.id ?? null,
      cuttable: notes.filter((n) => n.written && !trashed(n.id)).length,
      entries: [],
      unchanged: 0,
      retcons: [],
      truncated: false,
    };
    if (!from.releasedAt) return result;

    const snapshotColumns = { id: version.id, nodeId: version.nodeId, releaseId: version.releaseId, title: version.title, wordCount: version.wordCount, createdAt: version.createdAt };
    const snapshots = await userDb((tx) =>
      tx
        .select(snapshotColumns)
        .from(version)
        .where(and(eq(version.projectId, projectId), inArray(version.releaseId, until ? [releaseId, until.id] : [releaseId]))),
    );
    const then = new Map(snapshots.filter((s) => s.releaseId === releaseId).map((s) => [s.nodeId, s]));
    const later = new Map(snapshots.filter((s) => until && s.releaseId === until.id).map((s) => [s.nodeId, s]));

    // Decide what's cheap first; only notes touched since the cut need their text compared.
    const toCompare: typeof readable = [];
    // A rename, from the title kept with each release snapshot (older snapshots have none).
    const renamedFrom = (before: { title: string | null } | undefined, now: string) => (before?.title && before.title !== now ? before.title : null);
    const titleNow = (n: (typeof readable)[number], after: { title: string | null } | undefined) => (until ? (after?.title ?? n.title) : n.title);
    for (const n of readable) {
      const before = then.get(n.id);
      const after = until ? later.get(n.id) : undefined;
      const renamed = renamedFrom(before, titleNow(n, after));
      const entry = { nodeId: n.id, title: n.title, renamedFrom: renamed, kind: n.kind, canon: n.canon, versionId: before?.id ?? null, untilVersionId: after?.id ?? null };
      const gone = until ? !after : trashed(n.id);
      if (!before) {
        // No snapshot: written since the release was cut (or, against a later release, by then).
        const isNew = until ? !!after : !gone && (n.written || n.createdAt > from.releasedAt);
        if (isNew) result.entries.push({ ...entry, change: "added", wordsBefore: 0, wordsAfter: after?.wordCount ?? n.wordCount });
      } else if (gone) {
        result.entries.push({ ...entry, change: "removed", wordsBefore: before.wordCount, wordsAfter: 0 });
      } else if (n.updatedAt.getTime() + CLOCK_SLACK_MS < before.createdAt.getTime()) {
        result.unchanged++;
      } else toCompare.push(n);
    }
    if (toCompare.length > MAX_COMPARED) {
      result.truncated = true;
      toCompare.length = MAX_COMPARED;
    }

    for (let i = 0; i < toCompare.length; i += SNAPSHOT_BATCH) {
      const batch = toCompare.slice(i, i + SNAPSHOT_BATCH);
      const versionIds = batch.flatMap((n) => [then.get(n.id)!.id, ...(until ? [later.get(n.id)!.id] : [])]);
      const [blobs, current] = await userDb((tx) =>
        Promise.all([
          tx.select({ id: version.id, snapshot: version.snapshot, r2Key: version.r2Key }).from(version).where(inArray(version.id, versionIds)),
          until ? [] : tx.select({ id: node.id, text: node.text }).from(node).where(inArray(node.id, batch.map((n) => n.id))),
        ]),
      );
      const blobById = new Map(blobs.map((b) => [b.id, b]));
      const textById = new Map(current.map((c) => [c.id, c.text]));
      for (const n of batch) {
        const before = then.get(n.id)!;
        const after = until ? later.get(n.id)! : null;
        const renamed = renamedFrom(before, titleNow(n, after ?? undefined));
        const entry = { nodeId: n.id, title: n.title, renamedFrom: renamed, kind: n.kind, canon: n.canon, versionId: before.id, untilVersionId: after?.id ?? null };
        try {
          const was = snapshotText(n.kind, await loadSnapshot(blobById.get(before.id)!));
          const now = after ? snapshotText(n.kind, await loadSnapshot(blobById.get(after.id)!)) : (textById.get(n.id) ?? "");
          const change = compareNote({ text: was }, { text: now });
          // A rename alone is a change too: the reader knew it by its old name.
          if (change.kind === "changed" || renamed) result.entries.push({ ...entry, change: "changed", wordsBefore: change.wordsBefore, wordsAfter: change.wordsAfter });
          else result.unchanged++;
        } catch {
          // A snapshot that can't be read can't be compared: say it changed rather than hide it.
          result.entries.push({ ...entry, change: "changed", wordsBefore: before.wordCount, wordsAfter: after?.wordCount ?? n.wordCount });
        }
      }
    }

    const retcons = await userDb((tx) =>
      tx
        .select({
          id: retcon.id,
          nodeId: retcon.nodeId,
          reason: retcon.reason,
          releaseId: retcon.releaseId,
          previousCanon: retcon.previousCanon,
          createdAt: retcon.createdAt,
        })
        .from(retcon)
        .where(
          and(
            eq(retcon.projectId, projectId),
            gt(retcon.createdAt, from.releasedAt!),
            ...(until?.releasedAt ? [lte(retcon.createdAt, until.releasedAt)] : []),
          ),
        )
        .orderBy(desc(retcon.createdAt)),
    );
    result.retcons = retcons.filter((r) => access.has(r.nodeId)).map((r) => ({ ...r, title: byId.get(r.nodeId)?.title ?? "Untitled" }));
    return result;
  });
}
