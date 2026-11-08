import { describe, expect, test } from "bun:test";
import { gregorian, parseStoryDate, type Calendar } from "../src/lib/story-calendar";
import type { ViewNode } from "../src/lib/views-api";
import { buildTimeline, cardsIn, codexEntries, codexSections, defsFor, gridRows, groupByDay, itemWhen, NONE, propertyText, stepTarget, trailOf } from "../src/lib/views-model";

// The phone's story views (src/lib/views-model.ts) lay things out by the web views' rules.

const node = (id: string, over: Partial<ViewNode> = {}): ViewNode => ({
  id,
  parentId: null,
  kind: "scene",
  title: id,
  synopsis: null,
  tags: [],
  aliases: [],
  status: null,
  wordCount: 0,
  updatedAt: "",
  canEdit: true,
  revealReleaseId: null,
  position: "a0",
  properties: {},
  settings: {},
  entityTypeId: null,
  canon: "canon",
  label: null,
  ...over,
});

describe("timeline", () => {
  const nodes = [
    node("a", { properties: { "story-date": "1820-05-03", duration: "2 days" } }),
    node("b", { properties: { "story-date": "1820-05-03 14:00", pov: "ada" } }),
    node("c"),
    node("ada", { kind: "character" }),
    node("f", { kind: "folder", properties: { "story-date": "1820-01-01" } }),
  ];

  test("dated scenes and events, undated scenes apart, folders left out", () => {
    const { items, undated, lanes } = buildTimeline({ nodes, events: [{ id: "e", nodeId: null, title: "Storm", description: null, start: parseStoryDate(gregorian, "1820-05-01")!, end: null, lane: null, color: null }], threads: [], cells: [], calendar: gregorian, laneMode: "none" });
    expect(items.map((i) => i.id)).toEqual(["e", "a", "b"]);
    expect(undated.map((n) => n.id)).toEqual(["c"]);
    expect(lanes).toEqual([]);
    expect(items[1].end! - items[1].start).toBe(2 * 24 * 60);
  });

  test("lanes by POV, with an Unassigned lane", () => {
    const { items, lanes } = buildTimeline({ nodes, events: [], threads: [], cells: [], calendar: gregorian, laneMode: "pov" });
    expect(lanes.map((l) => l.key)).toEqual(["ada", NONE]);
    expect(items.find((i) => i.id === "b")!.lanes).toEqual(["ada"]);
    expect(items.find((i) => i.id === "a")!.lanes).toEqual([NONE]);
  });

  test("lanes by thread take the thread's colour; a horizon hides what isn't known", () => {
    const { items } = buildTimeline({ nodes, events: [], threads: [{ id: "t", name: "Love", color: "#123456", position: "a0", closedNodeId: null }], cells: [{ nodeId: "a", threadId: "t", note: "" }], calendar: gregorian, laneMode: "thread", knows: (id) => id !== "b" });
    expect(items.map((i) => [i.id, i.color])).toEqual([["a", "#123456"]]);
  });

  test("grouped by day, with the time and length under the title", () => {
    const { items } = buildTimeline({ nodes, events: [], threads: [], cells: [], calendar: gregorian, laneMode: "none" });
    const groups = groupByDay(items, gregorian);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([["3 May 1820", 2]]);
    expect(itemWhen(items[0], gregorian)).toBe("for 2d");
    expect(itemWhen(items[1], gregorian)).toBe("14:00");
  });

  test("an invented calendar", () => {
    const cal: Calendar = { id: "x", name: "Reckoning", definition: { months: [{ name: "Frost", days: 30 }, { name: "Thaw", days: 30 }], hoursPerDay: 20 } };
    const { items } = buildTimeline({ nodes: [node("s", { properties: { "story-date": "312-02-04" } })], events: [], threads: [], cells: [], calendar: cal, laneMode: "none" });
    expect(groupByDay(items, cal)[0].label).toBe("4 Thaw 312");
  });
});

describe("corkboard", () => {
  const nodes = [node("ch", { kind: "chapter" }), node("x", { parentId: "ch" }), node("y", { parentId: "ch" }), node("z", { parentId: "ch" }), node("b", { parentId: "ch", kind: "canvas" })];
  test("cards are the children, without boards", () => expect(cardsIn(nodes, "ch").map((n) => n.id)).toEqual(["x", "y", "z"]));
  test("a step says which card to go after", () => {
    const cards = cardsIn(nodes, "ch");
    expect(stepTarget(cards, "y", -1)).toBeNull();
    expect(stepTarget(cards, "y", 1)).toBe("z");
    expect(stepTarget(cards, "z", -1)).toBe("x");
    expect(stepTarget(cards, "x", -1)).toBeUndefined();
    expect(stepTarget(cards, "z", 1)).toBeUndefined();
  });
  test("the trail from the top", () => expect(trailOf(nodes, "x").map((n) => n.id)).toEqual(["ch", "x"]));
});

describe("plot grid", () => {
  test("chapters and scenes, scenes inside chapters a step in", () => {
    const rows = gridRows([node("f", { kind: "folder" }), node("ch", { kind: "chapter", parentId: "f" }), node("s", { parentId: "ch" }), node("n", { kind: "note" })]);
    expect(rows.map((r) => [r.node.id, r.depth])).toEqual([["ch", 0], ["s", 1]]);
  });
});

describe("codex", () => {
  const types = [{ id: "fac", name: "Faction", plural: "Factions", icon: "flag", color: "#000000", position: "a0", schema: [{ key: "leader", label: "Leader", type: "node" as const }] }];
  test("built-in kinds, then the project's types", () => expect(codexSections(types).map((s) => s.label)).toEqual(["Characters", "Places", "Research", "Notes", "Factions"]));
  test("find by name or alias, sorted", () => {
    const nodes = [node("2", { kind: "character", title: "Zed" }), node("1", { kind: "character", title: "Ada", aliases: ["The Quill"] }), node("3", { kind: "location", title: "Quay" })];
    expect(codexEntries(nodes, "character", "").map((n) => n.title)).toEqual(["Ada", "Zed"]);
    expect(codexEntries(nodes, "character", "quill").map((n) => n.title)).toEqual(["Ada"]);
  });
  test("a type's fields, and values as words", () => {
    const defs = defsFor(node("e", { kind: "entity", entityTypeId: "fac" }), [], types);
    expect(defs.map((d) => d.label)).toEqual(["Leader"]);
    expect(propertyText("node", ["1", "gone"], (id) => (id === "1" ? "Ada" : undefined))).toBe("Ada");
    expect(propertyText("checkbox", false, () => undefined)).toBe("No");
    expect(propertyText("url", "https://www.example.com/", () => undefined)).toBe("example.com");
    expect(propertyText("text", "", () => undefined)).toBe("");
  });
});
