import { describe, expect, test } from "bun:test";
import type { BreakdownScene, ElementReport, ScriptLine, Shot } from "@/lib/production";
import { breakdownByElementSheet, breakdownBySceneSheet, KEEP_ROWS, recordingSheet, runs, shotListSheet, type RecordingRow } from "@/lib/production-print";

// Printed Production sheets: the same rows as the CSV files, laid out as
// paperwork with a title block, columns and groups that keep together.

const header = { project: "The Long Night", scope: "Act One", date: "18 October 2026" };

const scene = (number: number, heading: string, extra: Partial<BreakdownScene> = {}): BreakdownScene => ({
  key: `n${number}`,
  nodeId: `n${number}`,
  number,
  heading,
  setting: "INT",
  location: heading,
  time: "NIGHT",
  words: 100,
  elements: {},
  ...extra,
});

const line = (order: number, character: string, sceneKey: string, extra: Partial<ScriptLine> = {}): ScriptLine => ({
  nodeId: "n1",
  blockId: `b${order}`,
  order,
  character,
  text: `Line ${order}`,
  direction: null,
  scene: sceneKey.toUpperCase(),
  sceneKey,
  ...extra,
});

const shot = (number: number, extra: Partial<Shot> = {}): Shot => ({
  id: `s${number}`,
  number,
  sequence: null,
  caption: "",
  shot: null,
  move: null,
  duration: null,
  url: null,
  ...extra,
});

describe("runs", () => {
  test("splits into runs of the same key, in order, and a key that comes back starts a new run", () => {
    expect(runs(["a", "a", "b", "a"], (x) => x)).toEqual([["a", "a"], ["b"], ["a"]]);
    expect(runs([], String)).toEqual([]);
  });
});

describe("breakdown sheets", () => {
  test("by scene: a row per scene with the categories in use as columns, and the header block filled in", () => {
    const sheet = breakdownBySceneSheet(
      [
        scene(1, "KITCHEN", { elements: { cast: ["JANE", "TOM"], props: ["a revolver", "keys"] } }),
        scene(2, "YARD", { setting: "EXT", location: "YARD", words: 1, elements: { cast: ["jane"] } }),
      ],
      ["cast", "props"],
      header,
    );
    expect(sheet).toMatchObject({ title: "Breakdown by scene", project: "The Long Night", scope: "Act One", date: "18 October 2026", orientation: "portrait" });
    expect(sheet.columns.map((c) => c.label)).toEqual(["#", "Scene", "Cast", "Props"]);
    expect(sheet.details).toEqual(["2 scenes", "2 locations", "2 cast members"]);
    expect(sheet.groups).toHaveLength(1);
    expect(sheet.groups[0].rows).toEqual([
      ["1", { text: "KITCHEN", after: "INT · NIGHT · 100 words" }, "JANE, TOM", "a revolver, keys"],
      ["2", { text: "YARD", after: "EXT · NIGHT · 1 word" }, "jane", ""],
    ]);
  });

  test("by scene: many categories turn the page to landscape", () => {
    expect(breakdownBySceneSheet([scene(1, "A")], ["cast", "props", "wardrobe", "vehicles"], header).orientation).toBe("landscape");
  });

  test("by element: a group per category, headed by its name, with the scenes and the count", () => {
    const report: ElementReport[] = [
      { category: "cast", name: "JANE", scenes: [1, 2, 5] },
      { category: "cast", name: "TOM", scenes: [2] },
      { category: "props", name: "a revolver", scenes: [5] },
    ];
    const sheet = breakdownByElementSheet(report, header);
    expect(sheet.groups.map((g) => g.heading)).toEqual(["Cast", "Props"]);
    expect(sheet.groups[0].rows).toEqual([
      ["JANE", "1, 2, 5", "3"],
      ["TOM", "2", "1"],
    ]);
    expect(sheet.groups.every((g) => g.keep)).toBe(true);
    expect(sheet.details).toEqual(["3 elements", "2 categories"]);
  });
});

