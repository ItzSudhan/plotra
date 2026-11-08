"use server";

import { schema } from "@plotra/db";
import type { CalendarDefinition, NodeSettings } from "@plotra/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { getNodeAccess, requireNodeAccess, requireProjectAccess } from "./access";
import { cleanSheet, getBeatSheet, type BeatSheet } from "./beat-sheets";
import { binderColumns, withActions, type BinderNode } from "./binder";
import { cleanDefinition } from "./calendar";
import { requireSession } from "./data";
import { userDb } from "./db";
import { readOnly, transaction } from "./request-cache";
import { swatches } from "./story";
import { assertUnlocked } from "./editorial-guard";

// Story tools (plan.md 2.5, Phase 4): plot threads and the plot grid,
// character relationships, calendars, timeline events and board settings.
// Everything is filtered through the access policy like the binder: rows that
// point at notes the user can't see are left out.

const { node, plotThread, sceneThread, relationship, calendar, timelineEvent } = schema;

const MAX_NAME = 80;
const MAX_NOTE = 4000;
const COLOR = /^#[0-9a-f]{6}$/i;

const cleanName = (name: string, fallback: string) => name.trim().slice(0, MAX_NAME) || fallback;
const cleanColor = (color: string | null | undefined) => (color && COLOR.test(color) ? color : null);

export type PlotThread = { id: string; name: string; color: string; position: string; closedNodeId: string | null };
export type SceneThreadCell = { nodeId: string; threadId: string; note: string };
export type Relationship = { id: string; fromNodeId: string; toNodeId: string; type: string; label: string | null; directed: boolean };
export type CalendarRow = { id: string; name: string; definition: CalendarDefinition };
export type TimelineEvent = {
  id: string;
  nodeId: string | null;
  title: string;
  description: string | null;
  start: number;
  end: number | null;
  lane: string | null;
  color: string | null;
};

export type StoryData = {
  threads: PlotThread[];
  cells: SceneThreadCell[];
  relationships: Relationship[];
  calendars: CalendarRow[];
};

const threadColumns = {
  id: plotThread.id,
  name: plotThread.name,
  color: plotThread.color,
  position: plotThread.position,
  closedNodeId: plotThread.closedNodeId,
};
const relationshipColumns = {
  id: relationship.id,
  fromNodeId: relationship.fromNodeId,
  toNodeId: relationship.toNodeId,
  type: relationship.type,
  label: relationship.label,
  directed: relationship.directed,
};
const calendarColumns = { id: calendar.id, name: calendar.name, definition: calendar.definition };
const eventColumns = {
  id: timelineEvent.id,
  nodeId: timelineEvent.nodeId,
  title: timelineEvent.title,
  description: timelineEvent.description,
  start: timelineEvent.start,
  end: timelineEvent.end,
  lane: timelineEvent.lane,
  color: timelineEvent.color,
};

/** Project-wide story data: threads, plot grid cells, relationships and calendars. */
export async function getStory(projectId: string): Promise<StoryData> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    const access = await getNodeAccess(projectId);
    const [threads, cells, relationships, calendars] = await userDb((tx) =>
      Promise.all([
        tx.select(threadColumns).from(plotThread).where(eq(plotThread.projectId, projectId)),
        tx
          .select({ nodeId: sceneThread.nodeId, threadId: sceneThread.threadId, note: sceneThread.note })
          .from(sceneThread)
          .where(eq(sceneThread.projectId, projectId)),
        tx.select(relationshipColumns).from(relationship).where(eq(relationship.projectId, projectId)),
        tx.select(calendarColumns).from(calendar).where(eq(calendar.projectId, projectId)).orderBy(asc(calendar.name)),
      ]),
    );
    return {
      threads: threads
        .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0))
        .map((t) => (t.closedNodeId && !access.has(t.closedNodeId) ? { ...t, closedNodeId: null } : t)),
      cells: cells.filter((c) => access.has(c.nodeId)),
      relationships: relationships.filter((r) => access.has(r.fromNodeId) && access.has(r.toNodeId)),
      calendars,
    };
  });
}

// ---- Plot threads and the plot grid ----------------------------------------------

