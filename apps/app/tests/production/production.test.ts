import { describe, expect, test } from "bun:test";
import type { CardData } from "@/lib/canvas";
import type { DocNode } from "@/lib/doc-index";
import { breakdown, csv, elementReport, formatSeconds, scriptLines, shotList, type ScriptSection } from "@/lib/production";

// Production reads scripts and storyboards as plain values: breakdowns by
// scene and element, recording sheets by line, shot lists in reading order,
// and CSV files of each.

let ids = 0;
const block = (type: string, ...children: DocNode[]): DocNode => ({ id: `b${++ids}`, type, children });
const t = (text: string, marks: Record<string, unknown> = {}): DocNode => ({ text, ...marks });
const el = (type: string, text: string) => block(type, t(text));
const section = (id: string, title: string, value: DocNode[]): ScriptSection => ({ id, title, kind: "scene", value });

describe("breakdown", () => {
  test("each scene heading starts a scene, and text before the first is a scene named after the note", () => {
    const scenes = breakdown([
      section("n1", "Opening", [
        el("action", "Rain on the window."),
        el("scene_heading", "INT. KITCHEN - NIGHT"),
        el("character", "JANE (V.O.)"),
        el("dialogue", "Who's there?"),
        el("scene_heading", "EXT. YARD - CONTINUOUS"),
        el("action", "Nothing moves."),
      ]),
      section("n2", "Later", [el("action", "A car pulls up.")]),
    ]);
    expect(scenes.map((s) => [s.number, s.heading, s.setting, s.location, s.time])).toEqual([
      [1, "Opening", "", "", ""],
      [2, "INT. KITCHEN - NIGHT", "INT", "KITCHEN", "NIGHT"],
      [3, "EXT. YARD - CONTINUOUS", "EXT", "YARD", "CONTINUOUS"],
      [4, "Later", "", "", ""],
    ]);
    expect(scenes[1].elements.cast).toEqual(["JANE"]);
    expect(new Set(scenes.map((s) => s.key)).size).toBe(4);
  });

  test("tagged words are elements, once per scene ignoring case; tags in writer's notes are not read", () => {
    const [scene] = breakdown([
      section("n1", "One", [
        el("scene_heading", "INT. HALL - DAY"),
        block("action", t("She lifts "), t("the revolver", { breakdown: "props" }), t(" and "), t("The Revolver", { breakdown: "props" }), t(".")),
        block("action", t("Her "), t("red ", { breakdown: "wardrobe" }), t("coat", { breakdown: "wardrobe" })),
        block("action", t("a hidden note", { breakdown: "props", script_note: true })),
      ]),
    ]);
    expect(scene.elements.props).toEqual(["the revolver"]);
    expect(scene.elements.wardrobe).toEqual(["red coat"]);
  });

  test("a heading with nothing under it is kept only when it has a setting", () => {
    const scenes = breakdown([section("n1", "One", [el("scene_heading", "INT. ATTIC - DAY"), el("scene_heading", "MONTAGE")])]);
    expect(scenes.map((s) => s.heading)).toEqual(["INT. ATTIC - DAY"]);
  });

  test("the element report lists categories in order, most-needed elements first", () => {
    const scenes = breakdown([
      section("a", "A", [el("character", "TOM"), el("dialogue", "Hi."), block("action", t("lamp", { breakdown: "props" }))]),
      section("b", "B", [el("character", "ANNA"), el("dialogue", "Hey."), el("character", "TOM"), el("dialogue", "Bye.")]),
    ]);
    expect(elementReport(scenes).map((r) => [r.category, r.name, r.scenes])).toEqual([
      ["cast", "TOM", [1, 2]],
      ["cast", "ANNA", [2]],
      ["props", "lamp", [1]],
    ]);
  });
});

