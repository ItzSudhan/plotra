"use client";

import type { ScriptFormat } from "@plotra/db/schema";
import { Icon, type IconName } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { SuggestionPlugin } from "@platejs/suggestion/react";
import { RangeApi } from "platejs";
import { createPlatePlugin, useEditorReadOnly, useEditorRef, usePluginOption, type PlateEditor } from "platejs/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useCurrentDocument } from "@/components/editor/current-document";
import { BaseScriptPlugin } from "@/components/editor/script/flow";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { MAX_SELECTION } from "@/lib/agent/inline";
import { cleanAnswer } from "@/lib/agent/inline-text";
import { inlineActionMeta, inlineTones, type InlineAction, type InlineEvent, type InlineTone } from "@/lib/agent/types";
import { flatten } from "@/lib/tree";
import { applyAnswer, gatherContext } from "./inline-edit";
import { errorText, friendlyMessage } from "@/lib/errors";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { aiMessage, responseError } from "./response-error";

// The inline editor actions (plan.md 2.11 "Inline in the editor"): continue
// from the cursor, and on a selection rewrite, shorten, expand or change tone.
// Reached from the floating toolbar, the "/" menu and ⌘J.
//
// The text streams into a small panel beside the selection, not into the
// document: nothing reaches the note (or the people reading it with you) until
// the writer accepts it. Accepting is one ordinary edit: one undo step, and a
// tracked suggestion when the editor is in suggesting mode.

export const INLINE_AI = "inlineAi";

export const InlineAiPlugin = createPlatePlugin({
  key: INLINE_AI,
  options: {
    /** Set by `InlineAi` from what the workspace allows; the hotkey does nothing without it. */
    available: false,
    open: false,
    /** An action to start at once, when the menu was skipped (toolbar, "/" menu). */
    action: null as InlineAction | null,
  },
  handlers: {
    onKeyDown: ({ editor, event }) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "j") return;
      if (!editor.getOption(InlineAiPlugin, "available")) return;
      event.preventDefault();
      openInlineAi(editor);
      return true;
    },
  },
  render: { afterEditable: () => <InlineAi /> },
});

/** Opens the inline AI menu at the selection, or starts `action` straight away. */
export function openInlineAi(editor: PlateEditor, action: InlineAction | null = null) {
  if (!editor.getOption(InlineAiPlugin, "available")) return;
  editor.setOption(InlineAiPlugin, "action", action);
  editor.setOption(InlineAiPlugin, "open", true);
}

/** Whether inline AI is offered in this editor: AI is on for the project and the document can be edited. */
export function useInlineAiAvailable() {
  return usePluginOption(InlineAiPlugin, "available");
}

const actionIcons: Record<InlineAction, IconName> = {
  continue: "pen-new-round-linear",
  rewrite: "restart-linear",
  shorten: "minimize-square-linear",
  expand: "maximize-square-linear",
  tone: "palette-linear",
};

function InlineAi() {
  const editor = useEditorRef();
  const readOnly = useEditorReadOnly();
  const { ai } = useWorkspace();
  const document = useCurrentDocument();
  const open = usePluginOption(InlineAiPlugin, "open");
  const available = ai.enabled && !readOnly && document !== null;

  useEffect(() => {
    editor.setOption(InlineAiPlugin, "available", available);
    if (!available) editor.setOption(InlineAiPlugin, "open", false);
  }, [available, editor]);

  if (!available || !open || !document) return null;
  return <Popover nodeId={document.nodeId} />;
}

type Phase = "menu" | "tones" | "running" | "done" | "failed";

