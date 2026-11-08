"use client";

import { SuggestionPlugin } from "@platejs/suggestion/react";
import { acceptSuggestion, rejectSuggestion, type TResolvedSuggestion } from "@platejs/suggestion";
import { relativePositionToSlatePoint, slatePointToRelativePosition } from "@slate-yjs/core";
import { YjsPlugin } from "@platejs/yjs/react";
import { cn } from "@plotra/ui/lib/utils";
import {
  ElementApi,
  PathApi,
  RangeApi,
  TextApi,
  type SlateEditor,
  type TElement,
  type TInlineSuggestionData,
  type TRange,
  type TSuggestionText,
} from "platejs";
import { createPlatePlugin, PlateLeaf, type PlateEditor, type PlateLeafProps } from "platejs/react";
import * as Y from "yjs";
import type { CommentAnchor } from "@plotra/db/schema";

// Review tools in the editor (plan.md 2.3, Phase 5).
//
// Comments are anchored with Yjs relative positions stored in Postgres, not as
// marks in the document, so people who may only comment (and whose connection
// to the collab server is read-only) can still comment. The editor turns the
// anchors back into ranges and highlights them as decorations.
//
// Suggestions (track changes) use Plate's suggestion plugin: in suggesting
// mode, edits are kept as marked insertions and deletions that an editor
// accepts or rejects.

export const COMMENT_KEY = "commentHighlight";

type CommentRange = { threadId: string; range: TRange };

export const CommentHighlightPlugin = createPlatePlugin({
  key: COMMENT_KEY,
  options: {
    ranges: [] as CommentRange[],
    activeId: null as string | null,
    onClickThread: null as null | ((threadId: string) => void),
    /** Set by the document view: starts a comment on the selection. */
    onComment: null as null | (() => void),
  },
  node: { isLeaf: true },
  decorate: ({ entry: [node, path], getOptions }) => {
    if (!TextApi.isText(node)) return [];
    const { ranges, activeId } = getOptions();
    const out: TRange[] = [];
    for (const { threadId, range } of ranges) {
      const [start, end] = RangeApi.edges(range);
      if (PathApi.compare(path, start.path) < 0 || PathApi.compare(path, end.path) > 0) continue;
      const from = PathApi.equals(path, start.path) ? start.offset : 0;
      const to = PathApi.equals(path, end.path) ? end.offset : node.text.length;
      if (to <= from) continue;
      out.push({
        anchor: { path, offset: from },
        focus: { path, offset: to },
        [COMMENT_KEY]: true,
        commentThreadId: threadId,
        commentActive: threadId === activeId,
      } as TRange);
    }
    return out;
  },
  render: { node: CommentLeaf },
});

function CommentLeaf(props: PlateLeafProps) {
  const leaf = props.leaf as { commentThreadId?: string; commentActive?: boolean };
  const onClickThread = props.editor.getOption(CommentHighlightPlugin, "onClickThread");
  return (
    <PlateLeaf
      {...props}
      className={cn(
        "border-b-2 border-gold/60 bg-gold/15 transition-colors",
        leaf.commentActive && "border-gold bg-gold/35",
      )}
      attributes={{
        ...props.attributes,
        onClick: () => leaf.commentThreadId && onClickThread?.(leaf.commentThreadId),
      }}
    />
  );
}

// ---- Anchors -----------------------------------------------------------------------

const sharedRoot = (editor: PlateEditor) => editor.getOptions(YjsPlugin).ydoc?.get("content", Y.XmlText);

const encode = (pos: Y.RelativePosition) => {
  const bytes = Y.encodeRelativePosition(pos);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};
const decode = (base64: string) => Y.decodeRelativePosition(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));

/** Anchors a range so it keeps pointing at the same text as the document changes. */
export function anchorFor(editor: PlateEditor, range: TRange): CommentAnchor | null {
  const root = sharedRoot(editor);
  if (!root) return null;
  const [start, end] = RangeApi.edges(range);
  try {
    return {
      start: encode(slatePointToRelativePosition(root, editor as never, start)),
      end: encode(slatePointToRelativePosition(root, editor as never, end)),
    };
  } catch {
    return null;
  }
}

/** The range an anchor points at now, or null if its text was deleted. */
export function resolveAnchor(editor: PlateEditor, anchor: CommentAnchor): TRange | null {
  const root = sharedRoot(editor);
  if (!root) return null;
  try {
    const start = relativePositionToSlatePoint(root, editor as never, decode(anchor.start));
    const end = relativePositionToSlatePoint(root, editor as never, decode(anchor.end));
    if (!start || !end) return null;
    const range = { anchor: start, focus: end };
    return RangeApi.isCollapsed(range) ? null : range;
  } catch {
    return null;
  }
}

