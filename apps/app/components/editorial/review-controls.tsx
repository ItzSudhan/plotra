"use client";

import type { ApprovalStatus } from "@plotra/db/schema";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { Icon, type IconName } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { fieldClass, errorText } from "@/components/views/view-ui";
import { Avatar, usePeople } from "@/components/workflow/data";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { nextApprovalStage } from "@/lib/editorial";
import { approveAsManager, cancelReview, decideApproval, requestReview, type ApprovalRow } from "@/lib/editorial-actions";
import { stageOf } from "@/lib/stages";
import { REVIEWS_NOTICE, useNodeReview, useReviews, type NodeReviewState } from "./data";
import { SelectField } from "@plotra/ui/components/select-field";

// The controls of a review (plan.md 2.8): asking for one, approving, asking
// for changes, and a manager's override. Used by the inspector's Review
// section and the Reviews view.

export const approvalMeta: Record<ApprovalStatus, { label: string; icon: IconName; className: string }> = {
  pending: { label: "Waiting", icon: "hourglass-linear", className: "text-muted-foreground" },
  approved: { label: "Approved", icon: "check-circle-linear", className: "text-teal-ink" },
  changes: { label: "Changes requested", icon: "danger-circle-linear", className: "text-ember-ink" },
};

const smallButton = "flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-ui-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-40";

/** The review actions, each followed by telling every view (and everyone else) what changed. */
export function useReviewActions() {
  const { project, stages, notify, refreshBinder, announce } = useWorkspace();
  const { refresh } = useReviews();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (work: () => Promise<{ movedTo?: string | null } | void>, done?: string) => {
      setBusy(true);
      try {
        const result = await work();
        notify(REVIEWS_NOTICE);
        refresh();
        if (result && result.movedTo) {
          // The note changed stage on the server: fetch it, and tell the others to.
          refreshBinder();
          announce();
          toast.success(`Approved. Moved to “${stageOf(stages, result.movedTo).label}”.`);
        } else if (done) toast.success(done);
      } catch (error) {
        toast.error(errorText(error));
      } finally {
        setBusy(false);
      }
    },
    [announce, notify, refresh, refreshBinder, stages],
  );

  return {
    busy,
    request: (nodeId: string, targetStage?: string) => run(() => requestReview(project.id, nodeId, targetStage).then(() => {}), "Review requested."),
    cancel: (nodeId: string) => run(() => cancelReview(project.id, nodeId), "Request withdrawn."),
    decide: (nodeId: string, decision: "approved" | "changes", note?: string) =>
      run(() => decideApproval(project.id, nodeId, decision, note), decision === "approved" ? "Approved." : "Changes requested."),
    override: (nodeId: string, targetStage?: string) => run(() => approveAsManager(project.id, nodeId, targetStage)),
  };
}

/** Each reviewer of a note and where their approval stands. */
export function ReviewerList({ review }: { review: Pick<NodeReviewState, "required" | "approvals"> }) {
  const people = usePeople();
  const ids = [...new Set([...review.required, ...review.approvals.map((a) => a.reviewerId)])];
  if (!ids.length) return null;
  return (
    <ul className="grid gap-1.5">
      {ids.map((id) => {
        const approval = review.approvals.find((a) => a.reviewerId === id);
        const meta = approval ? approvalMeta[approval.status] : null;
        const person = people.get(id);
        return (
          <li key={id} className="grid gap-0.5 text-ui-sm">
            <span className="flex items-center gap-1.5">
              <Avatar person={person} />
              <span className="min-w-0 flex-1 truncate">{person?.name ?? "Former member"}</span>
              {meta ? (
                <span className={cn("flex shrink-0 items-center gap-1 text-xs", meta.className)}>
                  <Icon name={meta.icon} className="size-3.5" />
                  {meta.label}
                </span>
              ) : (
                <span className="shrink-0 text-xs text-faint">Not asked yet</span>
              )}
            </span>
            {approval?.note && <p className="ml-[26px] text-xs break-words whitespace-pre-wrap text-muted-foreground">{approval.note}</p>}
          </li>
        );
      })}
    </ul>
  );
}

