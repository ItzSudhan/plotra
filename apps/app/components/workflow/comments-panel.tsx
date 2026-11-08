"use client";

import { Icon } from "@plotra/icons";
import { confirm } from "@plotra/ui/components/dialogs";
import { undoToast } from "@plotra/ui/components/sonner";
import { IconButton } from "@plotra/ui/components/icon-button";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { cn } from "@plotra/ui/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Suggestion } from "@/components/editor/review";
import { ReactionsSummary } from "@/components/editorial/reactions";
import { emptyStats, useStore } from "@/components/workspace/stores";
import { useUi, useWorkspace } from "@/components/workspace/workspace-provider";
import {
  createCommentThread,
  deleteComment,
  editComment,
  replyToThread,
  restoreComment,
  setThreadResolved,
  type CommentThreadRow,
  type Person,
} from "@/lib/workflow-actions";
import { Avatar, commentsNotice, timeAgo, useComments, usePeople } from "./data";
import { isDocumentKind } from "@/lib/story";
import { errorText } from "@/lib/errors";
import { scrollBehavior } from "@/lib/motion";

// Comments and suggestions on the active note (plan.md 2.6): threads anchored
// to passages, replies, resolve / reopen, @mentions, and the tracked changes
// waiting for an editor to accept or reject.


/** Comment text with @mentions of workspace members picked out. */
export function Body({ text, people }: { text: string; people: Map<string, Person> }) {
  const names = useMemo(
    () =>
      [...people.values()]
        .map((p) => p.name)
        .filter(Boolean)
        .sort((a, b) => b.length - a.length),
    [people],
  );
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest) {
    const at = rest.indexOf("@");
    if (at < 0) break;
    const name = names.find((n) => rest.slice(at + 1, at + 1 + n.length).toLowerCase() === n.toLowerCase());
    if (!name) {
      parts.push(rest.slice(0, at + 1));
      rest = rest.slice(at + 1);
      continue;
    }
    parts.push(rest.slice(0, at));
    parts.push(
      <span key={key++} className="rounded bg-ember/10 px-0.5 font-medium text-ember-ink">
        @{rest.slice(at + 1, at + 1 + name.length)}
      </span>,
    );
    rest = rest.slice(at + 1 + name.length);
  }
  parts.push(rest);
  return <p className="text-ui-sm leading-relaxed break-words whitespace-pre-wrap">{parts}</p>;
}

