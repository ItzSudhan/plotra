import * as Y from "yjs";
import { countWords, extractTags, type DocIndex, type ExtractedLink } from "./doc-index";

// A storyboard canvas (plan.md 2.5) is a Yjs doc, edited live by everyone who
// has it open: two maps of plain objects, cards and edges, keyed by id. Each
// card or edge is replaced whole when it changes, so concurrent edits to
// different cards merge and edits to the same card resolve last-writer-wins.

export const CARDS = "cards";
export const EDGES = "edges";
// A canvas made as a map (`settings.board = "map"`, components/views/map-view.tsx)
// also has its picture, and the pins, regions and paths drawn on it.
export const MARKS = "marks";
export const MAP_META = "map";

export type ShotInfo = {
  /** Wide, medium, close-up… */
  shot?: string;
  /** Pan, dolly, static… */
  move?: string;
  /** Seconds. */
  duration?: number;
};

export type CardData = {
  /** Sticky notes, shapes and pen strokes make a canvas a whiteboard (beat-the-competitors.md step 8). */
  type: "note" | "text" | "image" | "group" | "sticky" | "shape" | "stroke";
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** The group a card sits in; its x/y are then relative to the group. */
  parentId?: string;
  color?: string;
  /** Note cards: the binder node they show. */
  nodeId?: string;
  /** Text cards: the text. Groups: the label. */
  text?: string;
  /** Image cards: the picture and what's under it. */
  url?: string;
  caption?: string;
  /** Shapes: which one. */
  shape?: "rect" | "ellipse" | "diamond";
  /** Pen strokes: x, y, x, y… within the card's box, scaled to 0–1000 either way, so a stroke stretches with its card. */
  points?: number[];
  /** Pen strokes: how thick, in pixels. */
  strokeWidth?: number;
} & ShotInfo;

export type EdgeData = { source: string; target: string; label?: string; sourceHandle?: string; targetHandle?: string };

/**
 * A map's picture: a file attached to the map's note, and its size in pixels,
 * which marks are placed in. A picture larger than a browser shows comfortably
 * also has a smaller `overview` and full-size `tiles` (components/views/map-tiles.ts):
 * the map shows the overview zoomed out and only the tiles on screen zoomed in.
 */
export type MapMeta = {
  fileId?: string;
  width?: number;
  height?: number;
  overview?: { fileId: string; width: number; height: number };
  /** Square tiles of `size` pixels, row by row, `cols` across; the last in a row or column may be smaller. */
  tiles?: { size: number; cols: number; rows: number; ids: string[] };
};

/**
 * Something drawn on a map, in the picture's pixels: a pin at a point, or a
 * region (a closed shape) or a path (a line) through points. Any of them can
 * stand for a note; a pin for another map opens it.
 */
export type MarkData = {
  type: "pin" | "region" | "path";
  /** Pins: where the point is. */
  x?: number;
  y?: number;
  /** Regions and paths: x, y, x, y… */
  points?: number[];
  nodeId?: string;
  label?: string;
  color?: string;
  /** Marks are shown and hidden a layer at a time ("Trade routes", "The war"). */
  layer?: string;
};

export const canvasMaps = (doc: Y.Doc) => ({
  cards: doc.getMap<CardData>(CARDS),
  edges: doc.getMap<EdgeData>(EDGES),
  marks: doc.getMap<MarkData>(MARKS),
  meta: doc.getMap<MapMeta[keyof MapMeta]>(MAP_META),
});

/** True for a canvas made as a map. */
export const isMap = (node: { kind: string; settings?: Record<string, unknown> | null }) => node.kind === "canvas" && node.settings?.board === "map";

/** Text, words and links of a canvas, for search, word counts and the graph. */
export function indexCanvas(doc: Y.Doc): DocIndex {
  const { cards, marks } = canvasMaps(doc);
  const lines: string[] = [];
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();
  cards.forEach((card) => {
    for (const text of [card.text, card.caption]) if (text?.trim()) lines.push(text.trim());
    if (card.type === "note" && card.nodeId && !seen.has(card.nodeId)) {
      seen.add(card.nodeId);
      links.push({ targetNodeId: card.nodeId, targetHeading: null, kind: "wiki", context: "Card on the canvas" });
    }
  });
  // A map's pins, regions and paths: their labels are its text, and the notes they stand for are its links.
  marks.forEach((mark) => {
    if (mark.label?.trim()) lines.push(mark.label.trim());
    if (mark.nodeId && !seen.has(mark.nodeId)) {
      seen.add(mark.nodeId);
      links.push({ targetNodeId: mark.nodeId, targetHeading: null, kind: "wiki", context: mark.type === "pin" ? "Pinned on the map" : "Drawn on the map" });
    }
  });
  const text = lines.join("\n");
  return {
    text,
    words: countWords(text),
    characters: text.replace(/\n/g, "").length,
    headings: [],
    tags: extractTags(text),
    links: links.slice(0, 500),
    facts: [],
  };
}

/** A stroke drawn on the screen as a card: its box on the canvas, and its points in that box, scaled to 0–1000. */
export function strokeCard(screen: Array<{ x: number; y: number }>, toFlow: (p: { x: number; y: number }) => { x: number; y: number }, color?: string): CardData {
  const flowPoints = screen.map(toFlow);
  const xs = flowPoints.map((p) => p.x);
  const ys = flowPoints.map((p) => p.y);
  // A straight line has no width or no height: give the box a little of each.
  const pad = 4;
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  const w = Math.max(8, Math.max(...xs) - Math.min(...xs) + pad * 2);
  const h = Math.max(8, Math.max(...ys) - Math.min(...ys) + pad * 2);
  const points = flowPoints.flatMap((p) => [Math.round(((p.x - x) / w) * 1000), Math.round(((p.y - y) / h) * 1000)]);
  return { type: "stroke", x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), points, strokeWidth: 3, ...(color && { color }) };
}
