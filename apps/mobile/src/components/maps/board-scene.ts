import type { Board, CardData } from "@/lib/maps-api";
import type { SceneEdge, SceneNode } from "./scene";

// A board's cards as the map canvas draws them. Pure. Sizes and colours follow
// the web's storyboard (apps/app/components/views/storyboard-view.tsx).

export const defaultSize: Record<CardData["type"], { w: number; h: number }> = {
  note: { w: 220, h: 120 },
  text: { w: 200, h: 100 },
  image: { w: 260, h: 230 },
  group: { w: 520, h: 340 },
  sticky: { w: 200, h: 180 },
  shape: { w: 200, h: 130 },
  stroke: { w: 40, h: 40 },
};

const STICKY = "#f2c94c";

export type CardNote = { title: string; synopsis: string | null; known: boolean };

/** Where a card is on the board: a card in a group is placed relative to the group. */
export function absolute(cards: Board["cards"], id: string, depth = 0): { x: number; y: number } {
  const card = cards[id];
  if (!card) return { x: 0, y: 0 };
  const parent = card.parentId && depth < 20 ? cards[card.parentId] : undefined;
  if (!parent) return { x: card.x, y: card.y };
  const p = absolute(cards, card.parentId!, depth + 1);
  return { x: p.x + card.x, y: p.y + card.y };
}

/** What a card says, in a line or two: for the list and screen readers. */
export function cardText(card: CardData, note?: CardNote): { label: string; body: string } {
  switch (card.type) {
    case "note":
      if (note && !note.known) return { label: "Not revealed yet", body: "" };
      return { label: note?.title || (card.nodeId ? "A note you can't see" : "Note"), body: note?.synopsis ?? "" };
    case "image": {
      const shot = [card.shot, card.move, card.duration ? `${card.duration}s` : ""].filter(Boolean).join(" · ");
      return { label: card.caption?.trim() || (shot ? "Shot" : "Picture"), body: shot };
    }
    case "group":
      return { label: card.text?.trim() || "Group", body: "" };
    default:
      return { label: "", body: card.text ?? "" };
  }
}

/** Pen strokes aren't drawn on the phone: everything else is. */
export const shownCard = (card: CardData) => card.type !== "stroke";

export function boardScene(board: Board, noteOf: (nodeId: string) => CardNote | undefined, options: { movable: boolean; accent: string; line: string }): { nodes: SceneNode[]; edges: SceneEdge[] } {
  const nodes: SceneNode[] = [];
  for (const [id, card] of Object.entries(board.cards)) {
    if (!shownCard(card)) continue;
    const size = defaultSize[card.type];
    const at = absolute(board.cards, id);
    const note = card.nodeId ? noteOf(card.nodeId) : undefined;
    const { label, body } = cardText(card, note);
    nodes.push({
      id,
      x: at.x,
      y: at.y,
      w: card.w ?? size.w,
      h: card.h ?? size.h,
      shape: card.type === "group" ? "group" : "card",
      label,
      body,
      color: card.color ?? (card.type === "sticky" ? STICKY : card.type === "note" ? options.accent : options.line),
      dim: card.type === "note" && !!note && !note.known,
      movable: options.movable && card.type !== "group",
      description: [label, body].filter(Boolean).join(". ") || "Empty card",
    });
  }
  const shown = new Set(nodes.map((n) => n.id));
  const edges: SceneEdge[] = Object.entries(board.edges)
    .filter(([, e]) => shown.has(e.source) && shown.has(e.target))
    .map(([id, e]) => ({ id, from: e.source, to: e.target, color: options.line, width: 1.5, arrow: true, ...(e.label && { label: e.label }) }));
  return { nodes, edges };
}

/** The cards in reading order: top to bottom, then left to right. */
export function readingOrder(board: Board): string[] {
  return Object.keys(board.cards)
    .filter((id) => shownCard(board.cards[id]) && board.cards[id].type !== "group")
    .sort((a, b) => {
      const pa = absolute(board.cards, a);
      const pb = absolute(board.cards, b);
      return pa.y - pb.y || pa.x - pb.x;
    });
}