/** A textarea that suggests workspace members after "@", and submits on ⌘↵ (or on Enter, for a chat). */
export function Composer({
  placeholder,
  initial = "",
  autoFocus,
  submitLabel,
  onSubmit,
  onCancel,
  sendOnEnter,
}: {
  placeholder: string;
  initial?: string;
  autoFocus?: boolean;
  submitLabel: string;
  onSubmit: (text: string) => Promise<void>;
  onCancel?: () => void;
  /** A chat sends on Enter; Shift+Enter starts a new line. */
  sendOnEnter?: boolean;
}) {
  const people = usePeople();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{ query: string; at: number } | null>(null);
  const matches = mention
    ? [...people.values()].filter((p) => p.name.toLowerCase().startsWith(mention.query.toLowerCase())).slice(0, 5)
    : [];

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(text);
      setText("");
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const pick = (person: Person) => {
    if (!mention) return;
    const next = `${text.slice(0, mention.at)}@${person.name} ${text.slice(mention.at + 1 + mention.query.length)}`;
    setText(next);
    setMention(null);
    requestAnimationFrame(() => ref.current?.focus());
  };

  return (
    <div className="relative grid gap-1.5">
      <textarea
        ref={ref}
        value={text}
        rows={2}
        aria-label={placeholder}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          const caret = e.target.selectionStart;
          const before = e.target.value.slice(0, caret);
          const match = /(^|\s)@([\p{L}\p{N} .'-]{0,30})$/u.exec(before);
          setMention(match ? { query: match[2], at: caret - match[2].length - 1 } : null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && mention && matches[0]) {
            e.preventDefault();
            pick(matches[0]);
          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey || (sendOnEnter && !e.shiftKey && !e.nativeEvent.isComposing))) {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape") {
            if (mention) setMention(null);
            else onCancel?.();
          }
        }}
        className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-ui-sm leading-relaxed outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      {mention && matches.length > 0 && (
        <ul className="absolute top-full left-0 z-10 mt-1 w-56 rounded-md border bg-popover p-1 shadow-md">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                className="flex min-h-8 w-full items-center gap-2 rounded px-2 py-1 text-left text-ui-sm hover:bg-accent"
              >
                <Avatar person={p} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.guest && <span className="text-meta text-faint">Guest</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-1.5">
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-8 rounded-md px-2.5 text-ui-sm text-muted-foreground hover:bg-sidebar-accent">
            Cancel
          </button>
        )}
        <button
          type="button"
          disabled={!text.trim() || busy}
          onClick={() => void submit()}
          className="h-8 rounded-md bg-foreground px-3 text-ui-sm text-background disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function Thread({
  thread,
  nodeId,
  canComment,
  canManage,
  people,
  active,
  onRefresh,
}: {
  thread: CommentThreadRow;
  nodeId: string;
  canComment: boolean;
  canManage: boolean;
  people: Map<string, Person>;
  active: boolean;
  onRefresh: () => void;
}) {
  const { project, user, setUi, editors, notify } = useWorkspace();
  const [editing, setEditing] = useState<string | null>(null);
  const [replying, setReplying] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", behavior: scrollBehavior() });
  }, [active]);

  const changed = () => {
    notify(commentsNotice(nodeId));
    onRefresh();
  };
  const run = async (work: () => Promise<void>) => {
    try {
      await work();
      changed();
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const reveal = () => {
    setUi({ activeThreadId: thread.id });
    editors.current.get(nodeId)?.revealThread(thread.id);
  };
  // Deleting is at once; Undo puts the comment (and its thread, if it went too) back as it was.
  const remove = (commentId: string, mine: boolean) =>
    void run(async () => {
      const { undo } = await deleteComment(project.id, commentId);
      undoToast(mine ? "Deleted your comment" : "Deleted the comment", async () => {
        try {
          await restoreComment(project.id, undo);
          changed();
        } catch (error) {
          toast.error(errorText(error));
        }
      });
    });

  return (
    // A click anywhere on the card shows its passage; the quote is the keyboard's way to the same thing.
    <div
      ref={ref}
      role="group"
      aria-label={thread.quote ? `Comment on “${thread.quote.slice(0, 60)}”` : "Comment on the whole note"}
      onClick={reveal}
      className={cn(
        "grid gap-2 rounded-lg border bg-card p-3 transition-colors",
        active ? "border-gold/70 ring-1 ring-gold/40" : "hover:border-foreground/20",
        thread.resolvedAt && "opacity-70",
      )}
    >
      <button
        type="button"
        aria-label={thread.quote ? `Show “${thread.quote.slice(0, 60)}” in the text` : "Select this comment on the whole note"}
        aria-current={active || undefined}
        onClick={(e) => {
          e.stopPropagation();
          reveal();
        }}
        className={cn("rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", !thread.quote && "justify-self-start")}
      >
        {thread.quote ? (
          <span className="line-clamp-2 border-l-2 border-gold/60 pl-2 text-xs text-muted-foreground italic">{thread.quote}</span>
        ) : (
          <span className="text-xs text-muted-foreground">On the whole note</span>
        )}
      </button>
      {thread.comments.map((c) => {
        const author = c.authorId ? people.get(c.authorId) : undefined;
        const mine = c.authorId === user.id;
        return (
          <div key={c.id} className="group/comment grid gap-1">
            <div className="flex items-center gap-1.5 text-xs">
              <Avatar person={author} />
              <span className="font-medium">{author?.name ?? "Former member"}</span>
              <span className="text-muted-foreground" title={new Date(c.createdAt).toLocaleString()}>
                {timeAgo(c.createdAt)}
                {c.editedAt && " · edited"}
              </span>
              {(mine || canManage) && (
                // Shown on hover, on keyboard focus, and always on touch screens.
                <span
                  className="ml-auto flex gap-0.5 opacity-0 group-focus-within/comment:opacity-100 group-hover/comment:opacity-100 pointer-coarse:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  {mine && <IconButton icon="pen-linear" label="Edit comment" size="xs" onClick={() => setEditing(c.id)} />}
                  <IconButton
                    icon="trash-bin-minimalistic-linear"
                    label="Delete comment"
                    size="xs"
                    variant="destructive"
                    onClick={() => remove(c.id, mine)}
                  />
                </span>
              )}
            </div>
            {editing === c.id ? (
              <div onClick={(e) => e.stopPropagation()}>
                <Composer
                  autoFocus
                  initial={c.body}
                  placeholder="Edit your comment"
                  submitLabel="Save"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (body) => {
                    await editComment(project.id, c.id, body);
                    setEditing(null);
                    changed();
                  }}
                />
              </div>
            ) : (
              <Body text={c.body} people={people} />
            )}
          </div>
        );
      })}
      {canComment && (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {replying ? (
            <div className="flex-1">
              <Composer
                autoFocus
                placeholder="Reply… (@ to mention, ⌘↵ to send)"
                submitLabel="Reply"
                onCancel={() => setReplying(false)}
                onSubmit={async (body) => {
                  await replyToThread(project.id, thread.id, body);
                  setReplying(false);
                  changed();
                }}
              />
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setReplying(true)}
                className="h-8 rounded-md px-2 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              >
                Reply
              </button>
              <button
                type="button"
                onClick={() => void run(() => setThreadResolved(project.id, thread.id, !thread.resolvedAt))}
                className="ml-auto flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              >
                <Icon name={thread.resolvedAt ? "restart-linear" : "check-circle-linear"} className="size-3.5" />
                {thread.resolvedAt ? "Reopen" : "Resolve"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const suggestionVerb: Record<Suggestion["type"], string> = {
  insert: "added",
  remove: "deleted",
  replace: "replaced",
  update: "formatted",
};

function Suggestions({ nodeId, canEdit }: { nodeId: string; canEdit: boolean }) {
  const { docs, editors } = useWorkspace();
  const people = usePeople();
  const suggestions = (useStore(docs)[nodeId] ?? emptyStats).suggestions;
  if (!suggestions.length) return null;
  const resolve = (s: Suggestion | "all", accept: boolean) => {
    editors.current.get(nodeId)?.resolveSuggestion(s === "all" ? null : s.suggestionId, accept);
  };
  const rejectAll = async () => {
    const n = suggestions.length;
    if (n > 3 && !(await confirm({ title: `Reject all ${n} suggestions?`, description: "Each suggested change is thrown away and the text stays as it was.", confirmLabel: "Reject all" }))) return;
    resolve("all", false);
  };

  return (
    <section className="grid gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-ui-sm font-medium">Suggestions · {suggestions.length}</h3>
        {canEdit && suggestions.length > 1 && (
          <span className="ml-auto flex gap-1">
            <button type="button" onClick={() => resolve("all", true)} className="h-8 rounded-md px-2 text-xs text-teal-ink hover:bg-teal/10">
              Accept all
            </button>
            <button type="button" onClick={() => void rejectAll()} className="h-8 rounded-md px-2 text-xs text-muted-foreground hover:bg-sidebar-accent">
              Reject all
            </button>
          </span>
        )}
      </div>
      {suggestions.map((s) => {
        // The agent's suggestions are recorded as "agent:<the person it worked for>" (lib/agent/write.ts).
        const byAgent = s.userId.startsWith("agent:");
        const author = people.get(byAgent ? s.userId.slice("agent:".length) : s.userId);
        return (
          <div key={s.suggestionId} className="grid gap-1.5 rounded-lg border bg-card p-3">
            <div className="flex items-center gap-1.5 text-xs">
              <Avatar person={author} />
              <span className="font-medium">{byAgent ? `AI, for ${author?.name ?? "someone"}` : (author?.name ?? "Someone")}</span>
              <span className="text-muted-foreground">{suggestionVerb[s.type]}</span>
              <span className="ml-auto text-muted-foreground">{timeAgo(s.createdAt)}</span>
            </div>
            <p className="text-ui-sm leading-relaxed break-words">
              {s.text && <del className="bg-destructive/10 text-destructive">{s.text.slice(0, 300)}</del>}
              {s.text && s.newText && " → "}
              {s.newText && <ins className="bg-teal/15 text-teal-ink no-underline">{s.newText.slice(0, 300)}</ins>}
            </p>
            {canEdit && (
              <div className="flex justify-end gap-1">
                <button type="button" onClick={() => resolve(s, false)} className="h-8 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-sidebar-accent">
                  Reject
                </button>
                <button type="button" onClick={() => resolve(s, true)} className="h-8 rounded-md bg-teal/15 px-2.5 text-xs font-medium text-teal-ink hover:bg-teal/25">
                  Accept
                </button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function CommentsPanel({ nodeId }: { nodeId: string }) {
  const { project, binder, setUi, editors, notify } = useWorkspace();
  const node = useStore(binder).index.byId.get(nodeId);
  const { commenting, activeThreadId, suggesting } = useUi();
  const { data: threads, refresh } = useComments(nodeId);
  const people = usePeople();
  const [showResolved, setShowResolved] = useState(false);
  if (!node) return null;

  const canComment = node.actions.includes("comment");
  const canEdit = node.actions.includes("edit");
  const canManage = node.actions.includes("manage");
  // One-click reactions are shown on their own, grouped by passage.
  const open = (threads ?? []).filter((t) => !t.resolvedAt && !t.reaction);
  const resolved = (threads ?? []).filter((t) => t.resolvedAt && !t.reaction);
  const draft = commenting?.nodeId === nodeId ? commenting : null;
  const isDocument = isDocumentKind(node.kind);

  return (
    <div className="grid gap-4 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {canComment && isDocument && !draft && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const handle = editors.current.get(nodeId);
              if (handle) handle.comment();
              else setUi({ commenting: { nodeId, anchor: null, quote: null } });
            }}
            className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-ui-sm hover:bg-sidebar-accent"
          >
            <Icon name="chat-round-line-linear" className="size-3.5" />
            Comment
          </button>
        )}
        {canEdit && isDocument && (
          <Tooltip content="Track your edits as suggestions" shortcut="⌘⇧E">
          <button
            type="button"
            aria-pressed={suggesting}
            onClick={() => setUi({ suggesting: !suggesting })}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-ui-sm hover:bg-sidebar-accent",
              suggesting && "border-teal/50 bg-teal/10 text-teal-ink",
            )}
          >
            <Icon name="pen-new-round-linear" className="size-3.5" />
            {suggesting ? "Suggesting" : "Suggest"}
          </button>
          </Tooltip>
        )}
      </div>

      {draft && (
        <div className="grid gap-2 rounded-lg border border-gold/60 bg-card p-3">
          {draft.quote ? (
            <p className="line-clamp-3 border-l-2 border-gold/60 pl-2 text-xs text-muted-foreground italic">{draft.quote}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Commenting on the whole note. Select some text first to comment on a passage.</p>
          )}
          <Composer
            autoFocus
            placeholder="Add a comment… (@ to mention, ⌘↵ to send)"
            submitLabel="Comment"
            onCancel={() => setUi({ commenting: null })}
            onSubmit={async (body) => {
              const { id } = await createCommentThread(project.id, nodeId, { anchor: draft.anchor, quote: draft.quote, body });
              setUi({ commenting: null, activeThreadId: id });
              notify(commentsNotice(nodeId));
              refresh();
            }}
          />
        </div>
      )}

      <Suggestions nodeId={nodeId} canEdit={canEdit} />

      <ReactionsSummary nodeId={nodeId} threads={threads ?? []} people={people} canComment={canComment} onRefresh={refresh} />

      <section className="grid gap-2">
        <h3 className="text-ui-sm font-medium">
          Comments{threads ? ` · ${open.length}` : ""}
        </h3>
        {threads === null ? (
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
        ) : open.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">
            {canComment ? "No open comments. Select text and press ⌘⌥M to start one." : "No open comments."}
          </p>
        ) : (
          open.map((t) => (
            <Thread
              key={t.id}
              thread={t}
              nodeId={nodeId}
              canComment={canComment}
              canManage={canManage}
              people={people}
              active={t.id === activeThreadId}
              onRefresh={refresh}
            />
          ))
        )}
        {resolved.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowResolved(!showResolved)}
              aria-expanded={showResolved}
              className="flex h-8 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Icon name={showResolved ? "alt-arrow-down-linear" : "alt-arrow-right-linear"} className="size-3.5" />
              {resolved.length} resolved
            </button>
            {showResolved &&
              resolved.map((t) => (
                <Thread
                  key={t.id}
                  thread={t}
                  nodeId={nodeId}
                  canComment={canComment}
                  canManage={canManage}
                  people={people}
                  active={t.id === activeThreadId}
                  onRefresh={refresh}
                />
              ))}
          </>
        )}
      </section>
    </div>
  );
}
