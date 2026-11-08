import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { Icon } from "@/components/icon";
import { useMenu } from "@/components/menu";
import { Banner, Empty, IconButton, Loading, T } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { hasText, kindIcon, kindLabel, statusLabel } from "@/lib/kinds";
import { openWeb, webUrl, words } from "@/lib/links";
import { useProject } from "@/lib/project";
import { forgetRecent } from "@/lib/recent";
import { useClient, useSession } from "@/lib/session";
import { radius, space, useColors } from "@/lib/theme";
import { parentsIn, pathOf, totalWords, visibleRows, type Row as BinderRow } from "@/lib/tree";
import type { Note } from "@/lib/types";

// A project's binder: folders, chapters, scenes and notes, in the order the
// web app has them. Tap to read; hold for more.

const openKey = (projectId: string) => `plotra.open:${projectId}`;

export default function ProjectScreen() {
  const { projectId, title } = useLocalSearchParams<{ projectId: string; title?: string }>();
  const c = useColors();
  const client = useClient();
  const { server } = useSession();
  const showMenu = useMenu();
  const { project, notes } = useProject(projectId);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  useEffect(() => {
    AsyncStorage.getItem(openKey(projectId))
      .then((raw) => raw && setOpen(new Set(JSON.parse(raw) as string[])))
      .catch(() => {});
  }, [projectId]);

  const saveOpen = (next: Set<string>) => {
    setOpen(next);
    void AsyncStorage.setItem(openKey(projectId), JSON.stringify([...next])).catch(() => {});
  };

  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    saveOpen(next);
  };

  const list = useMemo(() => notes.data ?? [], [notes.data]);
  const rows = useMemo<BinderRow[]>(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return visibleRows(list, open);
    return list
      .filter((n) => [n.title, ...n.aliases, ...n.tags].some((s) => s.toLowerCase().includes(q)))
      .map((note) => ({ note, depth: 0, hasChildren: false, open: false }));
  }, [list, open, filter]);

  const name = project?.title ?? title ?? "";
  const canAdd = list.length === 0 || list.some((n) => n.canEdit);

  const openNote = (note: Note) => router.push({ pathname: "/project/[projectId]/note/[noteId]", params: { projectId, noteId: note.id } });

  const trash = (note: Note) =>
    Alert.alert(`Move “${note.title || "Untitled"}” to the trash?`, "Anything inside it goes too. You can bring it back from the trash on the web.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Move to trash",
        style: "destructive",
        onPress: async () => {
          try {
            await client.trashNote(projectId, note.id);
            const gone = new Set([note.id]);
            for (const n of list) if (n.parentId && gone.has(n.parentId)) gone.add(n.id);
            notes.mutate((current) => current?.filter((n) => !gone.has(n.id)));
            for (const id of gone) void forgetRecent(id);
          } catch (e) {
            Alert.alert("Couldn't move it to the trash", isOffline(e) ? "You're offline. Try again when you're back online." : (e as Error).message);
          }
        },
      },
    ]);

  const noteMenu = (note: Note) =>
    showMenu({
      title: note.title || "Untitled",
      message: kindLabel[note.kind],
      items: [
        ...(hasText(note.kind) ? [{ label: "Read", icon: "book" as const, onPress: () => openNote(note) }] : []),
        ...(note.canEdit && hasText(note.kind) ? [{ label: "Edit text", icon: "edit" as const, onPress: () => router.push({ pathname: "/project/[projectId]/edit/[noteId]", params: { projectId, noteId: note.id } }) }] : []),
        ...(note.canEdit ? [{ label: "Details", icon: "details" as const, onPress: () => router.push({ pathname: "/project/[projectId]/details/[noteId]", params: { projectId, noteId: note.id } }) }] : []),
        ...(note.canEdit && (note.kind === "folder" || note.kind === "chapter")
          ? [{ label: "New note inside", icon: "add" as const, onPress: () => router.push({ pathname: "/project/[projectId]/new", params: { projectId, parentId: note.id } }) }]
          : []),
        { label: "Open on the web", icon: "web" as const, onPress: () => openWeb(webUrl(server, project, note.id)) },
        ...(note.canEdit ? [{ label: "Move to trash", icon: "trash" as const, destructive: true, onPress: () => trash(note) }] : []),
      ],
    });

  const projectMenu = () =>
    showMenu({
      title: name,
      items: [
        { label: "Open everything", icon: "expandAll", onPress: () => saveOpen(parentsIn(list)) },
        { label: "Close everything", icon: "collapseAll", onPress: () => saveOpen(new Set()) },
        { label: "Open on the web", icon: "web", onPress: () => openWeb(webUrl(server, project)) },
      ],
    });

  return (
    <>
      <Stack.Screen
        options={{
          title: name,
          headerRight: () => (
            <View style={{ flexDirection: "row" }}>
              {canAdd && <IconButton name="add" label="New note" onPress={() => router.push({ pathname: "/project/[projectId]/new", params: { projectId } })} />}
              <IconButton name="more" label="More" onPress={projectMenu} />
            </View>
          ),
        }}
      />
      <FlatList
        style={{ flex: 1, backgroundColor: c.background }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        data={rows}
        keyExtractor={(r) => r.note.id}
        refreshControl={<RefreshControl refreshing={notes.refreshing} onRefresh={notes.refresh} tintColor={c.mutedForeground} />}
        ListHeaderComponent={
          <View style={{ paddingBottom: space.sm }}>
            <Banner offline={notes.offline} error={notes.offline ? null : notes.error} onRetry={notes.refresh} />
            {list.length > 0 && (
              <>
                <T tone="muted" style={{ marginHorizontal: space.lg, marginTop: space.sm, fontSize: 13 }}>
                  {list.length.toLocaleString()} {list.length === 1 ? "note" : "notes"} · {words(totalWords(list, null))}
                </T>
                <View style={{ marginHorizontal: space.lg, marginTop: space.md, flexDirection: "row", alignItems: "center", gap: space.sm, height: 40, borderRadius: radius.md, backgroundColor: c.muted, paddingHorizontal: space.md }}>
                  <Icon name="search" size={16} color={c.mutedForeground} />
                  <TextInput
                    value={filter}
                    onChangeText={setFilter}
                    placeholder="Filter by title or tag"
                    placeholderTextColor={c.mutedForeground}
                    autoCorrect={false}
                    clearButtonMode="while-editing"
                    accessibilityLabel="Filter notes"
                    style={{ flex: 1, color: c.foreground, fontSize: 15 }}
                  />
                </View>
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          notes.loading ? (
            <Loading />
          ) : filter.trim() ? (
            <Empty icon="search" title="No notes match" body={`Nothing here is called “${filter.trim()}”.`} />
          ) : notes.data ? (
            <Empty icon="note" title="Nothing here yet" body="Add a scene, a chapter or a character to start." />
          ) : undefined
        }
        renderItem={({ item }) => (
          <BinderRowView
            row={item}
            path={filter.trim() ? pathOf(list, item.note.id).join(" › ") : null}
            onPress={() => (item.hasChildren && !hasText(item.note.kind) ? toggle(item.note.id) : hasText(item.note.kind) ? openNote(item.note) : noteMenu(item.note))}
            onToggle={() => toggle(item.note.id)}
            onLongPress={() => noteMenu(item.note)}
          />
        )}
      />
    </>
  );
}

function BinderRowView({ row, path, onPress, onToggle, onLongPress }: { row: BinderRow; path: string | null; onPress: () => void; onToggle: () => void; onLongPress: () => void }) {
  const c = useColors();
  const { note, depth, hasChildren, open } = row;
  const status = statusLabel(note.status);
  const detail = path || note.synopsis || [status, note.wordCount ? words(note.wordCount) : null].filter(Boolean).join(" · ") || null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${kindLabel[note.kind]}: ${note.title || "Untitled"}`}
      accessibilityHint={hasChildren ? (open ? "Open. Hold for more." : "Closed. Hold for more.") : "Hold for more."}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", minHeight: 52, paddingLeft: space.sm + depth * 20, paddingRight: space.lg, backgroundColor: pressed ? c.accent : "transparent" })}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? "Close" : "Open"}
        disabled={!hasChildren}
        onPress={onToggle}
        hitSlop={8}
        style={{ width: 28, height: 44, alignItems: "center", justifyContent: "center" }}
      >
        {hasChildren && <Icon name={open ? "chevronDown" : "chevronRight"} size={12} color={c.mutedForeground} />}
      </Pressable>
      <Icon name={kindIcon[note.kind]} size={19} color={note.kind === "folder" || note.kind === "chapter" ? c.emberInk : c.mutedForeground} />
      <View style={{ flex: 1, minWidth: 0, marginLeft: space.md, paddingVertical: space.sm }}>
        <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 16, fontWeight: note.kind === "folder" || note.kind === "chapter" ? "600" : "400" }}>
          {note.title || "Untitled"}
        </Text>
        {!!detail && (
          <Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 13, marginTop: 1 }}>
            {detail}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
