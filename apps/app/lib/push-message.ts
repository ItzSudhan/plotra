import type { NotificationPayload, NotificationType } from "@plotra/db/schema";
import { describe } from "./notify-text";

// What a push to a phone says, and what Expo's push service answers, kept
// apart from the sending (lib/push.ts) so it can be tested without a network
// or a database.

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Expo takes at most 100 messages a request. */
export const EXPO_BATCH = 100;

/** A notification just written, with what a push needs to describe it. */
export type PushNotice = {
  id: string;
  userId: string;
  type: NotificationType;
  projectId: string | null;
  nodeId: string | null;
  payload: NotificationPayload;
  actorName: string | null;
  projectTitle: string | null;
};

/** What the phone app reads when a push is tapped, to open the right screen (apps/mobile/src/lib/push.ts). */
export type PushData = { notificationId: string; projectId: string | null; nodeId: string | null; threadId?: string; chat?: boolean };

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: PushData;
  sound: "default";
  badge?: number;
  /** The Android channel the app makes (apps/mobile/src/lib/push.ts). */
  channelId: "default";
};

/** One message per phone: the bell's sentence, under the project's title, with the person's unread count for the app icon. */
export function messagesFor(notice: PushNotice, expoTokens: string[], unread?: number): ExpoMessage[] {
  const data: PushData = {
    notificationId: notice.id,
    projectId: notice.projectId,
    nodeId: notice.nodeId,
    ...(notice.payload.threadId && { threadId: notice.payload.threadId }),
    ...(notice.payload.chat && { chat: true }),
  };
  return expoTokens.map((to) => ({
    to,
    title: notice.projectTitle || "Plotra",
    body: describe(notice),
    data,
    sound: "default",
    ...(unread !== undefined && { badge: unread }),
    channelId: "default",
  }));
}

export function chunks<T>(items: T[], size = EXPO_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Ticket = { status?: string; message?: string; details?: { error?: string; expoPushToken?: string } };

/**
 * The phones Expo says are gone (the app was deleted, or notifications were
 * turned off for good), from its answer to `sent`. Tickets come back in the
 * order the messages went.
 */
export function goneTokens(sent: Pick<ExpoMessage, "to">[], answer: unknown): string[] {
  const tickets = (answer as { data?: unknown } | null)?.data;
  if (!Array.isArray(tickets)) return [];
  const gone = new Set<string>();
  tickets.forEach((ticket: Ticket, i) => {
    if (ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
      const token = ticket.details.expoPushToken ?? sent[i]?.to;
      if (token) gone.add(token);
    }
  });
  return [...gone];
}

/** An Expo push token, as the phone sends it. Anything else is turned away before it's stored. */
export const isExpoToken = (value: unknown): value is string =>
  typeof value === "string" && value.length < 200 && /^(Exponent|Expo)PushToken\[[^\]]+\]$/.test(value);
