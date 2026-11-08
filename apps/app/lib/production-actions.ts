"use server";

import { schema } from "@plotra/db";
import { lineStatuses, type LineStatus } from "@plotra/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import * as Y from "yjs";
import { requireNodeAccess, requireProjectAccess } from "./access";
import { listNodes } from "./binder";
import { canvasMaps, type CardData } from "./canvas";
import { requireSession } from "./data";
import { userDb } from "./db";
import { rateLimit } from "./rate-limit";
import { breakdown, scriptLines, shotList, type BreakdownScene, type ScriptLine, type ScriptSection, type Shot } from "./production";
import { readOnly, transaction } from "./request-cache";
import { isScriptElement } from "./script";
import { flatten, indexNodes } from "./tree";
import { getManuscript } from "./workflow-actions";

// Production (plan.md 2.8 "Module: Production"): the breakdown report, the
// recording sheet and shot lists, read from scripts and storyboards as last
// synced. The only thing stored here is the recording state of each line.

const { node, lineState } = schema;

// A session ticks off hundreds of lines; this only stops a runaway client.
const LINE_STATE_LIMIT = { limit: 3000, windowSeconds: 3600 };
const MAX_NOTE = 1000;

/** The script's documents: scenes in a script format, and anything else written with script elements. */
async function scriptSections(projectId: string, rootId: string | null): Promise<ScriptSection[]> {
  const sections = await getManuscript(projectId, rootId);
  return sections
    .filter((s) => s.format !== "prose" || s.value.some((b) => isScriptElement(b.type)))
    .map((s) => ({ id: s.id, title: s.title, kind: s.kind, value: s.value }));
}

/** The breakdown of the script under a folder (null = the whole project), scene by scene. */
export async function getBreakdown(projectId: string, rootId: string | null): Promise<BreakdownScene[]> {
  return readOnly(async () => breakdown(await scriptSections(projectId, rootId)));
}

export type LineStateRow = { nodeId: string; blockId: string; status: LineStatus; note: string | null };
export type RecordingSheet = { lines: ScriptLine[]; states: LineStateRow[] };

/** Every line of dialogue under a folder, with its recording state. */
export async function getRecordingSheet(projectId: string, rootId: string | null): Promise<RecordingSheet> {
  return readOnly(async () => {
    const lines = scriptLines(await scriptSections(projectId, rootId));
    const nodeIds = [...new Set(lines.map((l) => l.nodeId))];
    const states = nodeIds.length
      ? await userDb((tx) =>
          tx
            .select({ nodeId: lineState.nodeId, blockId: lineState.blockId, status: lineState.status, note: lineState.note })
            .from(lineState)
            .where(and(eq(lineState.projectId, projectId), inArray(lineState.nodeId, nodeIds))),
        )
      : [];
    return { lines, states };
  });
}

/**
 * Marks a line as written, approved or recorded, with notes for the actor or
 * director. Needs `comment` on the script, not `edit`: the person running the
 * session often can't change the words. For the same reason an editorial
 * lock doesn't stop it: a locked note can still be commented on.
 */
export async function setLineState(
  projectId: string,
  nodeId: string,
  blockId: string,
  patch: { status?: LineStatus; note?: string | null },
): Promise<LineStateRow> {
  return transaction(async () => {
    const { user } = await requireSession();
    await requireNodeAccess(projectId, nodeId, "comment");
    if (patch.status !== undefined && !lineStatuses.includes(patch.status)) throw new Error("Unknown status.");
    if (patch.note !== undefined && patch.note !== null && typeof patch.note !== "string") throw new Error("Notes are text.");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(blockId)) throw new Error("Unknown line.");
    await rateLimit("line-state", user.id, LINE_STATE_LIMIT);
    const note = patch.note === undefined ? undefined : patch.note?.trim().slice(0, MAX_NOTE) || null;
    const [row] = await userDb((tx) =>
      tx
        .insert(lineState)
        .values({ projectId, nodeId, blockId, status: patch.status ?? "written", note: note ?? null, updatedById: user.id })
        .onConflictDoUpdate({
          target: [lineState.nodeId, lineState.blockId],
          set: { ...(patch.status !== undefined && { status: patch.status }), ...(note !== undefined && { note }), updatedById: user.id, updatedAt: new Date() },
        })
        .returning({ nodeId: lineState.nodeId, blockId: lineState.blockId, status: lineState.status, note: lineState.note }),
    );
    return row;
  });
}

export type Storyboard = { nodeId: string; title: string; shots: Shot[] };

/** The shot list of every storyboard canvas in the project that has shots. */
export async function getShotLists(projectId: string): Promise<Storyboard[]> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    // The binder as the user sees it: no canvases they can't read, none in the trash.
    const live = new Set(flatten(indexNodes(await listNodes(projectId))).map((n) => n.id));
    const rows = await userDb((tx) =>
      tx
        .select({ id: node.id, title: node.title, ydoc: node.ydoc })
        .from(node)
        .where(and(eq(node.projectId, projectId), eq(node.kind, "canvas"))),
    );
    const boards: Storyboard[] = [];
    for (const row of rows) {
      if (!live.has(row.id) || !row.ydoc?.length) continue;
      const doc = new Y.Doc();
      Y.applyUpdate(doc, row.ydoc);
      const shots = shotList(canvasMaps(doc).cards.toJSON() as Record<string, CardData>);
      doc.destroy();
      if (shots.length) boards.push({ nodeId: row.id, title: row.title, shots });
    }
    return boards.sort((a, b) => a.title.localeCompare(b.title));
  });
}
