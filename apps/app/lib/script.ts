// Script formats (plan.md 2.3 "Screenplay mode", 2.8 Production): the elements
// a screenplay, stage play, comic script or audio script is written in, and how
// the keyboard moves between them. Pure, so the editor, the Read view, Fountain
// and the server (document index, imports) all share one description.

import type { ScriptFormat } from "@plotra/db/schema";
import type { DocNode } from "./doc-index";

// ---- Elements -------------------------------------------------------------------

/** Block types of script elements, as stored in documents. */
export const SCENE_HEADING = "scene_heading";
/** Action in a screenplay; a stage direction, a panel's extra description or an audio direction elsewhere. */
export const ACTION = "action";
export const CHARACTER = "character";
export const PARENTHETICAL = "parenthetical";
export const DIALOGUE = "dialogue";
export const TRANSITION = "transition";
export const SHOT = "shot";
/** Stage plays: "ACT ONE". */
export const ACT_HEADING = "act_heading";
/** Comics: a page of the finished comic. Numbered automatically. */
export const COMIC_PAGE = "comic_page";
/** Comics: a panel; its text is the description for the artist. Numbered within its page. */
export const COMIC_PANEL = "comic_panel";
export const COMIC_CAPTION = "comic_caption";
/** A sound effect in a comic, or a sound cue in an audio script. */
export const SFX = "sfx";
export const MUSIC_CUE = "music_cue";

/** A mark on text: a writer's note (`[[like this]]` in Fountain) that never prints. */
export const SCRIPT_NOTE = "script_note";

export const scriptElementTypes = [
  SCENE_HEADING,
  ACTION,
  CHARACTER,
  PARENTHETICAL,
  DIALOGUE,
  TRANSITION,
  SHOT,
  ACT_HEADING,
  COMIC_PAGE,
  COMIC_PANEL,
  COMIC_CAPTION,
  SFX,
  MUSIC_CUE,
] as const;
export type ScriptElementType = (typeof scriptElementTypes)[number];

const elementSet: ReadonlySet<string> = new Set(scriptElementTypes);
export const isScriptElement = (type: unknown): type is ScriptElementType => typeof type === "string" && elementSet.has(type);

export const isScriptFormat = (format: ScriptFormat | null | undefined): format is Exclude<ScriptFormat, "prose"> =>
  Boolean(format) && format !== "prose";

/** The elements each format is written in, in the order Tab cycles through them. */
export const scriptElements: Record<ScriptFormat, ScriptElementType[]> = {
  prose: [],
  screenplay: [SCENE_HEADING, ACTION, CHARACTER, PARENTHETICAL, DIALOGUE, TRANSITION, SHOT],
  stageplay: [ACT_HEADING, SCENE_HEADING, ACTION, CHARACTER, PARENTHETICAL, DIALOGUE],
  comic: [COMIC_PAGE, COMIC_PANEL, ACTION, COMIC_CAPTION, CHARACTER, DIALOGUE, SFX],
  audio: [SCENE_HEADING, ACTION, CHARACTER, PARENTHETICAL, DIALOGUE, SFX, MUSIC_CUE],
};

type ElementMeta = { label: string; glyph: string; keywords: string[]; placeholder: string };

