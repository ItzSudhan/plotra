import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Icon } from "@/components/icon";
import { Button, Empty, Loading, Row, Separator } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { invalidate, useResource } from "@/lib/cache";
import { kindIcon } from "@/lib/kinds";
import { createRelationship, deleteRelationship, getRelationships, mapKeys, relationshipMeta, relationshipTypesFor, updateRelationship, type RelationshipAmong } from "@/lib/maps-api";
import { useProject } from "@/lib/project";
import { useClient } from "@/lib/session";
import { radius, space, useColors } from "@/lib/theme";
import type { Note } from "@/lib/types";

// Adding or changing one relationship, with the web's types (apps/app/lib/story.ts):
// between people (characters), or between powers (places). A one-way type ("Parent of",
// "Mentor of") reads from the first to the second; Swap turns it round.

export default function RelationshipScreen() {
  const { projectId, id, from: fromParam, among: amongParam } = useLocalSearchParams<{ projectId: string; id?: string; from?: string; among?: string }>();
  const among: RelationshipAmong = amongParam === "powers" ? "powers" : "people";
  const c = useColors();
  const client = useClient();
  const { notes } = useProject(projectId);
  const rels = useResource(mapKeys.relationships(projectId), () => getRelationships(client, projectId));
  const existing = id ? rels.data?.find((r) => r.id === id) : undefined;

  const [from, setFrom] = useState<string | null>(fromParam ?? null);
  const [to, setTo] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const [busy, setBusy] = useState(false);

  // Editing: start from what's there, until something is changed.
  const shownFrom = existing ? existing.fromNodeId : from;
  const shownTo = existing ? existing.toNodeId : to;
  const shownType = type ?? existing?.type ?? "ally";
  const shownLabel = label ?? existing?.label ?? "";

  const all = useMemo(() => notes.data ?? [], [notes.data]);
  const candidates = useMemo(() => all.filter((n) => n.kind === (among === "people" ? "character" : "location")), [all, among]);
  const note = (nid: string | null) => (nid ? all.find((n) => n.id === nid) : undefined);
  const types = relationshipTypesFor(among);
  const meta = relationshipMeta(shownType);
  const fromNote = note(shownFrom);
  // Only someone who may edit the first note may change its relationships (lib/story-actions.ts).
  const canEdit = existing ? !!fromNote?.canEdit : true;

  const fail = (title: string, e: unknown) => Alert.alert(title, isOffline(e) ? "You're offline. Try again when you're back online." : (e as Error).message);
  const done = () => {
    invalidate(mapKeys.relationships(projectId));
    router.back();
  };

  const save = async () => {
    setBusy(true);
    try {
      if (existing) {
        await updateRelationship(client, projectId, existing.id, { type: shownType, label: shownLabel.trim() || null });
      } else {
        if (!from || !to) return;
        await createRelationship(client, projectId, { fromNodeId: from, toNodeId: to, type: shownType, label: shownLabel.trim() || null });
      }
      done();
    } catch (e) {
      fail("Couldn't save it", e);
    } finally {
      setBusy(false);
    }
  };

  const swap = async () => {
    if (!existing) {
      setFrom(to);
      setTo(from);
      return;
    }
    setBusy(true);
    try {
      await updateRelationship(client, projectId, existing.id, { reverse: true });
      invalidate(mapKeys.relationships(projectId));
    } catch (e) {
      fail("Couldn't turn it round", e);
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    existing &&
    Alert.alert("Delete this relationship?", `${note(existing.fromNodeId)?.title ?? "They"} and ${note(existing.toNodeId)?.title ?? "them"} won't be related on the map any more.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteRelationship(client, projectId, existing.id);
            done();
          } catch (e) {
            fail("Couldn't delete it", e);
          }
        },
      },
    ]);

  const person = (which: "from" | "to", nid: string | null) => {
    const n = note(nid);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${which === "from" ? "First" : "Second"}: ${n?.title ?? "choose"}`}
        disabled={!!existing || !canEdit}
        onPress={() => setPicking(which)}
        style={({ pressed }) => ({ flex: 1, minHeight: 52, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: c.muted, opacity: pressed ? 0.7 : 1 })}
      >
        <Icon name={among === "people" ? "person" : "place"} size={18} color={c.mutedForeground} />
        <Text numberOfLines={2} style={{ flex: 1, color: n ? c.foreground : c.mutedForeground, fontSize: 16 }}>
          {n ? n.title || "Untitled" : among === "people" ? "Choose someone" : "Choose a place"}
        </Text>
      </Pressable>
    );
  };

  const ready = existing || (from && to && from !== to);
  if (id && !existing) return rels.loading ? <Loading /> : <Empty icon="people" title="That relationship is gone" body="Someone may have deleted it." />;

  return (
    <>
      <Stack.Screen options={{ title: existing ? "Relationship" : "New relationship" }} />
      <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: space.sm }}>
          {person("from", shownFrom)}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.md }}>
            <Text style={{ color: meta.color, fontSize: 15, fontWeight: "600" }}>{shownLabel.trim() || meta.label}</Text>
            {meta.directed && canEdit && (
              <Pressable accessibilityRole="button" accessibilityLabel="Swap who's first" onPress={swap} hitSlop={8} disabled={busy}>
                <Text style={{ color: c.emberInk, fontSize: 14 }}>Swap</Text>
              </Pressable>
            )}
          </View>
          {person("to", shownTo)}
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={{ color: c.mutedForeground, fontSize: 13, fontWeight: "600" }}>How they&apos;re related</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {types.map((t) => {
              const on = t.id === shownType;
              return (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  disabled={!canEdit}
                  onPress={() => setType(t.id)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1.5, borderColor: on ? t.color : c.border, backgroundColor: on ? c.card : "transparent" }}
                >
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: t.color }} />
                  <Text style={{ color: c.foreground, fontSize: 14 }}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {!types.some((t) => t.id === shownType) && <Text style={{ color: c.mutedForeground, fontSize: 13 }}>A type of its own: “{shownType}”.</Text>}
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={{ color: c.mutedForeground, fontSize: 13, fontWeight: "600" }}>In your words (optional)</Text>
          <TextInput
            value={shownLabel}
            onChangeText={setLabel}
            editable={canEdit}
            maxLength={80}
            placeholder={`Shown instead of “${meta.label}”, like “Sworn sister”`}
            placeholderTextColor={c.mutedForeground}
            accessibilityLabel="Label"
            style={{ minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: c.muted, color: c.foreground, fontSize: 16 }}
          />
        </View>

        {canEdit ? (
          <Button label={existing ? "Save" : "Add relationship"} onPress={save} busy={busy} disabled={!ready} />
        ) : (
          <Text style={{ color: c.mutedForeground, fontSize: 14, lineHeight: 20 }}>You can see this relationship, but not change it: you can&apos;t edit {fromNote?.title ?? "the first note"}.</Text>
        )}
        {existing && canEdit && <Button label="Delete relationship" icon="trash" variant="ghost" onPress={remove} />}
      </ScrollView>

      <Modal visible={!!picking} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicking(null)}>
        <View style={{ flex: 1, backgroundColor: c.background, paddingTop: space.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingBottom: space.md }}>
            <Text style={{ flex: 1, color: c.foreground, fontSize: 17, fontWeight: "600" }}>{among === "people" ? "Choose a character" : "Choose a place"}</Text>
            <Pressable accessibilityRole="button" onPress={() => setPicking(null)} hitSlop={8}>
              <Text style={{ color: c.foreground, fontSize: 17 }}>Cancel</Text>
            </Pressable>
          </View>
          <FlatList<Note>
            data={candidates.filter((n) => n.id !== (picking === "from" ? to : from) && (picking !== "from" || n.canEdit))}
            keyExtractor={(n) => n.id}
            ItemSeparatorComponent={() => <Separator inset={52} />}
            ListEmptyComponent={<Text style={{ color: c.mutedForeground, padding: space.lg }}>{among === "people" ? "No characters to choose from." : "No places to choose from."}</Text>}
            renderItem={({ item }) => (
              <Row
                icon={kindIcon[item.kind]}
                title={item.title}
                onPress={() => {
                  if (picking === "from") setFrom(item.id);
                  else setTo(item.id);
                  setPicking(null);
                }}
              />
            )}
          />
        </View>
      </Modal>
    </>
  );
}
