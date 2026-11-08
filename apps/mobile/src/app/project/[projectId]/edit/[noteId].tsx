import { router, Stack, useLocalSearchParams, usePreventRemove } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type TextInputInstance, type TextInputSelectionChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FormatBar, type Format } from "@/components/format-bar";
import { Loading } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { invalidate, keys, readCache, writeCache } from "@/lib/cache";
import { clearDraft, readDraft, writeDraft } from "@/lib/drafts";
import { continueList, insert, setLinePrefix, wrap, type Edit, type Selection } from "@/lib/editing";
import { words } from "@/lib/links";
import { countWords } from "@/lib/markdown";
import { useOutbox } from "@/lib/outbox";
import { useProject } from "@/lib/project";
import { useClient } from "@/lib/session";
import { fonts, radius, space, useColors } from "@/lib/theme";
import type { NoteWithText } from "@/lib/types";

// Writing on the phone. The text is Markdown, with a bar of buttons for the
// usual formatting; [[ suggests notes to link. Everything typed is kept on the
// phone as a draft until it's saved. Saving checks nobody changed the note in
// the meantime, and the server keeps the version it replaces in the note's
// history. Only paragraphs that changed are rewritten, so comments and
// formatting elsewhere in the note stay put (apps/app/lib/api/note-update.ts).
// With no connection, the change waits on the phone and goes later.

