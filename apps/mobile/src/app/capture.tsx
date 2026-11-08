import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Chip } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { invalidate, keys, useResource } from "@/lib/cache";
import { hasText } from "@/lib/kinds";
import { useOutbox } from "@/lib/outbox";
import { useClient } from "@/lib/session";
import { fonts, radius, space, useColors } from "@/lib/theme";
import type { Note } from "@/lib/types";

// Catching an idea before it goes: write, pick a project, and it becomes a new
// note there, or goes at the end of a note you choose. Opened from a note's
// menu, it adds to that note.

const LAST = "plotra.capture.project";

export default function Capture() {
  const params = useLocalSearchParams<{ projectId?: string; noteId?: string }>();
  const c = useColors();
  const client = useClient();
  const { enqueue } = useOutbox();
  const projects = useResource(keys.projects, client.projects);
  const [picked, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [target, setTarget] = useState<string | null>(params.noteId ?? null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  // The project picked, or the first one if that isn't there (any more).
  const list = projects.data;
  const projectId = list && picked && !list.some((p) => p.id === picked) ? (list[0]?.id ?? null) : (picked ?? list?.[0]?.id ?? null);
  const notes = useResource(projectId ? keys.notes(projectId) : null, () => client.notes(projectId!));

  useEffect(() => {
    if (params.projectId) return;
    void AsyncStorage.getItem(LAST).then((id) => id && setProjectId((current) => current ?? id));
  }, [params.projectId]);

  const targets = useMemo(() => (notes.data ?? []).filter((n) => n.canEdit && hasText(n.kind)), [notes.data]);
  const targetNote: Note | undefined = targets.find((n) => n.id === target);
  const fixed = !!params.noteId;

  const save = async () => {
    const body = text.trim();
    if (!body || !projectId) return;
    void AsyncStorage.setItem(LAST, projectId);
    setSaving(true);
    const [first, ...rest] = body.split("\n");
    const title = first.replace(/^#+\s*/, "").slice(0, 120).trim() || "Quick note";
    try {
      if (target) await client.writeText(projectId, target, "append", body);
      else await client.createNote(projectId, { title, kind: "note", markdown: rest.join("\n").trim() });
      invalidate(keys.notes(projectId));
      if (target) invalidate(keys.note(projectId, target));
      router.back();
    } catch (e) {
      setSaving(false);
      if (isOffline(e)) {
        if (target) enqueue({ type: "text", projectId, noteId: target, title: targetNote?.title ?? "A note", mode: "append", markdown: body });
        else enqueue({ type: "create", projectId, title, input: { title, kind: "note", markdown: rest.join("\n").trim() } });
        router.back();
      } else Alert.alert("Couldn't save it", `${(e as Error).message}\n\nYour text is still here.`);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: fixed ? "Add to the end" : "Quick note",
          headerLeft: () => (
            <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
              <Text style={{ color: c.foreground, fontSize: 17 }}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable accessibilityRole="button" onPress={save} disabled={saving || !text.trim() || !projectId} hitSlop={8} style={{ opacity: saving || !text.trim() || !projectId ? 0.4 : 1 }}>
              <Text style={{ color: c.emberInk, fontSize: 17, fontWeight: "600" }}>{saving ? "Saving…" : "Save"}</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
        {!fixed && (projects.data?.length ?? 0) > 0 && (
          <View style={{ paddingTop: space.md, gap: space.sm }}>
            <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
              {projects.data!.map((p) => (
                <Chip
                  key={p.id}
                  label={p.title}
                  selected={projectId === p.id}
                  onPress={() => {
                    setProjectId(p.id);
                    setTarget(null);
                  }}
                />
              ))}
            </ScrollView>
            <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
              <Chip label="As a new note" selected={!target} onPress={() => setTarget(null)} />
              {targets.map((n) => (
                <Chip key={n.id} label={`End of “${n.title || "Untitled"}”`} selected={target === n.id} onPress={() => setTarget(n.id)} />
              ))}
            </ScrollView>
          </View>
        )}
        {fixed && targetNote && <Text style={{ color: c.mutedForeground, fontSize: 14, paddingHorizontal: space.xl, paddingTop: space.md }}>Goes at the end of “{targetNote.title || "Untitled"}”.</Text>}
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          placeholder={target ? "What to add…" : "An idea, a line of dialogue, a name…\n\nThe first line becomes the title."}
          placeholderTextColor={c.mutedForeground}
          accessibilityLabel="Your note"
          textAlignVertical="top"
          style={{ flex: 1, margin: space.lg, padding: space.lg, borderRadius: radius.lg, backgroundColor: c.card, color: c.foreground, fontFamily: fonts.serif, fontSize: 18, lineHeight: 26 }}
        />
      </KeyboardAvoidingView>
    </>
  );
}
