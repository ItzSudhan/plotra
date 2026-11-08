import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { Icon } from "@/components/icon";
import { useMenu, type MenuItem } from "@/components/menu";
import { Banner, Empty, IconButton, Loading, T } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { binderKeys, duplicateNote, moveNote } from "@/lib/binder-api";
import { invalidate, keys } from "@/lib/cache";
import { hasText, isContainer, kindIcon, kindLabel, statusLabel } from "@/lib/kinds";
import { openWeb, webUrl, words } from "@/lib/links";
import { useOfferAi } from "@/lib/agent-api";
import { chatRoute } from "@/lib/chat-api";
import { hasOwnScreen, noteRoute } from "@/lib/maps-api";
import { useProject } from "@/lib/project";
import { forgetRecent } from "@/lib/recent";
import { useClient, useSession } from "@/lib/session";
import { refreshTextIndex } from "@/lib/text-index";
import { useHorizon } from "@/lib/use-horizon";
import type { Horizon } from "@/lib/horizon";
import { radius, space, useColors } from "@/lib/theme";
import { applyMove, canStep, parentsIn, pathOf, subtreeOf, totalWords, visibleRows, type Placement, type Row as BinderRow } from "@/lib/tree";
import type { Note } from "@/lib/types";

// A project's binder: folders, chapters, scenes and notes, in the order the
// web app has them. Tap to read; hold for more. In "Arrange" mode, tap a note
// to pick it up and tap where it goes, or nudge it with the arrows.

const openKey = (projectId: string) => `plotra.open:${projectId}`;