export const scriptElementMeta: Record<ScriptElementType, ElementMeta> = {
  [SCENE_HEADING]: { label: "Scene heading", glyph: "SH", keywords: ["slugline", "int", "ext"], placeholder: "INT. LOCATION - DAY" },
  [ACTION]: { label: "Action", glyph: "A", keywords: ["description"], placeholder: "Action" },
  [CHARACTER]: { label: "Character", glyph: "C", keywords: ["cue", "speaker"], placeholder: "CHARACTER" },
  [PARENTHETICAL]: { label: "Parenthetical", glyph: "( )", keywords: ["wryly", "delivery"], placeholder: "(parenthetical)" },
  [DIALOGUE]: { label: "Dialogue", glyph: "D", keywords: ["speech", "line"], placeholder: "Dialogue" },
  [TRANSITION]: { label: "Transition", glyph: "T", keywords: ["cut to", "fade"], placeholder: "CUT TO:" },
  [SHOT]: { label: "Shot", glyph: "S", keywords: ["angle", "camera"], placeholder: "CLOSE ON" },
  [ACT_HEADING]: { label: "Act heading", glyph: "AH", keywords: ["act"], placeholder: "ACT ONE" },
  [COMIC_PAGE]: { label: "Page", glyph: "PG", keywords: ["comic page"], placeholder: "" },
  [COMIC_PANEL]: { label: "Panel", glyph: "PN", keywords: ["frame"], placeholder: "What the artist draws" },
  [COMIC_CAPTION]: { label: "Caption", glyph: "CP", keywords: ["narration", "box"], placeholder: "Caption" },
  [SFX]: { label: "Sound effect", glyph: "FX", keywords: ["sfx", "sound", "cue"], placeholder: "Sound" },
  [MUSIC_CUE]: { label: "Music cue", glyph: "♪", keywords: ["music", "score", "sting"], placeholder: "Music" },
};

// The same element is called different things in different formats.
const formatLabels: Partial<Record<ScriptFormat, Partial<Record<ScriptElementType, Partial<ElementMeta>>>>> = {
  stageplay: {
    [SCENE_HEADING]: { placeholder: "SCENE 1" },
    [ACTION]: { label: "Stage direction", keywords: ["direction", "action"], placeholder: "Stage direction" },
  },
  comic: {
    [ACTION]: { label: "Description", keywords: ["action", "art note"], placeholder: "More description" },
    [CHARACTER]: { label: "Character", keywords: ["balloon", "speaker"] },
    [DIALOGUE]: { label: "Dialogue", keywords: ["balloon", "speech"], placeholder: "Balloon text" },
  },
  audio: {
    [SCENE_HEADING]: { placeholder: "SCENE 1. LOCATION" },
    [ACTION]: { label: "Direction", keywords: ["action", "narration"], placeholder: "Direction" },
    [PARENTHETICAL]: { label: "Delivery note", keywords: ["parenthetical", "delivery"], placeholder: "(delivery)" },
    [SFX]: { label: "Sound cue", keywords: ["sfx", "sound", "effect"] },
  },
};

/** An element's label, glyph and placeholder as the format calls it. */
export function scriptElementInfo(type: ScriptElementType, format: ScriptFormat = "screenplay"): ElementMeta {
  return { ...scriptElementMeta[type], ...formatLabels[format]?.[type] };
}

// ---- Keyboard flow ----------------------------------------------------------------

type Flow = Partial<Record<ScriptElementType, ScriptElementType>>;

/** What Enter at the end of an element starts next (Final Draft's flow). */
const enterFlow: Record<Exclude<ScriptFormat, "prose">, Flow> = {
  screenplay: {
    [SCENE_HEADING]: ACTION,
    [ACTION]: ACTION,
    [CHARACTER]: DIALOGUE,
    [PARENTHETICAL]: DIALOGUE,
    [DIALOGUE]: ACTION,
    [TRANSITION]: SCENE_HEADING,
    [SHOT]: ACTION,
  },
  // Plays and audio drama are mostly speech: a line is followed by the next speaker.
  stageplay: {
    [ACT_HEADING]: SCENE_HEADING,
    [SCENE_HEADING]: ACTION,
    [ACTION]: ACTION,
    [CHARACTER]: DIALOGUE,
    [PARENTHETICAL]: DIALOGUE,
    [DIALOGUE]: CHARACTER,
  },
  comic: {
    [COMIC_PAGE]: COMIC_PANEL,
    [COMIC_PANEL]: CHARACTER,
    [ACTION]: CHARACTER,
    [COMIC_CAPTION]: CHARACTER,
    [CHARACTER]: DIALOGUE,
    [DIALOGUE]: CHARACTER,
    [SFX]: CHARACTER,
  },
  audio: {
    [SCENE_HEADING]: ACTION,
    [ACTION]: CHARACTER,
    [CHARACTER]: DIALOGUE,
    [PARENTHETICAL]: DIALOGUE,
    [DIALOGUE]: CHARACTER,
    [SFX]: CHARACTER,
    [MUSIC_CUE]: CHARACTER,
  },
};

