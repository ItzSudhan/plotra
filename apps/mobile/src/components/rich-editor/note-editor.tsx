"use dom";

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
import { BulletedListRules, isOrderedList, OrderedListRules, TaskListRules, toggleList } from "@platejs/list";
import { ListPlugin } from "@platejs/list/react";
import { SuggestionPlugin } from "@platejs/suggestion/react";
import { TableCellHeaderPlugin, TableCellPlugin, TablePlugin, TableRowPlugin } from "@platejs/table/react";
import { YjsPlugin } from "@platejs/yjs/react";
import { useDOMImperativeHandle, type DOMImperativeFactory, type DOMProps } from "expo/dom";
import { KEYS, TrailingBlockPlugin, type TElement, type TListElement } from "platejs";
import {
  createPlatePlugin,
  ParagraphPlugin,
  Plate,
  PlateContent,
  PlateElement,
  PlateLeaf,
  useEditorRef,
  usePlateEditor,
  useReadOnly,
  type PlateEditor,
  type PlateElementProps,
  type PlateLeafProps,
  type RenderNodeWrapper,
} from "platejs/react";
import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from "react";
import * as Y from "yjs";
import "./party-provider";
import { scriptElements, scriptTypes, type EditorCommand, type EditorHorizon, type EditorStatus, type EditorTheme, type Seat, type SyncState } from "./shared";

// The phone's editor: the same document the web edits, live. It runs in a web
// view (an Expo DOM component) so it can use Plate, the web's editor, joined
// to the note's room on the collab server. Typing goes into the shared
// document a keystroke at a time, so nothing the phone doesn't show (comments,
// suggestions, block tags, formatting) is lost, and people writing elsewhere
// appear as they type.
//
// Every kind of node the web's editor has is declared here exactly as it is
// there (apps/app/components/editor/editor-kit.tsx): block or inline, void or
// not. That matters: an editor that mistook an inline link for a block would
// "fix" the document, and the fix would reach everyone.

export type EditorRef = DOMImperativeFactory & { run: (...args: unknown[]) => void };

type Props = {
  ref?: Ref<EditorRef>;
  dom?: DOMProps;
  room: string;
  /** The collab server's address, from the phone's last seat; the provider asks for a fresh seat on each connect. */
  collabUrl: string;
  /** The document as last kept on the phone (base64 Yjs update), to write in offline. */
  savedState: string | null;
  readOnly: boolean;
  theme: EditorTheme;
  /** Note titles by id, for links. */
  titles: Record<string, string>;
  horizon: EditorHorizon;
  getSeat: () => Promise<Seat | null>;
  persist: (state: string) => Promise<void>;
  onStatus: (status: EditorStatus) => Promise<void>;
  onOpenNote: (nodeId: string) => Promise<void>;
  /** `[[` was typed: the phone shows its note picker and says which note, or null. */
  pickNote: () => Promise<string | null>;
};

// ---- Bytes as text, for the bridge ----------------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

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