describe("recording sheet", () => {
  const row = (l: ScriptLine, status = "Written", note: string | null = null, actor: string | null = null): RecordingRow => ({ line: l, status, note, actor });

  test("groups the lines by scene, numbers them as in the script, and puts the direction above the line", () => {
    const sheet = recordingSheet(
      [
        row(line(0, "Jane", "kitchen", { direction: "whispering" }), "Approved", "Take 3", "Ann Lee"),
        row(line(1, "Tom", "kitchen")),
        row(line(4, "Jane", "yard"), "Recorded", null, "Ann Lee"),
      ],
      { character: null, status: null, actor: null, total: 10, recorded: 4 },
      header,
    );
    expect(sheet.title).toBe("Recording sheet");
    expect(sheet.columns.map((c) => c.label)).toEqual(["#", "Character", "Line", "Status", "Notes for the session"]);
    expect(sheet.groups.map((g) => g.heading)).toEqual(["KITCHEN", "YARD"]);
    expect(sheet.groups[0].rows[0]).toEqual(["1", { text: "JANE", after: "Ann Lee" }, { text: "Line 0", before: "(whispering)" }, "Approved", "Take 3"]);
    expect(sheet.groups[0].rows[1]).toEqual(["2", "TOM", "Line 1", "Written", ""]);
    expect(sheet.groups[1].rows[0][0]).toBe("5");
    expect(sheet.details).toEqual(["3 lines", "4 of 10 recorded in the script"]);
  });

  test("the filters go into the title and the details; one character's sheet doesn't repeat the actor on each line", () => {
    const sheet = recordingSheet([row(line(0, "Jane", "kitchen"), "Approved", null, "Ann Lee")], { character: "Jane", status: "Approved", actor: "Ann Lee", total: 10, recorded: 0 }, header);
    expect(sheet.title).toBe("Recording sheet: Jane");
    expect(sheet.details.slice(0, 3)).toEqual(["Character: Jane", "Played by Ann Lee", "Status: Approved"]);
    expect(sheet.groups[0].rows[0][1]).toBe("JANE");
  });

  test("a long scene may break across pages; a short one is kept together", () => {
    const long = Array.from({ length: KEEP_ROWS + 1 }, (_, i) => row(line(i, "Jane", "long")));
    const sheet = recordingSheet([...long, row(line(99, "Tom", "short"))], { character: null, status: null, actor: null, total: 0, recorded: 0 }, header);
    expect(sheet.groups.map((g) => g.keep)).toEqual([false, true]);
  });
});

describe("shot list sheet", () => {
  test("groups by sequence, dashes for blanks, and the running time in the details", () => {
    const sheet = shotListSheet(
      [
        shot(1, { sequence: "Opening", shot: "Wide", duration: 4, caption: "Rain" }),
        shot(2, { sequence: "Opening", move: "Push in", duration: 56 }),
        shot(3),
      ],
      { ...header, scope: "Storyboard" },
    );
    expect(sheet.columns.map((c) => c.label)).toEqual(["#", "Shot", "Move", "Time", "Description"]);
    expect(sheet.groups.map((g) => g.heading)).toEqual(["Opening", null]);
    expect(sheet.groups[0].rows).toEqual([
      ["1", "Wide", "—", "4s", "Rain"],
      ["2", "—", "Push in", "56s", "—"],
    ]);
    expect(sheet.details).toEqual(["3 shots", "Running time 1:00"]);
  });

  test("a frame column when any shot has a picture, and only web addresses are printed as pictures", () => {
    const sheet = shotListSheet([shot(1, { url: "https://example.com/a.png" }), shot(2, { url: "javascript:alert(1)" })], header);
    expect(sheet.columns.map((c) => c.label)).toContain("Frame");
    expect(sheet.groups[0].rows.map((r) => r[1])).toEqual([{ image: "https://example.com/a.png" }, { image: null }]);
    expect(sheet.details).toEqual(["2 shots"]);
  });
});