export default function ProjectScreen() {
  const { projectId, title } = useLocalSearchParams<{ projectId: string; title?: string }>();
  const c = useColors();
  const client = useClient();
  const { server } = useSession();
  const showMenu = useMenu();
  const offerAi = useOfferAi(projectId);
  const { project, notes } = useProject(projectId);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  // Arrange mode, and the note picked up to put somewhere else.
  const [arranging, setArranging] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const { releases, release, horizon, setAsOf } = useHorizon(projectId, notes.data);

  // Its text, kept for searching offline.
  useEffect(() => {
    void refreshTextIndex(client, projectId);
  }, [client, projectId]);

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
    if (!q || arranging) return visibleRows(list, open);
    return list
      .filter((n) => [n.title, ...n.aliases, ...n.tags].some((s) => s.toLowerCase().includes(q)))
      .map((note) => ({ note, depth: 0, hasChildren: false, open: false }));
  }, [list, open, filter, arranging]);

  const name = project?.title ?? title ?? "";
  const canAdd = list.length === 0 || list.some((n) => n.canEdit);

  const openNote = (note: Note) => router.push({ pathname: "/project/[projectId]/note/[noteId]", params: { projectId, noteId: note.id } });

  const trash = (note: Note) =>
    Alert.alert(`Move “${note.title || "Untitled"}” to the trash?`, "Anything inside it goes too. You can bring it back from the trash.", [
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
            invalidate(binderKeys.trash(projectId));
          } catch (e) {
            Alert.alert("Couldn't move it to the trash", isOffline(e) ? "You're offline. Try again when you're back online." : (e as Error).message);
          }
        },
      },
    ]);

  const canMove = (note: Note) => note.canEdit;
  const canTrash = (note: Note) => note.canDelete ?? note.canEdit;

  /** Moves a note: shown at once, then the server's order. Put back as it was if the server says no. */
  const move = async (note: Note, to: Placement) => {
    const before = list;
    const next = applyMove(list, note.id, to);
    if (!next) return;
    notes.mutate(() => next);
    // Open the folder it went into, so it stays in sight.
    const parent = next.find((n) => n.id === note.id)?.parentId;
    if (parent && !open.has(parent)) saveOpen(new Set([...open, parent]));
    try {
      await moveNote(client, projectId, note.id, to);
      invalidate(keys.notes(projectId));
    } catch (e) {
      notes.mutate(() => before);
      Alert.alert("Couldn't move it", isOffline(e) ? "You're offline. Moving notes works again when you're back online." : (e as Error).message);
    }
  };

  const duplicate = async (note: Note) => {
    try {
      await duplicateNote(client, projectId, note.id);
      invalidate(keys.notes(projectId));
    } catch (e) {
      Alert.alert("Couldn't make a copy", isOffline(e) ? "You're offline. Try again when you're back online." : (e as Error).message);
    }
  };

  /** Arrange mode: where the picked-up note goes when another one is tapped. */
  const dropOn = (target: Note) => {
    const from = list.find((n) => n.id === picked);
    if (!from) return setPicked(null);
    if (subtreeOf(list, from.id).has(target.id)) {
      setPicked(target.id === from.id ? null : picked);
      return;
    }
    const go = (to: Placement) => {
      setPicked(null);
      void move(from, to);
    };
    showMenu({
      title: `Put “${from.title || "Untitled"}”…`,
      items: [
        { label: `Above “${target.title || "Untitled"}”`, icon: "arrowUp", onPress: () => go({ before: target.id }) },
        { label: `Below “${target.title || "Untitled"}”`, icon: "arrowDown", onPress: () => go({ after: target.id }) },
        ...(target.canEdit ? [{ label: `Inside “${target.title || "Untitled"}”, at the end`, icon: "indent" as const, onPress: () => go({ parentId: target.id }) }] : []),
      ],
    });
  };

  const noteMenu = (note: Note) =>
    showMenu({
      title: note.title || "Untitled",
      message: kindLabel[note.kind],
      items: [
        ...(hasText(note.kind) ? [{ label: "Read", icon: "book" as const, onPress: () => openNote(note) }] : []),
        ...(hasOwnScreen(note.kind) ? [{ label: note.kind === "canvas" ? "Open the board" : note.kind === "timeline" ? "Open the timeline" : "Open the dialogue", icon: kindIcon[note.kind], onPress: () => router.push(noteRoute(projectId, note)) }] : []),
        ...(note.canEdit && hasText(note.kind) ? [{ label: "Edit text", icon: "edit" as const, onPress: () => router.push({ pathname: "/project/[projectId]/edit/[noteId]", params: { projectId, noteId: note.id } }) }] : []),
        ...(note.canEdit ? [{ label: "Details", icon: "details" as const, onPress: () => router.push({ pathname: "/project/[projectId]/details/[noteId]", params: { projectId, noteId: note.id } }) }] : []),
        ...(note.canEdit && (note.kind === "folder" || note.kind === "chapter")
          ? [{ label: "New note inside", icon: "add" as const, onPress: () => router.push({ pathname: "/project/[projectId]/new", params: { projectId, parentId: note.id } }) }]
          : []),
        ...(canMove(note) && canStep(list, note.id, "up") ? [{ label: "Move up", icon: "arrowUp" as const, onPress: () => void move(note, { step: "up" }) }] : []),
        ...(canMove(note) && canStep(list, note.id, "down") ? [{ label: "Move down", icon: "arrowDown" as const, onPress: () => void move(note, { step: "down" }) }] : []),
        ...(canMove(note) ? [{ label: "Move to…", icon: "move" as const, onPress: () => router.push({ pathname: "/project/[projectId]/move/[noteId]", params: { projectId, noteId: note.id } }) }] : []),
        ...(canAdd ? [{ label: "Duplicate", icon: "copy" as const, onPress: () => void duplicate(note) }] : []),
        { label: "Open on the web", icon: "web" as const, onPress: () => openWeb(webUrl(server, project, note.id)) },
        ...(canTrash(note) ? [{ label: "Move to trash", icon: "trash" as const, destructive: true, onPress: () => trash(note) }] : []),
      ],
    });

  const asOfMenu = () =>
    showMenu({
      title: "Show the project as of…",
      message: "What readers know once a release is out. The rest is dimmed, and passages revealed later are left out.",
      items: [{ label: "Everything", icon: "globe", onPress: () => setAsOf(null) }, ...releases.map((r) => ({ label: r.title, icon: "book" as const, onPress: () => setAsOf(r.id) }))],
    });

  // The project's menu. Other screens' entries go in this list: keep it one item per line.
  const projectItems: MenuItem[] = [
    { label: "Open everything", icon: "expandAll", onPress: () => saveOpen(parentsIn(list)) },
    { label: "Close everything", icon: "collapseAll", onPress: () => saveOpen(new Set()) },
    ...(canAdd && list.length > 1 ? [{ label: "Arrange notes", icon: "reorder" as const, onPress: () => setArranging(true) }] : []),
    { label: "Timeline", icon: "timeline", onPress: () => router.push({ pathname: "/project/[projectId]/views/timeline", params: { projectId } }) },
    { label: "Corkboard", icon: "corkboard", onPress: () => router.push({ pathname: "/project/[projectId]/views/corkboard", params: { projectId } }) },
    { label: "Plot grid", icon: "plotGrid", onPress: () => router.push({ pathname: "/project/[projectId]/views/plot-grid", params: { projectId } }) },
    { label: "Codex", icon: "globe", onPress: () => router.push({ pathname: "/project/[projectId]/views/codex", params: { projectId } }) },
    { label: "Graph", icon: "graph", onPress: () => router.push({ pathname: "/project/[projectId]/maps/graph", params: { projectId } }) },
    { label: "Relationships", icon: "people", onPress: () => router.push({ pathname: "/project/[projectId]/maps/relationships", params: { projectId } }) },
    { label: "Trash", icon: "trash", onPress: () => router.push({ pathname: "/project/[projectId]/trash", params: { projectId } }) },
    { label: "Chat", icon: "chat", onPress: () => router.push(chatRoute(projectId, null, name)) },
    ...(offerAi ? [{ label: "Ask AI", icon: "sparkles" as const, onPress: () => router.push({ pathname: "/project/[projectId]/ask", params: { projectId } }) }] : []),
    { label: "Share", icon: "people", onPress: () => router.push({ pathname: "/project/[projectId]/share", params: { projectId } }) },
    { label: "Export…", icon: "exportFile", onPress: () => router.push({ pathname: "/project/[projectId]/export", params: { projectId } }) },
    ...(canAdd ? [{ label: "Import…", icon: "importFile" as const, onPress: () => router.push({ pathname: "/import", params: { projectId } }) }] : []),
    { label: "Project settings", icon: "settings", onPress: () => router.push({ pathname: "/project/[projectId]/settings", params: { projectId } }) },
    { label: "Open on the web", icon: "web", onPress: () => openWeb(webUrl(server, project)) },
  ];
  const projectMenu = () => showMenu({ title: name, items: projectItems });

  const stopArranging = () => {
    setArranging(false);
    setPicked(null);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: name,
          headerRight: () =>
            arranging ? (
              <Pressable accessibilityRole="button" onPress={stopArranging} hitSlop={8}>
                <Text style={{ color: c.emberInk, fontSize: 17, fontWeight: "600" }}>Done</Text>
              </Pressable>
            ) : (
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
            {arranging && (
              <View accessibilityLiveRegion="polite" style={{ marginHorizontal: space.lg, marginTop: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.emberSoft, gap: space.sm }}>
                <Text style={{ color: c.emberInk, fontSize: 14, lineHeight: 20 }}>
                  {picked
                    ? `Now tap where “${list.find((n) => n.id === picked)?.title || "Untitled"}” goes.`
                    : "Tap a note to pick it up, then tap where it goes. The arrows move a note one place up or down."}
                </Text>
                {picked && (
                  <Pressable accessibilityRole="button" onPress={() => setPicked(null)} hitSlop={8} style={{ alignSelf: "flex-start" }}>
                    <Text style={{ color: c.emberInk, fontSize: 14, fontWeight: "600" }}>Put it down</Text>
                  </Pressable>
                )}
              </View>
            )}
            {list.length > 0 && !arranging && (
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
            {releases.length > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`As of ${release?.title ?? "everything"}. Change`}
                onPress={asOfMenu}
                style={({ pressed }) => ({ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: space.lg, marginTop: space.md, paddingHorizontal: space.md, height: 34, borderRadius: radius.pill, backgroundColor: release ? c.emberSoft : c.muted, opacity: pressed ? 0.7 : 1 })}
              >
                <Icon name="book" size={14} color={release ? c.emberInk : c.mutedForeground} />
                <Text style={{ color: release ? c.emberInk : c.mutedForeground, fontSize: 14 }}>{release ? `As of ${release.title}` : "Everything, no spoiler limit"}</Text>
                <Icon name="chevronDown" size={11} color={release ? c.emberInk : c.mutedForeground} />
              </Pressable>
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
            horizon={horizon}
            releaseTitle={(id) => releases.find((r) => r.id === id)?.title}
            path={filter.trim() && !arranging ? pathOf(list, item.note.id).join(" › ") : null}
            onPress={() =>
              arranging
                ? picked
                  ? dropOn(item.note)
                  : canMove(item.note) && setPicked(item.note.id)
                : item.hasChildren && !hasText(item.note.kind)
                  ? toggle(item.note.id)
                  : hasText(item.note.kind)
                    ? openNote(item.note)
                    : hasOwnScreen(item.note.kind)
                      ? router.push(noteRoute(projectId, item.note))
                      : noteMenu(item.note)
            }
            onToggle={() => toggle(item.note.id)}
            onLongPress={() => noteMenu(item.note)}
            arrange={
              arranging && canMove(item.note)
                ? {
                    picked: picked === item.note.id,
                    up: canStep(list, item.note.id, "up") ? () => void move(item.note, { step: "up" }) : null,
                    down: canStep(list, item.note.id, "down") ? () => void move(item.note, { step: "down" }) : null,
                  }
                : null
            }
          />
        )}
      />
    </>
  );
}