/** Adds a plot thread at the end. Without a name it's "Thread <n>". */
export async function createThread(projectId: string, input: { name?: string; color?: string }): Promise<PlotThread> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    return userDb(async (tx) => {
      const existing = await tx.select(threadColumns).from(plotThread).where(eq(plotThread.projectId, projectId));
      const last = existing.map((t) => t.position).sort().at(-1) ?? null;
      const used = existing.map((t) => t.color);
      const [row] = await tx
        .insert(plotThread)
        .values({
          projectId,
          name: cleanName(input.name ?? "", `Thread ${existing.length + 1}`),
          color: cleanColor(input.color) ?? swatches.find((c) => !used.includes(c)) ?? swatches[0],
          position: generateKeyBetween(last, null),
        })
        .returning(threadColumns);
      return row;
    });
  });
}

export async function updateThread(
  projectId: string,
  id: string,
  /** `closedNodeId`: the scene that resolves the thread (null reopens it). */
  patch: { name?: string; color?: string; position?: string; closedNodeId?: string | null },
): Promise<PlotThread> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    const values: Partial<typeof plotThread.$inferInsert> = {};
    if (patch.name !== undefined) values.name = cleanName(patch.name, "Untitled thread");
    if (patch.color !== undefined) values.color = cleanColor(patch.color) ?? swatches[0];
    if (patch.position !== undefined && patch.position && patch.position.length <= 256) values.position = patch.position;
    if (patch.closedNodeId !== undefined) {
      if (patch.closedNodeId) await requireNodeAccess(projectId, patch.closedNodeId);
      values.closedNodeId = patch.closedNodeId || null;
    }
    const [row] = await userDb((tx) =>
      tx
        .update(plotThread)
        .set(values)
        .where(and(eq(plotThread.id, id), eq(plotThread.projectId, projectId)))
        .returning(threadColumns),
    );
    if (!row) throw new Error("That thread no longer exists.");
    return row;
  });
}

export async function deleteThread(projectId: string, id: string): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    await userDb((tx) => tx.delete(plotThread).where(and(eq(plotThread.id, id), eq(plotThread.projectId, projectId))));
  });
}

/**
 * Sets a plot grid cell: what happens to a thread in a scene. An empty note
 * keeps the scene in the thread; `null` takes it out.
 */
export async function setSceneThread(projectId: string, nodeId: string, threadId: string, note: string | null): Promise<void> {
  return transaction(async () => {
    await requireNodeAccess(projectId, nodeId, "edit");
    await userDb(async (tx) => {
      const [thread] = await tx
        .select({ id: plotThread.id })
        .from(plotThread)
        .where(and(eq(plotThread.id, threadId), eq(plotThread.projectId, projectId)));
      if (!thread) throw new Error("That thread no longer exists.");
      if (note === null) {
        await tx.delete(sceneThread).where(and(eq(sceneThread.nodeId, nodeId), eq(sceneThread.threadId, threadId)));
        return;
      }
      const clean = note.slice(0, MAX_NOTE);
      await tx
        .insert(sceneThread)
        .values({ projectId, nodeId, threadId, note: clean })
        .onConflictDoUpdate({ target: [sceneThread.nodeId, sceneThread.threadId], set: { note: clean, updatedAt: new Date() } });
    });
  });
}

// ---- Relationships ---------------------------------------------------------------

export async function createRelationship(
  projectId: string,
  input: { fromNodeId: string; toNodeId: string; type: string; label?: string | null; directed?: boolean },
): Promise<Relationship> {
  return transaction(async () => {
    if (input.fromNodeId === input.toNodeId) throw new Error("A character can't have a relationship with themselves here.");
    await requireNodeAccess(projectId, input.fromNodeId, "edit");
    await requireNodeAccess(projectId, input.toNodeId, "read");
    const [row] = await userDb((tx) =>
      tx
        .insert(relationship)
        .values({
          projectId,
          fromNodeId: input.fromNodeId,
          toNodeId: input.toNodeId,
          type: cleanName(input.type, "related"),
          label: input.label?.trim().slice(0, MAX_NAME) || null,
          directed: Boolean(input.directed),
        })
        .returning(relationshipColumns),
    );
    return row;
  });
}

export async function updateRelationship(
  projectId: string,
  id: string,
  patch: { type?: string; label?: string | null; directed?: boolean; reverse?: boolean },
): Promise<Relationship> {
  return transaction(async () => {
    const [current] = await userDb((tx) =>
      tx.select(relationshipColumns).from(relationship).where(and(eq(relationship.id, id), eq(relationship.projectId, projectId))),
    );
    if (!current) throw new Error("That relationship no longer exists.");
    await requireNodeAccess(projectId, current.fromNodeId, "edit");
    await requireNodeAccess(projectId, current.toNodeId, patch.reverse ? "edit" : "read");
    const values: Partial<typeof relationship.$inferInsert> = {};
    if (patch.type !== undefined) values.type = cleanName(patch.type, current.type);
    if (patch.label !== undefined) values.label = patch.label?.trim().slice(0, MAX_NAME) || null;
    if (patch.directed !== undefined) values.directed = patch.directed;
    if (patch.reverse) {
      values.fromNodeId = current.toNodeId;
      values.toNodeId = current.fromNodeId;
    }
    const [row] = await userDb((tx) => tx.update(relationship).set(values).where(eq(relationship.id, id)).returning(relationshipColumns));
    return row;
  });
}

