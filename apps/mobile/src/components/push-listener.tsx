import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { invalidate, keys, useResource } from "@/lib/cache";
import { openPush, registerPush, setBadge, type PushData } from "@/lib/push";
import { startSearchFreshness } from "@/lib/search-freshness";
import { useClient } from "@/lib/session";

// Everything that runs in the background while someone is signed in: pushes
// that arrive or are tapped, the app icon's badge, and keeping offline search
// fresh. Draws nothing. Mounted beside the navigator in app/_layout.tsx.

// A tapped push opens once, even if the effect runs again (a new client after signing in).
let opened: string | null = null;

export function PushListener() {
  const client = useClient();
  const { data } = useResource(keys.notifications, client.notifications);
  const unread = data?.unread;

  // The badge on the app icon is the Inbox's unread count.
  useEffect(() => {
    if (unread !== undefined) void setBadge(unread);
  }, [unread]);

  useEffect(() => {
    // Only a phone already allowed is registered here; asking happens in Inbox or Account.
    void registerPush(client).catch(() => {});

    const open = (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (opened === id) return;
      opened = id;
      const push = (response.notification.request.content.data ?? {}) as PushData;
      if (push.notificationId) void client.markRead(push.notificationId).then(() => invalidate(keys.notifications), () => {});
      openPush(push);
    };

    // Tapped while the app was closed: it opens with that one.
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      // Let the navigator settle on its first screen before going somewhere else.
      setTimeout(() => {
        open(last);
        Notifications.clearLastNotificationResponse();
      }, 0);
    }

    const received = Notifications.addNotificationReceivedListener(() => invalidate(keys.notifications));
    const tapped = Notifications.addNotificationResponseReceivedListener(open);
    const stopFreshness = startSearchFreshness(client);
    return () => {
      received.remove();
      tapped.remove();
      stopFreshness();
    };
  }, [client]);

  return null;
}
