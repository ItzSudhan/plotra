import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { useMenu } from "@/components/menu";
import { Banner, Chip, Empty, IconButton, Loading, T } from "@/components/ui";
import { AsOfChip, Dot } from "@/components/views/as-of";
import { PromptSheet, type Prompt } from "@/components/views/prompt-sheet";
import { isOffline } from "@/lib/api";
import type { Horizon } from "@/lib/horizon";
import { kindIcon, statusLabel } from "@/lib/kinds";
import { openWeb, webUrl } from "@/lib/links";
import { useProject } from "@/lib/project";
import { useClient, useSession } from "@/lib/session";
import { fonts, radius, space, useColors } from "@/lib/theme";
import { useHorizon } from "@/lib/use-horizon";
import { refreshViews, useViews, viewsApi, type PlotThread, type ViewNode } from "@/lib/views-api";
import { cellKey, gridRows } from "@/lib/views-model";

// The plot grid on a phone. The web's grid is scenes down the side and plot
// threads across the top; a phone can't show both, so you look along one:
// pick a thread and see what happens to it in each scene, or go scene by
// scene and see every thread in it. Tap a cell to write in it.
// Under an "as of" release, scenes readers don't know yet are dimmed.

type Mode = "thread" | "scene";
const modeKey = (projectId: string) => `plotra.views.plotgrid:${projectId}`;

