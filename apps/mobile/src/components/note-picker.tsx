import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { kindIcon } from "@/lib/kinds";
import { radius, space, useColors } from "@/lib/theme";
import type { Note } from "@/lib/types";
import { Icon } from "./icon";
import { Row, Separator } from "./ui";

/** Choosing a note to link to: by title or alias, recently changed first. */
export function NotePicker({ visible, notes, exclude, onPick }: { visible: boolean; notes: Note[]; exclude?: string; onPick: (note: Note | null) => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes
      .filter((n) => n.id !== exclude && n.kind !== "folder" && (!q || n.title.toLowerCase().includes(q) || n.aliases.some((a) => a.toLowerCase().includes(q))))
      .sort((a, b) => (q ? Number(!a.title.toLowerCase().startsWith(q)) - Number(!b.title.toLowerCase().startsWith(q)) : 0) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 100);
  }, [notes, query, exclude]);

  const close = (note: Note | null) => {
    setQuery("");
    onPick(note);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => close(null)}>
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: space.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, gap: space.md }}>
          <Text style={{ flex: 1, color: c.foreground, fontSize: 17, fontWeight: "600" }}>Link to a note</Text>
          <Pressable accessibilityRole="button" onPress={() => close(null)} hitSlop={8}>
            <Text style={{ color: c.foreground, fontSize: 17 }}>Cancel</Text>
          </Pressable>
        </View>
        <View style={{ margin: space.lg, flexDirection: "row", alignItems: "center", gap: space.sm, height: 44, borderRadius: radius.md, backgroundColor: c.muted, paddingHorizontal: space.md }}>
          <Icon name="search" size={18} color={c.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder="Find a note"
            placeholderTextColor={c.mutedForeground}
            autoCorrect={false}
            accessibilityLabel="Find a note"
            style={{ flex: 1, color: c.foreground, fontSize: 16 }}
          />
        </View>
        <FlatList
          data={list}
          keyExtractor={(n) => n.id}
          keyboardShouldPersistTaps="always"
          ItemSeparatorComponent={() => <Separator inset={52} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}
          renderItem={({ item }) => <Row icon={kindIcon[item.kind]} title={item.title} subtitle={item.aliases.length ? `Also: ${item.aliases.join(", ")}` : null} onPress={() => close(item)} />}
          ListEmptyComponent={<Text style={{ color: c.mutedForeground, padding: space.xl, textAlign: "center" }}>No note is called that.</Text>}
        />
      </View>
    </Modal>
  );
}