/** What Enter turns an empty element into. Anything not listed becomes action. */
const emptyFlow: Partial<Record<ScriptFormat, Flow>> = {
  // An empty cue starts the next panel, an empty panel the next page.
  comic: { [CHARACTER]: COMIC_PANEL, [COMIC_PANEL]: COMIC_PAGE },
};

/** The element Enter starts after a finished `type`. */
export function nextOnEnter(format: ScriptFormat, type: ScriptElementType): ScriptElementType {
  return (isScriptFormat(format) && enterFlow[format][type]) || ACTION;
}

/** The element Enter turns an empty `type` into (itself when there's nothing to reset to). */
export function emptyReset(format: ScriptFormat, type: ScriptElementType): ScriptElementType {
  return emptyFlow[format]?.[type] ?? ACTION;
}

/** The next (Tab) or previous (Shift+Tab) element type in the format's list. */
export function cycleElement(format: ScriptFormat, type: ScriptElementType, reverse = false): ScriptElementType {
  const order = scriptElements[format];
  if (!order.length) return type;
  const at = order.indexOf(type);
  // An element from another format joins the cycle at its start.
  if (at < 0) return order[0];
  return order[(at + (reverse ? order.length - 1 : 1)) % order.length];
}

type TabMap = {
  /** What Tab turns a line into. */
  next: Flow;
  /** What Shift+Tab turns it into. */
  back: Flow;
  /** What Tab at the end of a written line starts on a new line below. */
  after: Flow;
};

// Speech: a written cue or line takes a parenthetical below it, a written parenthetical the line it introduces.
const speechAfter: Flow = { [CHARACTER]: PARENTHETICAL, [DIALOGUE]: PARENTHETICAL, [PARENTHETICAL]: DIALOGUE };

/** Tab and Shift+Tab per element, after Final Draft's defaults; the other formats follow the same shape. */
const tabMaps: Record<Exclude<ScriptFormat, "prose">, TabMap> = {
  // Action → Character → Transition → Scene heading → Action; dialogue and parenthetical swap.
  screenplay: {
    next: {
      [SCENE_HEADING]: ACTION,
      [ACTION]: CHARACTER,
      [CHARACTER]: TRANSITION,
      [TRANSITION]: SCENE_HEADING,
      [SHOT]: ACTION,
      [DIALOGUE]: PARENTHETICAL,
      [PARENTHETICAL]: DIALOGUE,
    },
    back: {
      [ACTION]: SHOT,
      [SHOT]: SCENE_HEADING,
      [SCENE_HEADING]: TRANSITION,
      [TRANSITION]: CHARACTER,
      [CHARACTER]: ACTION,
      [DIALOGUE]: CHARACTER,
      [PARENTHETICAL]: DIALOGUE,
    },
    after: speechAfter,
  },
  // No transitions in a play: an empty cue becomes the next scene.
  stageplay: {
    next: {
      [ACT_HEADING]: SCENE_HEADING,
      [SCENE_HEADING]: ACTION,
      [ACTION]: CHARACTER,
      [CHARACTER]: SCENE_HEADING,
      [DIALOGUE]: PARENTHETICAL,
      [PARENTHETICAL]: DIALOGUE,
    },
    back: {
      [ACTION]: SCENE_HEADING,
      [SCENE_HEADING]: ACT_HEADING,
      [ACT_HEADING]: CHARACTER,
      [CHARACTER]: ACTION,
      [DIALOGUE]: CHARACTER,
      [PARENTHETICAL]: DIALOGUE,
    },
    after: speechAfter,
  },
  // Inside a panel: description → balloon → caption → sound effect; a page and a panel swap.
  comic: {
    next: {
      [COMIC_PAGE]: COMIC_PANEL,
      [COMIC_PANEL]: COMIC_PAGE,
      [ACTION]: CHARACTER,
      [CHARACTER]: COMIC_CAPTION,
      [COMIC_CAPTION]: SFX,
      [SFX]: ACTION,
      [DIALOGUE]: CHARACTER,
    },
    back: {
      [COMIC_PAGE]: COMIC_PANEL,
      [COMIC_PANEL]: COMIC_PAGE,
      [ACTION]: SFX,
      [SFX]: COMIC_CAPTION,
      [COMIC_CAPTION]: CHARACTER,
      [CHARACTER]: ACTION,
      [DIALOGUE]: CHARACTER,
    },
    after: {},
  },
  // Direction → Character → Sound cue → Music cue → Scene heading → Direction.
  audio: {
    next: {
      [SCENE_HEADING]: ACTION,
      [ACTION]: CHARACTER,
      [CHARACTER]: SFX,
      [SFX]: MUSIC_CUE,
      [MUSIC_CUE]: SCENE_HEADING,
      [DIALOGUE]: PARENTHETICAL,
      [PARENTHETICAL]: DIALOGUE,
    },
    back: {
      [ACTION]: SCENE_HEADING,
      [SCENE_HEADING]: MUSIC_CUE,
      [MUSIC_CUE]: SFX,
      [SFX]: CHARACTER,
      [CHARACTER]: ACTION,
      [DIALOGUE]: CHARACTER,
      [PARENTHETICAL]: DIALOGUE,
    },
    after: speechAfter,
  },
};

