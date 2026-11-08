import { useMemo, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, space, useColors, useScheme } from "@/lib/theme";
import { Icon, type IconName } from "../icon";
import type { SceneTheme } from "./scene";

// Pieces the graph, relationship map, board and dialogue screens share.

/** The app's colours, for the map canvas in its web view. */
export function useSceneTheme(): SceneTheme {
  const c = useColors();
  const dark = useScheme() === "dark";
  return useMemo(
    () => ({ background: c.background, foreground: c.foreground, muted: c.muted, mutedForeground: c.mutedForeground, card: c.card, border: dark ? "#3a3733" : "#dcd9d3", ember: c.ember, dark }),
    [c, dark],
  );
}

/** Settings for the canvas's web view: it pans itself, so the view mustn't scroll or bounce. */
export const canvasDom = (background: string) => ({ style: { flex: 1, backgroundColor: background }, scrollEnabled: false, bounces: false, contentInsetAdjustmentBehavior: "never" as const });

/** Two to four choices side by side: Map, Tree, List. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  const c = useColors();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", backgroundColor: c.muted, borderRadius: radius.pill, padding: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, height: 32, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: on ? c.card : "transparent" }}
          >
            <Text style={{ color: on ? c.foreground : c.mutedForeground, fontSize: 14, fontWeight: on ? "600" : "400" }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type SheetAction = { label: string; icon: IconName; onPress: () => void };

/** A card over the bottom of a map: what was tapped, and what to do with it. */
export function InfoSheet({ title, subtitle, body, actions, onClose, children }: { title: string; subtitle?: string | null; body?: string | null; actions: SheetAction[]; onClose: () => void; children?: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityViewIsModal={false}
      style={{
        position: "absolute",
        left: space.md,
        right: space.md,
        bottom: insets.bottom + space.md,
        backgroundColor: c.card,
        borderRadius: radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.border,
        padding: space.lg,
        gap: space.sm,
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text accessibilityRole="header" numberOfLines={2} style={{ color: c.foreground, fontSize: 17, fontWeight: "600" }}>
            {title || "Untitled"}
          </Text>
          {!!subtitle && <Text style={{ color: c.mutedForeground, fontSize: 13, marginTop: 2 }}>{subtitle}</Text>}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose}>
          <Icon name="close" size={18} color={c.mutedForeground} />
        </Pressable>
      </View>
      {!!body && (
        <Text numberOfLines={4} style={{ color: c.foreground, fontSize: 14, lineHeight: 20 }}>
          {body}
        </Text>
      )}
      {children}
      {actions.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs }}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              onPress={a.onPress}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: c.accent, opacity: pressed ? 0.7 : 1 })}
            >
              <Icon name={a.icon} size={15} color={c.foreground} />
              <Text style={{ color: c.foreground, fontSize: 14 }}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** A line across the top of a map: what to do now ("Tap an empty spot…"), with a way out. */
export function Hint({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.lg, marginVertical: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.emberSoft }}>
      <Text style={{ flex: 1, color: c.emberInk, fontSize: 13, lineHeight: 18 }}>{text}</Text>
      {!!action && (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <Text style={{ color: c.emberInk, fontSize: 14, fontWeight: "600" }}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Writing a few lines: a text card's text. */
export function TextSheet({ visible, title, initial, onDone }: { visible: boolean; title: string; initial: string; onDone: (text: string | null) => void }) {
  const c = useColors();
  const [text, setText] = useState(initial);
  // Each time it opens it starts from the card's text (React's "adjust state while rendering").
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setText(initial);
  }
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => onDone(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background, padding: space.lg, gap: space.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable accessibilityRole="button" onPress={() => onDone(null)} hitSlop={8}>
            <Text style={{ color: c.foreground, fontSize: 17 }}>Cancel</Text>
          </Pressable>
          <Text style={{ flex: 1, textAlign: "center", color: c.foreground, fontSize: 17, fontWeight: "600" }}>{title}</Text>
          <Pressable accessibilityRole="button" onPress={() => onDone(text)} hitSlop={8}>
            <Text style={{ color: c.emberInk, fontSize: 17, fontWeight: "600" }}>Done</Text>
          </Pressable>
        </View>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          maxLength={4000}
          placeholder="Write something"
          placeholderTextColor={c.mutedForeground}
          accessibilityLabel="Card text"
          style={{ flex: 1, color: c.foreground, fontSize: 17, lineHeight: 24, textAlignVertical: "top" }}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}