function Popover({ nodeId }: { nodeId: string }) {
  const editor = useEditorRef();
  const { project, binder, ai } = useWorkspace();
  const format = (usePluginOption(BaseScriptPlugin, "format") ?? "prose") as ScriptFormat;
  const requested = usePluginOption(InlineAiPlugin, "action");
  const card = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);

  // The selection as it was when the menu opened, kept in step with edits made meanwhile (by anyone).
  const [target] = useState(() => {
    const selection = editor.selection;
    if (!selection) return null;
    const rect = editor.api.toDOMRange(selection)?.getBoundingClientRect() ?? null;
    return { ref: editor.api.rangeRef(selection), expanded: RangeApi.isExpanded(selection), rect };
  });
  const [phase, setPhase] = useState<Phase>("menu");
  const [action, setAction] = useState<InlineAction | null>(null);
  const [tone, setTone] = useState<InlineTone | null>(null);
  const [text, setText] = useState("");
  const [problem, setProblem] = useState("");
  const [usage, setUsage] = useState<{ inputTokens: number; outputTokens: number } | null>(null);

  const lookups = useMemo(() => {
    const { index } = binder.get();
    const byTitle = new Map(flatten(index).map((n) => [n.title.trim().toLowerCase(), n.id]));
    return {
      titleOf: (id: string) => index.byId.get(id)?.title ?? null,
      noteByTitle: (title: string) => byTitle.get(title.trim().toLowerCase()) ?? null,
    };
  }, [binder]);

  const close = useCallback(
    (refocus = true) => {
      controller.current?.abort();
      const range = target?.ref.unref() ?? null;
      editor.setOption(InlineAiPlugin, "open", false);
      editor.setOption(InlineAiPlugin, "action", null);
      if (!refocus) return;
      if (range) editor.tf.select(range);
      editor.tf.focus();
    },
    [editor, target],
  );

  const run = useCallback(
    async (next: InlineAction, nextTone: InlineTone | null) => {
      const range = target?.ref.current;
      if (!range) return;
      const context = gatherContext(editor, range, next, lookups.titleOf);
      if (next !== "continue" && context.selection.length > MAX_SELECTION) {
        setProblem("That's too much text at once. Select a shorter passage.");
        setPhase("failed");
        return;
      }
      setAction(next);
      setTone(nextTone);
      setText("");
      setUsage(null);
      setProblem("");
      setPhase("running");
      controller.current?.abort();
      const abort = (controller.current = new AbortController());
      try {
        // A model on the writer's own machine is called from this page (plan.md 2.11 "Local model");
        // the server only checks the note can be edited and builds the same prompt.
        if (ai.browserModel) {
          const { runBrowserInline } = await import("@/lib/agent/local-loop");
          const used = await runBrowserInline(
            { projectId: project.id },
            { nodeId, action: next, tone: nextTone ?? undefined, format, ...context },
            { onText: (delta) => setText((t) => t + delta), signal: abort.signal },
          );
          if (abort.signal.aborted) return;
          setUsage(used);
          setPhase("done");
          return;
        }
        const response = await fetch("/api/agent/inline", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId: project.id, nodeId, action: next, tone: nextTone ?? undefined, format, ...context }),
          signal: abort.signal,
        });
        if (!response.ok || !response.body) throw await responseError(response, "The model couldn't be reached.", { ai: true });
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        let failed = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as InlineEvent;
            if (event.t === "text") setText((t) => t + event.v);
            else if (event.t === "error") failed = event.v;
            else setUsage({ inputTokens: event.inputTokens, outputTokens: event.outputTokens });
          }
        }
        if (failed) {
          setProblem(aiMessage(0, failed, "The model couldn't finish. Try again."));
          setPhase("failed");
        } else setPhase("done");
      } catch (error) {
        if (abort.signal.aborted) return;
        // The route answers with a sentence written for the writer (lib/errors.ts `publicMessage`); anything else becomes plain words.
        // Messages written for people (the route's, or a local model's from lib/agent/browser-model.ts) are kept whole.
        const message = error instanceof Error ? error.message : "";
        const plain = error instanceof Error && (error.constructor === Error || error.name === "UserError") && message && !friendlyMessage(message);
        setProblem(plain ? message : errorText(error, "The model couldn't be reached."));
        setPhase("failed");
      }
    },
    [ai.browserModel, editor, format, lookups.titleOf, nodeId, project.id, target],
  );

  // Opened with an action already chosen (toolbar, "/" menu): start it. No selection: nothing to act on.
  // Deferred a tick, so StrictMode's mount → unmount → mount starts one request, not two.
  useEffect(() => {
    if (!target) {
      close(false);
      return;
    }
    if (!ai.hasModel || !requested) return;
    const start = setTimeout(() => {
      if (requested === "tone") setPhase("tones");
      else if (target.expanded || requested === "continue") void run(requested, null);
    });
    return () => clearTimeout(start);
    // Only what was asked for when the popover opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving (the tab closes, the note is swapped) stops a request still running.
  useEffect(() => {
    const running = controller;
    return () => running.current?.abort();
  }, []);

  // Keep the card on screen: under the selection, or above it near the bottom of the window.
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const hasText = text.length > 0;
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const rect = target?.rect;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const left = Math.min(Math.max(12, rect?.left ?? window.innerWidth / 2 - width / 2), window.innerWidth - width - 12);
    const below = (rect?.bottom ?? window.innerHeight / 3) + 8;
    const top = below + height > window.innerHeight - 12 && rect ? Math.max(12, rect.top - height - 8) : below;
    setPlace((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }));
  }, [phase, target, hasText]);

  // Focus follows the phase: the first choice of a menu, the button that accepts a finished answer.
  const placed = place !== null;
  useEffect(() => {
    if (placed) card.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [phase, placed]);

  useEffect(() => {
    if (phase !== "menu" && phase !== "tones") return;
    const onDown = (event: MouseEvent) => {
      if (!card.current?.contains(event.target as Node)) close(false);
    };
    window.document.addEventListener("mousedown", onDown);
    return () => window.document.removeEventListener("mousedown", onDown);
  }, [close, phase]);

  /** Puts the answer in. With `asSuggestion` it lands as a tracked change to accept or reject later, whatever mode the editor is in. */
  const accept = (asSuggestion = false) => {
    const range = target?.ref.current;
    const answer = cleanAnswer(text);
    if (!range || !action || !answer) {
      toast.error("The text this was for has changed. Try again.");
      close();
      return;
    }
    // Unref first: the edit below would otherwise move the range we're about to replace.
    target.ref.unref();
    const wasSuggesting = editor.getOption(SuggestionPlugin, "isSuggesting");
    if (asSuggestion) editor.setOption(SuggestionPlugin, "isSuggesting", true);
    try {
      applyAnswer(editor, range, action, answer, lookups.noteByTitle, format);
    } finally {
      if (asSuggestion) editor.setOption(SuggestionPlugin, "isSuggesting", wasSuggesting);
    }
    editor.setOption(InlineAiPlugin, "open", false);
    editor.setOption(InlineAiPlugin, "action", null);
    editor.tf.focus();
  };

  if (!target) return null;
  const choices = (Object.keys(inlineActionMeta) as InlineAction[]).filter((id) => inlineActionMeta[id].needsSelection === target.expanded);
  const itemClass = "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-ui-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground";

  return createPortal(
    <div
      ref={card}
      role="dialog"
      aria-label="AI"
      style={{ left: place?.left ?? 0, top: place?.top ?? 0, visibility: place ? "visible" : "hidden" }}
      className="fixed z-[60] w-[min(26rem,calc(100vw-1.5rem))] rounded-lg border bg-popover font-sans text-popover-foreground shadow-lg print:hidden"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
          return;
        }
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        const items = [...(card.current?.querySelectorAll<HTMLElement>("[data-item]") ?? [])];
        if (!items.length) return;
        event.preventDefault();
        const at = items.indexOf(window.document.activeElement as HTMLElement);
        items[(at + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
      }}
    >
      {!ai.hasModel ? (
        <div className="grid gap-2 p-3 text-ui-sm">
          <p className="font-medium">Connect your AI account</p>
          <p className="text-muted-foreground">Plotra&apos;s AI uses your own account with an AI company, such as Anthropic or OpenAI. Add its key in AI settings to start.</p>
          <a href="/settings" target="_blank" rel="noopener" data-autofocus className="w-fit font-medium text-ember-ink hover:underline">
            Open AI settings
          </a>
        </div>
      ) : phase === "menu" ? (
        <div role="menu" className="p-1">
          {choices.map((id, i) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              data-item
              {...(i === 0 && { "data-autofocus": true })}
              onClick={() => (id === "tone" ? setPhase("tones") : void run(id, null))}
              className={itemClass}
            >
              <Icon name={actionIcons[id]} className="size-4 shrink-0" />
              {inlineActionMeta[id].label}
              {id === "tone" && <Icon name="alt-arrow-right-linear" className="ml-auto size-3.5" />}
            </button>
          ))}
          <p className="px-2 pt-1 pb-1 text-meta text-faint">
            {target.expanded ? "The selection and the text around it are sent to your model." : "The text before the cursor is sent to your model."}
          </p>
        </div>
      ) : phase === "tones" ? (
        <div role="menu" className="p-1">
          <p className="px-2 py-1 text-meta font-medium text-muted-foreground">Change tone</p>
          {inlineTones.map((id, i) => (
            <button key={id} type="button" role="menuitem" data-item {...(i === 0 && { "data-autofocus": true })} onClick={() => void run("tone", id)} className={cn(itemClass, "capitalize")}>
              {id}
            </button>
          ))}
        </div>
      ) : (
        <div className="grid">
          <div className="flex items-center gap-1.5 border-b px-3 py-1.5 text-xs text-muted-foreground">
            <Icon name={phase === "running" ? "refresh-linear" : "magic-stick-3-linear"} className={cn("size-3.5", phase === "running" && "animate-spin")} />
            {action ? (action === "tone" && tone ? `Tone: ${tone}` : inlineActionMeta[action].label) : "AI"}
            {usage && (
              <Tooltip content="How much text this sent to your model and got back, counted in tokens (about ¾ of a word each). Your AI company bills by these; Plotra doesn't charge.">
                <span tabIndex={0} className="ml-auto rounded text-meta text-faint tabular-nums">
                  {usage.inputTokens.toLocaleString()} tokens in · {usage.outputTokens.toLocaleString()} out
                </span>
              </Tooltip>
            )}
          </div>
          {phase === "failed" ? (
            <p role="alert" className="px-3 py-3 text-ui-sm">
              {problem}
            </p>
          ) : (
            <div aria-live="polite" className="max-h-[40vh] overflow-y-auto px-3 py-2.5 font-serif text-[15px] leading-relaxed whitespace-pre-wrap">
              {text || <span className="font-sans text-ui-sm text-faint">Writing…</span>}
            </div>
          )}
          <div className="flex items-center gap-1 border-t p-1.5">
            {phase === "running" ? (
              <button
                type="button"
                data-autofocus
                onClick={() => {
                  controller.current?.abort();
                  // What was written so far can still be used.
                  setPhase(text ? "done" : "menu");
                }}
                className={cn(itemClass, "w-auto")}
              >
                <Icon name="stop-linear" className="size-3.5" />
                Stop
              </button>
            ) : (
              <>
                {phase === "done" && (
                  <button type="button" data-autofocus onClick={() => accept()} className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-ui-sm font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50">
                    <Icon name="check-linear" className="size-4" />
                    {action === "continue" ? "Insert" : "Replace"}
                  </button>
                )}
                {phase === "done" && (
                  <Tooltip content="Put it in as a tracked change, to accept or reject from the Comments tab">
                    <button type="button" onClick={() => accept(true)} className={cn(itemClass, "w-auto")}>
                      Suggest
                    </button>
                  </Tooltip>
                )}
                {action && (
                  <button type="button" {...(phase === "failed" && { "data-autofocus": true })} onClick={() => void run(action, tone)} className={cn(itemClass, "w-auto")}>
                    <Icon name="restart-linear" className="size-3.5" />
                    Try again
                  </button>
                )}
                <button type="button" onClick={() => close()} className={cn(itemClass, "ml-auto w-auto")}>
                  Discard
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>,
    window.document.body,
  );
}
