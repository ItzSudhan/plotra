import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Field } from "@/components/field";
import { Chip } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { binderKeys, binderOptions } from "@/lib/binder-api";
import { invalidate, keys, useResource } from "@/lib/cache";
import { hasText, kindLabel, newKinds } from "@/lib/kinds";
import { useOutbox } from "@/lib/outbox";
import { useProject } from "@/lib/project";
import { useClient } from "@/lib/session";
import { space, useColors } from "@/lib/theme";
import { containers, pathOf } from "@/lib/tree";
import type { NodeKind } from "@/lib/types";

// A new note of any kind the project makes (in its own words: a campaign's
// "Session"), a world page of one of its types, a board or a timeline, at the
// top of the binder or inside a folder or chapter. The server makes it as the
// web's "+ New" does. Text notes open to write in at once.

type Pick = { kind: NodeKind; entityTypeId?: string; label: string };

export default function NewNoteScreen() {
  const { projectId, parentId: initialParent } = useLocalSearchParams<{ projectId: string; parentId?: string }>();
  const c = useColors();
  const client = useClient();
  const { enqueue } = useOutbox();
  const { notes } = useProject(projectId);
  const options = useResource(binderKeys.options(projectId), () => binderOptions(client, projectId));
  const picks: Pick[] = [
    ...(options.data?.kinds ?? newKinds.map((k) => ({ kind: k, label: kindLabel[k] }))),
    ...(options.data?.entityTypes ?? []).map((t) => ({ kind: "entity" as const, entityTypeId: t.id, label: t.name })),
  ];
  const [pick, setPick] = useState<Pick>({ kind: "scene", label: kindLabel.scene });
  const kind = pick.kind;
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState<string | null>(initialParent ?? null);
  const [saving, setSaving] = useState(false);

  const places = containers(notes.data ?? []).filter((n) => n.canEdit);
  const list = notes.data ?? [];

  const create = async () => {
    const name = title.trim() || `New ${pick.label.toLowerCase()}`;
    setSaving(true);
    try {
      const input = { title: name, kind, parentId, ...(pick.entityTypeId && { entityTypeId: pick.entityTypeId }) };
      const note = await client.createNote(projectId, input);
      notes.mutate((current) => (current ? insertAfterSiblings(current, note) : current));
      invalidate(keys.notes(projectId));
      if (hasText(kind)) router.replace({ pathname: "/project/[projectId]/edit/[noteId]", params: { projectId, noteId: note.id } });
      else router.back();
    } catch (e) {
      setSaving(false);
      if (isOffline(e)) {
        enqueue({ type: "create", projectId, title: name, input: { title: name, kind, parentId, ...(pick.entityTypeId && { entityTypeId: pick.entityTypeId }) } });
        Alert.alert("Saved on your phone", "You're offline. The note is made when you're back online.", [{ text: "OK", onPress: () => router.back() }]);
      } else Alert.alert("Couldn't make the note", (e as Error).message);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "New note",
          headerLeft: () => (
            <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
              <Text style={{ color: c.foreground, fontSize: 17 }}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable accessibilityRole="button" onPress={create} disabled={saving} hitSlop={8} style={{ opacity: saving ? 0.4 : 1 }}>
              <Text style={{ color: c.emberInk, fontSize: 17, fontWeight: "600" }}>{saving ? "Making…" : "Make"}</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 6 }}>
            <Text style={{ color: c.mutedForeground, fontSize: 13, fontWeight: "600" }}>What is it?</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {picks.map((p) => (
                <Chip key={p.entityTypeId ?? p.kind} label={p.label} selected={kind === p.kind && pick.entityTypeId === p.entityTypeId} onPress={() => setPick(p)} />
              ))}
            </View>
          </View>
          <Field label="Title" value={title} onChangeText={setTitle} placeholder={`New ${pick.label.toLowerCase()}`} autoFocus returnKeyType="done" onSubmitEditing={create} />
          {places.length > 0 && (
            <View style={{ gap: 6 }}>
              <Text style={{ color: c.mutedForeground, fontSize: 13, fontWeight: "600" }}>Where?</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                <Chip label="At the top level" selected={!parentId} onPress={() => setParentId(null)} />
                {places.map((p) => (
                  <Chip key={p.id} label={[...pathOf(list, p.id), p.title].join(" › ")} selected={parentId === p.id} onPress={() => setParentId(p.id)} />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

/** The binder with a new note at the end of its parent's children, until the server's order comes back. */
function insertAfterSiblings<T extends { id: string; parentId: string | null }>(list: T[], note: T): T[] {
  let at = list.length;
  if (note.parentId) {
    const inside = new Set([note.parentId]);
    let last = list.findIndex((n) => n.id === note.parentId);
    for (let i = last + 1; i < list.length; i++) {
      if (list[i].parentId && inside.has(list[i].parentId!)) {
        inside.add(list[i].id);
        last = i;
      } else break;
    }
    if (last >= 0) at = last + 1;
  }
  return [...list.slice(0, at), note, ...list.slice(at)];
}
