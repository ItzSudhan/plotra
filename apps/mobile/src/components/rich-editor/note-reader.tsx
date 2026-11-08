"use dom";

import { LinkPlugin } from "@platejs/link/react";
import type { DOMProps } from "expo/dom";
import { KEYS, type TElement, type Value } from "platejs";
import { Plate, PlateContent, PlateElement, usePlateEditor, type PlateElementProps } from "platejs/react";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { PhonePlugin, plugins, styles } from "./kit";
import type { EditorTheme } from "./shared";

// Reading a note on the phone with all its formatting: the web's editor
// (Plate), read-only, drawing a document handed to it (no live connection).
// The kit (./kit.tsx) is the live editor's, so script pages, callouts,
// tables, to-do lists, highlights, suggestions and passage tags look the
// same in both. It runs in a web view (an Expo DOM component) that grows to
// fit its text, inside the reader's own scrolling screen.

type Props = {
  dom?: DOMProps;
  /** The document: Plate nodes, as the server sends them. */
  value: Record<string, unknown>[];
  /** Changes when the document does; the value itself is copied across the bridge on every render. */
  docKey: string;
  theme: EditorTheme;
  /** Note titles by id, for links. */
  titles: Record<string, string>;
  onOpenNote: (nodeId: string) => Promise<void>;
  onOpenUrl: (url: string) => Promise<void>;
  /** A picture in the note, fetched with the phone's token (the web view has no sign-in of its own). */
  loadImage: (url: string) => Promise<string | null>;
  /** The text is drawn: the screen can stop showing its stand-in. */
  onReady: () => Promise<void>;
};

const OpenUrl = createContext<(url: string) => void>(() => {});

/** A web link, opened in the phone's browser (the editor's own doesn't follow links). */
function ReaderLink(props: PlateElementProps) {
  const url = (props.element as TElement & { url?: string }).url ?? "";
  const open = useContext(OpenUrl);
  return (
    <PlateElement
      {...props}
      as="a"
      className="link"
      attributes={{
        ...props.attributes,
        href: url,
        onClick: (e: React.MouseEvent) => {
          e.preventDefault();
          if (/^(https?:|mailto:)/i.test(url)) open(url);
        },
      }}
    />
  );
}

// The kit's plugins, but links are followed when tapped. Only the drawing changes: the
// declarations (inline, void) stay the web's.
const readerPlugins = plugins.map((p) => (p.key === KEYS.link ? LinkPlugin.configure({ render: { node: ReaderLink } }) : p));

const readerCss = `
  html, body { background: transparent; }
  .content { min-height: 0; padding: 0 0 4px; -webkit-user-select: text; user-select: text; -webkit-touch-callout: default; }
  .content > :first-child { margin-top: 0; }
`;

export default function NoteReader({ value, docKey, theme, titles, onOpenNote, onOpenUrl, loadImage, onReady }: Props) {
  const callbacks = useRef({ onOpenNote, onOpenUrl, loadImage });
  useEffect(() => {
    callbacks.current = { onOpenNote, onOpenUrl, loadImage };
  });

  // A new editor only when the document changes, not on every render of the screen.
  const editor = usePlateEditor(
    {
      plugins: readerPlugins,
      value: (value.length ? value : [{ type: "p", children: [{ text: "" }] }]) as Value,
    },
    [docKey],
  );

  // Before the first draw, so links have their titles and pictures can load.
  editor.setOption(PhonePlugin, "titles", titles);
  editor.setOption(PhonePlugin, "loadImage", loadImage);

  useEffect(() => {
    // Only needed when a link is tapped, which is after this.
    editor.setOption(PhonePlugin, "openNote", (id: string) => void callbacks.current.onOpenNote(id));
    editor.setOption(PhonePlugin, "titles", titles);
    editor.api.redecorate?.();
  }, [editor, titles]);

  useEffect(() => {
    // After the first paint, so the height the screen gets is the text's.
    const frame = requestAnimationFrame(() => void onReady());
    return () => cancelAnimationFrame(frame);
    // Once per document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const css = useMemo(() => styles(theme) + readerCss, [theme]);
  const openUrl = useMemo(() => (url: string) => void callbacks.current.onOpenUrl(url), []);

  return (
    <div className="root">
      <style>{css}</style>
      <OpenUrl.Provider value={openUrl}>
        <Plate editor={editor} readOnly>
          <PlateContent className="content" readOnly aria-label="The note's text" />
        </Plate>
      </OpenUrl.Provider>
    </div>
  );
}
