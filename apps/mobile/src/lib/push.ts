import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";
import type { Client } from "./api";
import { targetOf, type PushData } from "./push-target";

// Push notifications (the server's side is apps/app/lib/push.ts). The phone
// asks for permission only when the person says so (the card in Inbox, the
// switch in Account), then hands its Expo push token to the server, which
// sends the bell's sentences to it. Tapping one opens what it's about.

const TOKEN_KEY = "plotra.pushToken";
const PROMPT_KEY = "plotra.pushPrompt";
export const CHANNEL_ID = "default";

export { targetOf, type PushData };

/**
 * - `on`: this phone is registered.
 * - `ask`: nobody has been asked yet.
 * - `denied`: turned off in the phone's settings; only the person can turn it back on there.
 * - `unavailable`: a simulator, or a build without an EAS project id (see the README).
 */
export type PushStatus = "on" | "ask" | "denied" | "unavailable";

// While the app is open, a push still shows as a banner (and lands in the list), quietly.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
});

/** The EAS project id Expo's push service needs, from `eas init`. Missing in a plain local build. */
export function easProjectId(): string | null {
  const fromConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return fromConfig ?? Constants.easConfig?.projectId ?? null;
}

const canPush = () => Device.isDevice && Platform.OS !== "web" && !!easProjectId();

/** Android 13 and later ask for permission only once a channel exists, so make it first. */
async function ensureChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Mentions, replies and shares",
    importance: AndroidImportance.HIGH,
    lightColor: "#e2602a",
  }).catch(() => null);
}

/** Where things stand on this phone, without asking anything. */
export async function pushStatus(): Promise<PushStatus> {
  if (!canPush()) return "unavailable";
  const permission = await Notifications.getPermissionsAsync().catch(() => null);
  if (!permission) return "unavailable";
  if (permission.granted) return "on";
  return permission.canAskAgain ? "ask" : "denied";
}

/**
 * Registers this phone with the server. With `ask`, shows the system's
 * permission prompt if it hasn't been answered yet; without, only phones
 * already allowed are registered (on each launch, so a new token reaches the server).
 */
export async function registerPush(client: Client, { ask = false } = {}): Promise<PushStatus> {
  const projectId = easProjectId();
  if (!canPush() || !projectId) return "unavailable";
  await ensureChannel();
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && ask && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return permission.canAskAgain ? "ask" : "denied";
  const { data: expoToken } = await Notifications.getExpoPushTokenAsync({ projectId });
  await client.request("/api/mobile/push", { method: "POST", body: { expoToken, platform: Platform.OS === "ios" ? "ios" : "android" } });
  await AsyncStorage.setItem(TOKEN_KEY, expoToken).catch(() => {});
  return "on";
}

/** Signing out: the server forgets this phone, and the icon's badge goes. Never throws. */
export async function unregisterPush(client: Client): Promise<void> {
  const expoToken = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
  await Notifications.setBadgeCountAsync(0).catch(() => {});
  if (!expoToken) return;
  // Revoking the token removes the phone on the server too; this is for when that call can't be made.
  await client.request("/api/mobile/push", { method: "DELETE", body: { expoToken } }).catch(() => {});
}

/** Whether the person wants phone notifications at all (every phone of theirs), and changing it. */
export const pushPreference = (client: Client) => client.request<{ enabled: boolean }>("/api/mobile/push").then((r) => r.enabled);
export const setPushPreference = (client: Client, enabled: boolean) => client.request("/api/mobile/push", { method: "PATCH", body: { enabled } });

/** The Inbox card, once closed, stays closed. */
export const promptDismissed = async () => (await AsyncStorage.getItem(PROMPT_KEY).catch(() => null)) === "closed";
export const dismissPrompt = () => AsyncStorage.setItem(PROMPT_KEY, "closed").catch(() => {});

export async function setBadge(unread: number) {
  await Notifications.setBadgeCountAsync(Math.max(0, unread)).catch(() => {});
}

export const openPush = (data: PushData) => router.push(targetOf(data));