function BinderRowView({
  row,
  path,
  horizon,
  releaseTitle,
  onPress,
  onToggle,
  onLongPress,
  arrange,
}: {
  row: BinderRow;
  path: string | null;
  horizon: Horizon | null;
  releaseTitle: (id: string) => string | undefined;
  onPress: () => void;
  onToggle: () => void;
  onLongPress: () => void;
  /** In arrange mode: whether it's the note picked up, and its arrows. */
  arrange?: { picked: boolean; up: (() => void) | null; down: (() => void) | null } | null;
}) {
  const c = useColors();
  const { note, depth, hasChildren, open } = row;
  const status = statusLabel(note.status);
  // Under a horizon: what readers don't know yet is dimmed, and says when they will.
  const unknown = !!horizon && !horizon.knows(note.id);
  const later = unknown ? horizon!.revealedBy.get(note.id) : undefined;
  const revealNote = unknown ? (later ? `Revealed in ${releaseTitle(later) ?? "a later release"}` : "Not revealed yet") : null;
  const detail = revealNote || path || note.synopsis || [status, note.wordCount ? words(note.wordCount) : null].filter(Boolean).join(" · ") || null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${kindLabel[note.kind]}: ${note.title || "Untitled"}`}
      accessibilityHint={arrange ? (arrange.picked ? "Picked up. Tap another note to put it there." : "Tap to pick it up.") : hasChildren ? (open ? "Open. Hold for more." : "Closed. Hold for more.") : "Hold for more."}
      accessibilityState={arrange ? { selected: arrange.picked } : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", minHeight: 52, paddingLeft: space.sm + depth * 20, paddingRight: space.lg, backgroundColor: arrange?.picked ? c.emberSoft : pressed ? c.accent : "transparent", opacity: unknown && !horizon!.shows(note.id) ? 0.45 : 1 })}
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
      <Icon name={kindIcon[note.kind]} size={19} color={isContainer(note.kind) ? c.emberInk : c.mutedForeground} />
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
      {arrange && (
        <View style={{ flexDirection: "row" }}>
          <IconButton name="arrowUp" label={`Move “${note.title || "Untitled"}” up`} disabled={!arrange.up} onPress={() => arrange.up?.()} color={c.mutedForeground} />
          <IconButton name="arrowDown" label={`Move “${note.title || "Untitled"}” down`} disabled={!arrange.down} onPress={() => arrange.down?.()} color={c.mutedForeground} />
        </View>
      )}
    </Pressable>
  );
}
