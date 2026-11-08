import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, RefreshControl, Text, View } from "react-native";
import { useMenu } from "@/components/menu";
import { Banner, Button, Empty, IconButton, Loading, Row, Separator } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { binderKeys, deleteForever, emptyTrash, listTrash, restoreNote, type Trashed } from "@/lib/binder-api";
import { invalidate, keys, useResource } from "@/lib/cache";
import { kindIcon, kindLabel } from "@/lib/kinds";
import { ago } from "@/lib/links";
import { useClient } from "@/lib/session";
import { space, useColors } from "@/lib/theme";

// A project's trash: what was moved there, when and by whom. Put a note back,
// delete it for good, or empty the lot. The server decides who may (the same
// rules as the web: deleting needs the right to delete in the project).

const notesWord = (n: number) => `${n.toLocaleString()} ${n === 1 ? "note" : "notes"}`;

export default function TrashScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const c = useColors();
  const client = useClient();
  const showMenu = useMenu();
  const trash = useResource(binderKeys.trash(projectId), () => listTrash(client, projectId));
  const [busy, setBusy] = useState<string | null>(null);
  const items = trash.data?.notes ?? [];

  const fail = (what: string) => (e: unknown) => Alert.alert(what, isOffline(e) ? "You're offline. Try again when you're back online." : (e as Error).message);

  const without = (id: string) => trash.mutate((t) => t && { ...t, notes: t.notes.filter((n) => n.id !== id) });

  const restore = async (note: Trashed) => {
    setBusy(note.id);
    try {
      await restoreNote(client, projectId, note.id);
      without(note.id);
      invalidate(keys.notes(projectId));
    } catch (e) {
      fail("Couldn't put it back")(e);
    } finally {
      setBusy(null);
    }
  };

  const destroy = (note: Trashed) =>
    Alert.alert(
      `Delete “${note.title || "Untitled"}” forever?`,
      note.inside ? `It and the ${notesWord(note.inside)} inside it are deleted for good. This can't be undone.` : "It's deleted for good. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete forever",
          style: "destructive",
          onPress: async () => {
            setBusy(note.id);
            try {
              await deleteForever(client, projectId, note.id);
              without(note.id);
            } catch (e) {
              fail("Couldn't delete it")(e);
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );

  const empty = () => {
    const count = items.reduce((sum, n) => sum + 1 + n.inside, 0);
    Alert.alert("Empty the trash?", `${notesWord(count)} ${count === 1 ? "is" : "are"} deleted for good. This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Empty trash",
        style: "destructive",
        onPress: async () => {
          setBusy("all");
          try {
            await emptyTrash(client, projectId);
            trash.mutate((t) => t && { ...t, notes: [] });
          } catch (e) {
            fail("Couldn't empty the trash")(e);
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const menu = (note: Trashed) =>
    showMenu({
      title: note.title || "Untitled",
      message: kindLabel[note.kind],
      items: (note.canDelete ?? note.canEdit)
        ? [
            { label: "Put back", icon: "putBack", onPress: () => void restore(note) },
            { label: "Delete forever", icon: "trash", destructive: true, onPress: () => destroy(note) },
          ]
        : [],
    });

  const said = (note: Trashed) =>
    [`${note.trashedBy ? `Moved here by ${note.trashedBy}` : "Moved here"} · ${ago(note.trashedAt)}`, note.inside ? `with ${notesWord(note.inside)} inside` : null].filter(Boolean).join(", ");

  return (
    <>
      <Stack.Screen options={{ title: "Trash" }} />
      <FlatList
        style={{ flex: 1, backgroundColor: c.background }}
        contentInsetAdjustmentBehavior="automatic"
        data={items}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={trash.refreshing} onRefresh={trash.refresh} tintColor={c.mutedForeground} />}
        ItemSeparatorComponent={() => <Separator inset={52} />}
        ListHeaderComponent={
          <View style={{ paddingBottom: space.sm }}>
            <Banner offline={trash.offline} error={trash.offline ? null : trash.error} onRetry={trash.refresh} />
            {items.length > 0 && (
              <Text style={{ color: c.mutedForeground, fontSize: 13, lineHeight: 18, marginHorizontal: space.lg, marginTop: space.md }}>
                Notes here can be put back. Hold one for more. A note whose folder is still in the trash comes back at the top level.
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          trash.loading ? <Loading /> : trash.data ? <Empty icon="trash" title="Nothing in the trash" body="Notes you move to the trash wait here, and can be put back." /> : undefined
        }
        renderItem={({ item }) => (
          <Row
            icon={kindIcon[item.kind]}
            title={item.title || "Untitled"}
            subtitle={said(item)}
            onLongPress={() => menu(item)}
            onPress={() => menu(item)}
            accessibilityHint="Put it back or delete it forever."
            right={
              (item.canDelete ?? item.canEdit) ? (
                <IconButton name="putBack" label={`Put back “${item.title || "Untitled"}”`} disabled={busy === item.id} onPress={() => void restore(item)} color={c.emberInk} />
              ) : null
            }
          />
        )}
        ListFooterComponent={
          items.length > 0 && trash.data?.canEmpty ? (
            <View style={{ padding: space.xl }}>
              <Button label="Empty trash…" icon="trash" variant="secondary" busy={busy === "all"} onPress={empty} />
            </View>
          ) : undefined
        }
      />
    </>
  );
}
