import { useCallback, useMemo, useState } from "react";
import { Linking, View } from "react-native";
import { MarkdownView } from "@/components/markdown-view";
import NoteReader from "@/components/rich-editor/note-reader";
import type { EditorTheme } from "@/components/rich-editor/shared";
import { Loading } from "@/components/ui";
import { textSizes, useAppearance } from "@/lib/appearance";
import { useClient } from "@/lib/session";
import type { Wiki } from "@/lib/markdown";
import type { DocValue } from "@/lib/reader-api";
import { useColors, useScheme } from "@/lib/theme";
import type { Note } from "@/lib/types";

// A note's text on a reading screen: drawn with all its formatting by the
// rich reader (rich-editor/note-reader.tsx) when its document is here, and
// from Markdown otherwise (an older server, or offline before the document
// was ever fetched). The reader is a web view that takes a moment to start:
// until it has drawn, the Markdown (or a spinner) stands in.

/** The reader's colours and reading size, from the phone's. */
export function useEditorTheme(): EditorTheme {
  const c = useColors();
  const scheme = useScheme();
  const { textSize } = useAppearance();
  return useMemo(
    () => ({
      foreground: c.foreground,
      background: c.background,
      muted: c.muted,
      mutedForeground: c.mutedForeground,
      border: c.border,
      ember: c.ember,
      emberInk: c.emberInk,
      emberSoft: c.emberSoft,
      highlight: c.highlight,
      teal: c.teal,
      destructive: c.destructive,
      fontSize: textSizes[textSize].body,
      lineHeight: textSizes[textSize].line,
      dark: scheme === "dark",
    }),
    [c, textSize, scheme],
  );
}

type Props = {
  /** The document, when there is one. */
  value: DocValue | null | undefined;
  /** Shown while the reader starts, and instead of it when there's no document. */
  markdown?: string | null;
  notes: Note[];
  onOpenNote: (noteId: string) => void;
  /** A Markdown `[[link]]`, by title. */
  onWiki: (wiki: Wiki) => void;
};

export function NoteText({ value, markdown, notes, onOpenNote, onWiki }: Props) {
  const theme = useEditorTheme();
  // What the document says, in short: the reader starts afresh only when that changes.
  const docKey = useMemo(() => (value ? fingerprint(JSON.stringify(value)) : ""), [value]);
  const [drawn, setDrawn] = useState<string | null>(null);
  const titles = useMemo(() => Object.fromEntries(notes.map((n) => [n.id, n.title || "Untitled"])), [notes]);

  const onReady = useCallback(async () => setDrawn(docKey), [docKey]);
  const openNote = useCallback(async (id: string) => onOpenNote(id), [onOpenNote]);
  const client = useClient();
  const openUrl = useCallback(async (url: string) => void Linking.openURL(url).catch(() => {}), []);
  // Pictures uploaded to Plotra, fetched with the phone's token, as the editor does.
  const loadImage = useCallback(
    async (url: string) => {
      const id = /^\/api\/files\/([\w-]+)/.exec(url)?.[1];
      return id ? client.dataUrl(`/api/mobile/upload?${new URLSearchParams({ file: id })}`) : null;
    },
    [client],
  );

  const fallback = markdown?.trim() ? <MarkdownView markdown={markdown} onWiki={onWiki} /> : null;
  if (!value) return fallback;
  // A new document starts hidden again until it has drawn.
  const ready = drawn === docKey;

  return (
    <View>
      {!ready && (fallback ?? <Loading />)}
      {/* Hidden, not left out, while it starts: it still measures itself, so it appears at its full height. */}
      <View style={ready ? undefined : { height: 0, overflow: "hidden" }} accessibilityElementsHidden={!ready} importantForAccessibility={ready ? "auto" : "no-hide-descendants"}>
        <NoteReader
          dom={{ matchContents: true, scrollEnabled: false }}
          value={value}
          docKey={docKey}
          theme={theme}
          titles={titles}
          onOpenNote={openNote}
          onOpenUrl={openUrl}
          loadImage={loadImage}
          onReady={onReady}
        />
      </View>
    </View>
  );
}

/** A short fingerprint of some text (FNV-1a), with its length. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}
