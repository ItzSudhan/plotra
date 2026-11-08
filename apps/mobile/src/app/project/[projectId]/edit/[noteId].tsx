import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FormatBar, type Format } from "@/components/format-bar";
import { useMenu } from "@/components/menu";
import { NotePicker } from "@/components/note-picker";
import NoteEditor, { type EditorRef } from "@/components/rich-editor/note-editor";
import {
  noteRoom,
  scriptElements,
  type CommentDraft,
  type EditorCommand,
  type EditorHorizon,
  type EditorStatus,
  type EditorTheme,
  type EditorThread,
  type Seat,
} from "@/components/rich-editor/shared";
import { Chip, Loading } from "@/components/ui";
import { ApiError, isOffline } from "@/lib/api";
import { textSizes, useAppearance } from "@/lib/appearance";
import { invalidate, keys, useResource } from "@/lib/cache";
import { commentKeys, commentsRoute, createThread, loadComments } from "@/lib/comments-api";
import { readDocState, writeDocState } from "@/lib/doc-store";
import { words } from "@/lib/links";
import { useOutbox } from "@/lib/outbox";
import { useProject } from "@/lib/project";
import { useClient } from "@/lib/session";
import { radius, space, useColors, useScheme } from "@/lib/theme";
import type { Me, Note } from "@/lib/types";
import { useHorizon } from "@/lib/use-horizon";

// Writing on the phone: the note's own document, live, in the web's editor
// (components/rich-editor/note-editor.tsx). There's nothing to save: every
// keystroke goes to the shared document, people writing elsewhere appear as
// they type, and comments, suggestions and formatting the phone doesn't show
// are untouched. The document is kept on the phone too, so writing works
// offline; what's written then is sent when the connection is back, by the
// editor if it's still open, or by the outbox.
//
// As on the web: other people's cursors are drawn with their names; people
// who may edit can switch to suggesting, and accept or reject suggestions;
// passages with open comments are highlighted, and selected text can be
// commented on (by commenters too); pictures come from the photo library or
// the camera.

/** What the compose sheet asks for: a comment's text, or a picture's description. */
type Sheet = {
  title: string;
  placeholder: string;
  action: string;
  /** The passage being commented on, shown above the box. */
  quote?: string | null;
  /** May be left empty. */
  optional?: boolean;
  /** Resolves with a message to show if it didn't work, or null. */
  submit: (text: string) => Promise<string | null>;
  cancel?: () => void;
};

