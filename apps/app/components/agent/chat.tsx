"use client";

import { useChat } from "@ai-sdk/react";
import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { DefaultChatTransport, getToolName, isToolUIPart, lastAssistantMessageIsCompleteWithApprovalResponses, type ChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/components/workspace/stores";
import { useUi, useWorkspace } from "@/components/workspace/workspace-provider";
import { createStoryBrief, getRunChanges, undoAgentRun } from "@/lib/agent-actions";
import { BRIEF_TITLE } from "@/lib/agent/brief-template";
import { turnBody } from "@/lib/agent/messages";
import { approvalVerb, stepLabel } from "@/lib/agent/tool-labels";
import type { AgentMode, AgentUIMessage, Mention, RunChanges, ToolResult } from "@/lib/agent/types";
import { errorText } from "@/lib/errors";
import { IconButton } from "@plotra/ui/components/icon-button";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { aiMessage } from "./response-error";
import { flatten, nodeKindMeta, type BinderNode } from "@/lib/tree";
import { Markdown, type NoteLookup } from "./markdown";
import { plural } from "@/lib/plural";

// One conversation with the agent (plan.md 2.11 "Agent panel"): the answer as
// it streams, every tool step as a line, the notes it used as links, and a box
// to ask the next thing in, with `@` to point at a note. In the modes that
// write, it is also where the agent asks before a change it may not make on
// its own, and where a run's changes are listed and undone.

type Part = AgentUIMessage["parts"][number];

/** How the workspace's notes are looked up by the messages: titles, and how to open one. */
function useNotes(): NoteLookup {
  const { binder, openNode } = useWorkspace();
  const { index } = useStore(binder);
  return useMemo(() => {
    const live = flatten(index);
    const byTitle = new Map(live.map((n) => [n.title.trim().toLowerCase(), n.id]));
    return {
      title: (id) => {
        const node = index.byId.get(id);
        return node && !node.deletedAt ? node.title : null;
      },
      byTitle: (title) => byTitle.get(title.trim().toLowerCase()) ?? null,
      // Beside what is open rather than in place of it: the writer is in the middle of something.
      open: (id) => openNode(id, "tab"),
    };
  }, [index, openNode]);
}

function NoteChip({ note, notes }: { note: Mention; notes: NoteLookup }) {
  const title = notes.title(note.id);
  return (
    <Tooltip content={title === null ? "This note is no longer in the project" : `Open ${title}`}>
      <button
        type="button"
        aria-disabled={title === null}
        onClick={() => title !== null && notes.open(note.id)}
        className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground aria-disabled:cursor-default aria-disabled:line-through aria-disabled:hover:bg-transparent"
      >
        <Icon name="document-text-linear" className="size-3 shrink-0" />
        <span className="truncate">{title ?? note.title}</span>
        {title === null && <span className="sr-only">(no longer in the project)</span>}
      </button>
    </Tooltip>
  );
}

/**
 * One tool call as a compact line: "Searched for “letter”", "Read Chapter 3".
 * The wording comes from lib/agent/tool-labels.ts; a tool without a line there
 * shows under its own name.
 */
function ToolStep({ part, notes }: { part: Extract<Part, { toolCallId: string }>; notes: NoteLookup }) {
  const label = stepLabel(getToolName(part));
  const input = (part.input && typeof part.input === "object" ? part.input : {}) as Record<string, unknown>;
  const subject = label.subject?.(input) ?? null;
  const denied = part.state === "output-denied" || (part.state === "approval-responded" && part.approval.approved === false);
  const failed = part.state === "output-error" || denied;
  const done = part.state === "output-available";
  // Waiting on the writer isn't running: the question is shown below the steps.
  const waiting = part.state === "approval-requested";
  const running = !done && !failed && !waiting;
  const title = subject?.nodeId ? notes.title(subject.nodeId) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      <Icon
        aria-hidden
        name={failed ? "danger-circle-linear" : waiting ? "question-circle-linear" : running ? "refresh-linear" : "check-linear"}
        className={cn("size-3.5 shrink-0", running && "animate-spin", failed ? "text-gold-ink" : "text-faint")}
      />
      <span className="min-w-0 truncate">
        {running || waiting ? label.doing : label.done}
        {subject?.nodeId && title !== null ? (
          <>
            {" "}
            <button type="button" onClick={() => notes.open(subject.nodeId!)} className="font-medium text-foreground/80 italic hover:underline">
              {title}
            </button>
          </>
        ) : subject?.text ? (
          ` ${subject.text}`
        ) : null}
        {running ? "…" : waiting ? " (waiting for you)" : denied ? " (not allowed)" : failed ? " (didn't work)" : null}
      </span>
      {part.state === "output-error" && part.errorText && <span className="basis-full pl-5 text-faint">{aiMessage(0, part.errorText, "That step didn't work.")}</span>}
    </div>
  );
}

