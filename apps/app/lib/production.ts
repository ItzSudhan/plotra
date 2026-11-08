// Production (plan.md 2.8 "Module: Production"): script breakdowns, recording
// sheets for voice and audio scripts, and shot lists from storyboards. Pure:
// it reads documents and canvases as plain values and returns report rows.

import type { CardData } from "./canvas";
import type { DocNode } from "./doc-index";
import { ACT_HEADING, CHARACTER, cueName, DIALOGUE, PARENTHETICAL, parseSceneHeading, plainText, SCENE_HEADING, SCRIPT_NOTE, speeches } from "./script";

/** The mark a breakdown tag puts on text: `{ text: "a revolver", breakdown: "props" }`. */
export const BREAKDOWN = "breakdown";

export const breakdownCategories = [
  { id: "cast", label: "Cast", color: "#c2255c" },
  { id: "extras", label: "Extras", color: "#e2602a" },
  { id: "props", label: "Props", color: "#b98021" },
  { id: "wardrobe", label: "Wardrobe", color: "#9c36b5" },
  { id: "makeup", label: "Hair & make-up", color: "#d5467f" },
  { id: "set", label: "Set dressing", color: "#2b8a3e" },
  { id: "vehicles", label: "Vehicles", color: "#1971c2" },
  { id: "animals", label: "Animals", color: "#109a82" },
  { id: "stunts", label: "Stunts", color: "#c92a2a" },
  { id: "sfx", label: "Special effects", color: "#5f3dc4" },
  { id: "vfx", label: "VFX", color: "#0c8599" },
  { id: "sound", label: "Sound & music", color: "#868e96" },
] as const;

export type BreakdownCategory = (typeof breakdownCategories)[number]["id"];

export const isBreakdownCategory = (value: unknown): value is BreakdownCategory => breakdownCategories.some((c) => c.id === value);
export const categoryMeta = (id: string) => breakdownCategories.find((c) => c.id === id) ?? { id, label: id, color: "#868e96" };

/** A document of the script, as the manuscript read returns it. */
export type ScriptSection = { id: string; title: string; kind: string; value: DocNode[] };

export type BreakdownScene = {
  /** Unique in the report: the note, plus the scene heading's position when a note holds several scenes. */
  key: string;
  nodeId: string;
  /** "12", in script order. */
  number: number;
  heading: string;
  setting: string;
  location: string;
  time: string;
  words: number;
  /** Elements by category, each written as it first appears. Cast includes everyone with a line. */
  elements: Partial<Record<BreakdownCategory, string[]>>;
};

const words = (text: string) => text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;

/** Adds a name to a list unless it's already there, ignoring case. */
function addUnique(list: string[], name: string) {
  const clean = name.replace(/\s+/g, " ").trim();
  if (clean && !list.some((n) => n.toLowerCase() === clean.toLowerCase())) list.push(clean);
}

/** Tagged runs of text in a block: adjacent leaves with the same tag are one element. */
function taggedIn(block: DocNode, out: Array<{ category: BreakdownCategory; text: string }>) {
  let run: { category: BreakdownCategory; text: string } | null = null;
  const visit = (n: DocNode) => {
    if (typeof n.text === "string") {
      const category = n[BREAKDOWN];
      if (isBreakdownCategory(category) && !n[SCRIPT_NOTE]) {
        if (run && run.category === category) run.text += n.text;
        else out.push((run = { category, text: n.text }));
      } else if (n.text.trim()) run = null;
      return;
    }
    for (const child of n.children ?? []) visit(child);
  };
  visit(block);
}

/**
 * The breakdown of a script: one row per scene (a scene heading starts one; a
 * note with no headings is one scene, named after the note), with the cast
 * who speak and everything tagged in it.
 */
export function breakdown(sections: ScriptSection[]): BreakdownScene[] {
  const scenes: BreakdownScene[] = [];
  let current: BreakdownScene | null = null;

  const open = (nodeId: string, key: string, heading: string, parsed = true) => {
    const parts = parsed ? parseSceneHeading(heading) : { setting: "", location: "", time: "" };
    current = { key, nodeId, number: scenes.length + 1, heading: heading.trim(), ...parts, words: 0, elements: {} };
    scenes.push(current);
    return current;
  };
  const add = (scene: BreakdownScene, category: BreakdownCategory, name: string) => addUnique((scene.elements[category] ??= []), name);

  for (const section of sections) {
    // Each note starts afresh: a scene never runs on from the note before.
    current = null;
    const blocks = section.value;
    const hasHeadings = blocks.some((b) => b.type === SCENE_HEADING);
    blocks.forEach((block, i) => {
      if (block.type === ACT_HEADING) return;
      const text = plainText(block);
      if (block.type === SCENE_HEADING) {
        if (text.trim()) open(section.id, `${section.id}:${i}`, text);
        return;
      }
      if (!text.trim()) return;
      // Text before the first heading, or a note without headings, belongs to a scene named after the note.
      const scene = current ?? open(section.id, hasHeadings ? `${section.id}:start` : section.id, section.title, false);
      scene.words += words(text);
      if (block.type === CHARACTER) add(scene, "cast", cueName(text));
      const tagged: Array<{ category: BreakdownCategory; text: string }> = [];
      taggedIn(block, tagged);
      for (const t of tagged) add(scene, t.category, t.text);
    });
  }
  // A note that's only a heading and nothing else is still a scene worth listing; empty prose notes aren't.
  return scenes.filter((s) => s.words > 0 || s.setting || Object.keys(s.elements).length > 0).map((s, i) => ({ ...s, number: i + 1 }));
}

