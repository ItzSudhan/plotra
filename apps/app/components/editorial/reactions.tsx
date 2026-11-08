"use client";

import type { CommentAnchor } from "@plotra/db/schema";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { cn } from "@plotra/ui/lib/utils";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { errorText } from "@/components/views/view-ui";
import { commentsNotice, useComments } from "@/components/workflow/data";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { groupReactions, reactionEmojis, reactionLabels } from "@/lib/editorial";
import { createCommentThread, deleteComment, type CommentThreadRow, type Person } from "@/lib/workflow-actions";

// Inline reactions (plan.md 2.8 "Beta readers… with inline reactions"): a
// reader reacts to a passage with one click. A reaction is a comment thread
// with `reaction` set, so it's anchored, highlighted and access-checked like
// any comment.

export type Passage = { anchor: CommentAnchor | null; quote: string | null };

/** The emoji buttons next to the editor's Comment bubble. */
export function ReactionBar({ nodeId, getPassage, onDone }: { nodeId: string; getPassage: () => Passage | null; onDone?: () => void }) {
  const { project, notify } = useWorkspace();
  const { refresh } = useComments(nodeId);
  const [busy, setBusy] = useState(false);

  const react = async (emoji: string) => {
    const passage = getPassage();
    if (!passage?.anchor || busy) return;
    setBusy(true);
    try {
      await createCommentThread(project.id, nodeId, { anchor: passage.anchor, quote: passage.quote, body: emoji, reaction: emoji });
      notify(commentsNotice(nodeId));
      refresh();
      onDone?.();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex items-center" role="group" aria-label="React to this passage">
      {reactionEmojis.map((emoji) => (
        <Tooltip key={emoji} content={reactionLabels[emoji]}>
        <button
          type="button"
          aria-label={reactionLabels[emoji]}
          disabled={busy}
          // Keep the selection: it's what the reaction is anchored to.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void react(emoji)}
          className="grid size-8 place-items-center rounded-md text-[15px] leading-none hover:bg-accent disabled:opacity-50"
        >
          {emoji}
        </button>
        </Tooltip>
      ))}
    </span>
  );
}

/** Reactions in the comments panel: per passage, each emoji with its count and who left it. */
export function ReactionsSummary({
  nodeId,
  threads,
  people,
  canComment,
  onRefresh,
}: {
  nodeId: string;
  threads: CommentThreadRow[];
  people: Map<string, Person>;
  canComment: boolean;
  onRefresh: () => void;
}) {
  const { project, user, setUi, editors, notify } = useWorkspace();
  const groups = useMemo(() => groupReactions(threads), [threads]);
  const [busy, setBusy] = useState(false);
  if (!groups.length) return null;
  const total = groups.reduce((sum, g) => sum + g.counts.reduce((n, c) => n + c.threadIds.length, 0), 0);

  const toggle = async (group: (typeof groups)[number], count: (typeof groups)[number]["counts"][number]) => {
    if (busy) return;
    setBusy(true);
    try {
      const mine = threads.find((t) => count.threadIds.includes(t.id) && t.createdById === user.id);
      if (mine) {
        // A reaction's thread goes with its only comment.
        for (const c of mine.comments.filter((c) => c.authorId === user.id)) await deleteComment(project.id, c.id);
      } else {
        const source = threads.find((t) => t.id === group.threadId);
        await createCommentThread(project.id, nodeId, { anchor: source?.anchor ?? null, quote: group.quote, body: count.emoji, reaction: count.emoji });
      }
      notify(commentsNotice(nodeId));
      onRefresh();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid gap-2">
      <h3 className="text-ui-sm font-medium">Reactions · {total}</h3>
      {groups.map((group) => (
        <div key={group.key} className="grid gap-1.5 rounded-lg border bg-card p-2.5">
          <button
            type="button"
            aria-label={`Show “${(group.quote || "the passage").slice(0, 60)}” in the text`}
            onClick={() => {
              setUi({ activeThreadId: group.threadId });
              editors.current.get(nodeId)?.revealThread(group.threadId);
            }}
            className="line-clamp-2 border-l-2 border-gold/60 pl-2 text-left text-xs text-muted-foreground italic hover:text-foreground"
          >
            {group.quote || "A passage"}
          </button>
          <div className="flex flex-wrap gap-1">
            {group.counts.map((count) => {
              const names = count.userIds.map((id) => (id === user.id ? "You" : (people.get(id)?.name ?? "Former member")));
              const mine = count.userIds.includes(user.id);
              return (
                <Tooltip key={count.emoji} content={`${reactionLabels[count.emoji] ?? "Reaction"}: ${names.join(", ")}${mine ? " (select to remove yours)" : ""}`}>
                <button
                  type="button"
                  disabled={busy || (!canComment && !mine)}
                  aria-pressed={mine}
                  aria-label={`${reactionLabels[count.emoji] ?? "Reaction"}, ${count.threadIds.length}: ${names.join(", ")}`}
                  onClick={() => void toggle(group, count)}
                  className={cn(
                    "flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs tabular-nums hover:bg-accent disabled:pointer-events-none",
                    mine && "border-gold/70 bg-gold/15",
                  )}
                >
                  <span className="text-ui-sm leading-none">{count.emoji}</span>
                  {count.threadIds.length}
                </button>
                </Tooltip>
              );
            })}
          </div>
          <p className="truncate text-meta text-muted-foreground">
            {[...new Set(group.counts.flatMap((c) => c.userIds))].map((id) => (id === user.id ? "You" : (people.get(id)?.name ?? "Former member"))).join(", ")}
          </p>
        </div>
      ))}
    </section>
  );
}