export async function deleteRelationship(projectId: string, id: string): Promise<void> {
  return transaction(async () => {
    const [current] = await userDb((tx) =>
      tx.select(relationshipColumns).from(relationship).where(and(eq(relationship.id, id), eq(relationship.projectId, projectId))),
    );
    if (!current) return;
    await requireNodeAccess(projectId, current.fromNodeId, "edit");
    await userDb((tx) => tx.delete(relationship).where(eq(relationship.id, id)));
  });
}

// ---- Calendars ----------------------------------------------------------------------

export async function saveCalendar(
  projectId: string,
  input: { id?: string; name: string; definition: CalendarDefinition },
): Promise<CalendarRow> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    const values = { name: cleanName(input.name, "Calendar"), definition: cleanDefinition(input.definition) };
    const [row] = await userDb((tx) =>
      input.id
        ? tx
            .update(calendar)
            .set(values)
            .where(and(eq(calendar.id, input.id), eq(calendar.projectId, projectId)))
            .returning(calendarColumns)
        : tx
            .insert(calendar)
            .values({ projectId, ...values })
            .returning(calendarColumns),
    );
    if (!row) throw new Error("That calendar no longer exists.");
    return row;
  });
}

export async function deleteCalendar(projectId: string, id: string): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    await userDb((tx) => tx.delete(calendar).where(and(eq(calendar.id, id), eq(calendar.projectId, projectId))));
  });
}

// ---- Timeline events -------------------------------------------------------------------

async function assertTimeline(projectId: string, timelineId: string, action: "read" | "edit") {
  await requireNodeAccess(projectId, timelineId, action);
  const [row] = await userDb((tx) => tx.select({ kind: node.kind }).from(node).where(eq(node.id, timelineId)));
  if (row?.kind !== "timeline") throw new Error("That isn't a timeline.");
}

/** Standalone events on a timeline. Links to notes the user can't see are dropped. */
export async function getTimelineEvents(projectId: string, timelineId: string): Promise<TimelineEvent[]> {
  return readOnly(async () => {
    await assertTimeline(projectId, timelineId, "read");
    const access = await getNodeAccess(projectId);
    const rows = await userDb((tx) =>
      tx.select(eventColumns).from(timelineEvent).where(eq(timelineEvent.timelineNodeId, timelineId)),
    );
    return rows.map((e) => (e.nodeId && !access.has(e.nodeId) ? { ...e, nodeId: null } : e));
  });
}

type EventInput = {
  title?: string;
  description?: string | null;
  start?: number;
  end?: number | null;
  lane?: string | null;
  color?: string | null;
  nodeId?: string | null;
};

function cleanEvent(input: EventInput): Partial<typeof timelineEvent.$inferInsert> {
  const values: Partial<typeof timelineEvent.$inferInsert> = {};
  if (input.title !== undefined) values.title = cleanName(input.title, "Event");
  if (input.description !== undefined) values.description = input.description?.slice(0, MAX_NOTE) || null;
  if (input.start !== undefined) {
    if (!Number.isFinite(input.start)) throw new Error("Invalid start.");
    values.start = input.start;
  }
  if (input.end !== undefined) values.end = input.end !== null && Number.isFinite(input.end) ? input.end : null;
  if (input.lane !== undefined) values.lane = input.lane?.slice(0, 80) || null;
  if (input.color !== undefined) values.color = cleanColor(input.color);
  return values;
}

export async function createTimelineEvent(projectId: string, timelineId: string, input: EventInput & { start: number }): Promise<TimelineEvent> {
  return transaction(async () => {
    await assertTimeline(projectId, timelineId, "edit");
    if (input.nodeId) await requireNodeAccess(projectId, input.nodeId);
    const values = cleanEvent(input);
    if (values.end !== undefined && values.end !== null && values.end < values.start!) values.end = null;
    const [row] = await userDb((tx) =>
      tx
        .insert(timelineEvent)
        .values({ projectId, timelineNodeId: timelineId, title: "Event", start: input.start, ...values, nodeId: input.nodeId || null })
        .returning(eventColumns),
    );
    return row;
  });
}

