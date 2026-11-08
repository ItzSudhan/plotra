import type { Href } from "expo-router";

// Where a notification leads, for a tapped push and for Inbox's rows. Pure, so it's tested (tests/push-target.test.ts).

/** What the server puts in a push (apps/app/lib/push-message.ts PushData). */
export type PushData = { notificationId?: string; projectId?: string | null; nodeId?: string | null; threadId?: string; chat?: boolean };

/**
 * Where a notification leads: the chat, a comment thread, the note, the
 * project, or Inbox. Shared by Inbox's rows and tapped pushes.
 */
export function targetOf(n: Omit<PushData, "notificationId">): Href {
  const p = n.projectId ? encodeURIComponent(n.projectId) : null;
  const note = n.nodeId ? encodeURIComponent(n.nodeId) : null;
  // The chat and comments screens are paths of their own (app/project/[projectId]/chat, …/comments/[noteId]).
  if (p && n.chat) return `/project/${p}/chat${n.nodeId ? `?${new URLSearchParams({ note: n.nodeId })}` : ""}` as Href;
  if (p && note && n.threadId) return `/project/${p}/comments/${note}?thread=${encodeURIComponent(n.threadId)}` as Href;
  if (p && note) return `/project/${p}/note/${note}` as Href;
  if (p) return `/project/${p}` as Href;
  return "/inbox" as Href;
}

