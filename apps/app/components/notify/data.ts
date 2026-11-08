"use client";

import { sharedResource } from "@/components/workflow/data";
import type { Notifications, UserPrefs } from "@/lib/notify-actions";
import { read } from "@/lib/read";

// Client copies of what the bell and the goals show. Both belong to the person,
// not the project, so one copy serves every part of the shell.

const useNotificationsResource = sharedResource<Notifications>();
const usePrefsResource = sharedResource<UserPrefs>();

/** Announced after you change your own goals, so the status bar and the Stats view agree. */
export const PREFS_NOTICE = "prefs";

/** Your notifications. Refetched every half minute, and when you come back to the tab. */
export function useNotifications() {
  return useNotificationsResource("me", () => read("listNotifications"), null);
}

/** Your email preference and writing goals. */
export function usePrefs() {
  return usePrefsResource("me", () => read("getUserPrefs"), PREFS_NOTICE);
}