const pictureError = (e: unknown) =>
  isOffline(e) ? "You're offline. Pictures can be added when you're back online." : e instanceof ApiError ? e.message : "The picture couldn't be added. Try again.";

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
  const [suggesting, setSuggesting] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const me = useResource<Me>(keys.me, client.me);
  // Open comment threads, as the comments screen has them (one cache entry for both).
  const comments = useResource(commentKeys.note(projectId, noteId), () => loadComments(client, projectId, noteId));
  const threads: EditorThread[] = useMemo(
    () => (comments.data?.threads ?? []).flatMap((t) => (t.anchor && !t.resolved ? [{ id: t.id, anchor: t.anchor }] : [])),
    [comments.data],
  );
  // Back from the comments screen: threads may have been resolved or started.
  const refreshComments = comments.refresh;
  useFocusEffect(
    useCallback(() => {
      void refreshComments();
    }, [refreshComments]),
  );
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

  const onOpenThread = useCallback(async (threadId: string) => {
    router.push(commentsRoute(projectId, noteId, threadId));
  }, [projectId, noteId]);

  const startComment = useCallback(
    async (draft: CommentDraft) => {
      setSheet({
        title: "Comment",
        placeholder: draft.quote ? "Say something about this passage" : "Say something about this note",
        action: "Comment",
        quote: draft.quote,
        submit: async (body) => {
          try {
            await createThread(client, projectId, noteId, { anchor: draft.anchor, quote: draft.quote, body });
            invalidate(commentKeys.project(projectId));
            void refreshComments();
            return null;
          } catch (e) {
            return isOffline(e) ? "You're offline. Comments can be added when you're back online." : e instanceof Error ? e.message : "The comment couldn't be added.";
          }
        },
      });
    },
    [client, projectId, noteId, refreshComments],
  );

  const onSuggestionsResolved = useCallback(
    async (authorIds: string[], accepted: boolean) => {
      // Only word of the decision: the decision itself is in the document already.
      await client.request("/api/mobile/suggestions", { method: "POST", body: { projectId, noteId, authorIds, accepted } }).catch(() => {});
    },
    [client, projectId, noteId],
  );

  const loadImage = useCallback(
    async (url: string) => {
      const id = /^\/api\/files\/([\w-]+)/.exec(url)?.[1];
      return id ? client.dataUrl(`/api/mobile/upload?${new URLSearchParams({ file: id })}`) : null;
    },
    [client],
  );

  // A picture: chosen or taken, described (optional), uploaded with the note's other files, then put in.
  const addPicture = async (source: "library" | "camera") => {
    if (status?.sync === "offline") return Alert.alert("You're offline", "Pictures can be added when you're back online.");
    if (source === "camera") {
      const allowed = await ImagePicker.requestCameraPermissionsAsync();
      if (!allowed.granted) return Alert.alert("No camera", "Plotra isn't allowed to use the camera. You can allow it in the phone's Settings.");
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      quality: 0.8,
      // JPEG rather than HEIC: browsers everywhere can show it.
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    };
    const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    const type = asset.mimeType ?? "image/jpeg";
    const name = asset.fileName || `picture.${type.split("/")[1] === "png" ? "png" : "jpg"}`;
    const upload = async (alt: string) => {
      setUploading(0);
      try {
        const path = `/api/mobile/upload?${new URLSearchParams({ project: projectId, node: noteId, name })}`;
        const { url } = await client.upload<{ url: string }>(path, { uri: asset.uri, type }, setUploading);
        run({ type: "image", url, alt });
      } catch (e) {
        Alert.alert("The picture wasn't added", pictureError(e));
      } finally {
        setUploading(null);
      }
    };
    setSheet({
      title: "Describe the picture",
      placeholder: "What it shows, for people who can't see it (optional)",
      action: "Add picture",
      optional: true,
      submit: async (alt) => {
        void upload(alt.trim());
        return null;
      },
    });
  };

  const resolveAll = () => {
    const n = status?.suggestions ?? 0;
    showMenu({
      title: n === 1 ? "1 suggestion" : `${n} suggestions`,
      message: "Accepting makes the change; rejecting puts the text back as it was. The people who suggested them are told.",
      items: [
        { label: "Accept all", icon: "check", onPress: () => run({ type: "suggestion", id: null, accept: true }) },
        { label: "Reject all", icon: "close", destructive: true, onPress: () => run({ type: "suggestion", id: null, accept: false }) },
      ],
    });
  };

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
      case "suggest":
        return setSuggesting((on) => !on);
      case "comment":
        return run({ type: "comment" });
      case "picture":
        return showMenu({
          title: "Add a picture",
          items: [
            { label: "Choose from photos", icon: "picture", onPress: () => void addPicture("library") },
            { label: "Take a photo", icon: "add", onPress: () => void addPicture("camera") },
          ],
        });
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

  const line = uploading !== null
    ? `Adding the picture… ${Math.round(uploading * 100)}%`
    : !status
    ? "Opening…"
    : status.sync === "offline"
      ? status.editable
        ? "Offline. What you write is kept on this phone and sent later."
        : "Offline, and this note isn't on your phone yet. Open it once while online."
      : status.sync === "connecting"
        ? "Connecting…"
        : status.role === "commenter"
          ? "You can comment on this note, not change it. Select text to comment."
          : status.role === "viewer"
          ? "You can read this note, not change it."
          : status.suggesting
          ? "Suggesting: your changes wait for someone to accept them."
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
            userId={me.data?.user.id ?? null}
            suggesting={suggesting}
            threads={threads}
            onOpenThread={onOpenThread}
            startComment={startComment}
            onSuggestionsResolved={onSuggestionsResolved}
            loadImage={loadImage}
            dom={{ style: { flex: 1, backgroundColor: c.background }, hideKeyboardAccessoryView: true, contentInsetAdjustmentBehavior: "never" }}
          />
        )}
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md, paddingHorizontal: space.lg, paddingVertical: 4, backgroundColor: c.card }}>
          <Text numberOfLines={1} style={{ flex: 1, color: status?.sync === "offline" ? c.emberInk : c.mutedForeground, fontSize: 12 }}>
            {line}
          </Text>
          {!!status && <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{words(status.words)}</Text>}
        </View>
        <Context status={status} onOpenNote={(id) => void onOpenNote(id)} onOpenThread={(id) => void onOpenThread(id)} run={run} onResolveAll={resolveAll} />
        <FormatBar status={status} onFormat={format} onDone={() => run({ type: "blur" })} />
      </KeyboardAvoidingView>
      <ComposeSheet sheet={sheet} onClose={() => setSheet(null)} />
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