/** The notes the answer's tool calls drew on, without repeats, in the order they came up. */
function notesUsed(message: AgentUIMessage): Mention[] {
  const seen = new Map<string, Mention>();
  for (const part of message.parts) {
    if (!isToolUIPart(part) || part.state !== "output-available") continue;
    const output = part.output as Partial<ToolResult> | undefined;
    for (const note of Array.isArray(output?.notes) ? output.notes : []) if (note?.id && !seen.has(note.id)) seen.set(note.id, note);
  }
  return [...seen.values()];
}

type ToolPart = Extract<Part, { toolCallId: string }>;

/** The requests an answer is waiting on the writer for. */
const pendingOf = (message: AgentUIMessage) =>
  message.parts.flatMap((part) => (isToolUIPart(part) && part.state === "approval-requested" && !part.approval.isAutomatic ? [part as ToolPart & { state: "approval-requested" }] : []));

/**
 * What the agent wants to do and may not without a yes (lib/agent/approval.ts):
 * one line per change, each allowed or refused, or all at once. The run carries
 * on when every one is answered.
 */
function Approvals({ message, notes, onAnswer }: { message: AgentUIMessage; notes: NoteLookup; onAnswer: (id: string, approved: boolean) => void }) {
  const pending = pendingOf(message);
  if (!pending.length) return null;
  const reasons = [...new Set(pending.map((part) => part.approval.requestReason).filter(Boolean))];
  return (
    <div role="group" aria-label="The AI is asking before it changes something" className="grid gap-2 rounded-md border border-gold/40 bg-gold/5 p-2.5">
      <p className="text-xs font-medium text-foreground">
        {pending.length === 1 ? "Allow this change?" : `Allow these ${pending.length} changes?`}
        {reasons.length === 1 && <span className="ml-1 font-normal text-muted-foreground">{reasons[0]}</span>}
      </p>
      <ul className="grid gap-1.5">
        {pending.map((part) => {
          const name = getToolName(part);
          const input = (part.input && typeof part.input === "object" ? part.input : {}) as Record<string, unknown>;
          const subject = stepLabel(name).subject?.(input) ?? null;
          const title = subject?.nodeId ? notes.title(subject.nodeId) : null;
          return (
            <li key={part.toolCallId} className="flex items-center gap-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate text-foreground/90">
                {approvalVerb[name] ?? stepLabel(name).doing} {title ?? subject?.text ?? ""}
              </span>
              <button type="button" onClick={() => onAnswer(part.approval.id, false)} className="h-8 shrink-0 rounded-md px-2.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                Don&apos;t
              </button>
              <button type="button" onClick={() => onAnswer(part.approval.id, true)} className="h-8 shrink-0 rounded-md bg-foreground px-2.5 font-medium text-background hover:opacity-90">
                Allow
              </button>
            </li>
          );
        })}
      </ul>
      {pending.length > 1 && (
        <div className="flex justify-end gap-1.5 border-t border-gold/30 pt-2 text-xs">
          <button type="button" onClick={() => pending.forEach((part) => onAnswer(part.approval.id, false))} className="h-8 rounded-md px-2.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            Allow none
          </button>
          <button type="button" onClick={() => pending.forEach((part) => onAnswer(part.approval.id, true))} className="h-8 rounded-md bg-foreground px-2.5 font-medium text-background hover:opacity-90">
            Allow all
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * What a run changed, under its answer, with "Undo run" (plan.md 2.11
 * "Checkpoints"). Loaded once the answer is in; an answer that changed nothing
 * shows nothing.
 */
function Changes({ runId, notes, settled }: { runId: string; notes: NoteLookup; settled: boolean }) {
  const { project, refreshBinder, announce } = useWorkspace();
  const [state, setState] = useState<RunChanges | null>(null);
  const [open, setOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    if (!settled) return;
    let cancelled = false;
    getRunChanges(project.id, runId)
      .then((found) => !cancelled && setState(found))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [project.id, runId, settled]);

  if (!state?.changes.length) return null;
  const undo = async () => {
    setUndoing(true);
    try {
      const result = await undoAgentRun(project.id, runId);
      setState({ ...state, undone: true });
      refreshBinder();
      announce();
      if (result.failed.length) toast.warning(`Undone, except ${result.failed.length} ${plural(result.failed.length, "change")}: ${result.failed[0]}`);
      else toast.success("The run's changes were undone.");
    } catch (error) {
      toast.error(errorText(error, "Couldn't undo that run."));
    } finally {
      setUndoing(false);
    }
  };
  const count = state.changes.length;
  return (
    <div className="grid gap-1 rounded-md border px-2.5 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-7 min-w-0 items-center gap-1 rounded text-muted-foreground hover:text-foreground">
          <Icon name={open ? "alt-arrow-down-linear" : "alt-arrow-right-linear"} className="size-3 shrink-0" />
          <span className={cn("truncate", state.undone && "line-through")}>
            {count} {plural(count, "change")}
          </span>
        </button>
        {state.undone ? (
          <span className="ml-auto text-faint">Undone</span>
        ) : (
          <button type="button" onClick={() => void undo()} disabled={undoing} className="ml-auto flex min-h-7 items-center gap-1 rounded font-medium text-foreground hover:underline disabled:opacity-50">
            <Icon name="undo-left-round-linear" className="size-3.5" />
            {undoing ? "Undoing…" : "Undo run"}
          </button>
        )}
      </div>
      {open && (
        <ul className="grid gap-0.5 pl-4 text-muted-foreground">
          {state.changes.map((change) => (
            <li key={change.id} className="truncate">
              {change.nodeId && notes.title(change.nodeId) !== null ? (
                <button type="button" onClick={() => notes.open(change.nodeId!)} className="max-w-full truncate text-left hover:text-foreground hover:underline">
                  {change.summary}
                </button>
              ) : (
                change.summary
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const number = new Intl.NumberFormat("en");

function Message({
  message,
  notes,
  showTokens,
  settled,
  onAnswer,
}: {
  message: AgentUIMessage;
  notes: NoteLookup;
  showTokens: boolean;
  /** No run is streaming into this answer: its changes can be listed. */
  settled: boolean;
  onAnswer: (id: string, approved: boolean) => void;
}) {
  if (message.role === "user") {
    const mentions = message.parts.flatMap((part) => (part.type === "data-mentions" ? part.data.notes : []));
    return (
      <div className="ml-6 grid justify-items-end gap-1">
        <div className="max-w-full rounded-lg bg-accent px-3 py-2 text-ui-sm leading-relaxed whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
          {message.parts.map((part, i) => (part.type === "text" ? <span key={i}>{part.text}</span> : null))}
        </div>
        {mentions.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1">
            {mentions.map((note) => (
              <NoteChip key={note.id} note={note} notes={notes} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const used = notesUsed(message);
  const { inputTokens, outputTokens, runId, mode } = message.metadata ?? {};
  return (
    <div className="grid gap-2">
      {message.parts.map((part, i) => {
        if (isToolUIPart(part)) return <ToolStep key={part.toolCallId} part={part} notes={notes} />;
        if (part.type === "text" && part.text.trim()) return <Markdown key={i} text={part.text} notes={notes} />;
        return null;
      })}
      {settled && <Approvals message={message} notes={notes} onAnswer={onAnswer} />}
      {runId && mode && mode !== "ask" && <Changes runId={runId} notes={notes} settled={settled} />}
      {used.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          <span className="text-meta text-faint">Notes used</span>
          {used.slice(0, 10).map((note) => (
            <NoteChip key={note.id} note={note} notes={notes} />
          ))}
          {used.length > 10 && <span className="text-meta text-faint">+{used.length - 10}</span>}
        </div>
      )}
      {showTokens && inputTokens !== undefined && outputTokens !== undefined && (
        <Tooltip content="How much text this answer sent to your model and got back, counted in tokens (about ¾ of a word each). Your AI company bills by these; Plotra doesn't charge.">
          <p tabIndex={0} className="w-fit rounded text-meta text-faint tabular-nums">
            {number.format(inputTokens)} tokens in · {number.format(outputTokens)} out
          </p>
        </Tooltip>
      )}
    </div>
  );
}

// ---- The message box, with @ to point at a note ---------------------------------------

const MENTION = /(^|\s)@([^\s@]{0,40})$/;

function Composer({ busy, mode, onSend, onStop }: { busy: boolean; mode: AgentMode; onSend: (text: string, mentions: Mention[]) => void; onStop: () => void }) {
  const { binder } = useWorkspace();
  const { index } = useStore(binder);
  const { askAi, aiDraft } = useUi();
  const { setUi } = useWorkspace();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Mention[]>([]);

  // A command ("Draft this scene") arrives as words already in the box, for the writer to finish or send.
  useEffect(() => {
    if (!aiDraft) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- takes a one-off draft handed over by a command
    setText(aiDraft.text);
    setPicked(aiDraft.mentions);
    setUi({ aiDraft: null });
    requestAnimationFrame(() => {
      const el = ref.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  }, [aiDraft, setUi]);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  // "Ask AI…" from the command palette lands here.
  useEffect(() => {
    if (askAi) ref.current?.focus();
  }, [askAi]);

  // Grow with the text, up to a point.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const matches = useMemo<BinderNode[]>(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return flatten(index)
      .filter((n) => n.kind !== "folder" && (n.title.toLowerCase().includes(q) || n.aliases.some((a) => a.toLowerCase().includes(q))))
      .sort((a, b) => Number(b.title.toLowerCase().startsWith(q)) - Number(a.title.toLowerCase().startsWith(q)))
      .slice(0, 8);
  }, [index, query]);

  const track = (value: string, caret: number) => {
    const found = MENTION.exec(value.slice(0, caret));
    setQuery(found ? found[2] : null);
    setActive(0);
  };

  const pick = (node: BinderNode) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(MENTION, (_, space: string) => `${space}@${node.title} `);
    const next = before + text.slice(caret);
    setText(next);
    setPicked((list) => (list.some((m) => m.id === node.id) ? list : [...list, { id: node.id, title: node.title }]));
    setQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  const send = () => {
    const message = text.trim();
    if (!message || busy) return;
    // Only notes whose @name is still in the text count as pointed at.
    onSend(message, picked.filter((m) => message.includes(`@${m.title}`)));
    setText("");
    setPicked([]);
    setQuery(null);
  };

  return (
    <div className="relative shrink-0 border-t border-sidebar-border p-2">
      {query !== null && matches.length > 0 && (
        <ul role="listbox" aria-label="Notes" className="absolute inset-x-2 bottom-full mb-1 max-h-56 overflow-y-auto rounded-md border bg-popover py-1 shadow-md">
          {matches.map((node, i) => (
            <li key={node.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                // Keep the caret in the box: the choice replaces what was typed there.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(node)}
                onMouseEnter={() => setActive(i)}
                className={cn("flex h-8 w-full items-center gap-2 px-2.5 text-left text-ui-sm text-muted-foreground", i === active && "bg-accent text-foreground")}
              >
                <Icon name={nodeKindMeta[node.kind].icon} className="size-4 shrink-0" />
                <span className="truncate">{node.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-1.5 rounded-lg border border-input bg-background px-2 py-1.5 focus-within:ring-[3px] focus-within:ring-ring/50">
        <textarea
          ref={ref}
          value={text}
          rows={1}
          aria-label={mode === "ask" ? "Ask about this project" : "Tell the AI what to write or change"}
          placeholder={mode === "ask" ? "Ask about this project. @ points at a note." : "What should it write or change? @ points at a note."}
          onChange={(e) => {
            setText(e.target.value);
            track(e.target.value, e.target.selectionStart);
          }}
          onClick={(e) => track(e.currentTarget.value, e.currentTarget.selectionStart)}
          onBlur={() => setQuery(null)}
          onKeyDown={(e) => {
            if (query !== null && matches.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => (i + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pick(matches[active]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setQuery(null);
                return;
              }
            }
            // Enter sends; Shift+Enter is a new line. Not while an IME is composing.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          className="max-h-40 min-h-6 flex-1 resize-none bg-transparent py-0.5 text-ui-sm leading-relaxed outline-none placeholder:text-faint"
        />
        {busy ? (
          <IconButton icon="stop-linear" label="Stop" onClick={onStop} className="bg-foreground text-background hover:bg-foreground/90 hover:text-background" />
        ) : (
          // The darker ember keeps the arrow readable (4.5:1) in both themes.
          <IconButton
            icon="arrow-up-linear"
            label="Send"
            shortcut="Enter"
            onClick={send}
            disabled={!text.trim()}
            className="bg-ember-ink text-background hover:bg-ember-ink/90 hover:text-background disabled:bg-muted disabled:text-faint disabled:opacity-100"
          />
        )}
      </div>
    </div>
  );
}

/** Offers the story brief to a project that has none: the note every run is told (plan.md 2.11 "What it knows"). */
function BriefHint() {
  const { project, binder, openNode, refreshBinder, announce } = useWorkspace();
  const { index } = useStore(binder);
  const [busy, setBusy] = useState(false);
  const has = (index.children.get(null) ?? []).some((n) => !n.deletedAt && n.title.trim().toLowerCase() === BRIEF_TITLE.toLowerCase());
  if (has) return null;
  const add = async () => {
    setBusy(true);
    try {
      const { nodeId } = await createStoryBrief(project.id);
      refreshBinder();
      announce();
      openNode(nodeId, "tab");
    } catch (error) {
      toast.error(errorText(error, "Couldn't create the story brief."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={() => void add()} disabled={busy} className="mx-auto flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground hover:underline disabled:opacity-50">
      <Icon name="notes-linear" className="size-3.5" />
      {busy ? "Creating…" : "Add a story brief: voice, tense, rules, things to avoid"}
    </button>
  );
}

// ---- The conversation ------------------------------------------------------------------

/** Tools that change the project: when one finishes, the binder is read again. */
const changesProject = (part: Part) => isToolUIPart(part) && part.state === "output-available" && getToolName(part) in approvalVerb;

export function Chat({
  threadId,
  initialMessages,
  mode,
  local,
  onFinish,
}: {
  threadId: string;
  initialMessages: AgentUIMessage[];
  mode: AgentMode;
  /** The person's model is on their own machine: this page calls it (plan.md 2.11 "Local model"). */
  local: boolean;
  onFinish: () => void;
}) {
  const { project, refreshBinder, announce } = useWorkspace();

  const notes = useNotes();
  const scroller = useRef<HTMLDivElement>(null);
  // Whether to keep the newest text in view: yes, until the reader scrolls up.
  const stick = useRef(true);

  // The server keeps the conversation: only the new message travels (app/api/agent/route.ts).
  // A model on the writer's own machine is called from this page instead, and the loop runs here
  // (lib/agent/local-loop.ts): the server still keeps the conversation and still runs every tool.
  const transport = useMemo<ChatTransport<AgentUIMessage>>(
    () =>
      local
        ? {
            // Loaded when a run starts: only people with a local model need it.
            sendMessages: async (options) => (await import("@/lib/agent/local-loop")).sendBrowserTurn({ projectId: project.id }, options),
            // The stream lives in this page: there is nothing to pick up again after a reload.
            reconnectToStream: async () => null,
          }
        : new DefaultChatTransport<AgentUIMessage>({
            api: "/api/agent",
            prepareSendMessagesRequest: ({ id, messages, trigger, messageId, body }) => ({
              // The mode travels with each message (`send` below).
              body: turnBody({ threadId: id, projectId: project.id, mode: (body as { mode?: AgentMode } | undefined)?.mode ?? "ask", trigger, messageId, messages }),
            }),
          }),
    [local, project.id],
  );

  const { messages, sendMessage, regenerate, stop, status, error, clearError, addToolApprovalResponse } = useChat<AgentUIMessage>({
    id: threadId,
    messages: initialMessages,
    transport,
    throttle: 60,
    // Once every question of the last answer has a yes or a no, the run carries on by itself.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    // The thread list shows this conversation (and its new place at the top) once an answer is in.
    onFinish,
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const send = useCallback(
    (text: string, mentions: Mention[]) => {
      clearError();
      stick.current = true;
      void sendMessage({ role: "user", parts: [{ type: "text", text }, ...(mentions.length ? [{ type: "data-mentions" as const, data: { notes: mentions } }] : [])] }, { body: { mode } });
    },
    [clearError, mode, sendMessage],
  );

  const lastAssistant = messages.findLast((m) => m.role === "assistant")?.id;

  // The agent changed the project: show it in the binder here, and tell everyone else's to look again.
  const written = useMemo(() => messages.reduce((n, m) => n + m.parts.filter(changesProject).length, 0), [messages]);
  const seenWritten = useRef(written);
  useEffect(() => {
    if (written === seenWritten.current) return;
    seenWritten.current = written;
    refreshBinder();
    announce();
  }, [announce, refreshBinder, written]);

  const answer = useCallback((id: string, approved: boolean) => void addToolApprovalResponse({ id, approved }), [addToolApprovalResponse]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {messages.length === 0 ? (
          <div className="grid gap-3 px-4 py-8 text-center">
            <Icon name="magic-stick-3-linear" className="mx-auto size-6 text-faint" />
            <p className="text-ui-sm text-muted-foreground">
              {mode === "ask"
                ? "Ask anything about this project. The agent looks it up in your notes and links the ones it used."
                : "Say what to write or change. The agent looks things up in your notes first, and lists everything it changed."}
            </p>
            <ul className="mx-auto grid gap-1 text-left text-xs text-faint">
              {(mode === "ask"
                ? ["Where is the letter first mentioned?", "What does Mara know by chapter 12?", "Which setups are still open?"]
                : ["Draft this scene from its synopsis.", "Make Mara left-handed and fix every scene that shows otherwise.", "Read chapter 3 like an editor and leave comments."]
              ).map((example) => (
                <li key={example}>{example}</li>
              ))}
            </ul>
            <p className="text-meta text-faint">
              {mode === "ask"
                ? "It can read what you can read and changes nothing."
                : mode === "suggest"
                  ? "Text edits arrive as suggestions you accept or reject; anything else asks you first."
                  : "Changes apply straight away, and each run can be undone. It asks before trashing, changing canon, or touching many notes."}{" "}
              {local ? "What it reads is sent to the model on your own machine, straight from this browser." : "What it reads is sent to the AI company you chose."}
            </p>
            <BriefHint />
          </div>
        ) : (
          <div className="grid gap-4 p-3">
            {messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                notes={notes}
                showTokens={message.id === lastAssistant && !busy}
                settled={!(busy && message.id === lastAssistant)}
                onAnswer={answer}
              />
            ))}
            {status === "submitted" && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon name="refresh-linear" className="size-3.5 animate-spin text-faint" />
                Thinking…
              </p>
            )}
            {error && (
              <div role="alert" className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs">
                <p className="text-foreground">{aiMessage(0, errorText(error, "The run stopped with an error."), "The run stopped with an error.")}</p>
                <button type="button" onClick={() => void regenerate({ body: { mode } })} className="flex h-8 w-fit items-center gap-1 rounded-md font-medium text-foreground hover:underline">
                  <Icon name="restart-linear" className="size-3.5" />
                  Try again
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <Composer busy={busy} mode={mode} onSend={send} onStop={() => void stop()} />
    </div>
  );
}
