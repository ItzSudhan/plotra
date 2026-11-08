"use client";

import { Tooltip } from "@plotra/ui/components/tooltip";
import { Icon } from "@plotra/icons";
import { PhoneWritingBar } from "@/components/editor/phone-bar";
import { kindPlural } from "@/lib/vocabulary";
import { typingOn } from "@/lib/shell-prefs";
import { cn } from "@plotra/ui/lib/utils";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { SuggestionPlugin } from "@platejs/suggestion/react";
import { YjsPlugin } from "@platejs/yjs/react";
import { NodeApi, RangeApi, TextApi, type TElement, type TRange, type TText } from "platejs";
import * as Y from "yjs";
import { Plate, PlateContainer, PlateContent, type PlateEditor } from "platejs/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { RemoteCursors } from "@/components/collab/remote-cursors";
import { useCollabEditor } from "@/components/collab/use-collab-editor";
import { EditorKit } from "@/components/editor/editor-kit";
import { CurrentDocument } from "@/components/editor/current-document";
import { useNodeReview } from "@/components/editorial/data";
import { ReactionBar } from "@/components/editorial/reactions";
import { FormatSwitcher } from "@/components/editor/script/format-switcher";
import { ScriptPlugin } from "@/components/editor/script/script-kit";
import {
  anchorFor,
  CommentHighlightPlugin,
  resolveAnchor,
  resolveOne,
  resolveSuggestions,
  setCommentRanges,
} from "@/components/editor/review";
import { useComments } from "@/components/workflow/data";
import { suggestionsResolved } from "@/lib/workflow-actions";
import { useStore } from "@/components/workspace/stores";
import { useUi, useWorkspace } from "@/components/workspace/workspace-provider";
import { colorFor } from "@/lib/colors";
import { useEditorStyle, useShell } from "@/components/workspace/shell-prefs";
import { starterPrompt } from "@/lib/onboarding/prompts";
import { blockTagKeys, blockTags, indexDocument, keptBlocks, mentionPattern, WIKILINK, type DocNode, type WikiLinkElement } from "@/lib/doc-index";
import { nodeFormat } from "@/lib/modules";
import { isScriptFormat, scriptHeadingLevels } from "@/lib/script";
import { ancestors, nodeKindMeta } from "@/lib/tree";
import { scrollBehavior } from "@/lib/motion";

const headingTypes = new Set(["h1", "h2", "h3", ...Object.keys(scriptHeadingLevels)]);

/** A binder node's document, edited live with everyone else who has it open (plan.md 2.6). */
export function EditorView({ nodeId }: { nodeId: string }) {
  const { binder } = useWorkspace();
  const node = useStore(binder).index.byId.get(nodeId);
  if (!node) return null;
  return <CollabDocument key={nodeId} nodeId={nodeId} />;
}

