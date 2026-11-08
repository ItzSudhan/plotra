import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View, type ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space, useColors } from "@/lib/theme";
import { Title } from "./ui";

/** A tab's page: its title big at the top (as on iOS), actions beside it, pull to refresh. */
export function TabScreen({
  title,
  actions,
  children,
  refreshing,
  onRefresh,
  ...scroll
}: { title: string; actions?: ReactNode; children: ReactNode; refreshing?: boolean; onRefresh?: () => void } & Omit<ScrollViewProps, "children">) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: space.xxl * 2 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.mutedForeground} /> : undefined}
      {...scroll}
    >
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, minHeight: 48 }}>
        <View style={{ flex: 1 }}>
          <Title>{title}</Title>
        </View>
        {actions}
      </View>
      {children}
    </ScrollView>
  );
}
