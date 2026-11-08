import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from "react-native";
import { fonts, radius, space, useColors } from "@/lib/theme";
import { Icon, type IconName } from "./icon";

// The app's small building blocks, drawn in Plotra's colours.

type Tone = "default" | "muted" | "ember" | "destructive";

export function T({ tone = "default", style, ...props }: TextProps & { tone?: Tone }) {
  const c = useColors();
  const color = tone === "muted" ? c.mutedForeground : tone === "ember" ? c.emberInk : tone === "destructive" ? c.destructive : c.foreground;
  return <Text {...props} style={[{ color, fontSize: 16 }, style]} />;
}

/** A large serif title, like the web app's headings. */
export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  return <Text style={[{ color: c.foreground, fontFamily: fonts.serif, fontSize: 30, lineHeight: 36, letterSpacing: -0.5 }, style]}>{children}</Text>;
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingTop: space.xl, paddingBottom: space.sm }}>
      <Text style={{ color: c.mutedForeground, fontSize: 13, fontWeight: "600" }}>{children}</Text>
      {right}
    </View>
  );
}

type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  label: string;
  icon?: IconName;
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, icon, variant = "primary", busy, disabled, style, onPress, ...props }: ButtonProps) {
  const c = useColors();
  const bg = variant === "primary" ? c.foreground : variant === "secondary" ? c.accent : variant === "destructive" ? c.destructive : "transparent";
  const fg = variant === "primary" ? c.background : variant === "destructive" ? "#fff" : c.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || busy}
      onPress={(e) => {
        void Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={({ pressed }) => [
        { height: 50, borderRadius: radius.pill, backgroundColor: bg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm, paddingHorizontal: space.xl },
        (disabled || busy) && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
        style,
      ]}
      {...props}
    >
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 16, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

/** A tappable icon, at least 44 points square. */
export function IconButton({ name, label, onPress, color, disabled }: { name: IconName; label: string; onPress: () => void; color?: string; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : pressed ? 0.5 : 1 })}
    >
      <Icon name={name} size={22} color={color ?? c.foreground} />
    </Pressable>
  );
}

/** A list row: an icon, a title and a line under it, something on the right. */
export function Row({
  icon,
  iconColor,
  title,
  subtitle,
  right,
  onPress,
  onLongPress,
  indent = 0,
  accessibilityHint,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  indent?: number;
  accessibilityHint?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      onLongPress={
        onLongPress &&
        (() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onLongPress();
        })
      }
      style={({ pressed }) => [styles.row, { paddingLeft: space.lg + indent, backgroundColor: pressed ? c.accent : "transparent" }]}
    >
      {icon && <Icon name={icon} size={20} color={iconColor ?? c.mutedForeground} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 16 }}>
          {title || "Untitled"}
        </Text>
        {!!subtitle && (
          <Text numberOfLines={2} style={{ color: c.mutedForeground, fontSize: 13, marginTop: 2 }}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </Pressable>
  );
}

export function Separator({ inset = space.lg }: { inset?: number }) {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: inset }} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, overflow: "hidden" }, style]}>{children}</View>;
}

/** A whole screen with nothing to show yet: what it is, and what to do. */
export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: "center", paddingHorizontal: space.xxl, paddingVertical: 64, gap: space.md }}>
      <Icon name={icon} size={36} color={c.mutedForeground} />
      <Text style={{ color: c.foreground, fontFamily: fonts.serif, fontSize: 22, textAlign: "center" }}>{title}</Text>
      {!!body && <Text style={{ color: c.mutedForeground, fontSize: 15, lineHeight: 22, textAlign: "center" }}>{body}</Text>}
      {action}
    </View>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={{ padding: 64, alignItems: "center" }}>
      <ActivityIndicator color={c.mutedForeground} />
    </View>
  );
}

/** A strip at the top when what's shown is the copy saved on the phone, or something went wrong. */
export function Banner({ offline, error, onRetry }: { offline?: boolean; error?: Error | null; onRetry?: () => void }) {
  const c = useColors();
  if (!offline && !error) return null;
  return (
    <Pressable
      accessibilityRole={onRetry ? "button" : undefined}
      onPress={onRetry}
      style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.lg, marginTop: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: offline ? c.muted : c.emberSoft }}
    >
      <Icon name={offline ? "offline" : "info"} size={16} color={offline ? c.mutedForeground : c.emberInk} />
      <Text style={{ flex: 1, color: offline ? c.mutedForeground : c.emberInk, fontSize: 13, lineHeight: 18 }}>
        {offline ? "You're offline. This is the copy saved on your phone." : error?.message}
        {onRetry ? " Tap to try again." : ""}
      </Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: space.md,
        height: 34,
        justifyContent: "center",
        borderRadius: radius.pill,
        backgroundColor: selected ? c.foreground : c.accent,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text numberOfLines={1} style={{ color: selected ? c.background : c.foreground, fontSize: 14 }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Tag({ label }: { label: string }) {
  const c = useColors();
  return (
    <View style={{ paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: c.muted }}>
      <Text style={{ color: c.mutedForeground, fontSize: 12 }}>#{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingRight: space.lg, minHeight: 52, paddingVertical: space.sm },
});