export async function updateTimelineEvent(projectId: string, timelineId: string, id: string, patch: EventInput): Promise<TimelineEvent> {
  return transaction(async () => {
    await assertTimeline(projectId, timelineId, "edit");
    const values = cleanEvent(patch);
    if (patch.nodeId !== undefined) {
      if (patch.nodeId) await requireNodeAccess(projectId, patch.nodeId);
      values.nodeId = patch.nodeId || null;
    }
    const [row] = await userDb((tx) =>
      tx
        .update(timelineEvent)
        .set(values)
        .where(and(eq(timelineEvent.id, id), eq(timelineEvent.timelineNodeId, timelineId)))
        .returning(eventColumns),
    );
    if (!row) throw new Error("That event no longer exists.");
    return row;
  });
}

export async function deleteTimelineEvent(projectId: string, timelineId: string, id: string): Promise<void> {
  return transaction(async () => {
    await assertTimeline(projectId, timelineId, "edit");
    await userDb((tx) => tx.delete(timelineEvent).where(and(eq(timelineEvent.id, id), eq(timelineEvent.timelineNodeId, timelineId))));
  });
}

// ---- Board settings and beat sheets ---------------------------------------------------------

/** Merges view settings (calendar, lanes, mode…) into a board node. Null removes a key. */
export async function setNodeSettings(projectId: string, nodeId: string, patch: NodeSettings): Promise<BinderNode> {
  return transaction(async () => {
    await requireNodeAccess(projectId, nodeId, "edit");
    // A board's settings are part of what a locked stage freezes (its calendar, its lanes, a script's format).
    await assertUnlocked(projectId, nodeId);
    const updated = await userDb(async (tx) => {
      const [current] = await tx.select({ settings: node.settings }).from(node).where(eq(node.id, nodeId));
      const next: NodeSettings = { ...current.settings };
      for (const [key, value] of Object.entries(patch).slice(0, 20)) {
        if (key.length > 40) continue;
        if (value === null) delete next[key];
        else if (["string", "number", "boolean"].includes(typeof value)) next[key] = typeof value === "string" ? value.slice(0, 200) : value;
      }
      const [row] = await tx.update(node).set({ settings: next }).where(eq(node.id, nodeId)).returning(binderColumns);
      return row;
    });
    const [visible] = await withActions(projectId, [updated]);
    if (!visible) throw new Error("That note is no longer visible to you.");
    return visible;
  });
}

/**
 * Builds a beat sheet in the binder: a folder, an act per chapter and a beat
 * per scene, each with a synopsis saying what the beat does.
 */
export async function applyBeatSheet(projectId: string, parentId: string | null, sheetOrId: string | BeatSheet, position: string): Promise<BinderNode[]> {
  return transaction(async () => {
    const { user } = await requireSession();
    // One of the built-in sheets by id, or one of the person's own, sent whole and cleaned here.
    const sheet = typeof sheetOrId === "string" ? getBeatSheet(sheetOrId) : cleanSheet(sheetOrId);
    if (!sheet) throw new Error("Unknown beat sheet.");
    if (!position || position.length > 256) throw new Error("Invalid position.");
    if (parentId) await requireNodeAccess(projectId, parentId, "edit");
    else await requireProjectAccess(projectId, "edit");

    const rows: Array<typeof node.$inferInsert> = [];
    const folderId = crypto.randomUUID();
    rows.push({ id: folderId, projectId, parentId, kind: "folder", title: sheet.title, position, synopsis: sheet.description, createdById: user.id });
    let actPos: string | null = null;
    for (const act of sheet.acts) {
      actPos = generateKeyBetween(actPos, null);
      const actId = crypto.randomUUID();
      rows.push({ id: actId, projectId, parentId: folderId, kind: "chapter", title: act.title, position: actPos, createdById: user.id });
      let beatPos: string | null = null;
      for (const beat of act.beats) {
        beatPos = generateKeyBetween(beatPos, null);
        rows.push({
          projectId,
          parentId: actId,
          kind: "scene",
          title: beat.title,
          position: beatPos,
          synopsis: `${beat.synopsis} (≈${beat.at}% in)`,
          createdById: user.id,
        });
      }
    }
    const inserted = await userDb((tx) => tx.insert(node).values(rows).returning(binderColumns));
    return withActions(projectId, inserted, true);
  });
}
