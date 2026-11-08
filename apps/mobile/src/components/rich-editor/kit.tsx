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
import { SuggestionPlugin } from "@platejs/suggestion/react";
import { TableCellHeaderPlugin, TableCellPlugin, TablePlugin, TableRowPlugin } from "@platejs/table/react";
import { KEYS, TrailingBlockPlugin, type TElement, type TListElement } from "platejs";
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
import { scriptElements, scriptTypes, type EditorHorizon, type EditorTheme } from "./shared";

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

function ImageElement(props: PlateElementProps) {
  const { url, alt } = props.element as TElement & { url?: string; alt?: string };
  return (
    <PlateElement {...props} className="img">
      <div contentEditable={false}>{url ? <img src={url} alt={alt ?? ""} /> : null}</div>
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
        onClick={() => {
          if (readOnly && el.nodeId) void (editor.getOption(PhonePlugin, "openNote") as (id: string) => void)(el.nodeId);
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

/** Tracked changes: inserted text underlined in teal, removed text struck through. */
function SuggestionLeaf(props: PlateLeafProps) {
  const data = Object.entries(props.leaf).find(([key]) => key.startsWith("suggestion_"))?.[1] as { type?: string } | undefined;
  return <PlateLeaf {...props} className={data?.type === "remove" ? "sugg-remove" : "sugg-insert"} />;
}

// ---- The phone's own plugin: options shared with elements, and `[[` -------------------------

export const PhonePlugin = createPlatePlugin({
  key: "phone",
  options: {
    titles: {} as Record<string, string>,
    openNote: (_id: string) => {},
    pickNote: async (): Promise<string | null> => null,
    horizon: null as EditorHorizon,
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
  createPlatePlugin({ key: "commentHighlight", node: { isLeaf: true } }),

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
