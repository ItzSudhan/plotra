import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Linking, Switch, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { Button, Card, Row, Separator, T } from "@/components/ui";
import { ago } from "@/lib/links";
import { dismissPrompt, promptDismissed, pushPreference, pushStatus, registerPush, setPushPreference, type PushStatus } from "@/lib/push";
import { oldestKept, refreshAll } from "@/lib/search-freshness";
import { useClient } from "@/lib/session";
import { radius, space, useColors } from "@/lib/theme";

// Settings that are about this phone: notifications, and the text kept for
// searching offline. Shown in Account; the Inbox shows the card that asks.

const askAgainInSettings = () =>
  Alert.alert("Notifications are off for Plotra", "Turn them on for Plotra in your phone's settings, then come back.", [
    { text: "Not now", style: "cancel" },
    { text: "Open settings", onPress: () => void Linking.openSettings() },
  ]);

/** "Get notified on this phone", at the top of Inbox, until it's answered or closed. */
export function PushPromptCard() {
  const c = useColors();
  const client = useClient();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void (async () => setShow((await pushStatus()) === "ask" && !(await promptDismissed())))();
    }, []),
  );

  if (!show) return null;

  const turnOn = async () => {
    setBusy(true);
    try {
      const status = await registerPush(client, { ask: true });
      if (status === "on") await setPushPreference(client, true).catch(() => {});
    } catch {
      Alert.alert("Couldn't turn on notifications", "Check your connection and try again from Account.");
    }
    setBusy(false);
    setShow(false);
  };

  const close = () => {
    void dismissPrompt();
    setShow(false);
  };

  return (
    <View style={{ marginHorizontal: space.lg, marginTop: space.md, padding: space.lg, gap: space.md, borderRadius: radius.lg, backgroundColor: c.emberSoft }}>
      <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
        <Icon name="bell" size={20} color={c.emberInk} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: c.foreground, fontSize: 16, fontWeight: "600" }}>Get notified on this phone</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 14, lineHeight: 20 }}>
            Hear about it when someone mentions you, replies to you, shares a project or asks for a review. You can turn it off any time in Account.
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button label="Turn on" busy={busy} onPress={() => void turnOn()} accessibilityHint="Your phone asks whether Plotra may send notifications" />
        <Button label="Not now" variant="secondary" onPress={close} />
      </View>
    </View>
  );
}

/** Account: phone notifications on or off, and keeping projects searchable offline. */
export function PhoneSettings() {
  const c = useColors();
  const client = useClient();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [wanted, setWanted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [kept, setKept] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void pushStatus().then(setStatus);
      void pushPreference(client).then(setWanted, () => {});
      void oldestKept().then(setKept);
    }, [client]),
  );

  const on = status === "on" && wanted !== false;

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) {
        const result = await registerPush(client, { ask: true });
        setStatus(result);
        if (result === "denied") askAgainInSettings();
        if (result === "on") {
          await setPushPreference(client, true);
          setWanted(true);
        }
      } else {
        await setPushPreference(client, false);
        setWanted(false);
      }
    } catch {
      Alert.alert("Couldn't change that", "Check your connection and try again.");
    }
    setBusy(false);
  };

  const refreshText = async () => {
    setRefreshing(true);
    await refreshAll(client, true);
    setKept(await oldestKept());
    setRefreshing(false);
  };

  const notifySubtitle =
    status === "unavailable"
      ? "Not available in this version of the app"
      : status === "denied"
        ? "Off in your phone's settings. Tap to open them."
        : on
          ? "Mentions, replies, shares and reviews, on all your phones"
          : "Off. Inbox still shows everything.";

  return (
    <>
      <Card style={{ marginHorizontal: space.lg }}>
        <Row
          icon="bell"
          title="Phone notifications"
          subtitle={notifySubtitle}
          onPress={status === "denied" ? askAgainInSettings : undefined}
          right={
            status === "unavailable" || status === null ? null : (
              <Switch
                value={on}
                disabled={busy}
                onValueChange={(v) => void toggle(v)}
                trackColor={{ true: c.ember, false: c.muted }}
                accessibilityLabel="Phone notifications"
                accessibilityHint={on ? "Stops notifications on your phones" : "Sends notifications to this phone"}
              />
            )
          }
        />
        <Separator inset={52} />
        <Row
          icon="sync"
          title="Keep projects searchable offline"
          subtitle={refreshing ? "Updating…" : kept ? `Updated: ${ago(kept)}. Tap to update now.` : "Not all kept yet. Tap to update now."}
          onPress={refreshing ? undefined : () => void refreshText()}
          accessibilityHint="Fetches the text of every project again, for Search when you're offline"
        />
      </Card>
      <T tone="muted" style={{ marginHorizontal: space.lg, marginTop: space.sm, fontSize: 13, lineHeight: 18 }}>
        Search can find words inside your notes with no connection. The text is kept fresh by itself; update it here before a trip.
      </T>
    </>
  );
}
