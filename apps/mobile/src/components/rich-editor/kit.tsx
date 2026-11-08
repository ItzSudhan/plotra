import { BlockquoteRules, BoldRules, CodeRules, HeadingRules, HorizontalRuleRules, ItalicRules, StrikethroughRules } from "@platejs/basic-nodes";
import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  HighlightPlugin,
  HorizontalRulePlugin,
  ItalicPlugin,
  StrikethroughPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import { CalloutPlugin } from "@platejs/callout/react";
import { IndentPlugin } from "@platejs/indent/react";
import { LinkPlugin } from "@platejs/link/react";
import { BulletedListRules, isOrderedList, OrderedListRules, TaskListRules } from "@platejs/list";
import { ListPlugin } from "@platejs/list/react";
import { acceptSuggestion, rejectSuggestion, type TResolvedSuggestion } from "@platejs/suggestion";
import { SuggestionPlugin } from "@platejs/suggestion/react";
import { TableCellHeaderPlugin, TableCellPlugin, TablePlugin, TableRowPlugin } from "@platejs/table/react";
import { YjsPlugin } from "@platejs/yjs/react";
import { CursorEditor, relativePositionToSlatePoint, relativeRangeToSlateRange, slatePointToRelativePosition } from "@slate-yjs/core";
import {
  ElementApi,
  KEYS,
  PathApi,
  RangeApi,
  TextApi,
  TrailingBlockPlugin,
  type Point,
  type SlateEditor,
  type TElement,
  type TInlineSuggestionData,
  type TListElement,
  type TRange,
  type TSuggestionText,
} from "platejs";
import {
  createPlatePlugin,
  ParagraphPlugin,
  PlateElement,
  PlateLeaf,
  useEditorRef,
  useReadOnly,
  type PlateEditor,
  type PlateElementProps,
  type PlateLeafProps,
  type RenderNodeWrapper,
} from "platejs/react";
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { scriptElements, scriptTypes, type CommentDraft, type EditorHorizon, type EditorTheme, type EditorThread, type SuggestionInfo } from "./shared";

// The phone's editor kit: every kind of node the web's editor has
// (apps/app/components/editor/editor-kit.tsx), declared exactly as it is
// there (block or inline, void or not), with simple phone rendering. Used by
// the live editor (note-editor.tsx) and the reader. An editor that mistook an
// inline link for a block would "fix" the document, and the fix would reach
// everyone: change these declarations only to match the web's.

// ---- Elements -------------------------------------------------------------------------------

const block = (tag: "p" | "h1" | "h2" | "h3" | "blockquote", className: string) =>
  function Block(props: PlateElementProps) {
    return <PlateElement {...props} as={tag} className={className} />;
  };

function HrElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} className="hr">
      <div contentEditable={false}>
        <hr />
      </div>
      {props.children}
    </PlateElement>
  );
}

function CalloutElement(props: PlateElementProps) {
  return <PlateElement {...props} className="callout" />;
}

// Pictures kept by Plotra (`/api/files/<id>`) need the phone's token, which a web view can't
// send: the phone fetches them (PhonePlugin's loadImage) and they're kept here while it runs.
const loaded = new Map<string, Promise<string | null>>();

function usePictureSource(url: string | undefined): string | null {
  const editor = useEditorRef();
  const direct = !url || /^(https?:|data:|blob:)/i.test(url);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (direct || !url) return;
    let live = true;
    if (!loaded.has(url)) loaded.set(url, (editor.getOption(PhonePlugin, "loadImage") as (u: string) => Promise<string | null>)(url).catch(() => null));
    void loaded.get(url)!.then((found) => {
      if (!found) loaded.delete(url);
      if (live) setSrc(found);
    });
    return () => {
      live = false;
    };
  }, [editor, url, direct]);
  return direct ? (url ?? null) : src;
}

function ImageElement(props: PlateElementProps) {
  const { url, alt } = props.element as TElement & { url?: string; alt?: string };
  const src = usePictureSource(url);
  return (
    <PlateElement {...props} className="img">
      <div contentEditable={false}>{src ? <img src={src} alt={alt ?? ""} /> : url ? <div className="img-wait">{alt || "Picture"}</div> : null}</div>
      {props.children}
    </PlateElement>
  );
}

