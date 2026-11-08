import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, RefreshControl, ScrollView, Text, View } from "react-native";
import { Field } from "@/components/field";
import { useMenu } from "@/components/menu";
import { NoteText } from "@/components/note-text";
import { Banner, Button, Empty, IconButton, Loading } from "@/components/ui";
import { invalidate, keys, useResource } from "@/lib/cache";
import { ago, words } from "@/lib/links";
import type { Wiki } from "@/lib/markdown";
import { useProject } from "@/lib/project";
import { deleteVersion, history, historyKey, historyProblem, renameVersion, restoreVersion, versionKey, versionTitle, versionValue } from "@/lib/reader-api";
import { useClient } from "@/lib/session";
import { fonts, space, useColors } from "@/lib/theme";
import { resolveLink } from "@/lib/tree";

// One version of a note, drawn as the reader draws the note. From here it can
// be renamed, deleted, or restored: the note goes back to it for everyone, and
// what it said is kept as a version first, as the web does.

export default function VersionScreen() {
  const { projectId, noteId, versionId } = useLocalSearchParams<{ projectId: string; noteId: string; versionId: string }>();
  const c = useColors();
  const client = useClient();
  const showMenu = useMenu();
  const { notes } = useProject(projectId);
  const list = useResource(historyKey(projectId, noteId), () => history(client, projectId, noteId));
  const content = useResource(versionKey(projectId, versionId), () => versionValue(client, projectId, versionId));
  const version = list.data?.versions.find((v) => v.id === versionId);
  const canEdit = !!list.data?.canEdit;
  const canRestore = canEdit && !!list.data?.isDocument && !!content.data;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const title = version ? versionTitle(version) : "Version";

  const changed = () => {
    invalidate(historyKey(projectId, noteId));
  };

  const rename = async () => {
    if (renaming === null) return;
    setBusy(true);
    try {
      await renameVersion(client, projectId, noteId, versionId, renaming.trim() || null);
      setRenaming(null);
      changed();
    } catch (e) {
      Alert.alert("Couldn't rename it", historyProblem(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert(`Delete “${title}”?`, "The note itself doesn't change. Only this saved copy goes.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteVersion(client, projectId, noteId, versionId);
            changed();
            router.back();
          } catch (e) {
            Alert.alert("Couldn't delete it", historyProblem(e));
          }
        },
      },
    ]);

  const restore = () =>
    Alert.alert(
      `Restore “${title}”?`,
      "The note goes back to how it read then, for everyone, even anyone writing in it right now. What it says now is saved as a version first, so you can undo this from history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: async () => {
            setBusy(true);
            try {
              await restoreVersion(client, projectId, noteId, versionId);
              changed();
              invalidate(keys.note(projectId, noteId));
              invalidate(keys.notes(projectId));
              router.back();
              Alert.alert("Restored", "The version before it was saved, so you can undo this from history.");
            } catch (e) {
              Alert.alert("Couldn't restore it", historyProblem(e));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  const menu = () =>
    showMenu({
      title,
      items: [
        ...(canEdit ? [{ label: "Rename", icon: "edit" as const, onPress: () => setRenaming(version?.name ?? "") }] : []),
        ...(canRestore ? [{ label: "Restore this version", icon: "restore" as const, onPress: restore }] : []),
        ...(version?.canDelete ? [{ label: "Delete", icon: "trash" as const, destructive: true, onPress: remove }] : []),
      ],
    });

  const openNote = (id: string) => router.push({ pathname: "/project/[projectId]/note/[noteId]", params: { projectId, noteId: id } });
  const onWiki = (wiki: Wiki) => {
    const target = resolveLink(notes.data ?? [], wiki.title);
    if (target) openNote(target.id);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerRight: () => (canEdit || version?.canDelete ? <IconButton name="more" label="More" onPress={menu} /> : null),
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 64 }}
        refreshControl={<RefreshControl refreshing={content.refreshing} onRefresh={content.refresh} tintColor={c.mutedForeground} />}
      >
        <Banner offline={content.offline} error={content.offline ? null : content.error} onRetry={content.refresh} />
        <View style={{ paddingHorizontal: space.xl, paddingTop: space.md, maxWidth: 720, width: "100%", alignSelf: "center", gap: space.md }}>
          {renaming !== null ? (
            <View style={{ gap: space.md }}>
              <Field label="Name" placeholder="Leave empty for no name" value={renaming} onChangeText={setRenaming} maxLength={80} autoFocus returnKeyType="done" onSubmitEditing={() => void rename()} />
              <View style={{ flexDirection: "row", gap: space.md }}>
                <Button label="Cancel" variant="ghost" style={{ flex: 1 }} onPress={() => setRenaming(null)} />
                <Button label="Save" style={{ flex: 1 }} busy={busy} onPress={() => void rename()} />
              </View>
            </View>
          ) : (
            <Text selectable style={{ color: c.foreground, fontFamily: fonts.serif, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 }}>
              {title}
            </Text>
          )}
          {version && (
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
              {[ago(version.createdAt), words(version.wordCount), version.authorName && `by ${version.authorName}`].filter(Boolean).join(" · ")}
            </Text>
          )}
          {canRestore && renaming === null && <Button label="Restore this version" icon="restore" variant="secondary" busy={busy} onPress={restore} />}
          <View style={{ height: 1, backgroundColor: c.border, marginVertical: space.md }} />

          {content.data ? (
            <NoteText value={content.data} notes={notes.data ?? []} onOpenNote={openNote} onWiki={onWiki} />
          ) : content.loading ? (
            <Loading />
          ) : content.data === null ? (
            <Empty icon="web" title="Open this one on the web" body="This version is of a board, laid out for a bigger screen. Look at it, or restore it, in Plotra on the web." />
          ) : (
            <Empty icon="history" title="This version isn't here" body="It may have been deleted, or you're offline and haven't opened it before." />
          )}
        </View>
      </ScrollView>
    </>
  );
}
