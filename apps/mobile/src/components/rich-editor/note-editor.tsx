"use dom";

import { toggleList } from "@platejs/list";
import { SuggestionPlugin } from "@platejs/suggestion/react";
import { YjsPlugin } from "@platejs/yjs/react";
import { useDOMImperativeHandle, type DOMImperativeFactory, type DOMProps } from "expo/dom";
import { KEYS, PointApi, RangeApi, type Point, type TElement, type TRange } from "platejs";
import { Plate, PlateContent, usePlateEditor, type PlateEditor } from "platejs/react";
import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from "react";
import * as Y from "yjs";
import {
  anchorFor,
  CommentHighlightPlugin,
  insertWikiLink,
  PhonePlugin,
  plugins,
  RemoteCursors,
  resolveOne,
  resolveSuggestions,
  setCommentRanges,
  styles,
  suggestionIdAt,
  threadAt,
} from "./kit";
import "./party-provider";
import {
  scriptTypes,
  type CommentDraft,
  type EditorCommand,
  type EditorHorizon,
  type EditorStatus,
  type EditorTheme,
  type EditorThread,
  type Seat,
  type SyncState,
} from "./shared";

// The phone's editor: the same document the web edits, live. It runs in a web
// view (an Expo DOM component) so it can use Plate, the web's editor, joined
// to the note's room on the collab server. Typing goes into the shared
// document a keystroke at a time, so nothing the phone doesn't show (comments,
// suggestions, block tags, formatting) is lost, and people writing elsewhere
// appear as they type.
//
// Every kind of node the web's editor has is declared in ./kit.tsx exactly as
// it is there (apps/app/components/editor/editor-kit.tsx): block or inline,
// void or not. That matters: an editor that mistook an inline link for a
// block would "fix" the document, and the fix would reach everyone.

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
  /** Who's writing, for the suggestions they make (as the web's currentUserId). */
  userId: string | null;
  /** Edits become suggestions (only for people who may edit, as on the web). */
  suggesting: boolean;
  /** Open comment threads, highlighted where they point. */
  threads: EditorThread[];
  getSeat: () => Promise<Seat | null>;
  persist: (state: string) => Promise<void>;
  onStatus: (status: EditorStatus) => Promise<void>;
  onOpenNote: (nodeId: string) => Promise<void>;
  /** `[[` was typed: the phone shows its note picker and says which note, or null. */
  pickNote: () => Promise<string | null>;
  /** A picture kept by Plotra (`/api/files/…`), fetched with the phone's token, as a data: URL. */
  loadImage: (url: string) => Promise<string | null>;
  /** A comment highlight was tapped while reading. */
  onOpenThread: (threadId: string) => Promise<void>;
  /** "Comment" on a selection: where it points, for the phone to ask what to say. */
  startComment: (draft: CommentDraft) => Promise<void>;
  /** Suggestions were accepted or rejected here: these people made them. */
  onSuggestionsResolved: (authorIds: string[], accepted: boolean) => Promise<void>;
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

// ---- The editor -----------------------------------------------------------------------------

const countWords = (text: string) => text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;