function CollabDocument({ nodeId }: { nodeId: string }) {
  const { project, user, binder, setDocStats, registerEditor, actions, setUi, ui, editors } = useWorkspace();
  const { shell } = useShell();
  const look = useEditorStyle();
  const { index } = useStore(binder);
  const node = index.byId.get(nodeId)!;
  // A locked note is read-only for everyone but its approvers (the server refuses their writes too: lib/editorial-guard).
  const review = useNodeReview(nodeId);
  const canEdit = node.actions.includes("edit") && !review.readOnly;
  // With the editorial module on, anyone who can comment can also react to a passage (plan.md 2.8).
  const reactions = useWorkspace().modules.has("editorial");
  // Prose, or a script format with its own page layout and keyboard flow (plan.md 2.3).
  const format = nodeFormat(node.settings);
  const script = isScriptFormat(format);
  const canComment = node.actions.includes("comment");
  const { suggesting, typewriter, activeThreadId } = useUi();
  const { data: threads } = useComments(nodeId);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The last text selection in this document, kept while focus moves to the comment box.
  const lastSelection = useRef<TRange | null>(null);

  const { editor, ready, sync } = useCollabEditor({
    projectId: project.id,
    room: `node-${nodeId}`,
    plugins: EditorKit,
    user: useMemo(() => ({ name: user.name, color: colorFor(user.id) }), [user.id, user.name]),
    readOnly: !canEdit,
    // Classified notes are never cached in the browser.
  });
  const [writing, setWriting] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    setDocStats(nodeId, { sync });
  }, [nodeId, setDocStats, sync]);

  useEffect(() => {
    editor.setOption(ScriptPlugin, "format", format);
  }, [editor, format]);

  // ---- Review: suggestions and comment highlights --------------------------------
  useEffect(() => {
    editor.setOption(SuggestionPlugin, "currentUserId", user.id);
    editor.setOption(SuggestionPlugin, "isSuggesting", canEdit && suggesting);
  }, [canEdit, editor, suggesting, user.id]);

  useEffect(() => {
    editor.setOption(CommentHighlightPlugin, "onClickThread", (threadId: string) =>
      setUi({ activeThreadId: threadId, right: true, rightTab: "comments" }),
    );
    editor.setOption(CommentHighlightPlugin, "onComment", () => editors.current.get(nodeId)?.comment());
  }, [editor, editors, nodeId, setUi]);

  // Comment highlights follow the text as it changes; the latest threads are read on every change.
  const latestThreads = useRef({ threads, activeThreadId });
  useEffect(() => {
    latestThreads.current = { threads, activeThreadId };
    if (ready) setCommentRanges(editor, threads ?? [], activeThreadId);
  }, [activeThreadId, editor, ready, threads]);
  const refreshHighlights = () => setCommentRanges(editor, latestThreads.current.threads ?? [], latestThreads.current.activeThreadId);

  const updateStats = (value: DocNode[]) => {
    const stats = indexDocument(value);
    setDocStats(nodeId, {
      words: stats.words,
      characters: stats.characters,
      headings: stats.headings,
      tags: stats.tags,
      links: stats.links.length,
      suggestions: resolveSuggestions(editor),
    });
  };

  // Typewriter scrolling: keep the caret's line in the middle of the pane.
  useEffect(() => {
    if (!typewriter || !ready) return;
    const center = () => {
      const container = scrollRef.current;
      const selection = window.getSelection();
      if (!container || !selection?.rangeCount || !container.contains(selection.anchorNode)) return;
      const range = selection.getRangeAt(0).cloneRange();
      range.collapse(false);
      let rect = range.getBoundingClientRect();
      if (!rect.height) rect = (selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement)?.getBoundingClientRect() ?? rect;
      if (!rect.height) return;
      const box = container.getBoundingClientRect();
      const offset = rect.top + rect.height / 2 - (box.top + box.height / 2);
      if (Math.abs(offset) > 4) container.scrollBy({ top: offset, behavior: scrollBehavior() });
    };
    const onKey = () => requestAnimationFrame(center);
    const el = scrollRef.current;
    el?.addEventListener("keyup", onKey);
    el?.addEventListener("mouseup", onKey);
    return () => {
      el?.removeEventListener("keyup", onKey);
      el?.removeEventListener("mouseup", onKey);
    };
  }, [ready, typewriter]);

  useEffect(() => {
    if (!ready) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the doc only has content once Yjs has synced
    setHasContent(editor.children.length > 0);
    updateStats(editor.children as DocNode[]);
    // updateStats only reads the editor and setDocStats.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, nodeId, ready, setDocStats]);

  // ---- Handles for the rest of the shell (outline, links, mentions) -----------
  useEffect(() => {
    if (!ready) return;
    const reveal = (path: number[]) => {
      const entry = editor.api.node(path);
      if (!entry) return;
      editor.api.toDOMNode(entry[0])?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
      const start = editor.api.start(path);
      if (start) editor.tf.select(start);
      editor.tf.focus();
    };
    registerEditor(nodeId, {
      focus: () => editor.tf.focus(),
      focusEnd: () => editor.tf.focus({ edge: "endEditor" }),
      scrollToHeading: (id) => {
        const entry = editor.api.node({ at: [], match: (n) => (n as TElement).id === id });
        if (entry) reveal(entry[1]);
      },
      scrollToHeadingText: (text) => {
        const wanted = text.trim().toLowerCase();
        const entry = editor.api.node({
          at: [],
          match: (n) => headingTypes.has((n as TElement).type) && NodeApi.string(n).trim().toLowerCase() === wanted,
        });
        if (entry) reveal(entry[1]);
      },
      linkMention: (text, targetId) => {
        if (editor.api.isReadOnly?.() || !canEdit) return false;
        const pattern = mentionPattern([text]);
        if (!pattern) return false;
        for (const [leaf, path] of editor.api.nodes<TText>({ at: [], match: (n) => TextApi.isText(n) })) {
          if (leaf.code) continue;
          pattern.lastIndex = 0;
          const match = pattern.exec(leaf.text);
          if (!match) continue;
          const target = binder.get().index.byId.get(targetId);
          const link: WikiLinkElement = {
            type: WIKILINK,
            nodeId: targetId,
            // Keep the prose reading the same when the mention isn't the exact title.
            ...(target && match[0] !== target.title && { alias: match[0] }),
            children: [{ text: "" }],
          };
          const at = { anchor: { path, offset: match.index }, focus: { path, offset: match.index + match[0].length } };
          editor.tf.insertNodes(link as unknown as TElement, { at });
          reveal(path.slice(0, 1));
          return true;
        }
        return false;
      },
      comment: () => {
        if (!canComment) return;
        const range = editor.selection && !RangeApi.isCollapsed(editor.selection) ? editor.selection : lastSelection.current;
        const anchor = range ? anchorFor(editor, range) : null;
        const quote = range ? editor.api.string(range).slice(0, 500) : null;
        setUi({ commenting: { nodeId, anchor, quote: anchor ? quote : null }, right: true, rightTab: "comments", activeThreadId: null });
      },
      revealThread: (threadId) => {
        const thread = threads?.find((t) => t.id === threadId);
        const range = thread?.anchor ? resolveAnchor(editor, thread.anchor) : null;
        if (!range) return;
        editor.api.toDOMNode(editor.api.node(RangeApi.start(range).path.slice(0, 1))?.[0] ?? editor)?.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
      },
      snapshot: () => {
        const doc = editor.getOptions(YjsPlugin).ydoc;
        return doc ? Y.encodeStateAsUpdate(doc) : null;
      },
      resolveSuggestion: (id, accept) => {
        if (!canEdit) return;
        const resolved = resolveSuggestions(editor).filter((s) => id === null || s.suggestionId === id);
        editor.tf.withoutNormalizing(() => {
          for (const s of resolved) resolveOne(editor, s, accept);
        });
        // The people who suggested these hear what became of them. The agent's suggestions are left out:
        // whoever ran it is usually the one deciding.
        const authors = resolved.map((s) => s.userId).filter((author) => author && author !== user.id && !author.startsWith("agent:"));
        if (authors.length) void suggestionsResolved(project.id, nodeId, authors, accept).catch(() => {});
      },
      tagBlocks: () => {
        if (!canEdit) return;
        // The blocks picked with block selection, else the ones the text selection touches.
        const picked = editor.getApi(BlockSelectionPlugin).blockSelection.getNodes({ sort: true });
        const entries = picked.length ? picked : editor.selection ? editor.api.blocks({ mode: "lowest" }) : [];
        const blockIds = entries.map(([n]) => n.id).filter((id): id is string => typeof id === "string");
        if (blockIds.length) setUi({ tagging: { nodeId, blockIds } });
      },
      getBlockTags: (blockId) => {
        const entry = editor.api.node({ at: [], match: (n) => (n as TElement).id === blockId });
        return (entry && blockTags(entry[0] as DocNode)) ?? {};
      },
      setBlockTags: (blockIds, tags) => {
        if (!canEdit) return;
        const ids = new Set(blockIds);
        const set: Record<string, string> = {};
        const unset: string[] = [];
        for (const key of blockTagKeys) {
          const value = tags[key];
          if (value === null) unset.push(key);
          else if (value !== undefined) set[key] = value;
        }
        // Tags are metadata, so they're applied directly, even in suggesting mode.
        editor.getApi(SuggestionPlugin).suggestion.withoutSuggestions(() => {
          editor.tf.withoutNormalizing(() => {
            for (const [, path] of editor.api.nodes<TElement>({ at: [], match: (n) => ids.has((n as TElement).id as string) })) {
              if (Object.keys(set).length) editor.tf.setNodes(set, { at: path });
              if (unset.length) editor.tf.unsetNodes(unset, { at: path });
            }
          });
        });
      },
      replaceContent: (value) => {
        if (!canEdit || !Array.isArray(value)) return;
        // A restore is applied directly, even in suggesting mode. Blocks that are the same in the
        // version are left alone, so comments anchored in them keep their place; the rest are swapped.
        const target = value as TElement[];
        const kept = keptBlocks(editor.children as unknown as DocNode[], target as unknown as DocNode[]);
        const stays = new Set(kept.values());
        editor.getApi(SuggestionPlugin).suggestion.withoutSuggestions(() => {
          editor.tf.withoutNormalizing(() => {
            for (let i = editor.children.length - 1; i >= 0; i--) if (!stays.has(i)) editor.tf.removeNodes({ at: [i] });
            target.forEach((block, t) => {
              if (!kept.has(t)) editor.tf.insertNodes(block, { at: [t] });
            });
          });
        });
      },
    });
    return () => registerEditor(nodeId, null);
  }, [binder, canComment, canEdit, editor, nodeId, project.id, ready, registerEditor, setUi, threads, user.id]);

  // ---- Title -------------------------------------------------------------------
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(node.title);
  const [syncedTitle, setSyncedTitle] = useState(node.title);
  if (node.title !== syncedTitle) {
    setSyncedTitle(node.title);
    setTitle(node.title);
  }

  // Size the title box to its content.
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  const meta = nodeKindMeta[node.kind];
  const trail = ancestors(index, nodeId);

  const commitTitle = () => {
    const next = title.trim();
    if (!next) setTitle(node.title);
    else if (next !== node.title) void actions.update(nodeId, { title: next });
  };

  return (
    <CurrentDocument value={{ nodeId }}>
      <div ref={scrollRef} className={cn("relative h-full overflow-y-auto", typewriter && "pt-[30vh]")}>
        <SelectionBubble
          editor={editor}
          nodeId={nodeId}
          ready={ready}
          canEdit={canEdit}
          canComment={canComment}
          reactions={reactions}
          scrollRef={scrollRef}
          lastSelection={lastSelection}
        />
        <div className="mx-auto w-full max-w-[44rem] px-6 pt-10 pb-2 sm:px-12" style={script ? undefined : look.column}>
          <p className="mb-3 flex items-center gap-1.5 truncate text-xs text-faint">
            <Icon name={meta.icon} className="size-3.5" />
            {trail.map((a) => (
              <span key={a.id} className="truncate after:ml-1.5 after:content-['/']">
                {a.title}
              </span>
            ))}
            <span className="truncate">{meta.label}</span>
            {project.settings.noteTemplates?.[node.kind] === node.id && (
              <Tooltip content="New notes of this kind start as a copy of this one. Right-click it in the binder to stop.">
              <span
                tabIndex={0}
                className="ml-1 flex items-center gap-1 rounded bg-ember/10 px-1.5 py-px text-meta font-medium text-ember-ink outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Icon name="document-add-linear" className="size-3" />
                Template for new {kindPlural(node.kind, project.settings).toLowerCase()}
              </span>
              </Tooltip>
            )}
            {canEdit && <FormatSwitcher nodeId={nodeId} format={format} />}
          </p>
          {/* How this note can be changed, said once above the title: suggesting is loud enough to notice, read only and locked are calmer. */}
          {canEdit && suggesting ? (
            <div role="status" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-teal/40 bg-teal/10 px-3 py-2 text-ui-sm text-teal-ink">
              <Icon name="pen-new-round-linear" className="size-4 shrink-0" />
              <span className="font-medium">You&apos;re suggesting edits</span>
              <span className="text-teal-ink/80">Others can accept or reject each change.</span>
              <button
                type="button"
                onClick={() => ui.set((prev) => ({ ...prev, suggesting: false }))}
                className="ml-auto h-8 rounded-md px-2 font-medium underline underline-offset-4 outline-none hover:bg-teal/15 focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:h-10"
              >
                Switch to editing
              </button>
            </div>
          ) : !canEdit || review.locked ? (
            <div role="status" className="mb-4 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-ui-sm text-muted-foreground">
              <Icon name={review.locked ? "lock-linear" : "eye-linear"} className="size-4 shrink-0" />
              {review.locked
                ? review.readOnly
                  ? "Locked: only an approver can change this note."
                  : "Locked for everyone but its approvers."
                : canComment
                  ? "You can read and comment on this note, but not change it."
                  : "You can read this note, but not change it."}
            </div>
          ) : null}
          <textarea
            ref={titleRef}
            value={title}
            rows={1}
            aria-label="Title"
            spellCheck={typingOn(shell, "spellcheck")}
            lang={project.settings.sourceLocale || undefined}
            readOnly={!canEdit}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter" || (e.key === "ArrowDown" && e.currentTarget.selectionStart === title.length)) {
                e.preventDefault();
                commitTitle();
                editor.tf.focus({ edge: "start" });
              } else if (e.key === "Escape") {
                setTitle(node.title);
                e.currentTarget.blur();
              }
            }}
            className="w-full resize-none overflow-hidden bg-transparent font-display text-4xl leading-tight tracking-tight outline-none placeholder:text-faint"
            placeholder="Untitled"
          />
        </div>

        {!ready || !hasContent ? (
          <div className="mx-auto w-full max-w-[44rem] px-6 pt-4 sm:px-12" aria-busy>
            {ready && sync === "offline" ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon name="cloud-cross-linear" className="size-4" />
                You&apos;re offline. This note will open when you&apos;re back online. We&apos;ll keep trying.
              </p>
            ) : (
              <div className="animate-pulse space-y-3">
                <div className="h-4 rounded bg-muted" />
                <div className="h-4 w-11/12 rounded bg-muted" />
                <div className="h-4 w-4/5 rounded bg-muted" />
              </div>
            )}
          </div>
        ) : null}

        <div className={cn((!ready || !hasContent) && "hidden")}>
          <Plate
            editor={editor}
            readOnly={!canEdit}
            onChange={({ value }) => {
              if (!hasContent && value.length) setHasContent(true);
              updateStats(value as DocNode[]);
              refreshHighlights();
            }}
          >
            <PlateContainer
              className={cn("relative mx-auto w-full", script ? "max-w-[calc(6in+6rem)]" : "max-w-[44rem]")}
              style={script ? undefined : look.column}
              // While the caret is in the text, a phone gets its writing bar (components/editor/phone-bar.tsx).
              onFocus={() => setWriting(true)}
              onBlur={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setWriting(false)}
            >
              <PlateContent
                aria-label={`${node.title} document`}
                // Always passed (script.css hides it in a script): toggling it on a format switch unmounts Slate's placeholder mid-commit.
                placeholder={canEdit ? (shell.prompts === false ? "Start writing. Type [[ to link a note, or / for blocks." : starterPrompt(node.kind, node.id)) : undefined}
                data-script-format={script ? format : undefined}
                // The writer's own typeface, size, spacing and paragraphs (Customize). A script keeps its format's.
                data-paragraphs={script ? undefined : look.paragraphs}
                style={script ? undefined : look.text}
                // The browser's spellchecker, in the project's language (Project settings → Reveals & languages), unless switched off in Customize.
                spellCheck={typingOn(shell, "spellcheck")}
                lang={project.settings.sourceLocale || undefined}
                readOnly={!canEdit}
                disableDefaultStyles
                className={cn(
                  "relative w-full px-6 pb-[40vh] font-prose whitespace-pre-wrap break-words text-[1.0625rem] leading-[1.75] caret-ember outline-none sm:px-12 [&_[data-slate-placeholder]]:text-faint [&_[data-slate-placeholder]]:!opacity-100 [&_strong]:font-semibold",
                  // Courier on a six-inch text block; the layout itself is in script.css.
                  script && "script-doc",
                )}
                // Slate's context lives inside PlateContent, and the cursor overlay needs it.
                renderEditable={(editable) => (
                  <>
                    {editable}
                    <RemoteCursors />
                  </>
                )}
              />
            </PlateContainer>
            <PhoneWritingBar active={writing && canEdit} />
          </Plate>
        </div>
      </div>
    </CurrentDocument>
  );
}

