import { Text, TextInput, View, type TextInputProps } from "react-native";
import { radius, space, useColors } from "@/lib/theme";

/** A labelled text box. */
export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 13, fontWeight: "600" }}>{label}</Text>
      <TextInput
        placeholderTextColor={c.mutedForeground}
        accessibilityLabel={label}
        {...props}
        style={[
          { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, color: c.foreground, paddingHorizontal: space.md, paddingVertical: space.md, fontSize: 16 },
          props.multiline && { minHeight: 96, textAlignVertical: "top" },
          props.style,
        ]}
      />
      {!!hint && <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{hint}</Text>}
    </View>
  );
}

/** "a, b , c" as tags. */
export const splitTags = (input: string) => [...new Set(input.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean))].slice(0, 50);
