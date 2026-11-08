import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { TabScreen } from "@/components/screen";
import { Banner, Empty, Loading, Separator } from "@/components/ui";
import { invalidate, keys, useResource } from "@/lib/cache";
import { ago } from "@/lib/links";
import { describe, happensOnWeb } from "@/lib/notify-text";
import { useClient } from "@/lib/session";
import { space, useColors } from "@/lib/theme";
import type { Notification } from "@/lib/types";

// Mentions, replies, shares and reviews, from every project.

export default function Inbox() {
  const c = useColors();
  const client = useClient();
  const list = useResource(keys.notifications, client.notifications);
  const { refresh, mutate } = list;

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const markRead = (id: string | null) => {
    mutate((current) =>
      current && {
        unread: id ? Math.max(0, current.unread - (current.items.some((n) => n.id === id && !n.readAt) ? 1 : 0)) : 0,
        items: current.items.map((n) => (!id || n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)),
      },
    );
    // Then everything showing the count (the tab's badge) asks again.
    void client
      .markRead(id)
      .then(() => invalidate(keys.notifications))
      .catch(() => {});
  };

  const open = (n: Notification) => {
    if (!n.readAt) markRead(n.id);
    if (n.projectId && n.nodeId) router.push({ pathname: "/project/[projectId]/note/[noteId]", params: { projectId: n.projectId, noteId: n.nodeId } });
    else if (n.projectId) router.push({ pathname: "/project/[projectId]", params: { projectId: n.projectId, title: n.projectTitle ?? "" } });
  };

  const unread = list.data?.unread ?? 0;

  return (
    <TabScreen
      title="Inbox"
      refreshing={list.refreshing}
      onRefresh={list.refresh}
      actions={
        unread > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => markRead(null)} hitSlop={8} style={{ padding: space.sm }}>
            <Text style={{ color: c.emberInk, fontSize: 15 }}>Mark all read</Text>
          </Pressable>
        ) : null
      }
    >
      <Banner offline={list.offline} error={list.offline ? null : list.error} onRetry={list.refresh} />
      {list.loading && !list.data ? (
        <Loading />
      ) : !list.data?.items.length ? (
        <Empty icon="bell" title="Nothing new" body="When someone mentions you, replies to you, shares a project or asks for a review, it shows up here." />
      ) : (
        <View style={{ marginTop: space.md }}>
          {list.data.items.map((n, i) => (
            <View key={n.id}>
              {i > 0 && <Separator />}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${n.readAt ? "" : "Unread. "}${describe(n)}`}
                onPress={() => open(n)}
                style={({ pressed }) => ({ flexDirection: "row", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: pressed ? c.accent : "transparent" })}
              >
                <View style={{ width: 8, paddingTop: 7 }}>{!n.readAt && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.ember }} />}</View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: c.foreground, fontSize: 15, lineHeight: 21, fontWeight: n.readAt ? "400" : "500" }}>{describe(n)}</Text>
                  <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
                    {ago(n.createdAt)}
                    {happensOnWeb(n.type) ? " · Reply on the web" : ""}
                  </Text>
                </View>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </TabScreen>
  );
}
