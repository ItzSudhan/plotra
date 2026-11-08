import { NativeTabs } from "expo-router/native-tabs";
import { md, sf } from "@/components/icon";
import { keys, useResource } from "@/lib/cache";
import { useClient } from "@/lib/session";
import { useColors } from "@/lib/theme";

export default function TabsLayout() {
  const c = useColors();
  const client = useClient();
  // For the badge on Inbox. The Inbox screen keeps it fresh.
  const { data } = useResource(keys.notifications, client.notifications);
  const unread = data?.unread ?? 0;

  return (
    <NativeTabs backgroundColor={c.background} indicatorColor={c.accent} iconColor={{ default: c.mutedForeground, selected: c.foreground }} labelStyle={{ selected: { color: c.foreground } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={sf("home")} md={md("home")} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search">
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={sf("search")} md={md("search")} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="inbox">
        <NativeTabs.Trigger.Label>Inbox</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={sf("bell")} md={md("bell")} />
        {unread > 0 && <NativeTabs.Trigger.Badge>{unread > 99 ? "99+" : String(unread)}</NativeTabs.Trigger.Badge>}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>Account</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={sf("account")} md={md("account")} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