function LinkElement(props: PlateElementProps) {
  // Not followed while writing: tapping puts the cursor in it.
  return <PlateElement {...props} as="a" className="link" attributes={{ ...props.attributes, onClick: (e: React.MouseEvent) => e.preventDefault() }} />;
}

function TableElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="table" className="table">
      <tbody>{props.children}</tbody>
    </PlateElement>
  );
}
const TableRowElement = (props: PlateElementProps) => <PlateElement {...props} as="tr" />;
const TableCellElement = (props: PlateElementProps) => <PlateElement {...props} as="td" />;
const TableCellHeaderElement = (props: PlateElementProps) => <PlateElement {...props} as="th" />;

/** Script elements: blocks, laid out as a script page sets them. */
function ScriptElement(props: PlateElementProps) {
  return <PlateElement {...props} className={`script script-${props.element.type}`} />;
}

type Linked = TElement & { nodeId?: string; alias?: string; heading?: string; locator?: string };

function useTitles() {
  return useEditorRef().getOption(PhonePlugin, "titles") as Record<string, string>;
}

function WikiLinkElement(props: PlateElementProps) {
  const el = props.element as Linked;
  const titles = useTitles();
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const title = el.alias || (el.nodeId && titles[el.nodeId]) || "a note";
  return (
    <PlateElement {...props} as="span" className="wikilink-wrap">
      <span
        contentEditable={false}
        className="wikilink"
        onClick={(e) => {
          if (!el.nodeId) return;
          // Reading: open it. Writing: the cursor goes just after it (typing carries on there; a
          // selected link would swallow keys), and the phone offers "Open" above the keyboard, so
          // a tap meant to put the cursor here doesn't leave the note.
          if (readOnly) return void (editor.getOption(PhonePlugin, "openNote") as (id: string) => void)(el.nodeId);
          const path = editor.api.findPath(props.element);
          const after = path && editor.api.after(path);
          if (!after) return;
          // The editor would select the link itself otherwise.
          e.stopPropagation();
          editor.tf.select(after);
          editor.setOption(PhonePlugin, "tappedLink", { nodeId: el.nodeId, title: el.alias || titles[el.nodeId] || "this note", point: after });
          editor.tf.focus();
        }}
      >
        {title}
        {el.heading ? ` › ${el.heading}` : ""}
      </span>
      {props.children}
    </PlateElement>
  );
}

function EmbedElement(props: PlateElementProps) {
  const el = props.element as Linked;
  const titles = useTitles();
  return (
    <PlateElement {...props} className="embed">
      <div contentEditable={false}>↳ {(el.nodeId && titles[el.nodeId]) || "An embedded note"}</div>
      {props.children}
    </PlateElement>
  );
}

function CitationElement(props: PlateElementProps) {
  const el = props.element as Linked;
  const titles = useTitles();
  return (
    <PlateElement {...props} as="span" className="wikilink-wrap">
      <span contentEditable={false} className="citation">
        [{(el.nodeId && titles[el.nodeId]) || "source"}
        {el.locator ? `, ${el.locator}` : ""}]
      </span>
      {props.children}
    </PlateElement>
  );
}

/** Someone on the web is typing `[[` or `[@` here: a placeholder until they pick. */
function PendingInputElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} as="span" className="wikilink-wrap">
      <span contentEditable={false} className="pending">
        …
      </span>
      {props.children}
    </PlateElement>
  );
}

// Lists are paragraphs with `listStyleType` and `indent` (Plate's indent lists), drawn as the web draws them.
const BlockList: RenderNodeWrapper = (props) => {
  if (!props.element.listStyleType) return;
  return function List(props) {
    const { listStart, listStyleType, checked } = props.element as TListElement & { checked?: boolean };
    const Tag = isOrderedList(props.element) ? "ol" : "ul";
    const todo = listStyleType === "todo";
    return (
      <Tag className="list" style={{ listStyleType: todo ? "none" : listStyleType }} start={listStart}>
        {todo && <TodoBox element={props.element} checked={!!checked} />}
        <li className={todo && checked ? "done" : undefined}>{props.children}</li>
      </Tag>
    );
  };
};

