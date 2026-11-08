"use client";

import { useEffect, useMemo, useRef } from "react";
import { sharedResource } from "@/components/workflow/data";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { allApproved, hasGates, isApprover, isLocked, requiredReviewers } from "@/lib/editorial";
import type { ApprovalRow, QuestionnaireRow, ReviewState } from "@/lib/editorial-actions";
import { read } from "@/lib/read";
import { ancestors } from "@/lib/tree";

// Client copies of the editorial data (plan.md 2.8 "Review, editorial &
// approval"): rules, locks and approvals, shared by the Reviews view, the
// inspector's Review section and the editor's lock badge.

/** Announced after any change to review rules, requests or approvals. */
export const REVIEWS_NOTICE = "reviews";
/** Announced after any change to questionnaires or their answers. */
export const QUESTIONNAIRES_NOTICE = "questionnaires";

const useReviewResource = sharedResource<ReviewState>();
const useQuestionnaireResource = sharedResource<QuestionnaireRow[]>();

/** Rules, locks and approvals of the project. Not loaded for projects whose workflow has no gates and no editorial module. */
export function useReviews() {
  const { project, modules, stages } = useWorkspace();
  const wanted = modules.has("editorial") || hasGates(stages);
  return useReviewResource(wanted ? project.id : null, () => read("getReviewState", project.id), REVIEWS_NOTICE);
}

export function useQuestionnaires() {
  const { project } = useWorkspace();
  return useQuestionnaireResource(project.id, () => read("listQuestionnaires", project.id), QUESTIONNAIRES_NOTICE);
}

export type NodeReviewState = {
  /** The note's stage is a locked one. */
  locked: boolean;
  /** Locked, and the current user isn't one of its approvers: they can read and comment only. */
  readOnly: boolean;
  /** The current user is a required reviewer, or can manage the note. */
  approver: boolean;
  required: string[];
  approvals: ApprovalRow[];
  /** The current user's own approval, if they've been asked. */
  mine: ApprovalRow | null;
  /** Every required reviewer has approved (false when nobody is required). */
  approved: boolean;
};

const none: NodeReviewState = { locked: false, readOnly: false, approver: false, required: [], approvals: [], mine: null, approved: false };

/**
 * The review state of one note, as it is right now: the lock follows the
 * binder's copy of the note (so it flips the moment its stage changes), the
 * approvals come from the server.
 */
export function useNodeReview(nodeId: string | null): NodeReviewState {
  const { binder, stages, user } = useWorkspace();
  const { index } = useStore(binder);
  const { data, refresh } = useReviews();
  const node = nodeId ? index.byId.get(nodeId) : undefined;

  // Moving a note between stages can clear its approvals on the server.
  const status = node?.status;
  const seen = useRef(status);
  useEffect(() => {
    if (seen.current !== status) refresh();
    seen.current = status;
  }, [refresh, status]);

  return useMemo(() => {
    if (!node) return none;
    const locked = isLocked(stages, node.status);
    const required = data ? requiredReviewers(node, ancestors(index, node.id).map((a) => a.id), data.rules) : [];
    const approvals = data?.nodes[node.id]?.approvals ?? [];
    const approver = isApprover(required, user.id, node.actions.includes("manage"));
    return {
      locked,
      readOnly: locked && !approver,
      approver,
      required,
      approvals,
      mine: approvals.find((a) => a.reviewerId === user.id) ?? null,
      approved: required.length > 0 && allApproved(required, approvals),
    };
  }, [data, index, node, stages, user.id]);
}
