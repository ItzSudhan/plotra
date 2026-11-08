import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import type { IconName } from "@/components/icon";
import { useMenu } from "@/components/menu";
import { Loading, Row, SectionLabel, Separator } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { moveNote } from "@/lib/binder-api";
import { invalidate, keys } from "@/lib/cache";
import { kindIcon, kindLabel } from "@/lib/kinds";
import { useProject } from "@/lib/project";
import { useClient } from "@/lib/session";
import { space, useColors } from "@/lib/theme";
import { applyMove, canStep, childrenOf, moveTargets, type Placement } from "@/lib/tree";
import type { Note } from "@/lib/types";

// "Move to…": a step up or down, in or out, or into another folder or
// chapter (or the top level), at its end or next to a note already there.

type Choice = { key: string; icon: IconName; title: string; subtitle?: string; depth?: number; onPress: () => void; current?: boolean };

export default function MoveScreen() {
  const { projectId, noteId } = useLocalSearchParams<{ projectId: string; noteId: string }>();
  const c = useColors();
  const client = useClient();
  const showMenu = useMenu();
  const { notes } = useProject(projectId);
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => notes.data ?? [], [notes.data]);
  const note = list.find((n) => n.id === noteId);

  const go = async (to: Placement) => {
    if (!note || busy) return;
    const next = applyMove(list, note.id, to);
    if (!next) return;
    setBusy(true);
    try {
      await moveNote(client, projectId, note.id, to);
      notes.mutate(() => next);
      invalidate(keys.notes(projectId));
      router.back();
    } catch (e) {
      setBusy(false);
      Alert.alert("Couldn't move it", isOffline(e) ? "You're offline. Moving notes works again when you're back online." : (e as Error).message);
    }
  };

  /** Into a folder: at its end, or next to one of the notes in it. */
  const into = (parent: Note | null) => {
    const inside = (childrenOf(list).get(parent?.id ?? null) ?? []).filter((n) => n.id !== noteId);
    if (!inside.length) return void go({ parentId: parent?.id ?? null });
    const name = parent ? `“${parent.title || "Untitled"}”` : "the top level";
    showMenu({
      title: `Where in ${name}?`,
      items: [
        { label: "At the end", icon: "arrowDown", onPress: () => void go({ parentId: parent?.id ?? null }) },
        { label: "At the start", icon: "arrowUp", onPress: () => void go({ before: inside[0].id }) },
        // A long folder: the first notes, then pick "at the end" or move it from there.
        ...inside.slice(0, 12).map((n) => ({ label: `After “${n.title || "Untitled"}”`, icon: kindIcon[n.kind], onPress: () => void go({ after: n.id }) })),
      ],
    });
  };

  if (!note)
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <Stack.Screen options={{ title: "Move to…" }} />
        <Loading />
      </View>
    );

  const steps: Choice[] = [
    ...(canStep(list, note.id, "up") ? [{ key: "up", icon: "arrowUp" as const, title: "Move up", onPress: () => void go({ step: "up" }) }] : []),
    ...(canStep(list, note.id, "down") ? [{ key: "down", icon: "arrowDown" as const, title: "Move down", onPress: () => void go({ step: "down" }) }] : []),
    ...(canStep(list, note.id, "in") ? [{ key: "in", icon: "indent" as const, title: "Into the note above it", onPress: () => void go({ step: "in" }) }] : []),
    ...(canStep(list, note.id, "out") ? [{ key: "out", icon: "outdent" as const, title: "Out of its folder", onPress: () => void go({ step: "out" }) }] : []),
  ];
  const places: Choice[] = [
    { key: "top", icon: "home", title: "The top level", onPress: () => into(null), current: !note.parentId },
    ...moveTargets(list, note.id)
      .filter((t) => t.note.canEdit)
      .map((t) => ({ key: t.note.id, icon: kindIcon[t.note.kind], title: t.note.title || "Untitled", subtitle: kindLabel[t.note.kind], depth: t.depth + 1, onPress: () => into(t.note), current: note.parentId === t.note.id })),
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: "Move to…",
          headerLeft: () => (
            <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
              <Text style={{ color: c.foreground, fontSize: 17 }}>Cancel</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        style={{ flex: 1, backgroundColor: c.background, opacity: busy ? 0.5 : 1 }}
        contentInsetAdjustmentBehavior="automatic"
        data={places}
        keyExtractor={(p) => p.key}
        ItemSeparatorComponent={() => <Separator inset={52} />}
        ListHeaderComponent={
          <View>
            <Text style={{ color: c.mutedForeground, fontSize: 14, lineHeight: 20, marginHorizontal: space.lg, marginTop: space.md }}>
              Moving “{note.title || "Untitled"}”{childrenOf(list).get(note.id)?.length ? " and everything inside it" : ""}.
            </Text>
            {steps.length > 0 && (
              <>
                <SectionLabel>Nearby</SectionLabel>
                {steps.map((s) => (
                  <Row key={s.key} icon={s.icon} title={s.title} onPress={s.onPress} />
                ))}
              </>
            )}
            <SectionLabel>Into a folder or chapter</SectionLabel>
          </View>
        }
        renderItem={({ item }) => (
          <Row
            icon={item.icon}
            title={item.title}
            subtitle={item.current ? "It's in here now" : item.subtitle}
            indent={(item.depth ?? 0) * 16}
            onPress={item.onPress}
            accessibilityHint="Choose where in it to put the note."
          />
        )}
      />
    </>
  );
}
