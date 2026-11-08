import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FormatBar, type Format } from "@/components/format-bar";
import { useMenu } from "@/components/menu";
import { NotePicker } from "@/components/note-picker";
import NoteEditor, { type EditorRef } from "@/components/rich-editor/note-editor";
import { noteRoom, scriptElements, type EditorCommand, type EditorHorizon, type EditorStatus, type EditorTheme, type Seat } from "@/components/rich-editor/shared";
import { Loading } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { textSizes, useAppearance } from "@/lib/appearance";
import { invalidate, keys } from "@/lib/cache";
import { readDocState, writeDocState } from "@/lib/doc-store";
import { words } from "@/lib/links";
import { useOutbox } from "@/lib/outbox";
import { useProject } from "@/lib/project";
import { useClient } from "@/lib/session";
import { space, useColors, useScheme } from "@/lib/theme";
import type { Note } from "@/lib/types";
import { useHorizon } from "@/lib/use-horizon";

// Writing on the phone: the note's own document, live, in the web's editor
// (components/rich-editor/note-editor.tsx). There's nothing to save: every
// keystroke goes to the shared document, people writing elsewhere appear as
// they type, and comments, suggestions and formatting the phone doesn't show
// are untouched. The document is kept on the phone too, so writing works
// offline; what's written then is sent when the connection is back, by the
// editor if it's still open, or by the outbox.

const COLLAB_URL = "plotra.collabUrl";

