import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Share, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { MarkdownView } from "@/components/markdown-view";
import { useMenu } from "@/components/menu";
import { Banner, Button, Card, Empty, IconButton, Loading, Row, Separator, Tag } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { invalidate, keys, useResource } from "@/lib/cache";
import { hasText, kindIcon, kindLabel, statusLabel } from "@/lib/kinds";
import { ago, openWeb, webUrl, words } from "@/lib/links";
import type { Wiki } from "@/lib/markdown";
import { useProject } from "@/lib/project";
import { forgetRecent, rememberRecent } from "@/lib/recent";
import { useClient, useSession } from "@/lib/session";
import { fonts, space, useColors } from "@/lib/theme";
import { childrenOf, pathOf, resolveLink } from "@/lib/tree";
import { useHorizon } from "@/lib/use-horizon";

// Reading a note. Its text is drawn from Markdown; [[links]] open the note
// they name; Previous and Next walk the binder, to read straight through.

export default function NoteScreen() {
  const { projectId, noteId } = useLocalSearchParams<{ projectId: string; noteId: string }>();
  const c = useColors();
  const client = useClient();
  const { server } = useSession();
  const showMenu = useMenu();
  const { project, notes } = useProject(projectId);
  const { release, setAsOf } = useHorizon(projectId, notes.data);
  const asOf = release?.id ?? null;
  const note = useResource(keys.note(projectId, noteId, asOf), () => client.note(projectId, noteId, asOf));
  const data = note.data;
  const list = useMemo(() => notes.data ?? [], [notes.data]);

  useEffect(() => {
    if (data && project) void rememberRecent({ projectId, projectTitle: project.title, noteId, title: data.title, kind: data.kind });
  }, [data, project, projectId, noteId]);

  // Reading order: the binder's, through notes that have text.
  const { prev, next } = useMemo(() => {
    const readable = list.filter((n) => hasText(n.kind));
    const at = readable.findIndex((n) => n.id === noteId);
    return { prev: at > 0 ? readable[at - 1] : null, next: at >= 0 && at < readable.length - 1 ? readable[at + 1] : null };
  }, [list, noteId]);

  const children = useMemo(() => childrenOf(list).get(noteId) ?? [], [list, noteId]);
  const path = useMemo(() => pathOf(list, noteId), [list, noteId]);

  const go = (id: string) => router.replace({ pathname: "/project/[projectId]/note/[noteId]", params: { projectId, noteId: id } });
  const push = (id: string) => router.push({ pathname: "/project/[projectId]/note/[noteId]", params: { projectId, noteId: id } });

  const onWiki = (wiki: Wiki) => {
    const target = resolveLink(list, wiki.title);
    if (target) push(target.id);
    else Alert.alert(`No note called “${wiki.title}”`, "It may have been renamed or moved to the trash.");
  };

  const edit = () => router.push({ pathname: "/project/[projectId]/edit/[noteId]", params: { projectId, noteId } });
  const canEdit = !!data?.canEdit;
  const readable = data ? hasText(data.kind) && data.markdown !== null : false;

  const trash = () =>
    Alert.alert(`Move “${data?.title || "Untitled"}” to the trash?`, "Anything inside it goes too. You can bring it back from the trash on the web.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Move to trash",
        style: "destructive",
        onPress: async () => {
          try {
            await client.trashNote(projectId, noteId);
            void forgetRecent(noteId);
            invalidate(keys.notes(projectId));
            router.back();
          } catch (e) {
            Alert.alert("Couldn't move it to the trash", isOffline(e) ? "You're offline. Try again when you're back online." : (e as Error).message);
          }
        },
      },
    ]);

  const menu = () =>
    showMenu({
      title: data?.title || "Untitled",
      items: [
        ...(canEdit ? [{ label: "Details", icon: "details" as const, onPress: () => router.push({ pathname: "/project/[projectId]/details/[noteId]", params: { projectId, noteId } }) }] : []),
        ...(canEdit && readable ? [{ label: "Add to the end", icon: "capture" as const, onPress: () => router.push({ pathname: "/capture", params: { projectId, noteId } }) }] : []),
        ...(readable && data?.markdown ? [{ label: "Share the text", icon: "share" as const, onPress: () => void Share.share({ title: data.title, message: data.markdown ?? "" }) }] : []),
        { label: "Open on the web", icon: "web" as const, onPress: () => openWeb(webUrl(server, project, noteId)) },
        ...(canEdit ? [{ label: "Move to trash", icon: "trash" as const, destructive: true, onPress: trash }] : []),
      ],
    });

  const status = statusLabel(data?.status ?? null);

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerRight: () =>
            data ? (
              <View style={{ flexDirection: "row" }}>
                {canEdit && readable && <IconButton name="edit" label="Edit" onPress={edit} />}
                <IconButton name="more" label="More" onPress={menu} />
              </View>
            ) : null,
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 64 }}
        refreshControl={<RefreshControl refreshing={note.refreshing} onRefresh={note.refresh} tintColor={c.mutedForeground} />}
      >
        <Banner offline={note.offline} error={note.offline ? null : note.error} onRetry={note.refresh} />
        {!data ? (
          note.loading ? <Loading /> : <Empty icon="note" title="This note isn't here" body="It may have been moved to the trash, or you no longer have access." />
        ) : (
          <View style={{ paddingHorizontal: space.xl, paddingTop: space.md, maxWidth: 720, width: "100%", alignSelf: "center" }}>
            {path.length > 0 && (
              <Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 13, marginBottom: space.sm }}>
                {path.join(" › ")}
              </Text>
            )}
            <Text selectable style={{ color: c.foreground, fontFamily: fonts.serif, fontSize: 32, lineHeight: 38, letterSpacing: -0.5 }}>
              {data.title || "Untitled"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.sm }}>
              <Icon name={kindIcon[data.kind]} size={14} color={c.mutedForeground} />
              <Text style={{ color: c.mutedForeground, fontSize: 13 }}>{[kindLabel[data.kind], status, data.wordCount ? words(data.wordCount) : null, `edited ${ago(data.updatedAt)}`].filter(Boolean).join(" · ")}</Text>
            </View>
            {data.tags.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: space.md }}>
                {data.tags.map((t) => (
                  <Tag key={t} label={t} />
                ))}
              </View>
            )}
            {!!data.synopsis && <Text style={{ color: c.mutedForeground, fontSize: 15, lineHeight: 22, fontStyle: "italic", marginTop: space.md }}>{data.synopsis}</Text>}
            <View style={{ height: 1, backgroundColor: c.border, marginVertical: space.xl }} />

            {release && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setAsOf(null)}
                style={{ marginBottom: space.lg, padding: space.md, borderRadius: 12, backgroundColor: c.emberSoft, flexDirection: "row", gap: space.sm, alignItems: "center" }}
              >
                <Icon name="book" size={16} color={c.emberInk} />
                <Text style={{ flex: 1, color: c.emberInk, fontSize: 14, lineHeight: 20 }}>
                  {data.revealed === false
                    ? `As of ${release.title}, readers don't know this note yet. Tap to show everything.`
                    : `Showing what readers know as of ${release.title}; passages revealed later are left out. Tap to show everything.`}
                </Text>
              </Pressable>
            )}

            {readable ? (
              data.markdown?.trim() ? (
                <MarkdownView markdown={data.markdown} onWiki={onWiki} />
              ) : data.revealed === false ? null : (
                <Pressable accessibilityRole="button" disabled={!canEdit} onPress={edit} style={{ paddingVertical: space.xl }}>
                  <Text style={{ color: c.mutedForeground, fontFamily: fonts.serif, fontSize: 18, fontStyle: "italic" }}>{canEdit ? "Nothing written yet. Tap to start." : "Nothing written yet."}</Text>
                </Pressable>
              )
            ) : data.kind !== "folder" ? (
              <Empty
                icon={kindIcon[data.kind]}
                title={`${kindLabel[data.kind]}s open on the web`}
                body="This one is laid out for a bigger screen. Open it in Plotra on the web."
                action={<Button label="Open on the web" icon="web" variant="secondary" onPress={() => openWeb(webUrl(server, project, noteId))} />}
              />
            ) : null}

            {children.length > 0 && (
              <Card style={{ marginTop: space.xl }}>
                {children.map((child, i) => (
                  <View key={child.id}>
                    {i > 0 && <Separator inset={52} />}
                    <Row icon={kindIcon[child.kind]} title={child.title} subtitle={child.synopsis ?? (child.wordCount ? words(child.wordCount) : null)} onPress={() => push(child.id)} />
                  </View>
                ))}
              </Card>
            )}

            {(prev || next) && (
              <View style={{ flexDirection: "row", gap: space.md, marginTop: 48 }}>
                <Step label="Previous" title={prev?.title} onPress={prev ? () => go(prev.id) : undefined} />
                <Step label="Next" title={next?.title} onPress={next ? () => go(next.id) : undefined} align="right" />
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </>
  );
}

function Step({ label, title, onPress, align = "left" }: { label: string; title?: string; onPress?: () => void; align?: "left" | "right" }) {
  const c = useColors();
  if (!onPress) return <View style={{ flex: 1 }} />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${title || "Untitled"}`}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, padding: space.md, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: pressed ? c.accent : "transparent", alignItems: align === "right" ? "flex-end" : "flex-start" })}
    >
      <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{align === "right" ? `${label} →` : `← ${label}`}</Text>
      <Text numberOfLines={2} style={{ color: c.foreground, fontSize: 15, marginTop: 2, textAlign: align }}>
        {title || "Untitled"}
      </Text>
    </Pressable>
  );
}