export default function EditScreen() {
  const { projectId, noteId } = useLocalSearchParams<{ projectId: string; noteId: string }>();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const client = useClient();
  const { enqueue } = useOutbox();
  const { notes } = useProject(projectId);

  const [loaded, setLoaded] = useState<NoteWithText | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [base, setBase] = useState("");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const selection = useRef<Selection>({ start: 0, end: 0 });
  const [forced, setForced] = useState<Selection | undefined>(undefined);
  const [cursor, setCursor] = useState(0);
  const input = useRef<TextInputInstance>(null);
  const done = useRef(false);
  const [leaving, setLeaving] = useState(false);

  // The note as the server has it, else as last saved on the phone; then any draft.
  useEffect(() => {
    let live = true;
    (async () => {
      let note: NoteWithText | undefined;
      try {
        note = await client.note(projectId, noteId);
        void writeCache(keys.note(projectId, noteId), note);
      } catch (e) {
        note = await readCache<NoteWithText>(keys.note(projectId, noteId));
        if (!note) {
          if (live) setFailed(isOffline(e) ? "You're offline, and this note isn't saved on your phone yet. Open it once while online." : (e as Error).message);
          return;
        }
      }
      if (!live) return;
      const markdown = note.markdown ?? "";
      setLoaded(note);
      setBase(markdown);
      setText(markdown);
      setTitle(note.title);
      const draft = await readDraft(noteId);
      if (!live || !draft || (draft.text === markdown && draft.title === note.title)) return;
      Alert.alert("Pick up where you left off?", "There's writing on this phone that wasn't saved to this note.", [
        { text: "Start from the note", style: "destructive", onPress: () => void clearDraft(noteId) },
        {
          text: "Keep my writing",
          style: "default",
          onPress: () => {
            setBase(draft.base);
            setText(draft.text);
            setTitle(draft.title);
          },
        },
      ]);
    })();
    return () => {
      live = false;
    };
  }, [client, projectId, noteId]);

  const dirty = !!loaded && (text !== base || title.trim() !== loaded.title);

  // The draft, a moment after each change.
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      if (done.current) return;
      if (dirty) void writeDraft(noteId, { base, text, title, savedAt: Date.now() });
      else void clearDraft(noteId);
    }, 400);
    return () => clearTimeout(timer);
  }, [text, title, base, dirty, loaded, noteId]);

  const apply = (edit: Edit) => {
    setText(edit.text);
    selection.current = edit.selection;
    setForced(edit.selection);
    setCursor(edit.selection.end);
  };

  const onChangeText = (next: string) => {
    const list = continueList(text, next);
    if (list) apply(list);
    else setText(next);
  };

  const onSelectionChange = (e: TextInputSelectionChangeEvent) => {
    selection.current = e.nativeEvent.selection;
    setCursor(e.nativeEvent.selection.end);
    if (forced) setForced(undefined);
  };

  const format = (f: Format) => {
    const sel = selection.current;
    switch (f) {
      case "bold":
        return apply(wrap(text, sel, "**"));
      case "italic":
        return apply(wrap(text, sel, "*"));
      case "strike":
        return apply(wrap(text, sel, "~~"));
      case "highlight":
        return apply(wrap(text, sel, "=="));
      case "link":
        return apply(wrap(text, sel, "[[", "]]"));
      case "heading": {
        // # → ## → ### → plain text.
        const lineStart = text.lastIndexOf("\n", sel.start - 1) + 1;
        const hashes = /^(#{1,6}) /.exec(text.slice(lineStart))?.[1].length ?? 0;
        if (hashes >= 3) return apply(setLinePrefix(text, sel, "#".repeat(hashes) + " "));
        return apply(setLinePrefix(text, sel, "#".repeat(hashes + 1) + " "));
      }
      case "bullet":
        return apply(setLinePrefix(text, sel, "- "));
      case "numbered":
        return apply(setLinePrefix(text, sel, "1. "));
      case "todo":
        return apply(setLinePrefix(text, sel, "- [ ] "));
      case "quote":
        return apply(setLinePrefix(text, sel, "> "));
      case "rule": {
        const before = text.slice(0, sel.start);
        const lead = before.length === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
        return apply(insert(text, sel, `${lead}---\n\n`));
      }
    }
  };

  // [[ before the cursor: suggest notes to link.
  const linkQuery = useMemo(() => /\[\[([^\]\n|#]*)$/.exec(text.slice(0, cursor))?.[1] ?? null, [text, cursor]);
  const suggestions = useMemo(() => {
    if (linkQuery === null) return [];
    const q = linkQuery.trim().toLowerCase();
    return (notes.data ?? []).filter((n) => n.id !== noteId && n.kind !== "folder" && (!q || n.title.toLowerCase().includes(q) || n.aliases.some((a) => a.toLowerCase().includes(q)))).slice(0, 8);
  }, [linkQuery, notes.data, noteId]);

  const pickLink = (linkTitle: string) => {
    if (linkQuery === null) return;
    const start = cursor - linkQuery.length;
    const closes = text.slice(cursor, cursor + 2) === "]]";
    apply(insert(text, { start, end: cursor + (closes ? 2 : 0) }, `${linkTitle}]]`));
  };

  const close = () => {
    done.current = true;
    setLeaving(true);
  };

  // Once nothing holds the screen back any more.
  useEffect(() => {
    if (leaving) router.back();
  }, [leaving]);

  const save = async () => {
    if (!loaded || saving) return;
    const newTitle = title.trim();
    const textChanged = text !== base;
    const titleChanged = !!newTitle && newTitle !== loaded.title;
    if (!textChanged && !titleChanged) {
      void clearDraft(noteId);
      return close();
    }
    setSaving(true);
    try {
      if (textChanged) {
        const current = await client.note(projectId, noteId);
        if ((current.markdown ?? "") !== base) {
          setSaving(false);
          const replace = await new Promise<boolean>((resolve) =>
            Alert.alert("This note changed while you were writing", "Someone (or you, somewhere else) edited it. Save yours over it? Theirs stays in the note's history on the web.", [
              { text: "Keep editing", style: "cancel", onPress: () => resolve(false) },
              { text: "Save mine", style: "destructive", onPress: () => resolve(true) },
            ]),
          );
          if (!replace) return;
          setSaving(true);
        }
        const markdown = await client.writeText(projectId, noteId, "update", text);
        await writeCache(keys.note(projectId, noteId), { ...loaded, title: titleChanged ? newTitle : loaded.title, markdown, wordCount: countWords(markdown) });
      }
      if (titleChanged) await client.updateNote(projectId, noteId, { title: newTitle });
      await clearDraft(noteId);
      invalidate(keys.note(projectId, noteId));
      invalidate(keys.notes(projectId));
      close();
    } catch (e) {
      setSaving(false);
      if (isOffline(e)) {
        if (textChanged) enqueue({ type: "text", projectId, noteId, title: newTitle || loaded.title, mode: "update", markdown: text });
        if (titleChanged) enqueue({ type: "patch", projectId, noteId, title: newTitle, patch: { title: newTitle } });
        // What's shown meanwhile is what was written.
        await writeCache(keys.note(projectId, noteId), { ...loaded, title: titleChanged ? newTitle : loaded.title, markdown: text, wordCount: countWords(text) });
        await clearDraft(noteId);
        invalidate(keys.note(projectId, noteId));
        Alert.alert("Saved on your phone", "You're offline. It goes to Plotra by itself when you're back online.", [{ text: "OK", onPress: close }]);
      } else Alert.alert("Couldn't save", `${(e as Error).message}\n\nYour writing is kept on this phone.`);
    }
  };

  const cancel = () => {
    if (!dirty) {
      void clearDraft(noteId);
      return close();
    }
    Alert.alert("Leave without saving?", "Your writing stays on this phone, and you can pick it up next time you edit this note.", [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Throw it away",
        style: "destructive",
        onPress: () => {
          void clearDraft(noteId);
          close();
        },
      },
      { text: "Leave it for later", onPress: close },
    ]);
  };

  // A swipe down or the back button asks the same as Cancel.
  usePreventRemove(dirty && !leaving, cancel);

  const count = useMemo(() => countWords(text), [text]);

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerLeft: () => (
            <Pressable accessibilityRole="button" onPress={cancel} hitSlop={8} style={{ paddingHorizontal: space.sm }}>
              <Text style={{ color: c.foreground, fontSize: 17 }}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable accessibilityRole="button" onPress={save} disabled={saving || !loaded} hitSlop={8} style={{ paddingHorizontal: space.sm, opacity: saving || !loaded ? 0.4 : 1 }}>
              <Text style={{ color: c.emberInk, fontSize: 17, fontWeight: "600" }}>{saving ? "Saving…" : "Save"}</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0} style={{ flex: 1, backgroundColor: c.background }}>
        {failed ? (
          <Text style={{ color: c.mutedForeground, padding: space.xl, fontSize: 16, lineHeight: 23 }}>{failed}</Text>
        ) : !loaded ? (
          <Loading />
        ) : (
          <>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title"
              placeholderTextColor={c.mutedForeground}
              accessibilityLabel="Title"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => input.current?.focus()}
              style={{ color: c.foreground, fontFamily: fonts.serif, fontSize: 26, paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.sm }}
            />
            <TextInput
              ref={input}
              value={text}
              onChangeText={onChangeText}
              onSelectionChange={onSelectionChange}
              selection={forced}
              multiline
              autoFocus={!base}
              placeholder="Start writing…"
              placeholderTextColor={c.mutedForeground}
              accessibilityLabel="Text"
              textAlignVertical="top"
              scrollEnabled
              style={{ flex: 1, color: c.foreground, fontFamily: fonts.serif, fontSize: 18, lineHeight: 27, paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.xl }}
            />
            {suggestions.length > 0 && (
              <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, backgroundColor: c.muted }} contentContainerStyle={{ padding: space.sm, gap: space.sm }}>
                {suggestions.map((n) => (
                  <Pressable key={n.id} accessibilityRole="button" accessibilityLabel={`Link to ${n.title}`} onPress={() => pickLink(n.title)} style={({ pressed }) => ({ paddingHorizontal: space.md, height: 34, justifyContent: "center", borderRadius: radius.pill, backgroundColor: pressed ? c.accent : c.card })}>
                    <Text style={{ color: c.emberInk, fontSize: 14 }}>{n.title}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space.lg, paddingVertical: 4, backgroundColor: c.card }}>
              <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{words(count)}</Text>
              {dirty && <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Draft kept on this phone</Text>}
            </View>
            <FormatBar onFormat={format} onDone={() => input.current?.blur()} />
          </>
        )}
      </KeyboardAvoidingView>
    </>
  );
}
