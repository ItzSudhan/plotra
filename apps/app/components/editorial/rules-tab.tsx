"use client";

import { Icon } from "@plotra/icons";
import { IconButton } from "@plotra/ui/components/icon-button";
import { undoToast } from "@plotra/ui/components/sonner";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { errorText, fieldClass } from "@/components/views/view-ui";
import { Avatar, usePeople } from "@/components/workflow/data";
import { useStore } from "@/components/workspace/stores";
import { nodeTags } from "@/components/workspace/tags-pane";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { normalizeTag } from "@/lib/doc-index";
import { createReviewRule, deleteReviewRule } from "@/lib/editorial-actions";
import { ancestors, flatten } from "@/lib/tree";
import { REVIEWS_NOTICE, useReviews } from "./data";
import { SelectField } from "@plotra/ui/components/select-field";
import { SuggestInput } from "@plotra/ui/components/suggest-input";

// Required reviewers (plan.md 2.8): "the showrunner must approve anything in
// /Season 2; the continuity editor approves anything tagged #canon".

type Scope = "project" | "folder" | "tag";

export function RulesTab() {
  const { project, binder, stages, notify, setUi } = useWorkspace();
  const { index } = useStore(binder);
  const { data, refresh } = useReviews();
  const people = usePeople();
  const canManage = project.actions.includes("manage");
  const [scope, setScope] = useState<Scope>("folder");
  const [nodeId, setNodeId] = useState("");
  const [tag, setTag] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [busy, setBusy] = useState(false);

  const live = useMemo(() => flatten(index), [index]);
  const tags = useMemo(() => [...new Set(live.flatMap(nodeTags))].sort(), [live]);
  const gates = stages.filter((s) => s.approval || s.locked);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      notify(REVIEWS_NOTICE);
      refresh();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const ready = !!reviewerId && (scope === "project" || (scope === "folder" ? !!nodeId : !!normalizeTag(tag)));
  const add = () =>
    run(async () => {
      await createReviewRule(project.id, {
        reviewerId,
        nodeId: scope === "folder" ? nodeId : null,
        tag: scope === "tag" ? normalizeTag(tag) : null,
      });
      setNodeId("");
      setTag("");
    });

  if (!data) return <div className="m-4 h-24 animate-pulse rounded-lg bg-muted" />;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 p-4">
      <section className="grid gap-2 text-ui-sm">
        <h3 className="text-ui-sm font-medium">How it works</h3>
        <p className="text-muted-foreground">
          A note can&apos;t enter a stage that needs approval until every reviewer required for it has approved. People who can manage the note may approve
          in their place. A note in a locked stage is read-only for everyone but those approvers.
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {gates.length ? (
            gates.map((s) => (
              <span key={s.id} className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
                <span className="text-faint">{[s.approval && "needs approval", s.locked && "locked"].filter(Boolean).join(", ")}</span>
              </span>
            ))
          ) : (
            <span className="text-muted-foreground">No stage needs approval or locks content yet.</span>
          )}
          {canManage && (
            <button type="button" onClick={() => setUi({ projectSettings: true })} className="ml-1 py-2 text-xs underline underline-offset-2 hover:text-foreground">
              Edit the workflow
            </button>
          )}
        </div>
      </section>

      <section className="grid gap-2">
        <h3 className="text-ui-sm font-medium">Required reviewers · {data.rules.length}</h3>
        {data.rules.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-ui-sm text-muted-foreground">
            Nobody is required to review anything yet, so anyone who can edit a note can move it through every stage.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border text-ui-sm">
            {data.rules.map((rule) => {
              const folder = rule.nodeId ? index.byId.get(rule.nodeId) : undefined;
              const person = people.get(rule.reviewerId);
              return (
                <li key={rule.id} className="flex items-center gap-2.5 px-3 py-2">
                  <Avatar person={person} className="size-6" />
                  <p className="min-w-0 flex-1">
                    <span className="font-medium">{person?.name ?? "Former member"}</span>
                    <span className="text-muted-foreground"> must approve </span>
                    {!rule.nodeId && !rule.tag && "everything in the project"}
                    {rule.nodeId && (
                      <>
                        <span className="text-muted-foreground">everything in </span>
                        <Icon name="folder-linear" className="mr-1 inline size-3.5 align-[-2px] text-muted-foreground" />
                        {folder ? [...ancestors(index, folder.id), folder].map((a) => a.title).join(" / ") : "a deleted folder"}
                      </>
                    )}
                    {rule.tag && (
                      <>
                        <span className="text-muted-foreground">{rule.nodeId ? " tagged " : "everything tagged "}</span>
                        <span className="rounded bg-muted px-1 font-mono text-xs">#{rule.tag}</span>
                      </>
                    )}
                  </p>
                  {canManage && (
                    <IconButton
                      icon="trash-bin-minimalistic-linear"
                      label={`Remove the rule for ${person?.name ?? "this reviewer"}`}
                      variant="destructive"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await deleteReviewRule(project.id, rule.id);
                          // Making the same rule again undoes it.
                          undoToast(`Removed the rule for ${person?.name ?? "this reviewer"}`, () =>
                            run(() => createReviewRule(project.id, { reviewerId: rule.reviewerId, nodeId: rule.nodeId, tag: rule.tag })),
                          );
                        })
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {canManage ? (
        <section className="grid gap-2">
          <h3 className="text-ui-sm font-medium">Add a reviewer</h3>
          <div className="flex flex-wrap items-center gap-2 text-ui-sm">
            <SelectField value={reviewerId} onValueChange={(v) => setReviewerId(v)} aria-label="Reviewer" className={`${fieldClass} max-w-48`}>
              <option value="">Who…</option>
              {[...people.values()].map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectField>
            <span className="text-muted-foreground">must approve</span>
            <SelectField value={scope} onValueChange={(v) => setScope(v as Scope)} aria-label="What they approve" className={`${fieldClass} max-w-44`}>
              <option value="folder">everything in…</option>
              <option value="tag">everything tagged…</option>
              <option value="project">the whole project</option>
            </SelectField>
            {scope === "folder" && (
              <SelectField value={nodeId} onValueChange={(v) => setNodeId(v)} aria-label="Folder or note" className={`${fieldClass} max-w-64`}>
                <option value="">Choose a folder or note…</option>
                {live.map((n) => (
                  <option key={n.id} value={n.id}>
                    {"\u00a0\u00a0".repeat(ancestors(index, n.id).length)}
                    {n.title}
                  </option>
                ))}
              </SelectField>
            )}
            {scope === "tag" && (
              <>
                <SuggestInput
                  value={tag}
                  suggestions={tags}
                  placeholder="#canon"
                  aria-label="Tag"
                  onChange={(e) => setTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && ready && void add()}
                  className={`${fieldClass} max-w-44`}
                />
              </>
            )}
            <button
              type="button"
              disabled={busy || !ready}
              onClick={() => void add()}
              className="flex h-8 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-ui-sm text-background disabled:opacity-40"
            >
              Add rule
            </button>
          </div>
          <p className="text-xs text-muted-foreground">A folder rule covers the folder and everything inside it. A tag rule also covers nested tags, like #canon/book-2.</p>
        </section>
      ) : (
        <p className="text-xs text-muted-foreground">Only people who can manage the project can change who reviews what.</p>
      )}
    </div>
  );
}