function TodoBox({ element, checked }: { element: TElement; checked: boolean }) {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  return (
    <span contentEditable={false}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        className={`todo ${checked ? "on" : ""}`}
        disabled={readOnly}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.tf.setNodes({ checked: !checked }, { at: editor.api.findPath(element) })}
      >
        {checked ? "✓" : ""}
      </button>
    </span>
  );
}

// ---- Marks ----------------------------------------------------------------------------------

const leaf = (as: "strong" | "em" | "u" | "s" | "code" | "mark") =>
  function Leaf(props: PlateLeafProps) {
    return <PlateLeaf {...props} as={as} />;
  };

/** Tracked changes, as the web draws them: inserted text underlined in teal, removed text struck through. */
function SuggestionLeaf(props: PlateLeafProps) {
  const removal = props.editor
    .getApi(SuggestionPlugin)
    .suggestion.dataList(props.leaf as TSuggestionText)
    .some((d) => d.type === "remove");
  return <PlateLeaf {...props} as={removal ? "del" : "ins"} className={removal ? "sugg-remove" : "sugg-insert"} />;
}

// ---- Comments: highlights from anchors (apps/app/components/editor/review.tsx) --------------
//
// Comments aren't marks in the document: they're anchored with Yjs relative
// positions kept on the server, so people who may only comment can comment.
// The editor turns the anchors back into ranges and highlights them as
// decorations, under the same key the web uses.

export const COMMENT_KEY = "commentHighlight";

type CommentRange = { threadId: string; range: TRange };

function CommentLeaf(props: PlateLeafProps) {
  const leaf = props.leaf as { commentThreadId?: string };
  const readOnly = useReadOnly();
  return (
    <PlateLeaf
      {...props}
      className="comment"
      attributes={{
        ...props.attributes,
        onClick: () => {
          // Reading: open the thread. Writing: the tap puts the cursor here, and the phone offers the thread.
          if (readOnly && leaf.commentThreadId) (props.editor.getOption(CommentHighlightPlugin, "openThread") as (id: string) => void)(leaf.commentThreadId);
        },
      }}
    />
  );
}

export const CommentHighlightPlugin = createPlatePlugin({
  key: COMMENT_KEY,
  options: {
    ranges: [] as CommentRange[],
    openThread: (_id: string) => {},
  },
  node: { isLeaf: true },
  decorate: ({ entry: [node, path], getOptions }) => {
    if (!TextApi.isText(node)) return [];
    const out: TRange[] = [];
    for (const { threadId, range } of getOptions().ranges) {
      const [start, end] = RangeApi.edges(range);
      if (PathApi.compare(path, start.path) < 0 || PathApi.compare(path, end.path) > 0) continue;
      const from = PathApi.equals(path, start.path) ? start.offset : 0;
      const to = PathApi.equals(path, end.path) ? end.offset : node.text.length;
      if (to <= from) continue;
      out.push({ anchor: { path, offset: from }, focus: { path, offset: to }, [COMMENT_KEY]: true, commentThreadId: threadId } as TRange);
    }
    return out;
  },
  render: { node: CommentLeaf },
});

const sharedRoot = (editor: PlateEditor) => editor.getOptions(YjsPlugin).ydoc?.get("content", Y.XmlText);

const encode = (pos: Y.RelativePosition) => {
  let binary = "";
  for (const b of Y.encodeRelativePosition(pos)) binary += String.fromCharCode(b);
  return btoa(binary);
};
const decode = (base64: string) => Y.decodeRelativePosition(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));

/** Anchors a range so it keeps pointing at the same text as the document changes (as the web's anchorFor). */
export function anchorFor(editor: PlateEditor, range: TRange): CommentDraft["anchor"] {
  const root = sharedRoot(editor);
  if (!root) return null;
  const [start, end] = RangeApi.edges(range);
  try {
    return { start: encode(slatePointToRelativePosition(root, editor as never, start)), end: encode(slatePointToRelativePosition(root, editor as never, end)) };
  } catch {
    return null;
  }
}