export default function EditScreen() {
  const { projectId, noteId } = useLocalSearchParams<{ projectId: string; noteId: string }>();
  const c = useColors();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const client = useClient();
  const showMenu = useMenu();
  const { textSize } = useAppearance();
  const { enqueue, settleDoc } = useOutbox();
  const { notes } = useProject(projectId);
  const { release, horizon } = useHorizon(projectId, notes.data);
  const note: Note | undefined = notes.data?.find((n) => n.id === noteId);

  const [boot, setBoot] = useState<{ url: string | null; saved: string | null } | null>(null);
  const [status, setStatus] = useState<EditorStatus | null>(null);
  const [picking, setPicking] = useState(false);
  const editor = useRef<EditorRef>(null);
  const pickResolve = useRef<((id: string | null) => void) | null>(null);
  const room = noteRoom(noteId);

  // The collab server's address (asked for once; remembered for offline) and the copy kept on the phone.
  useEffect(() => {
    let live = true;
    (async () => {
      const saved = await readDocState(noteId);
      let url: string | null = null;
      try {
        url = (await client.collabSeat(projectId, room)).url;
        void AsyncStorage.setItem(COLLAB_URL, url);
      } catch (e) {
        if (isOffline(e)) url = await AsyncStorage.getItem(COLLAB_URL);
      }
      if (live) setBoot({ url, saved });
    })();
    return () => {
      live = false;
    };
  }, [client, projectId, noteId, room]);

  const getSeat = useCallback(async (): Promise<Seat | null> => {
    try {
      return await client.collabSeat(projectId, room);
    } catch {
      return null;
    }
  }, [client, projectId, room]);

  const persist = useCallback(async (state: string) => writeDocState(noteId, state), [noteId]);

  const title = note?.title || "Untitled";
  const unsent = useRef(false);
  const onStatus = useCallback(
    async (next: EditorStatus) => {
      setStatus(next);
      // Written offline: queue the document, so it goes even if this screen is closed first.
      if (next.unsent && !unsent.current) enqueue({ type: "doc", projectId, noteId, title });
      else if (!next.unsent && next.sync === "synced") settleDoc(noteId);
      unsent.current = next.unsent;
    },
    [enqueue, settleDoc, projectId, noteId, title],
  );

  // Leaving with changes the server hasn't had: queue the latest copy, which is kept by then.
  const leave = useRef(() => {});
  useEffect(() => {
    leave.current = () => {
      if (unsent.current) setTimeout(() => enqueue({ type: "doc", projectId, noteId, title }), 800);
    };
  }, [enqueue, projectId, noteId, title]);
  useEffect(() => () => leave.current(), []);

  const onOpenNote = useCallback(async (id: string) => {
    router.push({ pathname: "/project/[projectId]/note/[noteId]", params: { projectId, noteId: id } });
  }, [projectId]);

  const pickNote = useCallback(
    () =>
      new Promise<string | null>((resolve) => {
        pickResolve.current = resolve;
        setPicking(true);
      }),
    [],
  );

  const run = (command: EditorCommand) => editor.current?.run(command as never);

  const format = (f: Format) => {
    switch (f) {
      case "bold":
      case "italic":
        return run({ type: "mark", mark: f });
      case "strike":
        return run({ type: "mark", mark: "strikethrough" });
      case "highlight":
        return run({ type: "mark", mark: "highlight" });
      case "heading": {
        // Paragraph → heading 1 → 2 → 3 → paragraph. Toggling a heading the text already is turns it back into a paragraph.
        const block = status?.block ?? "p";
        return run({ type: "block", block: block === "h1" ? "h2" : block === "h2" ? "h3" : block === "h3" ? "h3" : "h1" });
      }
      case "quote":
        return run({ type: "block", block: "blockquote" });
      case "bullet":
        return run({ type: "list", style: "disc" });
      case "numbered":
        return run({ type: "list", style: "decimal" });
      case "todo":
        return run({ type: "list", style: "todo" });
      case "rule":
        return run({ type: "hr" });
      case "undo":
        return run({ type: "undo" });
      case "redo":
        return run({ type: "redo" });
      case "link":
        return void pickNote().then((id) => id && run({ type: "wikilink", nodeId: id }));
      case "script":
        return showMenu({
          title: "Script element",
          items: scriptElements.map((e) => ({ label: e.label, onPress: () => run({ type: "block", block: e.type }) })),
        });
    }
  };

  const theme: EditorTheme = useMemo(
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

  const titles = useMemo(() => Object.fromEntries((notes.data ?? []).map((n) => [n.id, n.title])), [notes.data]);
  const editorHorizon: EditorHorizon = useMemo(
    () => (horizon && release ? { limit: horizon.order.get(release.id) ?? 0, order: Object.fromEntries(horizon.order) } : null),
    [horizon, release],
  );

  const done = () => {
    run({ type: "blur" });
    invalidate(keys.note(projectId, noteId));
    invalidate(keys.notes(projectId));
    router.back();
  };

  const line = !status
    ? "Opening…"
    : status.sync === "offline"
      ? status.editable
        ? "Offline. What you write is kept on this phone and sent later."
        : "Offline, and this note isn't on your phone yet. Open it once while online."
      : status.sync === "connecting"
        ? "Connecting…"
        : status.role === "viewer" || status.role === "commenter"
          ? "You can read this note, not change it."
          : status.peers.length
            ? `Writing with ${status.peers.join(", ")}`
            : "Saved as you type";

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerLeft: () => null,
          headerRight: () => (
            <Pressable accessibilityRole="button" onPress={done} hitSlop={8} style={{ paddingHorizontal: space.sm }}>
              <Text style={{ color: c.emberInk, fontSize: 17, fontWeight: "600" }}>Done</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0} style={{ flex: 1, backgroundColor: c.background }}>
        {!boot ? (
          <Loading />
        ) : !boot.url ? (
          <Text style={{ color: c.mutedForeground, padding: space.xl, fontSize: 16, lineHeight: 23 }}>
            You&apos;re offline, and this note hasn&apos;t been opened for writing on this phone yet. Open it once while online, then you can write in it anywhere.
          </Text>
        ) : (
          <NoteEditor
            ref={editor}
            room={room}
            collabUrl={boot.url}
            savedState={boot.saved}
            readOnly={note ? !note.canEdit : false}
            theme={theme}
            titles={titles}
            horizon={editorHorizon}
            getSeat={getSeat}
            persist={persist}
            onStatus={onStatus}
            onOpenNote={onOpenNote}
            pickNote={pickNote}
            dom={{ style: { flex: 1, backgroundColor: c.background }, hideKeyboardAccessoryView: true, contentInsetAdjustmentBehavior: "never" }}
          />
        )}
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md, paddingHorizontal: space.lg, paddingVertical: 4, backgroundColor: c.card }}>
          <Text numberOfLines={1} style={{ flex: 1, color: status?.sync === "offline" ? c.emberInk : c.mutedForeground, fontSize: 12 }}>
            {line}
          </Text>
          {!!status && <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{words(status.words)}</Text>}
        </View>
        <FormatBar status={status} onFormat={format} onDone={() => run({ type: "blur" })} />
      </KeyboardAvoidingView>
      <NotePicker
        visible={picking}
        notes={notes.data ?? []}
        exclude={noteId}
        onPick={(picked) => {
          setPicking(false);
          pickResolve.current?.(picked?.id ?? null);
          pickResolve.current = null;
        }}
      />
    </>
  );
}
