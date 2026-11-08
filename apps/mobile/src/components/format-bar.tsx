import { ScrollView, StyleSheet, View } from "react-native";
import { space, useColors } from "@/lib/theme";
import type { IconName } from "./icon";
import { IconButton } from "./ui";

// The row of formatting buttons above the keyboard.

export type Format = "bold" | "italic" | "strike" | "highlight" | "heading" | "bullet" | "numbered" | "todo" | "quote" | "link" | "rule";

const buttons: { id: Format; icon: IconName; label: string }[] = [
  { id: "bold", icon: "bold", label: "Bold" },
  { id: "italic", icon: "italic", label: "Italic" },
  { id: "heading", icon: "heading", label: "Heading" },
  { id: "link", icon: "link", label: "Link to a note" },
  { id: "bullet", icon: "bullet", label: "Bulleted list" },
  { id: "numbered", icon: "numbered", label: "Numbered list" },
  { id: "todo", icon: "todo", label: "To-do list" },
  { id: "quote", icon: "quote", label: "Quote" },
  { id: "strike", icon: "strike", label: "Strikethrough" },
  { id: "highlight", icon: "highlight", label: "Highlight" },
  { id: "rule", icon: "rule", label: "Scene break" },
];

export function FormatBar({ onFormat, onDone }: { onFormat: (f: Format) => void; onDone: () => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, backgroundColor: c.card }}>
      <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.xs }}>
        {buttons.map((b) => (
          <IconButton key={b.id} name={b.icon} label={b.label} onPress={() => onFormat(b.id)} />
        ))}
      </ScrollView>
      <View style={{ width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: c.border }} />
      <IconButton name="keyboardDown" label="Hide the keyboard" onPress={onDone} />
    </View>
  );
}