/** The range an anchor points at now, or null if its text was deleted. */
function resolveAnchor(editor: PlateEditor, anchor: EditorThread["anchor"]): TRange | null {
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
export function setCommentRanges(editor: PlateEditor, threads: EditorThread[]) {
  const ranges: CommentRange[] = [];
  for (const t of threads) {
    const range = resolveAnchor(editor, t.anchor);
    if (range) ranges.push({ threadId: t.id, range });
  }
  const before = editor.getOption(CommentHighlightPlugin, "ranges") as CommentRange[];
  const same = before.length === ranges.length && before.every((r, i) => r.threadId === ranges[i].threadId && RangeApi.equals(r.range, ranges[i].range));
  if (same) return;
  editor.setOption(CommentHighlightPlugin, "ranges", ranges);
  editor.api.redecorate?.();
}

/** The open thread whose passage holds the cursor. */
export function threadAt(editor: PlateEditor): string | null {
  const at = editor.selection?.focus;
  if (!at) return null;
  const ranges = editor.getOption(CommentHighlightPlugin, "ranges") as CommentRange[];
  return ranges.find((r) => RangeApi.includes(r.range, at))?.threadId ?? null;
}

// ---- Suggestions (apps/app/components/editor/review.tsx) ------------------------------------

export type Suggestion = TResolvedSuggestion & { type: SuggestionInfo["type"] };

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

/** The id of the suggestion at the cursor, if there is one. */
export function suggestionIdAt(editor: PlateEditor): string | null {
  if (!editor.selection) return null;
  const api = editor.getApi(SuggestionPlugin).suggestion;
  const entry = api.node({ isText: true }) ?? api.node();
  return entry ? (api.nodeId(entry[0] as TSuggestionText) ?? null) : null;
}

// ---- Other people's cursors (apps/app/components/collab/remote-cursors.tsx) ----------------

type Box = { top: number; left: number; width: number; height: number };
type Drawn = { clientId: string; name: string; color: string; caret: Box | null; rects: Box[] };

/** Dark or light text, whichever reads on a colour. */
function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#161412" : "#fff";
}

function measure(editor: PlateEditor, container: HTMLElement): Drawn[] {
  const root = sharedRoot(editor);
  if (!root || !CursorEditor.isCursorEditor(editor)) return [];
  const box = container.getBoundingClientRect();
  const rel = (r: DOMRect): Box => ({ top: r.top - box.top, left: r.left - box.left, width: r.width, height: r.height });
  const out: Drawn[] = [];
  const self = String(editor.awareness.clientID);
  for (const [clientId, state] of Object.entries(CursorEditor.cursorStates<{ name?: string; color?: string }>(editor))) {
    if (clientId === self || !state.relativeSelection) continue;
    let range: TRange | null = null;
    try {
      range = relativeRangeToSlateRange(root, editor as never, state.relativeSelection) as TRange | null;
    } catch {}
    if (!range) continue;
    const rects = RangeApi.isCollapsed(range) ? [] : [...(editor.api.toDOMRange(range)?.getClientRects() ?? [])].map(rel);
    const focus = editor.api.toDOMRange({ anchor: range.focus, focus: range.focus });
    const caretRect = focus?.getClientRects()[0] ?? focus?.getBoundingClientRect();
    const caret = caretRect && caretRect.height ? { ...rel(caretRect), width: 2 } : null;
    out.push({ clientId, name: state.data?.name ?? "", color: state.data?.color ?? "#888888", caret, rects });
  }
  return out;
}

