import { useEffect, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { partOfDay } from "@/lib/greeting";
import { fonts, radius, space, useColors, useScheme } from "@/lib/theme";
import { Icon, type IconName } from "../icon";

// The first-run screens' pieces, in the desktop app's manner
// (apps/desktop/static/chooser.html): warm light drifting slowly behind the
// page, a greeting with a star that twinkles once, a serif headline, and
// cards that rise into place one after another. Still for anyone who has
// asked their phone for less motion.

const ease = Easing.bezier(0.2, 0.7, 0.2, 1);

/** Rises into place, `i` steps after the first (70 ms apart, as on the desktop). */
export function Rise({ i = 0, children, style }: { i?: number; children: ReactNode; style?: object }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={reduced ? undefined : FadeInDown.delay(i * 70).duration(560).easing(ease).withInitialValues({ transform: [{ translateY: 8 }] })} style={style}>
      {children}
    </Animated.View>
  );
}

/** Warm light behind the page: two soft pools of ember, drifting for 18 seconds and back. */
export function Glow() {
  const c = useColors();
  const dark = useScheme() === "dark";
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!reduced) t.value = withRepeat(withTiming(1, { duration: 18_000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduced, t]);
  const drift = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * 12 }, { translateY: t.value * -10 }, { scale: 1 + t.value * 0.05 }] }));
  const glow = dark ? "rgba(226, 96, 42, 0.12)" : "rgba(226, 96, 42, 0.10)";
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.background, overflow: "hidden" }]}>
      <Animated.View
        style={[
          { position: "absolute", top: "-20%", left: "-20%", right: "-20%", bottom: "-20%" },
          { experimental_backgroundImage: `radial-gradient(40% 35% at 18% 14%, ${glow}, transparent 70%), radial-gradient(45% 32% at 86% 88%, ${glow}, transparent 70%)` },
          drift,
        ]}
      />
    </View>
  );
}

/** The four-pointed star, twinkling in once: small and turned, then a little too big, then still. */
function Star({ color }: { color: string }) {
  const reduced = useReducedMotion();
  const s = useSharedValue(reduced ? 1 : 0.4);
  const r = useSharedValue(reduced ? 0 : -40);
  const o = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    s.value = withDelay(600, withSequence(withTiming(1.2, { duration: 960 }), withTiming(1, { duration: 640 })));
    r.value = withDelay(600, withSequence(withTiming(8, { duration: 960 }), withTiming(0, { duration: 640 })));
    o.value = withDelay(600, withTiming(1, { duration: 960 }));
  }, [reduced, s, r, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: s.value }, { rotate: `${r.value}deg` }] }));
  return (
    <Animated.View style={style}>
      <Icon name="sparkle" size={14} color={color} />
    </Animated.View>
  );
}

/** "Good evening, and welcome to Plotra", or what's given, with the star. */
export function Eyebrow({ children, i = 0 }: { children?: string; i?: number }) {
  const c = useColors();
  const part = partOfDay(new Date().getHours());
  return (
    <Rise i={i}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.md }}>
        <Star color={c.emberInk} />
        <Text style={{ color: c.emberInk, fontSize: 14, fontWeight: "500" }}>{children ?? (part ? `${part}, and welcome to Plotra` : "Welcome to Plotra")}</Text>
      </View>
    </Rise>
  );
}

export function Headline({ children, i = 1 }: { children: ReactNode; i?: number }) {
  const c = useColors();
  return (
    <Rise i={i}>
      <Text accessibilityRole="header" style={{ color: c.foreground, fontFamily: fonts.serif, fontSize: 38, lineHeight: 42, letterSpacing: -0.6 }}>
        {children}
      </Text>
    </Rise>
  );
}

export function Lede({ children, i = 2 }: { children: ReactNode; i?: number }) {
  const c = useColors();
  return (
    <Rise i={i}>
      <Text style={{ color: c.mutedForeground, fontSize: 16, lineHeight: 24, marginTop: space.md }}>{children}</Text>
    </Rise>
  );
}

/** The ember-tinted square an option's icon sits in. */
export function Glyph({ name }: { name: IconName }) {
  const c = useColors();
  return (
    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.emberSoft, alignItems: "center", justifyContent: "center" }}>
      <Icon name={name} size={19} color={c.emberInk} />
    </View>
  );
}

/** A choice as the desktop draws one: a card with a glyph, a heading, what it means, and what to do. */
export function ChoiceCard({ i, glyph, title, points, children }: { i: number; glyph: IconName; title: string; points: string[]; children?: ReactNode }) {
  const c = useColors();
  return (
    <Rise i={i}>
      <View style={{ backgroundColor: c.card, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, padding: space.lg, gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <Glyph name={glyph} />
          <Text style={{ color: c.foreground, fontSize: 18, fontWeight: "600" }}>{title}</Text>
        </View>
        <View style={{ gap: 6 }}>
          {points.map((p) => (
            <View key={p} style={{ flexDirection: "row", gap: space.sm }}>
              <Text style={{ color: c.emberInk, fontSize: 15, lineHeight: 21 }}>•</Text>
              <Text style={{ flex: 1, color: c.mutedForeground, fontSize: 15, lineHeight: 21 }}>{p}</Text>
            </View>
          ))}
        </View>
        {children}
      </View>
    </Rise>
  );
}

/** A row in a list of what something does: a glyph, a line in bold, a line under it. */
export function Point({ i, glyph, title, body }: { i: number; glyph: IconName; title: string; body: string }) {
  const c = useColors();
  return (
    <Rise i={i}>
      <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
        <Glyph name={glyph} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontSize: 16, fontWeight: "600" }}>{title}</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 15, lineHeight: 21, marginTop: 2 }}>{body}</Text>
        </View>
      </View>
    </Rise>
  );
}

/** A choice that's picked rather than pressed through: a card with a ring when chosen. */
export function OptionCard({ selected, onPress, glyph, title, body }: { selected: boolean; onPress: () => void; glyph: IconName; title: string; body?: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        padding: space.md,
        borderRadius: radius.lg,
        borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
        borderColor: selected ? c.ember : c.border,
        backgroundColor: pressed ? c.accent : c.card,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <Glyph name={glyph} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.foreground, fontSize: 16, fontWeight: "600" }}>{title}</Text>
        {!!body && <Text style={{ color: c.mutedForeground, fontSize: 14, lineHeight: 19, marginTop: 2 }}>{body}</Text>}
      </View>
    </Pressable>
  );
}