describe("recording sheets", () => {
  test("every dialogue line, with its speaker, delivery and scene", () => {
    const lines = scriptLines([
      section("n1", "Cold open", [
        el("dialogue", "Hello?"),
        el("scene_heading", "int. lab - day"),
        el("character", "DR. MOSS (O.S.)"),
        el("parenthetical", "(whispering)"),
        el("dialogue", "Don't move."),
        el("dialogue", "Please."),
        el("character", "KIT"),
        el("dialogue", ""),
      ]),
    ]);
    expect(lines.map((l) => [l.order, l.character, l.direction, l.text, l.scene])).toEqual([
      [0, "Unknown", null, "Hello?", "Cold open"],
      [1, "DR. MOSS", "whispering", "Don't move.", "INT. LAB - DAY"],
      [2, "DR. MOSS", null, "Please.", "INT. LAB - DAY"],
    ]);
  });

  test("two scenes with the same heading are told apart", () => {
    const lines = scriptLines([
      section("n1", "One", [
        el("scene_heading", "INT. CAR - NIGHT"),
        el("character", "A"),
        el("dialogue", "One."),
        el("scene_heading", "INT. CAR - NIGHT"),
        el("character", "A"),
        el("dialogue", "Two."),
      ]),
      section("n2", "One", [el("character", "A"), el("dialogue", "Three.")]),
    ]);
    expect(new Set(lines.map((l) => l.sceneKey)).size).toBe(3);
  });
});

describe("shot lists", () => {
  const card = (patch: Partial<CardData>): CardData => ({ type: "image", x: 0, y: 0, ...patch });

  test("shots are read in rows, top to bottom and left to right, with uneven tops", () => {
    const shots = shotList({
      a: card({ x: 400, y: 0, caption: "A" }),
      b: card({ x: 0, y: 50, caption: "B" }),
      c: card({ x: 200, y: 100, caption: "C" }),
      d: card({ x: 0, y: 300, caption: "D" }),
      note: { type: "note", x: 0, y: 0, nodeId: "x" },
    });
    // A row starts at its top-most card: B is level with A, C (100 below A) starts the next row.
    expect(shots.map((s) => [s.number, s.caption])).toEqual([
      [1, "B"],
      [2, "A"],
      [3, "C"],
      [4, "D"],
    ]);
  });

  test("cards in groups, even nested ones, are placed by where they really are, under the group's label", () => {
    const shots = shotList({
      outer: { type: "group", x: 1000, y: 0, text: "Act one" },
      inner: { type: "group", x: 0, y: 0, parentId: "outer", text: " Chase " },
      late: card({ x: 10, y: 0, parentId: "inner", shot: "Wide" }),
      early: card({ x: 500, y: 0, move: "Pan", duration: 4 }),
      text: { type: "text", x: 2000, y: 0, text: "Insert: the watch", duration: 2 },
    });
    expect(shots.map((s) => [s.id, s.sequence, s.shot, s.move, s.duration, s.caption])).toEqual([
      ["early", null, null, "Pan", 4, ""],
      ["late", "Chase", "Wide", null, null, ""],
      ["text", null, null, null, 2, "Insert: the watch"],
    ]);
  });

  test("running time as minutes and seconds", () => {
    expect(formatSeconds(0)).toBe("0:00");
    expect(formatSeconds(125)).toBe("2:05");
    expect(formatSeconds(59.6)).toBe("1:00");
    expect(formatSeconds(119.5)).toBe("2:00");
  });
});

describe("csv", () => {
  test("quotes what needs it, keeps a BOM, and doesn't let a cell run as a formula", () => {
    const file = csv([
      ["#", "Line"],
      [1, 'She said "no", twice'],
      [2, "=HYPERLINK(\"x\")"],
      [-3, "@cmd"],
      [null, undefined],
    ]);
    expect(file).toBe(`﻿#,Line\r\n1,"She said ""no"", twice"\r\n2,"'=HYPERLINK(""x"")"\r\n-3,'@cmd\r\n,\r\n`);
  });
});