/** Approve, or ask for changes with a note. */
export function DecisionButtons({ nodeId, mine, actions }: { nodeId: string; mine: ApprovalRow | null; actions: ReturnType<typeof useReviewActions> }) {
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  if (asking) {
    return (
      <div className="grid gap-1.5">
        <textarea
          autoFocus
          rows={3}
          value={note}
          placeholder="What needs to change?"
          onChange={(e) => setNote(e.target.value)}
          className="w-full resize-y rounded-md border border-input bg-transparent px-2 py-1.5 text-ui-sm leading-relaxed outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <div className="flex justify-end gap-1.5">
          <button type="button" onClick={() => setAsking(false)} className="h-8 rounded-md px-2.5 text-ui-sm text-muted-foreground hover:bg-accent">
            Cancel
          </button>
          <button
            type="button"
            disabled={actions.busy || !note.trim()}
            onClick={() =>
              void actions.decide(nodeId, "changes", note).then(() => {
                setAsking(false);
                setNote("");
              })
            }
            className="h-8 rounded-md bg-foreground px-2.5 text-ui-sm text-background disabled:opacity-40"
          >
            Request changes
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        disabled={actions.busy || mine?.status === "approved"}
        onClick={() => void actions.decide(nodeId, "approved")}
        className={cn(smallButton, "border-teal/50 bg-teal/10 text-teal-ink hover:bg-teal/20")}
      >
        <Icon name="check-circle-linear" className="size-3.5" />
        {mine?.status === "approved" ? "You approved" : "Approve"}
      </button>
      <button type="button" disabled={actions.busy} onClick={() => setAsking(true)} className={smallButton}>
        <Icon name="pen-linear" className="size-3.5" />
        Request changes
      </button>
    </div>
  );
}

/**
 * The inspector's Review section: whether the note is locked, who has to
 * approve it and where each approval stands, and the buttons to ask for a
 * review, decide one, or (for managers) approve in the reviewers' place.
 */
export function ReviewSection({ nodeId }: { nodeId: string }) {
  const { binder, stages, user, openView } = useWorkspace();
  const node = useStore(binder).index.byId.get(nodeId);
  const review = useNodeReview(nodeId);
  const actions = useReviewActions();
  const [target, setTarget] = useState("");
  if (!node) return null;

  const stage = stageOf(stages, node.status);
  const canEdit = node.actions.includes("edit") && !review.readOnly;
  const canManage = node.actions.includes("manage");
  const requested = review.approvals.find((a) => a.targetStage)?.targetStage ?? null;
  const open = review.approvals.some((a) => a.status !== "approved");
  const suggested = nextApprovalStage(stages, node.status);
  const targets = stages.filter((s) => s.id !== node.status);
  const targetId = targets.some((s) => s.id === target) ? target : (suggested?.id ?? "");
  const iReview = review.required.includes(user.id) || review.mine !== null;

  return (
    <div className="grid gap-1.5">
      <span className="text-meta font-medium text-muted-foreground">Review</span>
      <div className="grid gap-2.5">
        {review.locked && (
          <p className="flex items-start gap-1.5 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
            <Icon name="lock-linear" className="mt-px size-3.5 shrink-0" />
            {review.readOnly
              ? `Locked in “${stage.label}”. Only an approver can change it or move it out.`
              : `Locked in “${stage.label}” for everyone but its approvers. You're one of them.`}
          </p>
        )}

        {review.required.length === 0 && review.approvals.length === 0 ? (
          <p className="text-xs text-faint">
            Nobody is required to review this.{" "}
            <button type="button" onClick={() => openView("reviews")} className="underline underline-offset-2 hover:text-foreground">
              Set up reviewers
            </button>
          </p>
        ) : (
          <>
            <ReviewerList review={review} />
            {requested && open && <p className="text-xs text-muted-foreground">Moves to “{stageOf(stages, requested).label}” once everyone has approved.</p>}
          </>
        )}

        {iReview && (review.mine || review.approvals.length > 0) && <DecisionButtons nodeId={nodeId} mine={review.mine} actions={actions} />}

        {canEdit && review.required.length > 0 && (
          <div className="grid gap-1.5">
            {targets.length > 0 && (
              <label className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-ui-sm text-muted-foreground">
                Move to
                <SelectField value={targetId} onValueChange={(v) => setTarget(v)} className={fieldClass}>
                  {!targetId && <option value="">Choose a stage</option>}
                  {targets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                      {s.approval ? " (needs approval)" : ""}
                    </option>
                  ))}
                </SelectField>
              </label>
            )}
            <div className="flex flex-wrap gap-1.5">
              <button type="button" disabled={actions.busy || !targetId} onClick={() => void actions.request(nodeId, targetId)} className={smallButton}>
                <Icon name="user-check-rounded-linear" className="size-3.5" />
                {review.approvals.length ? "Ask again" : "Request review"}
              </button>
              {review.approvals.length > 0 && (
                <button type="button" disabled={actions.busy} onClick={() => void actions.cancel(nodeId)} className={cn(smallButton, "text-muted-foreground")}>
                  Withdraw
                </button>
              )}
            </div>
          </div>
        )}

        {canManage && review.required.length > 0 && !review.approved && (requested ?? suggested?.id) && (
          <Tooltip content="Managers can approve in the reviewers’ place. This moves the note on without waiting for them.">
          <button
            type="button"
            disabled={actions.busy}
            onClick={() => void actions.override(nodeId, requested ?? suggested?.id)}
            className={cn(smallButton, "text-muted-foreground")}
          >
            <Icon name="shield-check-linear" className="size-3.5" />
            Approve as manager → {stageOf(stages, (requested ?? suggested?.id)!).label}
          </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
