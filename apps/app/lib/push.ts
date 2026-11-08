import "server-only";
import { db, schema } from "@plotra/db";
import type { PushPlatform } from "@plotra/db/schema";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { after } from "next/server";
import { userDb } from "./db";
import { isLocalMode } from "./local-mode";
import { chunks, EXPO_PUSH_URL, goneTokens, messagesFor, type ExpoMessage, type PushNotice } from "./push-message";

// Push notifications to the phone app, through Expo's push service. When
// lib/notify.ts writes notifications, `pushLater` sends each recipient's
// phones the bell's sentence once the response has gone: a push that fails is
// logged and forgotten, never the action's problem. The phones themselves are
// rows of `push_device` (app/api/mobile/push), one per Expo push token, tied to
// the phone app's API token so signing out or revoking it removes the phone.

const { apiToken, notification, project, pushDevice, userPref } = schema;

/** Expo answers in well under a second; past this it's not worth holding the function open. */
const SEND_TIMEOUT_MS = 10_000;

// ---- Devices ---------------------------------------------------------------------

/**
 * Remembers this phone for the person behind `tokenId`. The server's own
 * connection, because a phone can change hands: whoever signs in on it last
 * gets its notifications, and the previous person's row goes.
 */
export async function registerDevice(userId: string, tokenId: string, expoToken: string, platform: PushPlatform): Promise<void> {
  await db
    .insert(pushDevice)
    .values({ userId, tokenId, expoToken, platform })
    .onConflictDoUpdate({ target: pushDevice.expoToken, set: { userId, tokenId, platform, lastSeenAt: new Date() } });
}

/** Forgets this phone (or, with no token, every phone signed in with `tokenId`). Only the caller's own. */
export async function unregisterDevice(userId: string, tokenId: string, expoToken: string | null): Promise<void> {
  await db
    .delete(pushDevice)
    .where(and(eq(pushDevice.userId, userId), expoToken ? eq(pushDevice.expoToken, expoToken) : eq(pushDevice.tokenId, tokenId)));
}

/** Whether the signed-in person wants pushes at all. No row means yes. */
export async function getPushPreference(userId: string): Promise<boolean> {
  const [row] = await userDb((tx) => tx.select({ on: userPref.pushNotifications }).from(userPref).where(eq(userPref.userId, userId)).limit(1));
  return row?.on ?? true;
}

export async function setPushPreference(userId: string, on: boolean): Promise<void> {
  await userDb((tx) =>
    tx
      .insert(userPref)
      .values({ userId, pushNotifications: on })
      .onConflictDoUpdate({ target: userPref.userId, set: { pushNotifications: on, updatedAt: new Date() } }),
  );
}

// ---- Sending ---------------------------------------------------------------------

/** After the response: pushes the notifications `ids` to their recipients' phones. Never throws. */
export function pushLater(ids: string[]): void {
  if (isLocalMode || !ids.length) return;
  try {
    after(async () => {
      try {
        await pushNow(ids);
      } catch (error) {
        console.error("[plotra] couldn't push a notification", error);
      }
    });
  } catch {
    // Not inside a request (a script, a test): there's nobody waiting for a push.
  }
}

async function pushNow(ids: string[]): Promise<void> {
  // Only rows that committed are found: an action that failed sends nothing.
  const notices: PushNotice[] = await db
    .select({
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      projectId: notification.projectId,
      nodeId: notification.nodeId,
      payload: notification.payload,
      actorName: sql<string | null>`(select a.name from "user" a where a.id = ${notification.actorId})`,
      projectTitle: project.title,
    })
    .from(notification)
    .leftJoin(project, eq(project.id, notification.projectId))
    .leftJoin(userPref, eq(userPref.userId, notification.userId))
    // Someone who turned phone notifications off gets none; no preference row means on.
    .where(and(inArray(notification.id, ids), isNull(notification.readAt), sql`coalesce(${userPref.pushNotifications}, true)`));
  if (!notices.length) return;

  const people = [...new Set(notices.map((n) => n.userId))];
  const [devices, unread] = await Promise.all([
    db
      .select({ userId: pushDevice.userId, expoToken: pushDevice.expoToken })
      .from(pushDevice)
      // A token that has expired can't open anything the push points at; skip its phone.
      .innerJoin(apiToken, eq(apiToken.id, pushDevice.tokenId))
      .where(and(inArray(pushDevice.userId, people), sql`(${apiToken.expiresAt} is null or ${apiToken.expiresAt} > now())`)),
    db
      .select({ userId: notification.userId, n: count() })
      .from(notification)
      .where(and(inArray(notification.userId, people), isNull(notification.readAt)))
      .groupBy(notification.userId),
  ]);
  if (!devices.length) return;

  const phones = new Map<string, string[]>();
  for (const d of devices) phones.set(d.userId, [...(phones.get(d.userId) ?? []), d.expoToken]);
  const badge = new Map(unread.map((u) => [u.userId, Number(u.n)]));
  const messages = notices.flatMap((n) => messagesFor(n, phones.get(n.userId) ?? [], badge.get(n.userId)));
  await sendToExpo(messages);
}

/** Sends in batches of 100 and forgets the phones Expo says are gone. */
export async function sendToExpo(messages: ExpoMessage[]): Promise<void> {
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  for (const batch of chunks(messages)) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          ...(accessToken && { authorization: `Bearer ${accessToken}` }),
        },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      const answer: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        console.error(`[plotra] Expo turned down ${batch.length} push(es): ${response.status}`, answer);
        continue;
      }
      const gone = goneTokens(batch, answer);
      if (gone.length) await db.delete(pushDevice).where(inArray(pushDevice.expoToken, gone));
    } catch (error) {
      console.error("[plotra] couldn't reach Expo's push service", error);
    }
  }
}
