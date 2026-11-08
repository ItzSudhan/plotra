import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Field, splitTags } from "@/components/field";
import { Chip, Loading } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { invalidate, keys } from "@/lib/cache";
import { defaultStatuses, kindLabel, statusLabel } from "@/lib/kinds";
import { useOutbox } from "@/lib/outbox";
import { useProject } from "@/lib/project";
import { useClient } from "@/lib/session";
import { space, useColors } from "@/lib/theme";
import type { Note, NotePatch } from "@/lib/types";

// A note's title, synopsis, tags and status.

export default function DetailsScreen() {
  const { projectId, noteId } = useLocalSearchParams<{ projectId: string; noteId: string }>();
  const c = useColors();
  const { notes } = useProject(projectId);
  const note = notes.data?.find((n) => n.id === noteId);
  if (!note)
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <Stack.Screen options={{ title: "Details" }} />
        <Loading />
      </View>
    );
  return <DetailsForm key={note.id} projectId={projectId} note={note} />;
}

function DetailsForm({ projectId, note }: { projectId: string; note: Note }) {
  const noteId = note.id;
  const c = useColors();
  const client = useClient();
  const { enqueue } = useOutbox();
  const { notes } = useProject(projectId);
  const [title, setTitle] = useState(note.title);
  const [synopsis, setSynopsis] = useState(note.synopsis ?? "");
  const [tags, setTags] = useState(note.tags.join(", "));
  const [status, setStatus] = useState<string | null>(note.status);
  const [saving, setSaving] = useState(false);

  const statuses = [...defaultStatuses, ...(note.status && !(defaultStatuses as readonly string[]).includes(note.status) ? [note.status] : [])];

  const save = async () => {
    const patch: NotePatch = {};
    if (title.trim() && title.trim() !== note.title) patch.title = title.trim();
    if (synopsis.trim() !== (note.synopsis ?? "")) patch.synopsis = synopsis.trim() || null;
    const nextTags = splitTags(tags);
    if (nextTags.join("\n") !== note.tags.join("\n")) patch.tags = nextTags;
    if (status && status !== note.status) patch.status = status;
    if (!Object.keys(patch).length) return router.back();
    setSaving(true);
    try {
      const updated = await client.updateNote(projectId, noteId, patch);
      notes.mutate((list) => list?.map((n) => (n.id === noteId ? updated : n)));
      invalidate(keys.note(projectId, noteId));
      router.back();
    } catch (e) {
      setSaving(false);
      if (isOffline(e)) {
        enqueue({ type: "patch", projectId, noteId, title: patch.title ?? note.title, patch });
        notes.mutate((list) => list?.map((n) => (n.id === noteId ? { ...n, ...patch, synopsis: patch.synopsis !== undefined ? patch.synopsis : n.synopsis } : n)));
        router.back();
      } else Alert.alert("Couldn't save", (e as Error).message);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: `${kindLabel[note.kind]} details`,
          headerLeft: () => (
            <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
              <Text style={{ color: c.foreground, fontSize: 17 }}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable accessibilityRole="button" onPress={save} disabled={saving} hitSlop={8} style={{ opacity: saving ? 0.4 : 1 }}>
              <Text style={{ color: c.emberInk, fontSize: 17, fontWeight: "600" }}>{saving ? "Saving…" : "Save"}</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl }} keyboardShouldPersistTaps="handled">
          <Field label="Title" value={title} onChangeText={setTitle} returnKeyType="done" />
          <Field label="Synopsis" value={synopsis} onChangeText={setSynopsis} multiline placeholder="What happens here, in a line or two" />
          <Field label="Tags" value={tags} onChangeText={setTags} autoCapitalize="none" placeholder="flashback, act-two" hint="Separate tags with commas." />
          <View style={{ gap: 6 }}>
            <Text style={{ color: c.mutedForeground, fontSize: 13, fontWeight: "600" }}>Status</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {statuses.map((s) => (
                <Chip key={s} label={statusLabel(s) ?? s} selected={status === s} onPress={() => setStatus(s)} />
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