export type TabMove = {
  type: ScriptElementType;
  /** True: start a new element of `type` below; false: turn the line into it. */
  insert: boolean;
};

/**
 * What Tab (or Shift+Tab) does on an element. With the caret at the end of a
 * written cue, line or parenthetical it starts the next piece of the speech on
 * a new line, as Final Draft does; anywhere else it turns the line into
 * another element and keeps its text.
 */
export function tabElement(
  format: ScriptFormat,
  type: ScriptElementType,
  { reverse = false, blank = true, atEnd = false }: { reverse?: boolean; blank?: boolean; atEnd?: boolean } = {},
): TabMove {
  if (!isScriptFormat(format)) return { type, insert: false };
  const map = tabMaps[format];
  const after = !reverse && !blank && atEnd ? map.after[type] : undefined;
  if (after) return { type: after, insert: true };
  return { type: (reverse ? map.back : map.next)[type] ?? cycleElement(format, type, reverse), insert: false };
}

// ---- What an element is -------------------------------------------------------------

/** Elements written in capitals. The editor shows them so; exports must uppercase them too (`scriptText`). */
const uppercaseTypes: ReadonlySet<string> = new Set([SCENE_HEADING, CHARACTER, TRANSITION, SHOT, ACT_HEADING, SFX, MUSIC_CUE]);
export const isUppercaseElement = (type: unknown) => typeof type === "string" && uppercaseTypes.has(type);

/** Elements that must not be the last thing on a page: they belong to what follows. */
const keepWithNextTypes: ReadonlySet<string> = new Set([SCENE_HEADING, CHARACTER, PARENTHETICAL, SHOT, ACT_HEADING, COMIC_PAGE, COMIC_PANEL]);
export const keepsWithNext = (type: unknown) => typeof type === "string" && keepWithNextTypes.has(type);

/** Elements that show in the outline and can be linked to (`[[Note#Heading]]`), with their level. */
export const scriptHeadingLevels: Readonly<Record<string, number>> = {
  [ACT_HEADING]: 1,
  [SCENE_HEADING]: 2,
  [COMIC_PAGE]: 2,
  [COMIC_PANEL]: 3,
};

/** Plain text of a block, without marks. */
export function plainText(node: DocNode): string {
  if (typeof node.text === "string") return node.text;
  return (node.children ?? []).map(plainText).join("");
}

/** A script element's text as it is printed: capitals where the element is written in capitals. */
export function scriptText(block: DocNode): string {
  const text = plainText(block);
  return isUppercaseElement(block.type) ? text.toUpperCase() : text;
}

