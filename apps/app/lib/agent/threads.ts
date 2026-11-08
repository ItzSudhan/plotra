import "server-only";
import { schema } from "@plotra/db";
import { withUser } from "@plotra/db/rls";
import { and, desc, eq, gte } from "drizzle-orm";
import type { AgentUIMessage, ThreadSummary } from "./types";

// Conversations with the agent (plan.md 3 "AI agent"): `agent_thread` and
// `agent_message`, in the AI SDK's UI-message shape, which is what `useChat`
// shows and what goes back to the model on the next turn. A thread belongs to
// the person who started it; row-level security shows it to nobody else.
//
// Everything takes the user id rather than reading the session: messages are
// saved after the response has started streaming.

const { agentMessage, agentThread } = schema;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How much of a long conversation goes back to the model and to the panel. */
const MAX_MESSAGES = 60;

/**
 * Makes sure the thread exists and is this user's, in this project. A new id
 * starts a new thread. An id that is someone else's thread, or a thread of
 * another project, is refused.
 */
export async function ensureThread(userId: string, projectId: string, threadId: string, title: string): Promise<"created" | "existing"> {
  if (!UUID.test(threadId)) throw new Error("That conversation doesn't exist.");
  return withUser(userId, async (tx) => {
    const [mine] = await tx.select({ projectId: agentThread.projectId }).from(agentThread).where(eq(agentThread.id, threadId)).limit(1);
    if (mine) {
      if (mine.projectId !== projectId) throw new Error("That conversation belongs to another project.");
      return "existing";
    }
    // Someone else's thread is invisible here; the insert then fails on its id, and nothing is created.
    const inserted = await tx.insert(agentThread).values({ id: threadId, projectId, userId, title }).onConflictDoNothing().returning({ id: agentThread.id });
    if (!inserted.length) throw new Error("That conversation doesn't exist.");
    return "created";
  });
}

type StoredMessage = Pick<AgentUIMessage, "id" | "role" | "parts" | "metadata">;

/** A thread's messages, oldest first: the last `MAX_MESSAGES` of a long one. Empty for a thread that isn't the user's. */
export async function loadMessages(userId: string, threadId: string): Promise<AgentUIMessage[]> {
  const rows = await withUser(userId, (tx) =>
    tx
      .select({ id: agentMessage.id, role: agentMessage.role, parts: agentMessage.parts, metadata: agentMessage.metadata })
      .from(agentMessage)
      .where(eq(agentMessage.threadId, threadId))
      .orderBy(desc(agentMessage.createdAt), desc(agentMessage.id))
      .limit(MAX_MESSAGES),
  );
  const messages = rows.reverse().map((row) => ({ id: row.id, role: row.role, parts: row.parts, ...(row.metadata ? { metadata: row.metadata } : {}) }) as AgentUIMessage);
  // A conversation sent to a model has to open with the user's turn.
  const first = messages.findIndex((m) => m.role === "user");
  return first > 0 ? messages.slice(first) : messages;
}

/** The newest message of a thread, or null: for a thread that is empty or isn't the user's. */
export async function lastMessage(userId: string, threadId: string): Promise<AgentUIMessage | null> {
  const [row] = await withUser(userId, (tx) =>
    tx
      .select({ id: agentMessage.id, role: agentMessage.role, parts: agentMessage.parts, metadata: agentMessage.metadata })
      .from(agentMessage)
      .where(eq(agentMessage.threadId, threadId))
      .orderBy(desc(agentMessage.createdAt), desc(agentMessage.id))
      .limit(1),
  );
  return row ? ({ id: row.id, role: row.role, parts: row.parts, ...(row.metadata ? { metadata: row.metadata } : {}) } as AgentUIMessage) : null;
}

/** Saves one message of the user's thread, replacing an earlier copy of it. */
export async function saveMessage(userId: string, projectId: string, threadId: string, message: StoredMessage): Promise<void> {
  const values = { role: message.role, parts: message.parts as unknown[], metadata: (message.metadata ?? null) as Record<string, unknown> | null };
  await withUser(userId, async (tx) => {
    await tx
      .insert(agentMessage)
      // The time is set here, not by the database's `now()`, which is when the transaction began:
      // messages are read back in this order, and each must sort after the one before it.
      .values({ id: message.id, projectId, threadId, ...values, createdAt: new Date() })
      // The same id is only ever the same message of the same thread: a streamed answer saved again when it ends.
      .onConflictDoUpdate({ target: agentMessage.id, set: values, setWhere: eq(agentMessage.threadId, threadId) });
    await tx.update(agentThread).set({ updatedAt: new Date() }).where(eq(agentThread.id, threadId));
  });
}

/** Drops a message and everything after it, for "try again". */
export async function truncateFrom(userId: string, threadId: string, messageId: string): Promise<void> {
  await withUser(userId, async (tx) => {
    const [from] = await tx
      .select({ createdAt: agentMessage.createdAt })
      .from(agentMessage)
      .where(and(eq(agentMessage.threadId, threadId), eq(agentMessage.id, messageId)))
      .limit(1);
    if (from) await tx.delete(agentMessage).where(and(eq(agentMessage.threadId, threadId), gte(agentMessage.createdAt, from.createdAt)));
  });
}

export async function listThreads(userId: string, projectId: string): Promise<ThreadSummary[]> {
  return withUser(userId, (tx) =>
    tx
      .select({ id: agentThread.id, title: agentThread.title, updatedAt: agentThread.updatedAt })
      .from(agentThread)
      .where(and(eq(agentThread.projectId, projectId), eq(agentThread.userId, userId)))
      .orderBy(desc(agentThread.updatedAt))
      .limit(100),
  );
}

export async function deleteThread(userId: string, projectId: string, threadId: string): Promise<void> {
  await withUser(userId, (tx) => tx.delete(agentThread).where(and(eq(agentThread.id, threadId), eq(agentThread.projectId, projectId), eq(agentThread.userId, userId))));
}

/** The messages of one of the user's threads in this project, for the panel. Empty when it isn't theirs. */
export async function threadMessages(userId: string, projectId: string, threadId: string): Promise<AgentUIMessage[]> {
  const [thread] = await withUser(userId, (tx) =>
    tx.select({ id: agentThread.id }).from(agentThread).where(and(eq(agentThread.id, threadId), eq(agentThread.projectId, projectId))).limit(1),
  );
  return thread ? loadMessages(userId, threadId) : [];
}