export type ElementReport = { category: BreakdownCategory; name: string; scenes: number[] };

/** Every element across the script with the scenes it's needed in: the report per element. */
export function elementReport(scenes: BreakdownScene[]): ElementReport[] {
  const map = new Map<string, ElementReport>();
  for (const scene of scenes) {
    for (const [category, names] of Object.entries(scene.elements) as Array<[BreakdownCategory, string[]]>) {
      for (const name of names) {
        const key = `${category}\n${name.toLowerCase()}`;
        const entry = map.get(key);
        if (entry) entry.scenes.push(scene.number);
        else map.set(key, { category, name, scenes: [scene.number] });
      }
    }
  }
  const order = new Map<string, number>(breakdownCategories.map((c, i) => [c.id, i]));
  return [...map.values()].sort((a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) || b.scenes.length - a.scenes.length || a.name.localeCompare(b.name));
}

// ---- Recording sheets -------------------------------------------------------------

export type ScriptLine = {
  nodeId: string;
  blockId: string;
  /** Position in the whole script. */
  order: number;
  character: string;
  text: string;
  /** The parenthetical before the line: how it's delivered. */
  direction: string | null;
  /** The scene or note the line is in. */
  scene: string;
  /** Unique per scene: the note, plus the scene heading's position. */
  sceneKey: string;
};

/** Every line of dialogue in a script, with who says it and how: the rows of a recording sheet. */
export function scriptLines(sections: ScriptSection[]): ScriptLine[] {
  const lines: ScriptLine[] = [];
  for (const section of sections) {
    let scene = { name: section.title, key: `${section.id}:start` };
    const headingAt = new Map<number, typeof scene>();
    section.value.forEach((block, i) => {
      if (block.type === SCENE_HEADING && plainText(block).trim()) scene = { name: plainText(block).trim().toUpperCase(), key: `${section.id}:${i}` };
      headingAt.set(i, scene);
    });
    for (const speech of speeches(section.value)) {
      let direction: string | null = null;
      for (const block of speech.blocks) {
        const text = plainText(block).trim();
        if (block.type === PARENTHETICAL) {
          direction = text.replace(/^\(\s*|\s*\)$/g, "") || null;
          continue;
        }
        if (block.type !== DIALOGUE || !text || typeof block.id !== "string") continue;
        lines.push({
          nodeId: section.id,
          blockId: block.id,
          order: lines.length,
          character: speech.character || "Unknown",
          text,
          direction,
          scene: headingAt.get(speech.index)?.name ?? section.title,
          sceneKey: headingAt.get(speech.index)?.key ?? `${section.id}:start`,
        });
        direction = null;
      }
    }
  }
  return lines;
}

// ---- Shot lists ----------------------------------------------------------------------

export type Shot = {
  id: string;
  number: number;
  /** The group (sequence) the shot's card sits in, if any. */
  sequence: string | null;
  caption: string;
  shot: string | null;
  move: string | null;
  duration: number | null;
  url: string | null;
};

/** How far apart (in canvas pixels) two card tops can be and still be one row. */
const ROW_SLACK = 80;

/**
 * The shot list of a storyboard: its image and shot cards in reading order
 * (rows top to bottom, left to right within a row), sequence by sequence.
 */
export function shotList(cards: Record<string, CardData>): Shot[] {
  // A card's x/y are relative to its group, which may sit in a group of its own.
  const absolute = (card: CardData) => {
    let x = Number(card.x) || 0;
    let y = Number(card.y) || 0;
    const seen = new Set<string>();
    for (let id = card.parentId; id && cards[id] && !seen.has(id); id = cards[id].parentId) {
      seen.add(id);
      x += Number(cards[id].x) || 0;
      y += Number(cards[id].y) || 0;
    }
    return { x, y };
  };
  const shots = Object.entries(cards)
    .filter(([, card]) => card.type === "image" || card.shot || card.move || card.duration)
    .filter(([, card]) => card.type !== "group")
    .map(([id, card]) => ({ id, card, ...absolute(card) }));
  // Rows top to bottom: a card whose top is within half a card of the row's first card is on that row.
  shots.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Array<typeof shots> = [];
  for (const shot of shots) {
    const row = rows.at(-1);
    if (row && shot.y - row[0].y <= ROW_SLACK) row.push(shot);
    else rows.push([shot]);
  }
  const ordered = rows.flatMap((row) => row.sort((a, b) => a.x - b.x || a.y - b.y));
  return ordered.map(({ id, card }, i) => ({
    id,
    number: i + 1,
    sequence: card.parentId ? cards[card.parentId]?.text?.trim() || null : null,
    caption: (card.caption ?? card.text ?? "").trim(),
    shot: card.shot?.trim() || null,
    move: card.move?.trim() || null,
    duration: typeof card.duration === "number" && Number.isFinite(card.duration) ? card.duration : null,
    url: card.url ?? null,
  }));
}

/** Seconds as m:ss. */
export const formatSeconds = (seconds: number) => {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

// ---- CSV -------------------------------------------------------------------------------

const cell = (value: string | number | null | undefined) => {
  let text = value === null || value === undefined ? "" : String(value);
  // Text a spreadsheet would run as a formula (=, +, -, @) is kept as text.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",;\t\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** A CSV file from rows of cells, with a BOM so spreadsheet apps read it as UTF-8. */
export const csv = (rows: Array<Array<string | number | null | undefined>>) => `\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
