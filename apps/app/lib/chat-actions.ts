"use server";

import { schema } from "@plotra/db";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { requireNodeAccess, requireProjectAccess } from "./access";
import { requireSession } from "./data";
import { userDb } from "./db";
import { mentionedIn, notify, titleOf } from "./notify";
import { rateLimit } from "./rate-limit";
import { readOnly, transaction } from "./request-cache";

// Chat beside the page (beat-the-competitors.md step 8): the whole project's
// conversation, and one for each note, apart from comments, which are about
// the words they're anchored to. Anyone who can comment can talk; anyone who
// can read the project (or, for a note's chat, that note) can read along.
// New messages are announced to everyone in the project through presence
// (components/workflow/chat-panel.tsx), so open chats refresh at once.

const { chatMessage } = schema;

const MAX_MESSAGE = 4000;
const PAGE = 100;
// A burst of quick lines is normal in a chat; a flood isn't.
const CHAT_LIMIT = { limit: 120, windowSeconds: 600 };

export type ChatMessageRow = { id: string; nodeId: string | null; authorId: string | null; body: string; createdAt: Date };

/** Who may read a chat: the project's, or a note's (which also needs that note). */
async function readAccess(projectId: string, nodeId: string | null, action: "read" | "comment" = "read") {
  return nodeId ? requireNodeAccess(projectId, nodeId, action) : requireProjectAccess(projectId, action);
}

/** The latest messages of a chat, oldest first; `before` (an ISO time) pages further back. */
export async function listChat(projectId: string, nodeId: string | null, before?: string): Promise<ChatMessageRow[]> {
  return readOnly(async () => {
    await readAccess(projectId, nodeId);
    const until = before ? new Date(before) : null;
    const rows = await userDb((tx) =>
      tx
        .select({ id: chatMessage.id, nodeId: chatMessage.nodeId, authorId: chatMessage.authorId, body: chatMessage.body, createdAt: chatMessage.createdAt })
        .from(chatMessage)
        .where(
          and(
            eq(chatMessage.projectId, projectId),
            nodeId ? eq(chatMessage.nodeId, nodeId) : isNull(chatMessage.nodeId),
            ...(until && !Number.isNaN(until.getTime()) ? [lt(chatMessage.createdAt, until)] : []),
          ),
        )
        .orderBy(desc(chatMessage.createdAt))
        .limit(PAGE),
    );
    return rows.reverse();
  });
}

/** Posts to a chat. "@Name" tells that person. */
export async function sendChat(projectId: string, nodeId: string | null, body: string): Promise<ChatMessageRow> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    const { project } = await readAccess(projectId, nodeId, "comment");
    await rateLimit("chat", me.id, CHAT_LIMIT);
    const clean = body.trim().slice(0, MAX_MESSAGE);
    if (!clean) throw new Error("Write something first.");
    const [row] = await userDb((tx) =>
      tx
        .insert(chatMessage)
        .values({ projectId, nodeId, authorId: me.id, body: clean })
        .returning({ id: chatMessage.id, nodeId: chatMessage.nodeId, authorId: chatMessage.authorId, body: chatMessage.body, createdAt: chatMessage.createdAt }),
    );
    // Names, never words: the notification says who and where, the chat says the rest.
    const mentioned = await mentionedIn(projectId, project.organizationId, clean);
    if (mentioned.length) await notify(projectId, mentioned, "chat_mention", { nodeId, payload: { chat: true, ...(nodeId && { title: await titleOf(nodeId) }) } });
    return row;
  });
}

/** Deletes your own message, or anyone's for someone who manages the project. */
export async function deleteChatMessage(projectId: string, messageId: string): Promise<void> {
  return transaction(async () => {
    const { user: me } = await requireSession();
    const [row] = await userDb((tx) =>
      tx.select({ nodeId: chatMessage.nodeId, authorId: chatMessage.authorId }).from(chatMessage).where(and(eq(chatMessage.id, messageId), eq(chatMessage.projectId, projectId))),
    );
    if (!row) return;
    const access = await readAccess(projectId, row.nodeId);
    const manages = "access" in access ? access.access.actions.has("manage") : access.actions.has("manage");
    if (row.authorId !== me.id && !manages) throw new Error("You can only delete your own messages.");
    await userDb((tx) => tx.delete(chatMessage).where(eq(chatMessage.id, messageId)));
  });
}
