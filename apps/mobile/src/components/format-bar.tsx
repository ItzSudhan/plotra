import { ScrollView, StyleSheet, View } from "react-native";
import { space, useColors } from "@/lib/theme";
import type { EditorStatus } from "./rich-editor/shared";
import type { IconName } from "./icon";
import { IconButton } from "./ui";

// The row of formatting buttons above the keyboard. What's on at the cursor is drawn in ember.

export type Format = "bold" | "italic" | "strike" | "highlight" | "heading" | "bullet" | "numbered" | "todo" | "quote" | "link" | "rule" | "undo" | "redo" | "script";

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
  { id: "undo", icon: "undo", label: "Undo" },
  { id: "redo", icon: "redo", label: "Redo" },
];

function isOn(id: Format, s: EditorStatus | null): boolean {
  if (!s) return false;
  switch (id) {
    case "bold":
    case "italic":
      return s.marks.includes(id);
    case "strike":
      return s.marks.includes("strikethrough");
    case "highlight":
      return s.marks.includes("highlight");
    case "heading":
      return /^h[1-6]$/.test(s.block);
    case "quote":
      return s.block === "blockquote";
    case "bullet":
      return s.list === "disc";
    case "numbered":
      return s.list === "decimal";
    case "todo":
      return s.list === "todo";
    default:
      return false;
  }
}

export function FormatBar({ status, onFormat, onDone }: { status: EditorStatus | null; onFormat: (f: Format) => void; onDone: () => void }) {
  const c = useColors();
  const list = status?.script ? [{ id: "script" as const, icon: "scene" as const, label: "Script element" }, ...buttons] : buttons;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, backgroundColor: c.card }}>
      <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.xs }}>
        {list.map((b) => (
          <IconButton key={b.id} name={b.icon} label={b.label} onPress={() => onFormat(b.id)} color={isOn(b.id, status) ? c.emberInk : undefined} disabled={!status?.editable} />
        ))}
      </ScrollView>
      <View style={{ width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: c.border }} />
      <IconButton name="keyboardDown" label="Hide the keyboard" onPress={onDone} />
    </View>
  );
}
