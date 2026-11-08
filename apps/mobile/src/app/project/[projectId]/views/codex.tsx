import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { Icon } from "@/components/icon";
import { Banner, Empty, IconButton, Loading, T } from "@/components/ui";
import { AsOfChip, Dot } from "@/components/views/as-of";
import { PromptSheet, type Prompt } from "@/components/views/prompt-sheet";
import { kindIcon } from "@/lib/kinds";
import { useClient } from "@/lib/session";
import { radius, space, useColors } from "@/lib/theme";
import { useHorizon } from "@/lib/use-horizon";
import { refreshViews, useViews, type ViewNode } from "@/lib/views-api";
import { canonLabel, codexEntries, codexSections, isCodexEntry, sectionOf } from "@/lib/views-model";

// The codex (world bible) on a phone: characters, places, research, notes and
// the project's own world-bible types, each with a count; find by name or
// alias; tap an entry for its page. Under an "as of" release only what the
// audience knows by then is listed, as on the web.

const sectionKey = (projectId: string) => `plotra.views.codex:${projectId}`;
// What the phone can make: the API's kinds. Custom-type pages and research are made on the web.
const creatable = new Set(["character", "location", "note"]);

export default function CodexScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const c = useColors();
  const client = useClient();
  const views = useViews(projectId);
  const { releases, release, horizon, setAsOf } = useHorizon(projectId, views.data?.nodes);
  const [section, setSection] = useState("character");
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(sectionKey(projectId)).then((s) => s && setSection(s));
  }, [projectId]);
  const choose = (key: string) => {
    setSection(key);
    void AsyncStorage.setItem(sectionKey(projectId), key).catch(() => {});
  };

  const sections = useMemo(() => codexSections(views.data?.entityTypes ?? []), [views.data]);
  const all = useMemo(() => (views.data?.nodes ?? []).filter(isCodexEntry), [views.data]);
  const visible = useMemo(() => (horizon ? all.filter((n) => horizon.knows(n.id)) : all), [all, horizon]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of visible) m.set(sectionOf(n), (m.get(sectionOf(n)) ?? 0) + 1);
    return m;
  }, [visible]);
  const current = sections.find((s) => s.key === section) ?? sections[0];
  const entries = useMemo(() => (current ? codexEntries(visible, current.key, query) : []), [current, query, visible]);
  const concealed = all.length - visible.length;
  const canAdd = !!current && creatable.has(current.kind) && !!views.data?.canEditProject;

  const open = (n: ViewNode) => router.push({ pathname: "/project/[projectId]/views/entity/[noteId]", params: { projectId, noteId: n.id } });

  const add = () =>
    current &&
    setPrompt({
      title: `New ${current.singular.toLowerCase()}`,
      label: "Name",
      placeholder: current.kind === "character" ? "Ada Quill" : current.kind === "location" ? "The lighthouse" : "Title",
      confirmLabel: "Add",
      onSubmit: async (name) => {
        const created = await client.createNote(projectId, { title: name.trim() || `Untitled ${current.singular.toLowerCase()}`, kind: current.kind as "character" | "location" | "note" });
        refreshViews(projectId);
        router.push({ pathname: "/project/[projectId]/views/entity/[noteId]", params: { projectId, noteId: created.id } });
      },
    });

  return (
    <>
      <Stack.Screen options={{ title: "Codex", headerRight: () => (canAdd ? <IconButton name="add" label={`New ${current!.singular.toLowerCase()}`} onPress={add} /> : null) }} />
      <FlatList
        style={{ flex: 1, backgroundColor: c.background }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        data={entries}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={views.refreshing} onRefresh={views.refresh} tintColor={c.mutedForeground} />}
        ListHeaderComponent={
          <View style={{ paddingBottom: space.sm }}>
            <Banner offline={views.offline} error={views.offline ? null : views.error} onRetry={views.refresh} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm }}>
              {sections.map((s) => {
                const selected = s.key === current?.key;
                return (
                  <Pressable
                    key={s.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${s.label}, ${counts.get(s.key) ?? 0}`}
                    onPress={() => choose(s.key)}
                    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: selected ? c.foreground : c.accent, opacity: pressed ? 0.7 : 1 })}
                  >
                    {s.type ? <Dot color={s.type.color} size={9} /> : <Icon name={kindIcon[s.kind]} size={14} color={selected ? c.background : c.mutedForeground} />}
                    <Text style={{ color: selected ? c.background : c.foreground, fontSize: 14 }}>{s.label}</Text>
                    <Text style={{ color: selected ? c.background : c.mutedForeground, fontSize: 13, fontVariant: ["tabular-nums"] }}>{counts.get(s.key) ?? 0}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={{ marginHorizontal: space.lg, marginTop: space.md, flexDirection: "row", alignItems: "center", gap: space.sm, height: 40, borderRadius: radius.md, backgroundColor: c.muted, paddingHorizontal: space.md }}>
              <Icon name="search" size={16} color={c.mutedForeground} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={`Find in ${current?.label.toLowerCase() ?? "the codex"}`}
                placeholderTextColor={c.mutedForeground}
                autoCorrect={false}
                clearButtonMode="while-editing"
                accessibilityLabel={`Find in ${current?.label.toLowerCase() ?? "the codex"}`}
                style={{ flex: 1, color: c.foreground, fontSize: 15 }}
              />
            </View>
            <AsOfChip releases={releases} release={release} setAsOf={setAsOf} hint="What readers know once a release is out. The codex lists only that." />
            {concealed > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: space.lg, marginTop: space.md }}>
                <Icon name="hidden" size={14} color={c.mutedForeground} />
                <T tone="muted" style={{ fontSize: 13 }}>
                  {concealed} not revealed yet at this point
                </T>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          views.loading ? (
            <Loading />
          ) : views.data && current ? (
            <Empty
              icon={current.type ? "globe" : kindIcon[current.kind]}
              title={query.trim() ? "Nothing matches" : `No ${current.label.toLowerCase()} yet`}
              body={query.trim() ? `No ${current.label.toLowerCase()} are called “${query.trim()}”.` : `Each ${current.singular.toLowerCase()} gets a page here with its details and everywhere it's mentioned.`}
            />
          ) : undefined
        }
        renderItem={({ item }) => <EntryRow node={item} onPress={() => open(item)} />}
      />
      <PromptSheet prompt={prompt} onClose={() => setPrompt(null)} />
    </>
  );
}

function EntryRow({ node, onPress }: { node: ViewNode; onPress: () => void }) {
  const c = useColors();
  const canon = node.canon !== "canon" && node.canon !== "draft" ? canonLabel[node.canon] : null;
  const detail = node.aliases.length ? `Also ${node.aliases.join(", ")}` : node.synopsis;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${node.title || "Untitled"}${canon ? `, ${canon.label}` : ""}`}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, minHeight: 56, paddingVertical: space.sm, backgroundColor: pressed ? c.accent : "transparent" })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 16 }}>
          {node.title || "Untitled"}
        </Text>
        {!!detail && (
          <Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 13, marginTop: 2 }}>
            {detail}
          </Text>
        )}
      </View>
      {canon && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Dot color={canon.color} size={7} />
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{canon.label}</Text>
        </View>
      )}
      <Icon name="chevronRight" size={12} color={c.mutedForeground} />
    </Pressable>
  );
}
