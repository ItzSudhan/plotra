import { Pressable, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { useMenu } from "@/components/menu";
import { radius, space, useColors } from "@/lib/theme";
import type { Release } from "@/lib/types";

// The project's "as of" a release, shown and changed from a view. It's the
// same setting the binder has (lib/use-horizon.ts), so changing it here
// changes it there too.

export function AsOfChip({ releases, release, setAsOf, hint }: { releases: Release[]; release: Release | null; setAsOf: (id: string | null) => void; hint: string }) {
  const c = useColors();
  const showMenu = useMenu();
  if (!releases.length) return null;
  const open = () =>
    showMenu({
      title: "Show the project as of…",
      message: hint,
      items: [{ label: "Everything", icon: "globe", onPress: () => setAsOf(null) }, ...releases.map((r) => ({ label: r.title, icon: "book" as const, onPress: () => setAsOf(r.id) }))],
    });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`As of ${release?.title ?? "everything"}. Change`}
      onPress={open}
      style={({ pressed }) => ({ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: space.lg, marginTop: space.md, paddingHorizontal: space.md, height: 34, borderRadius: radius.pill, backgroundColor: release ? c.emberSoft : c.muted, opacity: pressed ? 0.7 : 1 })}
    >
      <Icon name="book" size={14} color={release ? c.emberInk : c.mutedForeground} />
      <Text style={{ color: release ? c.emberInk : c.mutedForeground, fontSize: 14 }}>{release ? `As of ${release.title}` : "Everything, no spoiler limit"}</Text>
      <Icon name="chevronDown" size={11} color={release ? c.emberInk : c.mutedForeground} />
    </Pressable>
  );
}

/** A coloured dot: a thread's, a lane's, a label's. */
export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <View accessible={false} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}
