"use client";

import { Tooltip } from "@plotra/ui/components/tooltip";
import { Icon } from "@plotra/icons";
import { useMemo, useState } from "react";
import { fieldClass } from "@/components/views/view-ui";
import { usePeople } from "@/components/workflow/data";
import { StatusDot } from "@/components/workspace/status";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { NodeIcon } from "@/components/world/entity-icon";
import { nextApprovalStage, requiredReviewers } from "@/lib/editorial";
import { stageOf } from "@/lib/stages";
import { ancestors, flatten, isTrashed, type BinderNode } from "@/lib/tree";
import { useNodeReview, useReviews } from "./data";
import { DecisionButtons, ReviewerList, useReviewActions } from "./review-controls";
import { SelectField } from "@plotra/ui/components/select-field";

// The Reviews view's first tab: what's waiting for the current user's
// approval, every note that's in review, and a way to ask for a review.

const sectionTitle = "text-ui-sm font-medium";
const smallButton = "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-ui-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-40";

function NoteLine({ node }: { node: BinderNode }) {
  const { binder, openNode, stages } = useWorkspace();
  const { index } = useStore(binder);
  const trail = ancestors(index, node.id);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <NodeIcon node={node} className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => openNode(node.id, "tab")} className="block max-w-full truncate text-left text-sm font-medium hover:underline">
          {node.title}
        </button>
        {trail.length > 0 && <p className="truncate text-xs text-faint">{trail.map((a) => a.title).join(" / ")}</p>}
      </div>
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <StatusDot status={node.status} title={false} />
        {stageOf(stages, node.status).label}
      </span>
    </div>
  );
}

/** One note in review: who has decided what, and what the current user can do about it. */
function ReviewCard({ node, forMe }: { node: BinderNode; forMe: boolean }) {
  const { stages, user } = useWorkspace();
  const people = usePeople();
  const review = useNodeReview(node.id);
  const actions = useReviewActions();
  const requested = review.approvals.find((a) => a.targetStage)?.targetStage ?? null;
  const asker = review.approvals.find((a) => a.requestedById)?.requestedById;
  const canEdit = node.actions.includes("edit") && !review.readOnly;
  const canManage = node.actions.includes("manage");
  const iReview = review.required.includes(user.id) || review.mine !== null;

  return (
    <li className="grid gap-2.5 rounded-lg border bg-card p-3">
      <NoteLine node={node} />
      <p className="text-xs text-muted-foreground">
        {asker ? `${asker === user.id ? "You" : (people.get(asker)?.name ?? "Someone")} asked for a review` : "In review"}
        {requested && ` · moves to “${stageOf(stages, requested).label}” once everyone has approved`}
      </p>
      {review.locked && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon name="lock-linear" className="size-3.5" />
          Locked: only its approvers can change it.
        </p>
      )}
      <ReviewerList review={review} />
      <div className="flex flex-wrap items-start gap-1.5">
        {iReview && <DecisionButtons nodeId={node.id} mine={review.mine} actions={actions} />}
        {!forMe && canEdit && (
          <>
            <button type="button" disabled={actions.busy} onClick={() => void actions.request(node.id, requested ?? undefined)} className={smallButton}>
              <Icon name="restart-linear" className="size-3.5" />
              Ask again
            </button>
            <button type="button" disabled={actions.busy} onClick={() => void actions.cancel(node.id)} className={`${smallButton} text-muted-foreground`}>
              Withdraw
            </button>
          </>
        )}
        {canManage && !review.approved && requested && (
          <Tooltip content="Managers can approve in the reviewers’ place. This moves the note on without waiting for them.">
          <button
            type="button"
            disabled={actions.busy}
            onClick={() => void actions.override(node.id, requested)}
            className={`${smallButton} text-muted-foreground`}
          >
            <Icon name="shield-check-linear" className="size-3.5" />
            Approve as manager
          </button>
          </Tooltip>
        )}
      </div>
    </li>
  );
}

