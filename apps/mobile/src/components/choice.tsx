import { Pressable, Text, View } from "react-native";
import { space, useColors } from "@/lib/theme";
import { Icon, type IconName } from "./icon";

// One option of a list where one is chosen (a radio button) or each is on or
// off (a checkbox): a title, a line saying what it does, a check when chosen.

export function Choice({
  title,
  detail,
  icon,
  selected,
  onPress,
  checkbox,
  disabled,
}: {
  title: string;
  detail?: string | null;
  icon?: IconName;
  selected: boolean;
  onPress: () => void;
  checkbox?: boolean;
  disabled?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole={checkbox ? "checkbox" : "radio"}
      accessibilityState={checkbox ? { checked: selected, disabled: !!disabled } : { selected, disabled: !!disabled }}
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "flex-start",
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        backgroundColor: pressed ? c.accent : "transparent",
        opacity: disabled ? 0.5 : 1,
      })}
    >
      {icon && (
        <View style={{ paddingTop: 1 }}>
          <Icon name={icon} size={20} color={selected ? c.emberInk : c.mutedForeground} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ color: c.foreground, fontSize: 16, fontWeight: selected ? "600" : "400" }}>{title}</Text>
        {!!detail && <Text style={{ color: c.mutedForeground, fontSize: 13, lineHeight: 18 }}>{detail}</Text>}
      </View>
      <View style={{ width: 22, paddingTop: 1, alignItems: "center" }}>
        {selected ? <Icon name="check" size={18} color={c.emberInk} /> : checkbox ? <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: c.mutedForeground }} /> : null}
      </View>
    </Pressable>
  );
}
