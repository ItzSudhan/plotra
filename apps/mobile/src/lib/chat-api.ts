import type { Client } from "./api";

// The project's chat and each note's, through /api/mobile/chat (the server
// wraps apps/app/lib/chat-actions.ts). Messages come oldest first, a hundred
// at a time; `before` pages back. Talk is for commenters and editors.

export type ChatMessage = { id: string; authorId: string | null; body: string; createdAt: string; mine: boolean };
export type ChatPerson = { id: string; name: string; image: string | null; guest: boolean };
export type ChatView = { messages: ChatMessage[]; people: ChatPerson[]; canTalk: boolean; canManage: boolean };

/** How many messages one page brings: fewer means there are no older ones. */
export const CHAT_PAGE = 100;

const base = (projectId: string, noteId: string | null, extra: Record<string, string> = {}) =>
  `/api/mobile/chat?${new URLSearchParams({ project: projectId, ...(noteId && { note: noteId }), ...extra })}`;

export const loadChat = (client: Client, projectId: string, noteId: string | null, before?: string) => client.request<ChatView>(base(projectId, noteId, before ? { before } : {}));

export const sendChat = (client: Client, projectId: string, noteId: string | null, body: string) =>
  client.request<{ message: ChatMessage }>(base(projectId, noteId), { method: "POST", body: { action: "send", body } }).then((r) => r.message);

export const deleteChat = (client: Client, projectId: string, noteId: string | null, messageId: string) =>
  client.request<{ ok: true }>(base(projectId, noteId), { method: "POST", body: { action: "delete", messageId } });

/** What open chats listen for (apps/app/lib/chat.ts chatNotice): the project's chat, or a note's. */
export const chatNotice = (noteId: string | null) => `chat:${noteId ?? "project"}`;

/** The chat screen: the project's, or a note's. */
export const chatRoute = (projectId: string, noteId?: string | null, title?: string) =>
  ({ pathname: "/project/[projectId]/chat", params: { projectId, ...(noteId && { note: noteId }), ...(title && { title }) } }) as const;

/** Older messages put in front of the latest, without repeats, oldest first. */
export function mergeMessages(older: ChatMessage[], latest: ChatMessage[]): ChatMessage[] {
  const seen = new Set(latest.map((m) => m.id));
  return [...older.filter((m) => !seen.has(m.id)), ...latest].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Messages a few minutes apart from the same person sit under one name, as on the web. */
export function joinsPrevious(message: ChatMessage, before: ChatMessage | undefined): boolean {
  return !!before && before.authorId === message.authorId && Date.parse(message.createdAt) - Date.parse(before.createdAt) < 3 * 60_000;
}