export const isCharacterCue = (block: DocNode) => block.type === CHARACTER;
/** A line someone speaks. */
export const isDialogueLine = (block: DocNode) => block.type === DIALOGUE;
/** Part of a speech: the cue, its parentheticals and its lines. */
export const isSpeechElement = (block: DocNode) =>
  block.type === CHARACTER || block.type === DIALOGUE || block.type === PARENTHETICAL;

/**
 * The character a cue names: capitals, without extensions such as (V.O.),
 * (O.S.) or (CONT'D) and without Fountain's dual-dialogue caret.
 */
export function cueName(text: string): string {
  return text
    .replace(/\([^)]*\)?/g, " ")
    .replace(/\^\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** The extensions on a cue: `JANE (V.O.) (CONT'D)` gives `["V.O.", "CONT'D"]`. */
export function cueExtensions(text: string): string[] {
  return [...text.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim().toUpperCase()).filter(Boolean);
}

/** A parenthetical with its brackets, however it was typed. */
export function wrapParenthetical(text: string): string {
  const inner = text.trim().replace(/^\(/, "").replace(/\)$/, "").trim();
  return inner ? `(${inner})` : "";
}

/** True when the block has nothing in it (a parenthetical's bare brackets count as nothing). */
export function isBlankElement(type: string | undefined, text: string) {
  const trimmed = text.trim();
  return !trimmed || (type === PARENTHETICAL && /^\(\s*\)$/.test(trimmed));
}

export type Speech = {
  /** The speaker, normalised (`cueName`). Empty for dialogue with no cue above it. */
  character: string;
  extensions: string[];
  /** Index of the cue block in the document, or of the first line when there is no cue. */
  index: number;
  /** The parentheticals and lines of the speech, in order. */
  blocks: DocNode[];
};

/** Every speech in a document: who speaks, and their lines. For breakdowns and recording sheets. */
export function speeches(value: DocNode[]): Speech[] {
  const out: Speech[] = [];
  let current: Speech | null = null;
  value.forEach((block, index) => {
    if (block.type === CHARACTER) {
      const text = plainText(block);
      current = { character: cueName(text), extensions: cueExtensions(text), index, blocks: [] };
      out.push(current);
    } else if (block.type === DIALOGUE || block.type === PARENTHETICAL) {
      if (!current) {
        current = { character: "", extensions: [], index, blocks: [] };
        out.push(current);
      }
      current.blocks.push(block);
    } else {
      current = null;
    }
  });
  return out;
}

// ---- Dual dialogue ---------------------------------------------------------------------

/**
 * Two speeches side by side: blocks `start` to `split` (the first speech) on
 * the left, `split` to `end` (the speech whose cue is marked dual) on the right.
 */
export type DualPair = { start: number; split: number; end: number };

type SpeechInfo = { type?: unknown; dual?: unknown };

/**
 * The dual-dialogue pairs in a run of blocks. A cue marked dual (`dual: true`,
 * Fountain's `^`) sets its speech beside the speech right before it, which
 * must be a whole speech of its own (a cue and its lines) not already in a
 * pair. A dual cue with no speech to pair with is laid out as usual. The
 * blocks stay flat in the document; this only says how they're laid out.
 * `info` reads a block's type and mark (export blocks keep them elsewhere).
 */
export function dualPairs<T>(items: readonly T[], info: (item: T) => SpeechInfo = (item) => item as SpeechInfo): DualPair[] {
  const pairs: DualPair[] = [];
  const isLine = (i: number) => {
    const type = info(items[i]).type;
    return type === DIALOGUE || type === PARENTHETICAL;
  };
  // The speech before: its cue's index, or -1 when what came before isn't a speech or is already paired.
  let previous = -1;
  let i = 0;
  while (i < items.length) {
    const { type, dual } = info(items[i]);
    if (type !== CHARACTER) {
      if (!isLine(i)) previous = -1;
      i++;
      continue;
    }
    let end = i + 1;
    while (end < items.length && isLine(end)) end++;
    if (dual === true && previous >= 0) {
      pairs.push({ start: previous, split: i, end });
      previous = -1;
    } else {
      previous = i;
    }
    i = end;
  }
  return pairs;
}

/** Where a block sits in a dual-dialogue pair: the left column, the right, or the right column's last block. */
export type DualRole = "left" | "right" | "last";

/** Each block's place in a dual-dialogue pair (`dualPairs`), or null outside one. */
export function dualRoles<T>(items: readonly T[], info?: (item: T) => SpeechInfo): Array<DualRole | null> {
  const roles: Array<DualRole | null> = items.map(() => null);
  for (const { start, split, end } of dualPairs(items, info)) {
    for (let i = start; i < end; i++) roles[i] = i < split ? "left" : i === end - 1 ? "last" : "right";
  }
  return roles;
}

/** The cue of the speech the block at `index` belongs to (itself, for a cue), or -1 outside a speech. */
export function speechCue(value: readonly DocNode[], index: number): number {
  for (let i = Math.min(index, value.length - 1); i >= 0; i--) {
    if (value[i].type === CHARACTER) return i;
    if (value[i].type !== DIALOGUE && value[i].type !== PARENTHETICAL) return -1;
  }
  return -1;
}

/** The characters who speak in a document, in order of first appearance. */
export function documentCues(value: DocNode[]): string[] {
  const names = new Set<string>();
  for (const block of value) {
    if (block.type !== CHARACTER) continue;
    const name = cueName(plainText(block));
    if (name) names.add(name);
  }
  return [...names];
}

/**
 * Names to offer while a cue is typed: characters already speaking in the
 * document, most recent first but leading with the other half of the current
 * exchange, then the project's characters. `before` is the cue's block index.
 */
export function suggestCues(query: string, value: DocNode[], before: number, names: string[], limit = 8): string[] {
  const typed = cueName(query);
  const recent: string[] = [];
  for (let i = Math.min(before, value.length) - 1; i >= 0; i--) {
    if (value[i].type !== CHARACTER) continue;
    const name = cueName(plainText(value[i]));
    if (name && !recent.includes(name)) recent.push(name);
  }
  // In a two-hander the next speaker is usually whoever spoke before the last speaker.
  if (recent.length > 1) [recent[0], recent[1]] = [recent[1], recent[0]];
  const later = documentCues(value.slice(before + 1));
  const known = [...names.map((n) => n.trim().toUpperCase()).filter(Boolean)].sort((a, b) => a.localeCompare(b));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...recent, ...later, ...known]) {
    if (seen.has(name) || name === typed) continue;
    seen.add(name);
    if (typed && !name.startsWith(typed) && !name.split(/\s+/).some((word) => word.startsWith(typed))) continue;
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

// ---- Page breaks in a speech ------------------------------------------------------------

/** The last candidate in `cuts` (in order) whose text before it fits; fits is monotonic, so a binary search. */
function lastFitting(text: string, cuts: Array<[number, number]>, fits: (part: string) => boolean) {
  let lo = 0;
  let hi = cuts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fits(text.slice(0, cuts[mid][0]))) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found < 0 ? null : cuts[found];
}

