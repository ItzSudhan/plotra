import { ScrollView, StyleSheet, View } from "react-native";
import { space, useColors } from "@/lib/theme";
import type { EditorStatus } from "./rich-editor/shared";
import type { IconName } from "./icon";
import { IconButton } from "./ui";

// The row of formatting buttons above the keyboard. What's on at the cursor is drawn in ember.

export type Format =
  | "bold"
  | "italic"
  | "strike"
  | "highlight"
  | "heading"
  | "bullet"
  | "numbered"
  | "todo"
  | "quote"
  | "link"
  | "rule"
  | "undo"
  | "redo"
  | "script"
  | "picture"
  | "comment"
  | "suggest";

const buttons: { id: Format; icon: IconName; label: string }[] = [
  { id: "bold", icon: "bold", label: "Bold" },
  { id: "italic", icon: "italic", label: "Italic" },
  { id: "heading", icon: "heading", label: "Heading" },
  { id: "link", icon: "link", label: "Link to a note" },
  { id: "comment", icon: "comment", label: "Comment on the selected text" },
  { id: "picture", icon: "picture", label: "Add a picture" },
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
    case "suggest":
      return s.suggesting;
    default:
      return false;
  }
}

/** Commenting works for people who may only comment too; everything else needs a note they can change. */
const isEnabled = (id: Format, s: EditorStatus | null) => (id === "comment" ? !!s?.selection : !!s?.editable);

export function FormatBar({ status, onFormat, onDone }: { status: EditorStatus | null; onFormat: (f: Format) => void; onDone: () => void }) {
  const c = useColors();
  let list = status?.script ? [{ id: "script" as const, icon: "scene" as const, label: "Script element" }, ...buttons] : buttons;
  // Suggesting is for people who may edit, as on the web; it leads, so it's easy to see it's on.
  if (status?.editable) list = [{ id: "suggest", icon: "suggest", label: status.suggesting ? "Stop suggesting: edit directly" : "Suggest edits" }, ...list];
  // People who can only comment see just that.
  else if (status?.role === "commenter") list = buttons.filter((b) => b.id === "comment");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, backgroundColor: c.card }}>
      <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.xs }}>
        {list.map((b) => (
          <IconButton key={b.id} name={b.icon} label={b.label} onPress={() => onFormat(b.id)} color={isOn(b.id, status) ? (b.id === "suggest" ? c.teal : c.emberInk) : undefined} disabled={!isEnabled(b.id, status)} />
        ))}
      </ScrollView>
      <View style={{ width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: c.border }} />
      <IconButton name="keyboardDown" label="Hide the keyboard" onPress={onDone} />
    </View>
  );
}
