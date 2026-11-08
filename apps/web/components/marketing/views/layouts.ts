import { chapters, events, notes, places, scenes, sceneSpots, threads, type NoteId } from "./story";

// Where the five scenes sit in each view, worked out from the room the page
// gives the canvas, so a phone gets a layout of its own rather than a small one.

export type ViewId = "manuscript" | "corkboard" | "grid" | "timeline" | "storyboard" | "graph";
export type Size = { w: number; h: number; compact: boolean };
export type Box = { x: number; y: number; w: number; h: number; tilt?: number };

export function manuscript({ w, h }: Size) {
  const width = Math.min(w, 600);
  const x = (w - width) / 2;
  const headH = h >= 470 ? 34 : 0;
  const rowH = Math.min(92, (h - chapters.length * headH) / scenes.length);
  let y = (h - chapters.length * headH - scenes.length * rowH) / 2;
  const headings: Box[] = [];
  const boxes = scenes.map((s, i) => {
    if (headH && s.chapter !== scenes[i - 1]?.chapter) {
      headings.push({ x, y, w: width, h: headH });
      y += headH;
    }
    y += rowH;
    return { x, y: y - rowH, w: width, h: rowH };
  });
  return { boxes, headings };
}

const tilts = [-0.9, 0.6, -0.4, 0.8, -0.6];

export function corkboard({ w, h, compact }: Size) {
  const cols = compact ? 2 : 3;
  const rows = Math.ceil(scenes.length / cols);
  const gap = compact ? 12 : 22;
  const cw = Math.min(236, (w - gap * (cols - 1)) / cols);
  const ch = Math.min(compact ? 150 : 168, (h - gap * (rows - 1)) / rows);
  const x = (w - cols * cw - (cols - 1) * gap) / 2;
  const y = (h - rows * ch - (rows - 1) * gap) / 2;
  const boxes: Box[] = scenes.map((_, i) => ({
    x: x + (i % cols) * (cw + gap),
    y: y + Math.floor(i / cols) * (ch + gap),
    w: cw,
    h: ch,
    tilt: tilts[i],
  }));
  return { boxes };
}

export function grid({ w, h, compact }: Size) {
  const head = 38;
  const rowH = Math.min(84, (h - head) / scenes.length);
  const sceneW = Math.round(w * (compact ? 0.38 : 0.34));
  const threadW = (w - sceneW) / threads.length;
  const top = (h - head - scenes.length * rowH) / 2;
  const boxes: Box[] = scenes.map((_, i) => ({ x: 0, y: top + head + i * rowH, w: sceneW, h: rowH }));
  return { boxes, head, rowH, sceneW, threadW, top };
}

const CARD_H = 28;
const ROW_GAP = 6;
export const AXIS_H = 28;
/** The days the timeline shows, counted from the Sunday the story opens on. */
const FROM = 0;
const TO = 5;

export function timeline({ w, h, compact }: Size) {
  const labelW = compact ? 0 : 152;
  const cardW = compact ? 100 : 148;
  // On a phone the lane's name sits inside the lane, above its cards.
  const nameH = compact ? 16 : 0;
  const pad = compact ? 10 : 20;
  const xOf = (day: number) => labelW + 10 + ((day - FROM) / (TO - FROM)) * (w - labelW - cardW - 20);

  // A lane for each place, and one for the events that have none. Cards that
  // would overlap drop to the next row, as they do in the app.
  const items = [
    ...scenes.map((s, i) => ({ scene: i, lane: s.place, day: s.day })),
    ...events.map((e, i) => ({ event: i, lane: places.length, day: e.day })),
  ];
  const lanes = [...places, null].map((name, lane) => {
    let row = 0;
    let last = -Infinity;
    const cards = items
      .filter((c) => c.lane === lane)
      .sort((a, b) => a.day - b.day)
      .map((c) => {
        row = xOf(c.day) < last + cardW + 6 ? row + 1 : 0;
        last = xOf(c.day);
        return { ...c, row };
      });
    const rows = Math.max(...cards.map((c) => c.row)) + 1;
    return { name, cards, rows, natural: nameH + pad + rows * CARD_H + (rows - 1) * ROW_GAP };
  });
  const natural = lanes.reduce((n, l) => n + l.natural, 0);
  const spare = Math.max(0, Math.min(28, (h - AXIS_H - natural) / lanes.length));
  const top = Math.max(0, (h - AXIS_H - natural - spare * lanes.length) / 2);

  const boxes: Box[] = [];
  const eventBoxes: Box[] = [];
  let y = top + AXIS_H;
  const rails = lanes.map((l) => {
    const laneH = l.natural + spare;
    const stack = l.rows * CARD_H + (l.rows - 1) * ROW_GAP;
    for (const c of l.cards) {
      const box = { x: xOf(c.day), y: y + nameH + (laneH - nameH - stack) / 2 + c.row * (CARD_H + ROW_GAP), w: cardW, h: CARD_H };
      if ("scene" in c) boxes[c.scene] = box;
      else eventBoxes[c.event] = box;
    }
    y += laneH;
    return { name: l.name, y: y - laneH, h: laneH };
  });
  // A phone has room for every other day.
  const ticks = (compact ? ["Sun", "", "Tue", "", "Thu"] : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"])
    .map((label, day) => ({ day, label, x: xOf(day) }))
    .filter((t) => t.label);
  return { boxes, eventBoxes, rails, ticks, labelW, top, bottom: y };
}

export function storyboard({ w, h, compact }: Size) {
  const fw = compact ? w * 0.44 : Math.min(w * 0.27, 210);
  const fh = Math.min((fw * 9) / 16 + 30, h * (compact ? 0.31 : 0.36));
  // Loosely placed, the way a board is before anyone tidies it.
  const spots = compact
    ? [[0, 0], [1, 0.08], [0.06, 0.5], [1, 0.56], [0.5, 1]]
    : [[0, 0.07], [0.5, 0], [1, 0.12], [0.8, 1], [0.32, 0.93]];
  const boxes: Box[] = spots.map(([fx, fy]) => ({ x: fx * (w - fw), y: fy * (h - fh), w: fw, h: fh }));
  const note: Box | null = compact ? null : { x: 0, y: h * 0.62, w: Math.min(150, w * 0.2), h: 0 };
  return { boxes, note };
}

export const DOT = 18;

export function graph({ w, h, compact }: Size) {
  const pad = 14;
  // The legend runs along the bottom, on two lines on a phone.
  const legend = compact ? 52 : 30;
  const at = ([fx, fy]: readonly [number, number]) => [pad + fx * (w - pad * 2), pad + fy * (h - pad * 2 - legend)] as const;
  const boxes: Box[] = sceneSpots.map((spot) => {
    const [x, y] = at(spot);
    return { x: x - DOT / 2, y: y - DOT / 2, w: DOT, h: DOT };
  });
  const points = Object.fromEntries(Object.entries(notes).map(([id, n]) => [id, at(n.at)])) as unknown as Record<
    NoteId,
    readonly [number, number]
  >;
  return { boxes, points, scenePoints: sceneSpots.map(at) };
}

export const boxesOf: Record<ViewId, (size: Size) => Box[]> = {
  manuscript: (s) => manuscript(s).boxes,
  corkboard: (s) => corkboard(s).boxes,
  grid: (s) => grid(s).boxes,
  timeline: (s) => timeline(s).boxes,
  storyboard: (s) => storyboard(s).boxes,
  graph: (s) => graph(s).boxes,
};