export default function NoteEditor(props: Props) {
  const { room, collabUrl, savedState, theme, titles, horizon, readOnly, userId, suggesting, threads } = props;
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
          // Others see this phone's cursor; the name and colour on it are the seat's (getSeat).
          cursors: {},
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
    editor.setOption(CommentHighlightPlugin, "openThread", (id: string) => void callbacks.current.onOpenThread(id));
    editor.setOption(PhonePlugin, "loadImage", (url: string) => callbacks.current.loadImage(url));
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
  // As on the web: only people who may edit suggest; commenters comment.
  const isSuggesting = editable && suggesting;
  const canComment = ready && (role === "editor" || role === "commenter");

  useEffect(() => {
    editor.setOption(SuggestionPlugin, "currentUserId", userId);
    editor.setOption(SuggestionPlugin, "isSuggesting", isSuggesting);
  }, [editor, userId, isSuggesting]);

  // Comment highlights follow the text as it changes; the latest threads are read on every change.
  const threadsRef = useRef(threads);
  useEffect(() => {
    threadsRef.current = threads;
    if (ready) setCommentRanges(editor, threads);
  }, [editor, ready, threads]);

  // The text selection, also in a read-only note, where Slate doesn't track it (as the web's SelectionBubble).
  const lastSelection = useRef<TRange | null>(null);
  const [selected, setSelected] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const update = () => {
      const selection = window.getSelection();
      const root = editor.api.toDOMNode(editor);
      if (!selection?.rangeCount || !root?.contains(selection.anchorNode)) return;
      const range = selection.isCollapsed ? null : editor.api.toSlateRange(selection.getRangeAt(0), { exactMatch: false, suppressThrow: true });
      lastSelection.current = range && !RangeApi.isCollapsed(range) ? range : null;
      setSelected(!!lastSelection.current);
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [editor, ready]);

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
      // A link to a note tapped while writing (the cursor is just after it), or selected.
      const tapped = editor.getOption(PhonePlugin, "tappedLink") as { nodeId: string; title: string; point: Point } | null;
      const sel = editor.selection;
      const linkEntry = sel ? editor.api.above({ match: { type: "wikilink" }, voids: true }) : undefined;
      const linked = linkEntry?.[0] as (TElement & { nodeId?: string; alias?: string }) | undefined;
      const titles = callbacks.current.titles;
      const link = linked?.nodeId
        ? { nodeId: linked.nodeId, title: linked.alias || titles[linked.nodeId] || "this note" }
        : tapped && sel && RangeApi.isCollapsed(sel) && PointApi.equals(sel.anchor, tapped.point)
          ? { nodeId: tapped.nodeId, title: tapped.title }
          : null;
      const pending = resolveSuggestions(editor);
      const here = suggestionIdAt(editor);
      const atCursor = here ? pending.find((s) => s.suggestionId === here) : undefined;
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
        suggesting: isSuggesting,
        selection: canComment && !!lastSelection.current,
        link,
        thread: threadAt(editor),
        suggestion: atCursor ? { id: atCursor.suggestionId, type: atCursor.type, text: (atCursor.text ?? "").slice(0, 200), newText: (atCursor.newText ?? "").slice(0, 200) } : null,
        suggestions: pending.length,
      });
    }, 120);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(report, [sync, editable, role, peers, unsent, ready, titles, horizon, isSuggesting, selected, threads]);

  const onChange = () => {
    // The highlights move with the text.
    if (ready) setCommentRanges(editor, threadsRef.current);
    report();
  };

  useDOMImperativeHandle(
    props.ref as Ref<EditorRef>,
    () => ({
      run: (...args: unknown[]) => {
        const command = args[0] as EditorCommand;
        if (command.type === "blur") {
          (document.activeElement as HTMLElement | null)?.blur();
          return;
        }
        if (command.type === "comment") {
          if (!canComment) return;
          const range = editor.selection && !RangeApi.isCollapsed(editor.selection) ? editor.selection : lastSelection.current;
          const anchor = range ? anchorFor(editor, range) : null;
          const quote = range && anchor ? editor.api.string(range).slice(0, 500) : null;
          void callbacks.current.startComment({ anchor, quote });
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
          case "suggestion": {
            const resolved = resolveSuggestions(editor).filter((s) => command.id === null || s.suggestionId === command.id);
            editor.tf.withoutNormalizing(() => {
              for (const s of resolved) resolveOne(editor, s, command.accept);
            });
            // The people who suggested these hear what became of them, as on the web. The agent's are left out.
            const authors = [...new Set(resolved.map((s) => s.userId))].filter((a) => a && a !== userId && !a.startsWith("agent:"));
            if (authors.length) void callbacks.current.onSuggestionsResolved(authors, command.accept);
            break;
          }
          case "image":
            editor.tf.insertNodes({ type: KEYS.img, url: command.url, ...(command.alt && { alt: command.alt }), children: [{ text: "" }] } as TElement, { select: true });
            break;
        }
        report();
      },
    }),
    [editor, editable, canComment, userId],
  );

  const css = useMemo(() => styles(theme), [theme]);

  return (
    <div className="root">
      <style>{css}</style>
      <Plate editor={editor} readOnly={!editable} onChange={onChange}>
        <PlateContent className="content" placeholder={editable ? "Start writing…" : ""} autoCapitalize="sentences" spellCheck />
        {ready && <RemoteCursors editor={editor} />}
      </Plate>
      {!ready && <div className="loading">Opening…</div>}
    </div>
  );
}