export default function PlotGridScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const c = useColors();
  const client = useClient();
  const { server } = useSession();
  const showMenu = useMenu();
  const { project } = useProject(projectId);
  const views = useViews(projectId);
  const { releases, release, horizon, setAsOf } = useHorizon(projectId, views.data?.nodes);
  const [mode, setMode] = useState<Mode>("thread");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  // How it was left: by thread or by scene, and which thread.
  useEffect(() => {
    void AsyncStorage.getItem(modeKey(projectId)).then((raw) => {
      if (!raw) return;
      const saved = JSON.parse(raw) as { mode?: Mode; threadId?: string | null };
      if (saved.mode) setMode(saved.mode);
      if (saved.threadId) setThreadId(saved.threadId);
    });
  }, [projectId]);
  const remember = (next: { mode: Mode; threadId: string | null }) => void AsyncStorage.setItem(modeKey(projectId), JSON.stringify(next)).catch(() => {});

  const threads = useMemo(() => views.data?.threads ?? [], [views.data]);
  const rows = useMemo(() => gridRows(views.data?.nodes ?? []), [views.data]);
  const cells = useMemo(() => new Map((views.data?.cells ?? []).map((cell) => [cellKey(cell.nodeId, cell.threadId), cell.note])), [views.data]);
  const thread = threads.find((t) => t.id === threadId) ?? threads[0] ?? null;
  const canEditProject = !!views.data?.canEditProject;
  const releaseTitle = (id: string) => releases.find((r) => r.id === id)?.title;

  const fail = (e: unknown) => Alert.alert("That didn't save", isOffline(e) ? "You're offline. Try again when you're back online." : (e as Error).message);

  /** Writes a cell, showing it at once. Null takes the scene out of the thread. */
  const writeCell = async (scene: ViewNode, t: PlotThread, note: string | null) => {
    views.mutate((data) => {
      if (!data) return data;
      const rest = data.cells.filter((x) => !(x.nodeId === scene.id && x.threadId === t.id));
      return { ...data, cells: note === null ? rest : [...rest, { nodeId: scene.id, threadId: t.id, note }] };
    });
    await viewsApi.setCell(client, projectId, scene.id, t.id, note);
    refreshViews(projectId);
  };

  const editCell = (scene: ViewNode, t: PlotThread) => {
    const note = cells.get(cellKey(scene.id, t.id));
    if (!scene.canEdit) {
      Alert.alert(`${t.name} in “${scene.title || "Untitled"}”`, note || (note === undefined ? "Not in this thread." : "In this thread, with nothing written yet."));
      return;
    }
    setPrompt({
      title: `${t.name} in “${scene.title || "Untitled"}”`,
      message: "What happens to this thread in this scene. Leave it empty to just mark the scene as part of the thread.",
      label: "What happens",
      value: note ?? "",
      multiline: true,
      onSubmit: (text) => writeCell(scene, t, text.trim()),
      extra: note !== undefined ? { label: "Take the scene out of this thread", destructive: true, onPress: () => writeCell(scene, t, null) } : undefined,
    });
  };

  const addThread = () =>
    setPrompt({
      title: "New plot thread",
      message: "A storyline to follow through the scenes: a romance, a mystery, a rivalry.",
      label: "Name",
      placeholder: "The missing letter",
      confirmLabel: "Add thread",
      onSubmit: async (name) => {
        const created = await viewsApi.createThread(client, projectId, name.trim());
        setThreadId(created.id);
        remember({ mode, threadId: created.id });
        refreshViews(projectId);
      },
    });

  const threadMenu = (t: PlotThread) =>
    showMenu({
      title: t.name,
      message: t.closedNodeId ? "This thread is resolved." : undefined,
      items: canEditProject
        ? [
            {
              label: "Rename",
              icon: "edit",
              onPress: () =>
                setPrompt({
                  title: "Rename the thread",
                  label: "Name",
                  value: t.name,
                  validate: (s) => (s.trim() ? null : "Give it a name."),
                  onSubmit: async (name) => {
                    await viewsApi.updateThread(client, projectId, t.id, { name: name.trim() });
                    refreshViews(projectId);
                  },
                }),
            },
            ...(t.closedNodeId
              ? [{ label: "Reopen it", icon: "restore" as const, onPress: () => void viewsApi.updateThread(client, projectId, t.id, { closedNodeId: null }).then(() => refreshViews(projectId), fail) }]
              : []),
            {
              label: "Delete thread",
              icon: "trash",
              destructive: true,
              onPress: () => {
                const count = (views.data?.cells ?? []).filter((x) => x.threadId === t.id).length;
                Alert.alert(
                  count ? `Delete “${t.name}” and its ${count} ${count === 1 ? "cell" : "cells"}?` : `Delete “${t.name}”?`,
                  count ? "What you wrote in its cells is deleted with it, and its scenes leave the thread. This can't be undone." : "This can't be undone.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete thread", style: "destructive", onPress: () => void viewsApi.deleteThread(client, projectId, t.id).then(() => refreshViews(projectId), fail) },
                  ],
                );
              },
            },
          ]
        : [{ label: "Open on the web", icon: "web", onPress: () => openWeb(webUrl(server, project)) }],
    });

  const read = (n: ViewNode) => router.push({ pathname: "/project/[projectId]/note/[noteId]", params: { projectId, noteId: n.id } });
  const scenes = rows.filter((r) => r.node.kind === "scene");

  return (
    <>
      <Stack.Screen
        options={{
          title: "Plot grid",
          headerRight: () => (canEditProject ? <IconButton name="add" label="New plot thread" onPress={addThread} /> : null),
        }}
      />
      <FlatList
        style={{ flex: 1, backgroundColor: c.background }}
        contentInsetAdjustmentBehavior="automatic"
        data={threads.length ? rows : []}
        keyExtractor={(r) => r.node.id}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        refreshControl={<RefreshControl refreshing={views.refreshing} onRefresh={views.refresh} tintColor={c.mutedForeground} />}
        ListHeaderComponent={
          <View style={{ paddingBottom: space.md }}>
            <Banner offline={views.offline} error={views.offline ? null : views.error} onRetry={views.refresh} />
            <AsOfChip releases={releases} release={release} setAsOf={setAsOf} hint="What readers know once a release is out. Scenes they don't know yet are dimmed." />
            {threads.length > 0 && (
              <View style={{ flexDirection: "row", gap: space.sm, marginHorizontal: space.lg, marginTop: space.md }}>
                {(["thread", "scene"] as const).map((m) => (
                  <Chip
                    key={m}
                    label={m === "thread" ? "One thread" : "Scene by scene"}
                    selected={mode === m}
                    onPress={() => {
                      setMode(m);
                      remember({ mode: m, threadId: thread?.id ?? null });
                    }}
                  />
                ))}
              </View>
            )}
            {mode === "thread" && threads.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md }}>
                {threads.map((t) => (
                  <Pressable
                    key={t.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: thread?.id === t.id }}
                    accessibilityLabel={`${t.name}${t.closedNodeId ? ", resolved" : ""}`}
                    accessibilityHint="Hold for more."
                    onPress={() => {
                      setThreadId(t.id);
                      remember({ mode, threadId: t.id });
                    }}
                    onLongPress={() => threadMenu(t)}
                    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: thread?.id === t.id ? c.foreground : c.accent, opacity: pressed ? 0.7 : 1 })}
                  >
                    <Dot color={t.color} size={9} />
                    <Text numberOfLines={1} style={{ color: thread?.id === t.id ? c.background : c.foreground, fontSize: 14, textDecorationLine: t.closedNodeId ? "line-through" : "none" }}>
                      {t.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {mode === "thread" && thread && (
              <T tone="muted" style={{ marginHorizontal: space.lg, marginTop: space.md, fontSize: 13 }}>
                {scenes.filter((r) => cells.has(cellKey(r.node.id, thread.id))).length} of {scenes.length} scenes are in this thread. Hold a thread for more.
              </T>
            )}
          </View>
        }
        ListEmptyComponent={
          views.loading ? (
            <Loading />
          ) : !views.data ? undefined : threads.length === 0 ? (
            <Empty icon="plotGrid" title="No plot threads yet" body="Add a thread (a storyline to follow) and write what happens to it in each scene." />
          ) : (
            <Empty icon="scene" title="No scenes yet" body="Add scenes in the binder. They become the grid's rows." />
          )
        }
        renderItem={({ item }) =>
          item.node.kind === "chapter" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingLeft: space.lg + item.depth * 12, paddingTop: space.lg, paddingBottom: space.sm }}>
              <Icon name={kindIcon.chapter} size={16} color={c.emberInk} />
              <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, color: c.foreground, fontFamily: fonts.serif, fontSize: 18 }}>
                {item.node.title || "Untitled"}
              </Text>
            </View>
          ) : mode === "thread" && thread ? (
            <ThreadCell scene={item.node} depth={item.depth} thread={thread} note={cells.get(cellKey(item.node.id, thread.id))} horizon={horizon} releaseTitle={releaseTitle} onPress={() => editCell(item.node, thread)} onLongPress={() => read(item.node)} />
          ) : (
            <SceneRow scene={item.node} depth={item.depth} threads={threads} cells={cells} horizon={horizon} releaseTitle={releaseTitle} onRead={() => read(item.node)} onCell={(t) => editCell(item.node, t)} onAdd={() =>
              showMenu({
                title: `Add “${item.node.title || "Untitled"}” to a thread`,
                items: threads.filter((t) => !cells.has(cellKey(item.node.id, t.id))).map((t) => ({ label: t.name, onPress: () => editCell(item.node, t) })),
              })
            } />
          )
        }
      />
      <PromptSheet prompt={prompt} onClose={() => setPrompt(null)} />
    </>
  );
}