/** What the cursor is on, above the keyboard: a link to open, a comment to read, a suggestion to decide. */
function Context({
  status,
  onOpenNote,
  onOpenThread,
  run,
  onResolveAll,
}: {
  status: EditorStatus | null;
  onOpenNote: (id: string) => void;
  onOpenThread: (id: string) => void;
  run: (command: EditorCommand) => void;
  onResolveAll: () => void;
}) {
  const c = useColors();
  if (!status) return null;
  const s = status.suggestion;
  const decide = status.editable && !!s;
  const all = status.editable && status.suggestions > 0;
  if (!status.link && !status.thread && !decide && !all && !status.selection) return null;
  const change = s ? (s.type === "remove" ? `Remove “${s.text}”` : s.type === "insert" ? `Add “${s.newText}”` : s.type === "replace" ? `“${s.text}” → “${s.newText}”` : "Formatting") : "";
  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, backgroundColor: c.background }}
      contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.md, paddingVertical: 6, alignItems: "center" }}
    >
      {status.link && <Chip label={`Open ‘${status.link.title}’`} onPress={() => onOpenNote(status.link!.nodeId)} />}
      {status.thread && <Chip label="Open the comment" onPress={() => onOpenThread(status.thread!)} />}
      {status.selection && !status.thread && <Chip label="Comment" onPress={() => run({ type: "comment" })} />}
      {decide && (
        <>
          <Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 13, maxWidth: 180 }}>
            {change}
          </Text>
          <Chip label="Accept" onPress={() => run({ type: "suggestion", id: s!.id, accept: true })} />
          <Chip label="Reject" onPress={() => run({ type: "suggestion", id: s!.id, accept: false })} />
        </>
      )}
      {all && <Chip label={status.suggestions === 1 ? "1 suggestion…" : `${status.suggestions} suggestions…`} onPress={onResolveAll} />}
    </ScrollView>
  );
}

/** A comment's text, or a picture's description: a small sheet with one box. */
function ComposeSheet({ sheet, onClose }: { sheet: Sheet | null; onClose: () => void }) {
  const c = useColors();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = (cancelled: boolean) => {
    if (cancelled) sheet?.cancel?.();
    setText("");
    setError(null);
    setBusy(false);
    onClose();
  };
  const submit = async () => {
    if (!sheet || busy || (!sheet.optional && !text.trim())) return;
    setBusy(true);
    const failed = await sheet.submit(text.trim());
    setBusy(false);
    if (failed) setError(failed);
    else close(false);
  };
  const canSend = !!sheet && !busy && (sheet.optional || !!text.trim());
  return (
    <Modal visible={!!sheet} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => close(true)}>
      <View style={{ flex: 1, backgroundColor: c.background, padding: space.lg, gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <Pressable accessibilityRole="button" onPress={() => close(true)} hitSlop={8}>
            <Text style={{ color: c.foreground, fontSize: 17 }}>Cancel</Text>
          </Pressable>
          <Text style={{ flex: 1, textAlign: "center", color: c.foreground, fontSize: 17, fontWeight: "600" }}>{sheet?.title}</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSend }} disabled={!canSend} onPress={() => void submit()} hitSlop={8}>
            <Text style={{ color: canSend ? c.emberInk : c.mutedForeground, fontSize: 17, fontWeight: "600" }}>{busy ? "Sending…" : sheet?.action}</Text>
          </Pressable>
        </View>
        {!!sheet?.quote && (
          <Text numberOfLines={4} style={{ color: c.mutedForeground, fontSize: 15, fontStyle: "italic", borderLeftWidth: 3, borderLeftColor: c.ember, paddingLeft: space.md }}>
            {sheet.quote}
          </Text>
        )}
        <TextInput
          value={text}
          onChangeText={setText}
          autoFocus
          multiline
          placeholder={sheet?.placeholder}
          placeholderTextColor={c.mutedForeground}
          accessibilityLabel={sheet?.title}
          style={{ minHeight: 120, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, color: c.foreground, padding: space.md, fontSize: 16, textAlignVertical: "top" }}
        />
        {!!error && <Text style={{ color: c.destructive, fontSize: 14 }}>{error}</Text>}
      </View>
    </Modal>
  );
}