/** Points the comment highlights at the threads' current positions. */
export function setCommentRanges(editor: PlateEditor, threads: Array<{ id: string; anchor: CommentAnchor | null; resolvedAt: Date | null }>, activeId: string | null) {
  const ranges: CommentRange[] = [];
  for (const t of threads) {
    if (!t.anchor || t.resolvedAt) continue;
    const range = resolveAnchor(editor, t.anchor);
    if (range) ranges.push({ threadId: t.id, range });
  }
  const before = editor.getOptions(CommentHighlightPlugin);
  const same =
    before.activeId === activeId &&
    before.ranges.length === ranges.length &&
    before.ranges.every((r, i) => r.threadId === ranges[i].threadId && RangeApi.equals(r.range, ranges[i].range));
  if (same) return;
  editor.setOption(CommentHighlightPlugin, "ranges", ranges);
  editor.setOption(CommentHighlightPlugin, "activeId", activeId);
  editor.api.redecorate();
}

// ---- Suggestions -----------------------------------------------------------------------

function SuggestionLeaf(props: PlateLeafProps<TSuggestionText>) {
  const api = props.editor.getApi(SuggestionPlugin);
  const dataList = api.suggestion.dataList(props.leaf);
  const removal = dataList.some((d) => d.type === "remove");
  return (
    <PlateLeaf
      {...props}
      as={removal ? "del" : "ins"}
      className={cn(
        "no-underline decoration-2",
        removal ? "bg-destructive/10 text-destructive line-through" : "bg-teal/15 text-teal-ink underline underline-offset-4",
      )}
    />
  );
}

export const ReviewSuggestionPlugin = SuggestionPlugin.configure({
  render: {
    node: SuggestionLeaf,
    belowRootNodes: ({ editor, element }) => {
      if (!editor.getApi(SuggestionPlugin).suggestion.isBlockSuggestion(element)) return null;
      const removal = (element as TElement & { suggestion: { type: string } }).suggestion.type === "remove";
      return (
        <div
          contentEditable={false}
          className={cn(
            "pointer-events-none absolute inset-y-0 -left-3 w-0.5 rounded-full",
            removal ? "bg-destructive/70" : "bg-teal",
          )}
        />
      );
    },
  },
});

export type Suggestion = TResolvedSuggestion & { type: "insert" | "remove" | "replace" | "update" };

/** Every pending suggestion in the document, in reading order. */
export function resolveSuggestions(editor: SlateEditor): Suggestion[] {
  const api = editor.getApi(SuggestionPlugin);
  const found = new Map<string, { data: TInlineSuggestionData | { id: string; userId: string; createdAt: number }; text: string; newText: string; update: boolean }>();
  const entry = (data: { id: string; userId: string; createdAt: number }) => {
    let e = found.get(data.id);
    if (!e) found.set(data.id, (e = { data, text: "", newText: "", update: false }));
    return e;
  };
  for (const [node] of editor.api.nodes({ at: [], mode: "all", match: (n) => TextApi.isText(n) || ElementApi.isElement(n) })) {
    if (TextApi.isText(node)) {
      for (const data of api.suggestion.dataList(node as TSuggestionText)) {
        const e = entry(data);
        if (data.type === "insert") e.newText += node.text;
        else if (data.type === "remove") e.text += node.text;
        else {
          e.update = true;
          e.newText += node.text;
        }
      }
    } else if (api.suggestion.isBlockSuggestion(node)) {
      const data = node.suggestion;
      const e = entry(data);
      if (data.type === "insert") e.newText += "¶";
      else if (data.type === "remove") e.text += "¶";
    }
  }
  return [...found.values()].map(({ data, text, newText, update }) => ({
    keyId: `suggestion_${data.id}`,
    suggestionId: data.id,
    userId: data.userId,
    createdAt: new Date(data.createdAt),
    text,
    newText,
    type: update && !text ? "update" : text && newText ? "replace" : newText ? "insert" : "remove",
  }));
}

export function resolveOne(editor: SlateEditor, suggestion: Suggestion, accept: boolean) {
  if (accept) acceptSuggestion(editor, suggestion);
  else rejectSuggestion(editor, suggestion);
}