function revealLine(horizon: Horizon | null, id: string, releaseTitle: (id: string) => string | undefined) {
  if (!horizon || horizon.knows(id)) return null;
  const later = horizon.revealedBy.get(id);
  return later ? `Revealed in ${releaseTitle(later) ?? "a later release"}` : "Not revealed yet";
}

function ThreadCell({ scene, depth, thread, note, horizon, releaseTitle, onPress, onLongPress }: { scene: ViewNode; depth: number; thread: PlotThread; note: string | undefined; horizon: Horizon | null; releaseTitle: (id: string) => string | undefined; onPress: () => void; onLongPress: () => void }) {
  const c = useColors();
  const inThread = note !== undefined;
  const reveal = revealLine(horizon, scene.id, releaseTitle);
  const resolves = thread.closedNodeId === scene.id;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${scene.title || "Untitled"}. ${inThread ? note || "In this thread, nothing written yet" : "Not in this thread"}${resolves ? ". Resolves the thread" : ""}`}
      accessibilityHint={scene.canEdit ? "Writes in the cell. Hold to read the scene." : "Hold to read the scene."}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        marginLeft: space.lg + depth * 12,
        marginRight: space.lg,
        marginBottom: space.sm,
        padding: space.md,
        gap: 4,
        borderRadius: radius.md,
        backgroundColor: pressed ? c.accent : inThread ? c.card : "transparent",
        borderWidth: 1,
        borderColor: inThread ? c.border : "transparent",
        borderLeftWidth: 4,
        borderLeftColor: inThread ? thread.color : c.border,
        opacity: reveal && !horizon!.shows(scene.id) ? 0.45 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Text numberOfLines={1} style={{ flex: 1, color: inThread ? c.foreground : c.mutedForeground, fontSize: 15, fontWeight: "500" }}>
          {scene.title || "Untitled"}
        </Text>
        {!!statusLabel(scene.status) && <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{statusLabel(scene.status)}</Text>}
      </View>
      {!!reveal && <Text style={{ color: c.emberInk, fontSize: 12 }}>{reveal}</Text>}
      {inThread ? (
        <Text style={{ color: note ? c.foreground : c.mutedForeground, fontSize: 14, lineHeight: 20, fontStyle: note ? "normal" : "italic" }}>{note || "In this thread"}</Text>
      ) : (
        <Text style={{ color: c.mutedForeground, fontSize: 13 }}>Not in this thread{scene.canEdit ? ". Tap to add it." : ""}</Text>
      )}
      {resolves && <Text style={{ color: c.teal, fontSize: 12 }}>Resolves the thread</Text>}
    </Pressable>
  );
}

function SceneRow({
  scene,
  depth,
  threads,
  cells,
  horizon,
  releaseTitle,
  onRead,
  onCell,
  onAdd,
}: {
  scene: ViewNode;
  depth: number;
  threads: PlotThread[];
  cells: Map<string, string>;
  horizon: Horizon | null;
  releaseTitle: (id: string) => string | undefined;
  onRead: () => void;
  onCell: (t: PlotThread) => void;
  onAdd: () => void;
}) {
  const c = useColors();
  const mine = threads.filter((t) => cells.has(cellKey(scene.id, t.id)));
  const reveal = revealLine(horizon, scene.id, releaseTitle);
  return (
    <View style={{ marginLeft: space.lg + depth * 12, marginRight: space.lg, marginBottom: space.md, borderRadius: radius.md, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, overflow: "hidden", opacity: reveal && !horizon!.shows(scene.id) ? 0.45 : 1 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Read ${scene.title || "Untitled"}`} onPress={onRead} style={({ pressed }) => ({ padding: space.md, gap: 2, backgroundColor: pressed ? c.accent : "transparent" })}>
        <Text numberOfLines={2} style={{ color: c.foreground, fontSize: 16, fontWeight: "600" }}>
          {scene.title || "Untitled"}
        </Text>
        {!!reveal && <Text style={{ color: c.emberInk, fontSize: 12 }}>{reveal}</Text>}
        {!!scene.synopsis && (
          <Text numberOfLines={2} style={{ color: c.mutedForeground, fontSize: 13 }}>
            {scene.synopsis}
          </Text>
        )}
      </Pressable>
      {mine.map((t) => (
        <Pressable
          key={t.id}
          accessibilityRole="button"
          accessibilityLabel={`${t.name}: ${cells.get(cellKey(scene.id, t.id)) || "nothing written yet"}`}
          onPress={() => onCell(t)}
          style={({ pressed }) => ({ flexDirection: "row", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: pressed ? c.accent : "transparent" })}
        >
          <View style={{ paddingTop: 5 }}>
            <Dot color={t.color} size={9} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: c.mutedForeground, fontSize: 12, fontWeight: "600" }}>{t.name}</Text>
            <Text style={{ color: c.foreground, fontSize: 14, lineHeight: 20 }}>{cells.get(cellKey(scene.id, t.id)) || "—"}</Text>
          </View>
        </Pressable>
      ))}
      {scene.canEdit && mine.length < threads.length && (
        <Pressable accessibilityRole="button" onPress={onAdd} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, height: 44, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: pressed ? c.accent : "transparent" })}>
          <Icon name="add" size={14} color={c.emberInk} />
          <Text style={{ color: c.emberInk, fontSize: 14 }}>Add to a thread</Text>
        </Pressable>
      )}
    </View>
  );
}