const cutsAt = (text: string, pattern: RegExp): Array<[number, number]> =>
  [...text.matchAll(pattern)].map((m) => [m.index, m.index + m[0].length] as [number, number]).filter(([from, to]) => from > 0 && to < text.length);

/**
 * Where a speech that runs over the foot of a page breaks: after the last
 * whole sentence that `fits`, or, when not even one sentence does, after the
 * last whole word. Gives the end of the first part and the start of the rest,
 * or null when not even the first word fits.
 */
export function breakSpeech(text: string, fits: (part: string) => boolean): [number, number] | null {
  return (
    lastFitting(text, cutsAt(text, /(?<=[.!?…][”’"')\]]*)\s+/g), fits) ??
    lastFitting(text, cutsAt(text, /\s+/g), fits)
  );
}

/**
 * A block with only the text between two offsets of its plain text, keeping
 * marks. An inline element (a link) goes whole with the part it starts in.
 */
export function sliceBlock(block: DocNode, from: number, to = Infinity): DocNode {
  let pos = 0;
  const cut = (nodes: DocNode[]): DocNode[] =>
    nodes.flatMap((node) => {
      const start = pos;
      const length = plainText(node).length;
      pos += length;
      if (typeof node.text === "string") {
        if ((length && start + length <= from) || start >= to) return [];
        return [{ ...node, text: node.text.slice(Math.max(0, from - start), Math.max(0, Math.min(length, to - start))) }];
      }
      return start >= from && start < to ? [node] : [];
    });
  const children = cut(block.children ?? []);
  return { ...block, children: children.length ? children : [{ text: "" }] };
}

/** The "(MORE)" under the first part of a speech split over a page. */
export const moreCue = (): DocNode => ({ type: CHARACTER, children: [{ text: "(MORE)" }] });
/** The cue repeated over the rest of a speech split over a page. */
export const contdCue = (cue: DocNode): DocNode => ({ type: CHARACTER, children: [{ text: `${cueName(plainText(cue))} (CONT'D)` }] });

/**
 * Where a speech set as a column (its cue, then its lines) breaks when it runs
 * over the foot of a page: as late as `fits` allows, between two sentences
 * (or words) of a line of dialogue, or between two lines, never right after a
 * parenthetical or with the cue alone. The first part ends with "(MORE)", the
 * rest starts with the cue and "(CONT'D)". `fits` is given the whole first
 * part, "(MORE)" and all. Null when not even the first word fits.
 */
export function breakColumn(blocks: readonly DocNode[], fits: (part: DocNode[]) => boolean): [DocNode[], DocNode[]] | null {
  if (blocks[0]?.type !== CHARACTER) return null;
  const more = moreCue();
  const contd = contdCue(blocks[0]);
  for (let j = blocks.length - 1; j >= 1; j--) {
    const block = blocks[j];
    const head = blocks.slice(0, j);
    if (block.type === DIALOGUE) {
      const at = breakSpeech(plainText(block), (part) => fits([...head, sliceBlock(block, 0, part.length), more]));
      if (at) return [[...head, sliceBlock(block, 0, at[0]), more], [contd, sliceBlock(block, at[1]), ...blocks.slice(j + 1)]];
    }
    if (j >= 2 && blocks[j - 1].type !== PARENTHETICAL && fits([...head, more])) return [[...head, more], [contd, ...blocks.slice(j)]];
  }
  return null;
}

/**
 * A dual-dialogue pair laid over as many pages as it takes: each part is the
 * two columns side by side, a column that runs over a page broken by
 * `breakColumn` and carried on in the next part, a column that has ended left
 * empty. `fits(column, part)` says whether a column fits in the room of the
 * part'th page (the first is what's left of the current page). Null when the
 * pair runs over the first page and a column can't be broken there.
 */
export function splitDual(left: DocNode[], right: DocNode[], fits: (column: DocNode[], part: number) => boolean): Array<[DocNode[], DocNode[]]> | null {
  const parts: Array<[DocNode[], DocNode[]]> = [];
  let rest: [DocNode[], DocNode[]] = [left, right];
  for (;;) {
    const n = parts.length;
    const first: DocNode[][] = [];
    const next: DocNode[][] = [];
    let broken = true;
    for (const column of rest) {
      if (!column.length || fits(column, n)) {
        first.push(column);
        next.push([]);
        continue;
      }
      const at = breakColumn(column, (part) => fits(part, n));
      if (!at) broken = false;
      first.push(at ? at[0] : column);
      next.push(at ? at[1] : []);
    }
    if (!broken) {
      if (n === 0) return null;
      // Not even a word fits on a whole page: set the rest as it is rather than loop.
      parts.push(rest);
      return parts;
    }
    parts.push([first[0], first[1]]);
    if (!next[0].length && !next[1].length) return parts;
    rest = [next[0], next[1]];
  }
}

// ---- Recognising elements from what's typed -------------------------------------------

/** How a scene heading starts: INT., EXT., EST., INT./EXT., I/E. */
export const SCENE_PREFIX = /^(?:INT\.?\/EXT|EXT\.?\/INT|INT|EXT|EST|I\/E)\./i;
/** A transition: capitals ending in "TO:". */
export const TRANSITION_PATTERN = /^[^a-z]*\bTO:$/;

/**
 * The element a line of action evidently is, from its text so far: `INT. ` or
 * `EXT. ` opens a scene heading, capitals ending in `TO:` are a transition.
 * Null when it's just action, or the format doesn't have that element.
 */
export function detectElement(format: ScriptFormat, type: string, text: string): ScriptElementType | null {
  if (type !== ACTION) return null;
  const elements = scriptElements[format];
  if (elements.includes(SCENE_HEADING) && SCENE_PREFIX.test(text) && /^\S+\s$/.test(text)) return SCENE_HEADING;
  if (elements.includes(TRANSITION) && TRANSITION_PATTERN.test(text.trim()) && text.trim().length > 3) return TRANSITION;
  return null;
}

export type SceneHeadingParts = {
  /** "INT", "EXT", "INT/EXT" or "EST"; empty when the heading doesn't say. */
  setting: string;
  location: string;
  /** "DAY", "NIGHT", "CONTINUOUS"… */
  time: string;
};

/** Splits `INT. KITCHEN - NIGHT` into where and when, for breakdowns. */
export function parseSceneHeading(text: string): SceneHeadingParts {
  const upper = text.trim().toUpperCase();
  const prefix = upper.match(SCENE_PREFIX)?.[0] ?? "";
  const rest = upper.slice(prefix.length).trim();
  const dash = rest.search(/\s[-–—]\s(?!.*\s[-–—]\s)/);
  const setting = prefix.replace(/\.$/, "").replace(/\./g, "").replace("I/E", "INT/EXT");
  if (dash < 0) return { setting, location: rest, time: "" };
  return { setting, location: rest.slice(0, dash).trim(), time: rest.slice(dash).replace(/^\s[-–—]\s/, "").trim() };
}

// ---- Comic numbering and headings --------------------------------------------------------

export type ComicCounter = { page: number; panel: number };

/**
 * Counts a comic page or panel and returns its printed label ("PAGE 3",
 * "PANEL 2"); null for any other block. Pages and panels are numbered by
 * position, exactly as the editor's CSS counters show them.
 */
export function comicLabel(block: DocNode, counter: ComicCounter): string | null {
  if (block.type === COMIC_PAGE) {
    counter.page++;
    counter.panel = 0;
    return `PAGE ${counter.page}`;
  }
  if (block.type === COMIC_PANEL) {
    counter.panel++;
    return `PANEL ${counter.panel}`;
  }
  return null;
}

/**
 * The outline heading a script block makes, if any. Comic pages and panels are
 * headed by their number, since their own text is optional.
 */
export function scriptHeading(block: DocNode, text: string, counter: ComicCounter): { level: number; text: string } | null {
  const level = block.type ? scriptHeadingLevels[block.type] : undefined;
  if (!level) return null;
  const label = comicLabel(block, counter);
  const own = isUppercaseElement(block.type) ? text.trim().toUpperCase() : text.trim();
  if (label) {
    const title = label.charAt(0) + label.slice(1).toLowerCase();
    return { level, text: block.type === COMIC_PAGE && own ? `${title}: ${own}` : title };
  }
  return own ? { level, text: own } : null;
}

// ---- Starting bodies ---------------------------------------------------------------------

type Block = { type: string; children: Array<{ text: string }> };
const empty = (type: string): Block => ({ type, children: [{ text: "" }] });

/** What a new document in each script format starts with. Fixed, because the collab server seeds the same body. */
export const scriptStarters: Record<Exclude<ScriptFormat, "prose">, Block[]> = {
  screenplay: [empty(SCENE_HEADING)],
  stageplay: [empty(SCENE_HEADING)],
  comic: [empty(COMIC_PAGE), empty(COMIC_PANEL)],
  audio: [empty(SCENE_HEADING)],
};