/**
 * Remembers the document's text selection, and offers commenters a comment (and reaction) button
 * next to it. Its position is state of its own: the selection changes with every move of a drag, and
 * re-rendering the editor in the middle of one makes Slate put the selection back where it was.
 */
function SelectionBubble({
  editor,
  nodeId,
  ready,
  canEdit,
  canComment,
  reactions,
  scrollRef,
  lastSelection,
}: {
  editor: PlateEditor;
  nodeId: string;
  ready: boolean;
  canEdit: boolean;
  canComment: boolean;
  reactions: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  lastSelection: RefObject<TRange | null>;
}) {
  const { setUi } = useWorkspace();
  const [bubble, setBubble] = useState<{ top: number; left: number } | null>(null);

  // Also in read-only documents, where Slate doesn't track the selection.
  useEffect(() => {
    if (!ready) return;
    // While the mouse is down the selection is still being made: the bubble waits for the button to
    // come up, so that it never sits in the way of the drag.
    let dragging = false;
    const update = () => {
      const selection = window.getSelection();
      const root = editor.api.toDOMNode(editor);
      if (!selection?.rangeCount || !root?.contains(selection.anchorNode)) return;
      if (selection.isCollapsed) {
        lastSelection.current = null;
        setBubble(null);
        return;
      }
      const range = editor.api.toSlateRange(selection.getRangeAt(0), { exactMatch: false, suppressThrow: true });
      lastSelection.current = range && !RangeApi.isCollapsed(range) ? range : null;
      if (dragging) return;
      if (lastSelection.current && canComment && (!canEdit || reactions) && scrollRef.current) {
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        const box = scrollRef.current.getBoundingClientRect();
        // Editors get the formatting toolbar above the selection, so theirs goes below it.
        const top = canEdit ? rect.bottom + 8 : rect.top - 44;
        setBubble({ top: top - box.top + scrollRef.current.scrollTop, left: rect.left - box.left + rect.width / 2 });
      } else setBubble(null);
    };
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0 || !editor.api.toDOMNode(editor)?.contains(event.target as Node)) return;
      dragging = true;
      setBubble(null);
    };
    const onMouseUp = () => {
      if (!dragging) return;
      dragging = false;
      update();
    };
    document.addEventListener("selectionchange", update);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("mouseup", onMouseUp, true);
    return () => {
      document.removeEventListener("selectionchange", update);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("mouseup", onMouseUp, true);
    };
  }, [canComment, canEdit, editor, lastSelection, reactions, ready, scrollRef]);

  if (!bubble) return null;
  return (
    <div
      style={{ top: bubble.top, left: bubble.left }}
      className="absolute z-20 flex h-9 -translate-x-1/2 items-center gap-0.5 rounded-lg border bg-popover px-1 shadow-md"
    >
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const range = lastSelection.current;
          const anchor = range ? anchorFor(editor, range) : null;
          setUi({
            commenting: { nodeId, anchor, quote: range && anchor ? editor.api.string(range).slice(0, 500) : null },
            right: true,
            rightTab: "comments",
          });
          setBubble(null);
        }}
        className="flex h-7 items-center gap-1.5 rounded-md px-2 text-ui-sm hover:bg-accent"
      >
        <Icon name="chat-round-line-linear" className="size-4" />
        Comment
      </button>
      {reactions && (
        <ReactionBar
          nodeId={nodeId}
          getPassage={() => {
            const range = lastSelection.current;
            const anchor = range ? anchorFor(editor, range) : null;
            return range && anchor ? { anchor, quote: editor.api.string(range).slice(0, 500) } : null;
          }}
          onDone={() => setBubble(null)}
        />
      )}
    </div>
  );
}
