// Printable Production sheets: the breakdown (by scene and by element), the
// recording sheet and the shot list laid out as production paperwork. Pure: it
// turns report rows into a sheet (title, columns, groups of rows) that
// components/views/production-print.tsx renders and the browser prints, the
// same print path as the Read view's "Export as PDF".

import { safeUrl } from "./publish/html";
import { categoryMeta, formatSeconds, type BreakdownCategory, type BreakdownScene, type ElementReport, type ScriptLine, type Shot } from "./production";
import { count } from "./plural";

/** A cell: plain text, text with a small line above or below it, or a picture. */
export type PrintCell = string | { text: string; before?: string; after?: string } | { image: string | null };

export type PrintColumn = {
  label: string;
  /** A CSS width; columns without one share what's left. */
  width?: string;
  align?: "right";
};

export type PrintGroup = {
  /** A band above the rows (a scene, a category, a sequence); null for none. */
  heading: string | null;
  rows: PrintCell[][];
  /** Kept on one page when it fits: set for groups short enough not to leave a page mostly empty. */
  keep: boolean;
};

export type PrintSheet = {
  /** "Breakdown by scene", "Recording sheet", "Shot list". */
  title: string;
  project: string;
  /** The folder or canvas the sheet covers, when not the whole project. */
  scope: string | null;
  date: string;
  /** Filters and totals, one short phrase each. */
  details: string[];
  columns: PrintColumn[];
  groups: PrintGroup[];
  orientation: "portrait" | "landscape";
};

type Header = { project: string; scope: string | null; date: string };

/** Groups longer than this may break across pages; shorter ones move to the next page whole. */
export const KEEP_ROWS = 14;

/** Splits rows into runs that share a key, in order: a scene's lines, a sequence's shots. */
export function runs<T>(items: T[], keyOf: (item: T) => string): T[][] {
  const out: T[][] = [];
  let last: string | undefined;
  for (const item of items) {
    const key = keyOf(item);
    if (out.length && key === last) out.at(-1)!.push(item);
    else out.push([item]);
    last = key;
  }
  return out;
}

const group = (heading: string | null, rows: PrintCell[][]): PrintGroup => ({ heading, rows, keep: rows.length <= KEEP_ROWS });


/** The breakdown, one row per scene, one column per category in use. */
export function breakdownBySceneSheet(scenes: BreakdownScene[], used: readonly BreakdownCategory[], header: Header): PrintSheet {
  const locations = new Set(scenes.map((s) => s.location).filter(Boolean)).size;
  const cast = new Set(scenes.flatMap((s) => (s.elements.cast ?? []).map((n) => n.toLowerCase()))).size;
  return {
    ...header,
    title: "Breakdown by scene",
    details: [count(scenes.length, "scene"), count(locations, "location"), count(cast, "cast member")],
    columns: [
      { label: "#", width: "2.2rem", align: "right" },
      { label: "Scene", width: used.length > 4 ? "11rem" : "14rem" },
      ...used.map((c) => ({ label: categoryMeta(c).label })),
    ],
    // One row per scene: rows never split, but the sheet runs on from page to page.
    groups: [
      {
        heading: null,
        keep: false,
        rows: scenes.map((s) => [
          String(s.number),
          { text: s.heading, after: [s.setting, s.time, count(s.words, "word")].filter(Boolean).join(" · ") },
          ...used.map((c) => (s.elements[c] ?? []).join(", ")),
        ]),
      },
    ],
    orientation: used.length > 3 ? "landscape" : "portrait",
  };
}

/** The breakdown turned round: each category in use, its elements and the scenes they're needed in. */
export function breakdownByElementSheet(report: ElementReport[], header: Header): PrintSheet {
  const categories = runs(report, (r) => r.category);
  return {
    ...header,
    title: "Breakdown by element",
    details: [count(report.length, "element"), count(categories.length, "category", "categories")],
    columns: [{ label: "Element" }, { label: "Scenes", width: "45%" }, { label: "Count", width: "3.5rem", align: "right" }],
    groups: categories.map((rows) =>
      group(
        categoryMeta(rows[0].category).label,
        rows.map((r) => [r.name, r.scenes.join(", "), String(r.scenes.length)]),
      ),
    ),
    orientation: "portrait",
  };
}

export type RecordingRow = { line: ScriptLine; status: string; note: string | null; actor: string | null };

/** A recording sheet of the lines shown (the filters already applied), grouped by scene. */
export function recordingSheet(
  rows: RecordingRow[],
  filters: { character: string | null; status: string | null; actor: string | null; total: number; recorded: number },
  header: Header,
): PrintSheet {
  const details = [
    filters.character ? `Character: ${filters.character}` : null,
    filters.actor ? `Played by ${filters.actor}` : null,
    filters.status ? `Status: ${filters.status}` : null,
    count(rows.length, "line"),
    `${filters.recorded.toLocaleString("en")} of ${filters.total.toLocaleString("en")} recorded in the script`,
  ].filter((d): d is string => d !== null);
  return {
    ...header,
    title: filters.character ? `Recording sheet: ${filters.character}` : "Recording sheet",
    details,
    columns: [
      { label: "#", width: "2.6rem", align: "right" },
      { label: "Character", width: "8.5rem" },
      { label: "Line" },
      { label: "Status", width: "5.5rem" },
      { label: "Notes for the session", width: "28%" },
    ],
    groups: runs(rows, (r) => r.line.sceneKey).map((scene) =>
      group(
        scene[0].line.scene,
        scene.map(({ line, status, note, actor }) => [
          String(line.order + 1),
          // The actor is already in the title when the sheet is one character's.
          actor && !filters.character ? { text: line.character.toUpperCase(), after: actor } : line.character.toUpperCase(),
          line.direction ? { text: line.text, before: `(${line.direction})` } : line.text,
          status,
          note ?? "",
        ]),
      ),
    ),
    orientation: "portrait",
  };
}

/** A storyboard's shot list, grouped by sequence; the frame column only when a shot has a picture. */
export function shotListSheet(shots: Shot[], header: Header): PrintSheet {
  const frames = shots.some((s) => safeUrl(s.url));
  const total = shots.reduce((sum, s) => sum + (s.duration ?? 0), 0);
  const dash = (v: string | null) => v || "—";
  return {
    ...header,
    title: "Shot list",
    details: [count(shots.length, "shot"), ...(total > 0 ? [`Running time ${formatSeconds(total)}`] : [])],
    columns: [
      { label: "#", width: "2.2rem", align: "right" },
      ...(frames ? [{ label: "Frame", width: "6.5rem" }] : []),
      { label: "Shot", width: "6.5rem" },
      { label: "Move", width: "6.5rem" },
      { label: "Time", width: "3.5rem", align: "right" as const },
      { label: "Description" },
    ],
    groups: runs(shots, (s) => s.sequence ?? "").map((seq) =>
      group(
        seq[0].sequence,
        seq.map((s) => [
          String(s.number),
          ...(frames ? [{ image: safeUrl(s.url) }] : []),
          dash(s.shot),
          dash(s.move),
          s.duration !== null ? `${s.duration}s` : "—",
          dash(s.caption),
        ]),
      ),
    ),
    orientation: "portrait",
  };
}