/** Carets and selections of everyone else in the note, with their names. Render inside the positioned box that holds the editable. */
export function RemoteCursors({ editor }: { editor: PlateEditor }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [cursors, setCursors] = useState<Drawn[]>([]);
  useEffect(() => {
    const container = anchor.current?.parentElement;
    if (!container || !CursorEditor.isCursorEditor(editor)) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      // After the editor has drawn the change.
      frame = requestAnimationFrame(() => setCursors(measure(editor, container)));
    };
    update();
    // Their cursors move, or the text under them does (anyone's typing, this phone's too), or the page reflows.
    const ydoc = editor.getOptions(YjsPlugin).ydoc;
    CursorEditor.on(editor, "change", update);
    ydoc?.on("update", update);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      CursorEditor.off(editor, "change", update);
      ydoc?.off("update", update);
      window.removeEventListener("resize", update);
    };
  }, [editor]);
  return (
    <div ref={anchor} className="cursors" aria-hidden>
      {cursors.map((c) => (
        <div key={c.clientId}>
          {c.rects.map((r, i) => (
            <div key={i} className="cursor-sel" style={{ ...r, backgroundColor: c.color }} />
          ))}
          {c.caret && (
            <div className="cursor-caret" style={{ ...c.caret, backgroundColor: c.color }}>
              {!!c.name && (
                <div className="cursor-name" style={{ backgroundColor: c.color, color: readableOn(c.color) }}>
                  {c.name}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- The phone's own plugin: options shared with elements, and `[[` -------------------------

export const PhonePlugin = createPlatePlugin({
  key: "phone",
  options: {
    titles: {} as Record<string, string>,
    openNote: (_id: string) => {},
    pickNote: async (): Promise<string | null> => null,
    horizon: null as EditorHorizon,
    loadImage: async (_url: string): Promise<string | null> => null,
    /** The link last tapped while writing, and the point just after it where the cursor went. */
    tappedLink: null as { nodeId: string; title: string; point: Point } | null,
  },
  render: {
    // A passage the audience doesn't know yet, as of the release the phone shows, is dimmed.
    aboveNodes: ({ element, path, editor }) => {
      if (path.length !== 1) return;
      const reveal = (element as TElement & { reveal?: string }).reveal;
      const horizon = editor.getOption(PhonePlugin, "horizon") as EditorHorizon;
      if (!horizon || !reveal) return;
      const known = reveal !== "never" && (horizon.order[reveal] ?? Infinity) <= horizon.limit;
      if (known) return;
      return function Later({ children }) {
        return <div className="later">{children}</div>;
      };
    },
  },
}).overrideEditor(({ editor, tf: { insertText } }) => ({
  transforms: {
    insertText(text, options) {
      // `[[`: the second bracket opens the phone's note picker instead.
      if (text !== "[" || options?.at || !editor.selection || !editor.api.isCollapsed()) return insertText(text, options);
      const before = editor.api.before(editor.selection, { distance: 1, unit: "character" });
      const typed = before ? editor.api.string({ anchor: before, focus: editor.selection.anchor }) : "";
      if (typed !== "[") return insertText(text, options);
      editor.tf.deleteBackward("character");
      const at = editor.selection;
      void (editor.getOption(PhonePlugin, "pickNote") as () => Promise<string | null>)().then((nodeId) => {
        if (!nodeId) return;
        insertWikiLink(editor as PlateEditor, nodeId, at);
      });
    },
  },
}));

export function insertWikiLink(editor: PlateEditor, nodeId: string, at?: PlateEditor["selection"]) {
  editor.tf.focus();
  if (at) editor.tf.select(at);
  editor.tf.insertNodes({ type: "wikilink", nodeId, children: [{ text: "" }] } as TElement);
  editor.tf.move({ unit: "offset" });
}

// Elements that are blocks but carry no plugin of their own are left to Plate's defaults
// (a block); the ones below need declaring, because they're inline or void.
const voidInline = { isElement: true, isInline: true, isVoid: true } as const;

export const plugins = [
  ParagraphPlugin.withComponent(block("p", "p")),
  H1Plugin.configure({ node: { component: block("h1", "h1") }, inputRules: [HeadingRules.markdown()] }),
  H2Plugin.configure({ node: { component: block("h2", "h2") }, inputRules: [HeadingRules.markdown()] }),
  H3Plugin.configure({ node: { component: block("h3", "h3") }, inputRules: [HeadingRules.markdown()] }),
  BlockquotePlugin.configure({ node: { component: block("blockquote", "quote") }, inputRules: [BlockquoteRules.markdown()] }),
  HorizontalRulePlugin.configure({ node: { component: HrElement }, inputRules: [HorizontalRuleRules.markdown({ variant: "-" })] }),
  CalloutPlugin.withComponent(CalloutElement),
  createPlatePlugin({ key: KEYS.img, node: { isElement: true, isVoid: true, component: ImageElement } }),
  TablePlugin.withComponent(TableElement),
  TableRowPlugin.withComponent(TableRowElement),
  TableCellPlugin.withComponent(TableCellElement),
  TableCellHeaderPlugin.withComponent(TableCellHeaderElement),

  BoldPlugin.configure({ node: { component: leaf("strong") }, inputRules: [BoldRules.markdown({ variant: "*" })] }),
  ItalicPlugin.configure({ node: { component: leaf("em") }, inputRules: [ItalicRules.markdown({ variant: "*" }), ItalicRules.markdown({ variant: "_" })] }),
  UnderlinePlugin.withComponent(leaf("u")),
  StrikethroughPlugin.configure({ node: { component: leaf("s") }, inputRules: [StrikethroughRules.markdown()] }),
  CodePlugin.configure({ node: { component: leaf("code") }, inputRules: [CodeRules.markdown()] }),
  HighlightPlugin.withComponent(leaf("mark")),
  // Marks the phone shows plainly but must know are marks.
  createPlatePlugin({ key: "breakdown", node: { isLeaf: true } }),
  createPlatePlugin({ key: "script_note", node: { isLeaf: true, component: (props: PlateLeafProps) => <PlateLeaf {...props} className="script-note" /> } }),
  // Declared as the web declares it (a leaf); the highlights are decorations from the threads' anchors.
  CommentHighlightPlugin,

  IndentPlugin.configure({ inject: { targetPlugins: [...KEYS.heading, KEYS.p, KEYS.blockquote, KEYS.img] }, options: { offset: 24 } }),
  ListPlugin.configure({
    inject: { targetPlugins: [...KEYS.heading, KEYS.p, KEYS.blockquote, KEYS.img] },
    render: { belowNodes: BlockList },
    inputRules: [BulletedListRules.markdown({ variant: "-" }), OrderedListRules.markdown({ variant: "." }), TaskListRules.markdown({ checked: false })],
  }),
  LinkPlugin.configure({ render: { node: LinkElement } }),

  createPlatePlugin({ key: "wikilink", node: { ...voidInline, isMarkableVoid: true, component: WikiLinkElement } }),
  createPlatePlugin({ key: "wikilink_input", node: { ...voidInline, component: PendingInputElement } }),
  createPlatePlugin({ key: "embed", node: { isElement: true, isVoid: true, component: EmbedElement } }),
  createPlatePlugin({ key: "citation", node: { ...voidInline, isMarkableVoid: true, component: CitationElement } }),
  createPlatePlugin({ key: "citation_input", node: { ...voidInline, component: PendingInputElement } }),
  ...scriptElements.map((e) => createPlatePlugin({ key: e.type, node: { isElement: true, component: ScriptElement } })),

  SuggestionPlugin.configure({ render: { node: SuggestionLeaf } }),
  // As on the web: a document ends on a paragraph, except a script.
  TrailingBlockPlugin.configure({ options: { exclude: [...scriptTypes] } }),
  PhonePlugin,
];


export function styles(t: EditorTheme): string {
  return `
  :root { color-scheme: ${t.dark ? "dark" : "light"}; }
  html, body { margin: 0; padding: 0; background: ${t.background}; color: ${t.foreground}; -webkit-text-size-adjust: 100%; }
  .root { font-family: "New York", ui-serif, Georgia, serif; font-size: ${t.fontSize}px; line-height: ${t.lineHeight}px; }
  .content { outline: none; min-height: 60vh; padding: 8px 24px 160px; caret-color: ${t.ember}; word-wrap: break-word; }
  .content [data-slate-placeholder] { color: ${t.mutedForeground}; font-style: italic; opacity: 1 !important; }
  .loading { padding: 8px 24px; color: ${t.mutedForeground}; font-style: italic; }
  .p { margin: 0; padding: 4px 0; }
  .h1, .h2, .h3 { font-weight: 400; letter-spacing: -0.02em; line-height: 1.2; margin: 1.1em 0 0.3em; }
  .h1 { font-size: 1.7em; } .h2 { font-size: 1.4em; } .h3 { font-size: 1.18em; font-weight: 600; }
  .quote { margin: 8px 0; padding-left: 14px; border-left: 3px solid ${t.border}; color: ${t.mutedForeground}; font-style: italic; }
  .callout { margin: 8px 0; padding: 10px 14px; border-radius: 12px; background: ${t.emberSoft}; }
  .hr hr { border: none; text-align: center; margin: 16px 0; } .hr hr::after { content: "* * *"; color: ${t.mutedForeground}; letter-spacing: 8px; }
  .img img { max-width: 100%; border-radius: 12px; display: block; margin: 8px auto; }
  .img-wait { margin: 8px 0; padding: 24px 14px; border-radius: 12px; background: ${t.muted}; color: ${t.mutedForeground}; font-size: 0.85em; text-align: center; font-family: -apple-system, system-ui, sans-serif; }
  .link { color: ${t.emberInk}; text-decoration: underline; }
  .table { border-collapse: collapse; width: 100%; margin: 8px 0; font-family: -apple-system, system-ui, sans-serif; font-size: 0.85em; }
  .table td, .table th { border: 1px solid ${t.border}; padding: 6px 8px; vertical-align: top; }
  .table th { background: ${t.muted}; font-weight: 600; text-align: left; }
  .list { margin: 0; padding: 0 0 0 1.4em; position: relative; } .list li { padding: 2px 0; }
  .list li.done { color: ${t.mutedForeground}; text-decoration: line-through; }
  .todo { position: absolute; left: -2px; top: 0.35em; width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid ${t.mutedForeground}; background: transparent; color: #fff; font-size: 12px; line-height: 14px; padding: 0; }
  .todo.on { background: ${t.ember}; border-color: ${t.ember}; }
  .wikilink { color: ${t.emberInk}; border-bottom: 1px solid ${t.emberSoft}; }
  .citation { color: ${t.mutedForeground}; font-size: 0.9em; }
  .pending { color: ${t.mutedForeground}; }
  .embed > div { margin: 8px 0; padding: 12px 14px; border-radius: 12px; background: ${t.muted}; color: ${t.emberInk}; font-size: 0.9em; }
  mark { background: ${t.highlight}; color: inherit; border-radius: 2px; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: 0.85em; background: ${t.muted}; border-radius: 4px; padding: 0 3px; }
  .sugg-insert { color: ${t.teal}; text-decoration: underline; text-decoration-color: ${t.teal}; }
  .sugg-remove { color: ${t.destructive}; text-decoration: line-through; }
  .script-note { color: ${t.mutedForeground}; font-style: italic; }
  .later { opacity: 0.35; }
  .comment { background: ${t.emberSoft}; border-bottom: 2px solid ${t.ember}; }
  ins.sugg-insert { text-decoration-thickness: 2px; text-underline-offset: 4px; }
  .root { position: relative; }
  .cursors { position: absolute; inset: 0; pointer-events: none; z-index: 10; }
  .cursor-sel { position: absolute; opacity: 0.25; pointer-events: none; }
  .cursor-caret { position: absolute; pointer-events: none; }
  .cursor-name { position: absolute; bottom: 100%; left: 0; padding: 1px 4px; border-radius: 3px; font-family: -apple-system, system-ui, sans-serif; font-size: 11px; line-height: 14px; font-weight: 500; white-space: nowrap; }
  .script { font-family: "Courier Prime", "Courier New", Courier, monospace; font-size: 0.85em; line-height: 1.35; margin: 0; padding: 4px 0; }
  .script-scene_heading, .script-act_heading, .script-comic_page { text-transform: uppercase; font-weight: 700; margin-top: 18px; }
  .script-character { text-transform: uppercase; margin: 14px 0 0 38%; padding-bottom: 0; }
  .script-parenthetical { margin-left: 28%; margin-right: 22%; padding: 0; }
  .script-dialogue { margin-left: 18%; margin-right: 14%; padding-top: 0; }
  .script-transition { text-transform: uppercase; text-align: right; margin-top: 12px; }
  .script-shot, .script-comic_panel { text-transform: uppercase; margin-top: 12px; }
  .script-sfx, .script-music_cue { text-transform: uppercase; font-style: italic; }
  .script-comic_caption { font-style: italic; }
  `;
}
