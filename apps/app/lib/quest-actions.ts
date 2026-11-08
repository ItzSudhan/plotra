"use server";

import { schema } from "@plotra/db";
import { eq, sql, type SQL } from "drizzle-orm";
import { requireNodeAccess } from "./access";
import { binderColumns, withActions, type BinderNode } from "./binder";
import { requireSession } from "./data";
import { userDb } from "./db";
import { assertUnlocked } from "./editorial-guard";
import { cleanDone, QUEST_DONE_KEY, QUEST_STATE_KEY, QUEST_STATES, storedQuestState, type QuestState } from "./interactive/quests";
import { rateLimit } from "./rate-limit";
import { transaction } from "./request-cache";

// Quest progress (plan.md 2.8 "Quest/mission designer"): a quest's state and
// which of its objectives are ticked off. Kept in the quest's properties, so
// it travels with the page; written here rather than through
// setNodeProperties so it works even if the State field was taken off the
// Quest type, and the ticks don't need a field of their own.

const { node, entityType } = schema;

/** Ticking objectives off during a session is quick work; this only stops scripts. */
const PROGRESS_LIMIT = { limit: 600, windowSeconds: 600 };

/** Sets a quest's state and/or its ticked objectives. Leaving one out keeps it as it is. */
export async function setQuestProgress(projectId: string, nodeId: string, input: { state?: QuestState; done?: string[] }): Promise<BinderNode> {
  return transaction(async () => {
    const { user } = await requireSession();
    await requireNodeAccess(projectId, nodeId, "edit");
    // A quest's properties are part of what a locked stage freezes.
    await assertUnlocked(projectId, nodeId);
    if (input.state !== undefined && !QUEST_STATES.some((s) => s.id === input.state)) throw new Error("That isn't a quest state.");
    await rateLimit("quest-progress", user.id, PROGRESS_LIMIT);

    const updated = await userDb(async (tx) => {
      const [current] = await tx
        .select({ builtin: entityType.builtin })
        .from(node)
        .leftJoin(entityType, eq(entityType.id, node.entityTypeId))
        .where(eq(node.id, nodeId));
      if (!current || current.builtin !== "quest") throw new Error("That note isn't a quest.");
      // Only these two keys change, merged in SQL, so an edit to another property at the same moment isn't lost.
      const set: Record<string, string | string[]> = {};
      const clear: string[] = [];
      if (input.state !== undefined) {
        const stored = storedQuestState(input.state);
        if (stored === null) clear.push(QUEST_STATE_KEY);
        else set[QUEST_STATE_KEY] = stored;
      }
      if (input.done !== undefined) {
        const done = cleanDone(input.done);
        if (done.length) set[QUEST_DONE_KEY] = done;
        else clear.push(QUEST_DONE_KEY);
      }
      let properties: SQL = sql`${node.properties}`;
      for (const key of clear) properties = sql`(${properties} - ${key}::text)`;
      properties = sql`(${properties} || ${JSON.stringify(set)}::jsonb)`;
      const [row] = await tx.update(node).set({ properties }).where(eq(node.id, nodeId)).returning(binderColumns);
      return row;
    });
    const [visible] = await withActions(projectId, [updated]);
    if (!visible) throw new Error("That quest is no longer visible to you.");
    return visible;
  });
}