/** Pick a note that has required reviewers, and ask them. */
function RequestForm({ candidates }: { candidates: BinderNode[] }) {
  const { stages, binder } = useWorkspace();
  const { index } = useStore(binder);
  const actions = useReviewActions();
  const [nodeId, setNodeId] = useState("");
  const [target, setTarget] = useState("");
  const node = candidates.find((n) => n.id === nodeId);
  const targets = node ? stages.filter((s) => s.id !== node.status) : [];
  const targetId = targets.some((s) => s.id === target) ? target : ((node && nextApprovalStage(stages, node.status)?.id) ?? "");

  if (!candidates.length) {
    return <p className="text-ui-sm text-muted-foreground">None of the notes you can edit has a required reviewer. Add reviewers under Rules.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SelectField value={nodeId} onValueChange={(v) => setNodeId(v)} aria-label="Note" className={`${fieldClass} max-w-xs`}>
        <option value="">Choose a note…</option>
        {candidates.map((n) => (
          <option key={n.id} value={n.id}>
            {"\u00a0\u00a0".repeat(ancestors(index, n.id).length)}
            {n.title}
          </option>
        ))}
      </SelectField>
      <SelectField value={targetId} disabled={!node} onValueChange={(v) => setTarget(v)} aria-label="Stage to move to" className={`${fieldClass} max-w-52`}>
        {!targetId && <option value="">Move to…</option>}
        {targets.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
            {s.approval ? " (needs approval)" : ""}
          </option>
        ))}
      </SelectField>
      <button
        type="button"
        disabled={actions.busy || !node || !targetId}
        onClick={() => void actions.request(nodeId, targetId).then(() => setNodeId(""))}
        className={smallButton}
      >
        <Icon name="user-check-rounded-linear" className="size-3.5" />
        Request review
      </button>
    </div>
  );
}

export function InboxTab() {
  const { binder, user, stages } = useWorkspace();
  const { index } = useStore(binder);
  const { data } = useReviews();

  const { mine, others, locked, candidates } = useMemo(() => {
    const live = flatten(index);
    const reviews = data?.nodes ?? {};
    const inReview = live.filter((n) => reviews[n.id]?.approvals.length);
    const waitingForMe = (n: BinderNode) => reviews[n.id].approvals.some((a) => a.reviewerId === user.id && a.status === "pending");
    return {
      mine: inReview.filter(waitingForMe),
      others: inReview.filter((n) => !waitingForMe(n)),
      locked: live.filter((n) => stageOf(stages, n.status).locked && !reviews[n.id]?.approvals.length),
      candidates: data
        ? live.filter(
            (n) =>
              n.actions.includes("edit") &&
              !reviews[n.id]?.approvals.length &&
              requiredReviewers(n, ancestors(index, n.id).map((a) => a.id), data.rules).length > 0,
          )
        : [],
    };
  }, [data, index, stages, user.id]);

  if (!data) return <div className="m-4 h-24 animate-pulse rounded-lg bg-muted" />;
  const gated = stages.some((s) => s.approval || s.locked);

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 p-4">
      {!gated && (
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-ui-sm text-muted-foreground">
          No stage of this project&apos;s workflow needs approval or locks content yet. Mark one under Project settings → Workflow; reviews can still be
          requested and recorded meanwhile.
        </p>
      )}
      <section className="grid gap-2">
        <h3 className={sectionTitle}>Waiting for you · {mine.length}</h3>
        {mine.length ? (
          <ul className="grid gap-2">
            {mine.filter((n) => !isTrashed(index, n.id)).map((n) => (
              <ReviewCard key={n.id} node={n} forMe />
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-ui-sm text-muted-foreground">
            <Icon name="inbox-linear" className="size-4" />
            Nothing is waiting for your approval.
          </p>
        )}
      </section>

      <section className="grid gap-2">
        <h3 className={sectionTitle}>Request a review</h3>
        <RequestForm candidates={candidates} />
      </section>

      {others.length > 0 && (
        <section className="grid gap-2">
          <h3 className={sectionTitle}>In review · {others.length}</h3>
          <ul className="grid gap-2">
            {others.map((n) => (
              <ReviewCard key={n.id} node={n} forMe={false} />
            ))}
          </ul>
        </section>
      )}

      {locked.length > 0 && (
        <section className="grid gap-2">
          <h3 className={sectionTitle}>Locked · {locked.length}</h3>
          <ul className="grid gap-1.5 rounded-lg border p-3">
            {locked.map((n) => (
              <li key={n.id}>
                <NoteLine node={n} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
