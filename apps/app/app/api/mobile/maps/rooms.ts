import "server-only";
import { schema } from "@plotra/db";
import { eq } from "drizzle-orm";
import * as Y from "yjs";
import { requireNodeAccess } from "@/lib/access";
import { fetchRoomState, postRoomUpdate } from "@/lib/agent/collab-service";
import { ApiError } from "@/lib/api/handler";
import { listNodes } from "@/lib/binder";
import { canvasMaps, isMap, type CardData, type EdgeData, type MarkData } from "@/lib/canvas";
import { roomName } from "@/lib/collab/rooms";
import { syncRoomState } from "@/lib/collab/sync";
import { userDb } from "@/lib/db";
import { assertUnlocked } from "@/lib/editorial-guard";
import { dialogueGraph, type DialogueGraph } from "@/lib/interactive/model";
import { readOnly } from "@/lib/request-cache";
import { indexNodes, isTrashed } from "@/lib/tree";

// Boards (canvases) and dialogues for the phone app (apps/mobile: board/ and
// dialogue/ screens). Both are Yjs documents in the note's collab room, edited
// live on the web (components/views/storyboard-view.tsx, dialogue-view.tsx).
// The phone reads the room as it is right now; its few board edits (move a
// card, add or change a text card) go into the room the way a collaborator's
// would, so anyone with the board open sees them arrive.

const { node } = schema;

type Kind = "canvas" | "dialogue";

/** Checks the note is a board of this kind the caller can see (or edit), and returns its settings. */
async function boardNode(projectId: string, nodeId: string, kind: Kind, action: "read" | "edit" = "read") {
  return readOnly(async () => {
    await requireNodeAccess(projectId, nodeId, action);
    const index = indexNodes(await listNodes(projectId));
    const found = index.byId.get(nodeId);
    if (!found || isTrashed(index, nodeId)) throw new ApiError(404, "Not found.");
    if (found.kind !== kind) throw new ApiError(400, `That's a ${found.kind}, not a ${kind === "canvas" ? "board" : "dialogue"}.`);
    return found;
  });
}

/** The room's document now; when the live server can't be reached, the last copy it saved. */
async function roomDoc(nodeId: string): Promise<Y.Doc> {
  const doc = new Y.Doc();
  let state: Uint8Array | null = null;
  try {
    state = await fetchRoomState(roomName({ kind: "node", id: nodeId }));
  } catch {
    const [row] = await userDb((tx) => tx.select({ ydoc: node.ydoc }).from(node).where(eq(node.id, nodeId)).limit(1));
    state = row?.ydoc ?? null;
  }
  if (state?.length) Y.applyUpdate(doc, state);
  return doc;
}

export type ApiBoard = {
  /** A canvas made as a map: its pins and regions, which the phone lists instead of drawing. */
  map: boolean;
  cards: Record<string, CardData>;
  edges: Record<string, EdgeData>;
  marks: Record<string, MarkData>;
};

export async function readBoard(projectId: string, nodeId: string): Promise<ApiBoard> {
  const found = await boardNode(projectId, nodeId, "canvas");
  const doc = await roomDoc(nodeId);
  try {
    const maps = canvasMaps(doc);
    return {
      map: isMap(found),
      cards: maps.cards.toJSON() as Record<string, CardData>,
      edges: maps.edges.toJSON() as Record<string, EdgeData>,
      marks: maps.marks.toJSON() as Record<string, MarkData>,
    };
  } finally {
    doc.destroy();
  }
}

export async function readDialogue(projectId: string, nodeId: string): Promise<DialogueGraph> {
  await boardNode(projectId, nodeId, "dialogue");
  const doc = await roomDoc(nodeId);
  try {
    return dialogueGraph(doc);
  } finally {
    doc.destroy();
  }
}

export type BoardChange =
  | { action: "move"; id: string; x: number; y: number }
  | { action: "add-text"; text: string; x: number; y: number }
  | { action: "set-text"; id: string; text: string };

const MAX_TEXT = 4000;
/** Far beyond any board, so a bad number can't throw a card out of reach. */
const MAX_COORD = 1_000_000;

const coord = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > MAX_COORD) throw new ApiError(400, "Send x and y as numbers.");
  return Math.round(value);
};

/** Checks what the phone sent is a change it may make, before anything is touched. */
export function parseBoardChange(input: Record<string, unknown>): BoardChange {
  const text = (value: unknown) => {
    if (typeof value !== "string") throw new ApiError(400, "Send the card's text.");
    if (value.length > MAX_TEXT) throw new ApiError(413, "That's too much text for one card.");
    return value;
  };
  const id = (value: unknown) => {
    if (typeof value !== "string" || !value) throw new ApiError(400, "Say which card.");
    return value;
  };
  if (input.action === "move") return { action: "move", id: id(input.id), x: coord(input.x), y: coord(input.y) };
  if (input.action === "add-text") return { action: "add-text", text: text(input.text), x: coord(input.x), y: coord(input.y) };
  if (input.action === "set-text") return { action: "set-text", id: id(input.id), text: text(input.text) };
  throw new ApiError(400, "Send action: move, add-text or set-text.");
}

/** Makes one change to a board, in its live room. Returns the card's id. */
export async function changeBoard(projectId: string, nodeId: string, change: BoardChange): Promise<{ id: string }> {
  const found = await boardNode(projectId, nodeId, "canvas", "edit");
  if (isMap(found)) throw new ApiError(400, "Maps are changed on the web.");
  await readOnly(() => assertUnlocked(projectId, nodeId));
  const room = roomName({ kind: "node", id: nodeId });
  const doc = new Y.Doc();
  try {
    // Edits go on top of the live state, never the saved copy: offline here means no edit.
    Y.applyUpdate(doc, await fetchRoomState(room));
    const before = Y.encodeStateVector(doc);
    const { cards } = canvasMaps(doc);
    let id: string;
    if (change.action === "add-text") {
      id = crypto.randomUUID();
      // Sized as the web's text cards are (storyboard-view.tsx defaultSize).
      cards.set(id, { type: "text", text: change.text, x: change.x, y: change.y, w: 200, h: 100 });
    } else {
      id = change.id;
      const card = cards.get(id);
      if (!card) throw new ApiError(404, "That card isn't on the board any more.");
      if (change.action === "move") cards.set(id, { ...card, x: change.x, y: change.y });
      else {
        if (card.type !== "text" && card.type !== "sticky") throw new ApiError(400, "Only text cards and sticky notes have text to change.");
        cards.set(id, { ...card, text: change.text });
      }
    }
    const missing = Y.encodeStateAsUpdate(doc, before);
    if (missing.length > 2) {
      await postRoomUpdate(room, missing);
      await syncRoomState(room, Y.encodeStateAsUpdate(doc));
    }
    return { id };
  } finally {
    doc.destroy();
  }
}