const PhonePlugin = createPlatePlugin({
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

function insertWikiLink(editor: PlateEditor, nodeId: string, at?: PlateEditor["selection"]) {
  editor.tf.focus();
  if (at) editor.tf.select(at);
  editor.tf.insertNodes({ type: "wikilink", nodeId, children: [{ text: "" }] } as TElement);
  editor.tf.move({ unit: "offset" });
}

// Elements that are blocks but carry no plugin of their own are left to Plate's defaults
// (a block); the ones below need declaring, because they're inline or void.
const voidInline = { isElement: true, isInline: true, isVoid: true } as const;

const plugins = [
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

// ---- The editor -----------------------------------------------------------------------------

const countWords = (text: string) => text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;

export default function NoteEditor(props: Props) {
  const { room, collabUrl, savedState, theme, titles, horizon, readOnly } = props;
  const [sync, setSync] = useState<SyncState>("connecting");
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<Seat["role"] | null>(null);
  const [synced, setSynced] = useState(false);
  const [unsent, setUnsent] = useState(false);
  const [peers, setPeers] = useState<string[]>([]);
  const callbacks = useRef(props);
  useEffect(() => {
    callbacks.current = props;
  });

  // The seat is asked for again on each connect; its role decides whether the phone may write.
  const editorRef = useRef<PlateEditor | null>(null);
  const getSeat = useCallback(async () => {
    const seat = await callbacks.current.getSeat();
    setRole(seat?.role ?? null);
    // Who this is, for the names others see in the note.
    if (seat) editorRef.current?.getOptions(YjsPlugin).awareness?.setLocalStateField("data", seat.user);
    return seat;
  }, []);

  const yjs = useMemo(
    () =>
      // getSeat reads a ref, but only when the provider connects, never while rendering.
      // eslint-disable-next-line react-hooks/refs
      YjsPlugin.configure({
        options: {
          cursors: null,
          providers: [{ type: "partyserver", options: { room, url: collabUrl, getSeat } } as never],
          onConnect: () => setSync((s) => (s === "synced" ? s : "connecting")),
          onDisconnect: () => setSync("offline"),
          onSyncChange: ({ isSynced }) => {
            setSync(isSynced ? "synced" : "connecting");
            if (isSynced) {
              setSynced(true);
              // The server has everything written here now.
              setUnsent(false);
            }
          },
          onError: () => setSync("offline"),
        },
      }),
    // One editor per room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room],
  );

  const editor = usePlateEditor({ plugins: [...plugins, yjs], skipInitialization: true }, [room]) as PlateEditor;
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);
  const syncRef = useRef<SyncState>("connecting");
  const readyRef = useRef(false);
  useEffect(() => {
    syncRef.current = sync;
    readyRef.current = ready;
  }, [sync, ready]);

  useEffect(() => {
    editor.setOption(PhonePlugin, "titles", titles);
    editor.setOption(PhonePlugin, "horizon", horizon);
    editor.setOption(PhonePlugin, "openNote", (id: string) => void callbacks.current.onOpenNote(id));
    editor.setOption(PhonePlugin, "pickNote", () => callbacks.current.pickNote());
    // Elements read these as they render: draw again.
    editor.api.redecorate?.();
  }, [editor, titles, horizon]);

  // Join the room: the copy kept on the phone first, then the server's.
  useEffect(() => {
    let cancelled = false;
    let initializing: Promise<void> | null = null;
    const api = editor.getApi(YjsPlugin).yjs;
    const ydoc = editor.getOptions(YjsPlugin).ydoc!;
    const start = setTimeout(() => {
      if (savedState) {
        try {
          Y.applyUpdate(ydoc, fromBase64(savedState));
        } catch {}
      }
      initializing = api.init({ id: room, value: null }).then(() => {
        if (!cancelled) setReady(true);
      });
    });
    return () => {
      cancelled = true;
      clearTimeout(start);
      void initializing?.finally(() => api.destroy());
    };
    // The saved state only matters when the room opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, room]);

  // Keep the document on the phone as it changes, for writing offline; note what the server hasn't seen.
  useEffect(() => {
    const ydoc = editor.getOptions(YjsPlugin).ydoc!;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      // A change made here while the server can't hear it waits to be sent. (What arrives from
      // the provider is the server's own; while connected, local changes go at once.)
      const fromServer = !!origin && typeof origin === "object" && "wsconnected" in (origin as object);
      if (!fromServer && readyRef.current && syncRef.current !== "synced") setUnsent(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void callbacks.current.persist(toBase64(Y.encodeStateAsUpdate(ydoc))), 600);
    };
    ydoc.on("update", onUpdate);
    return () => {
      ydoc.off("update", onUpdate);
      // Closing straight after typing: keep the last of it too.
      if (timer) {
        clearTimeout(timer);
        void callbacks.current.persist(toBase64(Y.encodeStateAsUpdate(ydoc)));
      }
    };
  }, [editor]);


  // Who else is here.
  useEffect(() => {
    const awareness = editor.getOptions(YjsPlugin).awareness;
    if (!awareness) return;
    const onChange = () => {
      const names = new Set<string>();
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const name = (state as { data?: { name?: string }; user?: { name?: string } }).data?.name ?? (state as { user?: { name?: string } }).user?.name;
        if (name) names.add(name);
      });
      setPeers([...names]);
    };
    awareness.on("change", onChange);
    return () => awareness.off("change", onChange);
  }, [editor]);

  // Writing needs a copy to write in: the server's, or one kept on the phone. And a seat that may edit.
  const editable = ready && !readOnly && (synced || !!savedState) && role !== "viewer" && role !== "commenter";

  // The status, a moment after each change.
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const report = () => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => {
      const marks = Object.keys(editor.api.marks() ?? {}).filter((k) => !k.startsWith("suggestion"));
      const entry = editor.selection ? editor.api.block() : undefined;
      const el = entry?.[0] as (TElement & { listStyleType?: string }) | undefined;
      const text = editor.api.string([]);
      const script = editor.children.some((n) => scriptTypes.has((n as TElement).type));
      void callbacks.current.onStatus({
        sync,
        editable,
        role,
        words: countWords(text),
        peers,
        marks,
        block: el?.type ?? "p",
        list: el?.listStyleType ?? null,
        script,
        unsent,
      });
    }, 120);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(report, [sync, editable, role, peers, unsent, ready, titles, horizon]);

  useDOMImperativeHandle(
    props.ref as Ref<EditorRef>,
    () => ({
      run: (...args: unknown[]) => {
        const command = args[0] as EditorCommand;
        if (command.type === "blur") {
          (document.activeElement as HTMLElement | null)?.blur();
          return;
        }
        if (!editable) return;
        editor.tf.focus();
        switch (command.type) {
          case "mark":
            editor.tf.toggleMark(command.mark);
            break;
          case "block":
            editor.tf.toggleBlock(command.block);
            break;
          case "list":
            toggleList(editor, { listStyleType: command.style });
            break;
          case "hr":
            editor.tf.insertNodes({ type: KEYS.hr, children: [{ text: "" }] } as TElement);
            break;
          case "wikilink":
            insertWikiLink(editor, command.nodeId);
            break;
          case "undo":
            editor.undo();
            break;
          case "redo":
            editor.redo();
            break;
        }
        report();
      },
    }),
    [editor, editable],
  );

  const css = useMemo(() => styles(theme), [theme]);

  return (
    <div className="root">
      <style>{css}</style>
      <Plate editor={editor} readOnly={!editable} onChange={report}>
        <PlateContent className="content" placeholder={editable ? "Start writing…" : ""} autoCapitalize="sentences" spellCheck />
      </Plate>
      {!ready && <div className="loading">Opening…</div>}
    </div>
  );
}

function styles(t: EditorTheme): string {
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
