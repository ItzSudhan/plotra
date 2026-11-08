import { describe, expect, test } from "bun:test";
import { absolute, boardScene, readingOrder } from "../src/components/maps/board-scene";
import { orderedNodes, type DialogueGraph } from "../src/components/maps/dialogue/model";
import { choose, continuePlay, startPlay } from "../src/components/maps/dialogue/play";
import { circleLayout, familyTree, forceLayout, neighbourhood } from "../src/components/maps/layout";
import type { Board } from "../src/lib/maps-api";

// The phone's graph, relationship map, boards and dialogues: the parts that are pure.

describe("forceLayout", () => {
  test("places every note, the same way each time, and linked notes closer than unlinked", () => {
    const ids = ["a", "b", "c", "d", "e", "f"];
    const links = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "d", to: "e" },
    ];
    const one = forceLayout(ids, links);
    const two = forceLayout(ids, links);
    expect([...one.keys()]).toEqual(ids);
    expect([...one.values()]).toEqual([...two.values()]);
    const d = (x: string, y: string) => Math.hypot(one.get(x)!.x - one.get(y)!.x, one.get(x)!.y - one.get(y)!.y);
    expect(d("a", "b")).toBeLessThan(d("a", "e"));
    for (const p of one.values()) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });

  test("keeps the fixed note in the middle, and copes with none at all", () => {
    expect(forceLayout(["a", "b"], [{ from: "a", to: "b" }], { fixed: "a" }).get("a")).toEqual({ x: 0, y: 0 });
    expect(forceLayout([], []).size).toBe(0);
  });

  test("lays out a big project", () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `n${i}`);
    const links = ids.slice(1).map((id, i) => ({ from: ids[i], to: id }));
    const started = Date.now();
    expect(forceLayout(ids, links).size).toBe(1200);
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});

test("neighbourhood: the notes a number of links away", () => {
  const links = [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
    { from: "c", to: "d" },
  ];
  expect([...neighbourhood("a", links, 1)].sort()).toEqual(["a", "b"]);
  expect([...neighbourhood("b", links, 2)].sort()).toEqual(["a", "b", "c", "d"]);
});

test("circleLayout puts everyone on one circle", () => {
  const at = circleLayout(["a", "b", "c", "d"]);
  const r = [...at.values()].map((p) => Math.round(Math.hypot(p.x, p.y)));
  expect(new Set(r).size).toBe(1);
});

test("familyTree: children a generation below, spouses side by side, the rest left out", () => {
  const people = ["Mum", "Dad", "Kid", "Stranger"].map((title) => ({ id: title, title }));
  const tree = familyTree(people, [
    { from: "Mum", to: "Kid", type: "parent" },
    { from: "Dad", to: "Kid", type: "parent" },
    { from: "Mum", to: "Dad", type: "spouse" },
  ]);
  expect(tree.generation.get("Kid")).toBe(1);
  expect(tree.positions.get("Mum")!.y).toBe(tree.positions.get("Dad")!.y);
  expect(tree.positions.get("Kid")!.y).toBeGreaterThan(tree.positions.get("Mum")!.y);
  expect(tree.left).toEqual(["Stranger"]);
});

describe("boards", () => {
  const board: Board = {
    map: false,
    cards: {
      g: { type: "group", x: 100, y: 100, w: 400, h: 300, text: "Act one" },
      n: { type: "note", x: 10, y: 20, parentId: "g", nodeId: "scene1" },
      t: { type: "text", x: 0, y: 0, text: "Hello" },
      s: { type: "stroke", x: 5, y: 5 },
    },
    edges: { e: { source: "t", target: "n", label: "then" }, gone: { source: "t", target: "s" } },
    marks: {},
  };

  test("a card in a group is placed from the group", () => {
    expect(absolute(board.cards, "n")).toEqual({ x: 110, y: 120 });
  });

  test("cards become scene nodes with their notes' titles; strokes and their arrows are left out", () => {
    const scene = boardScene(board, (id) => (id === "scene1" ? { title: "The heist", synopsis: "It goes wrong", known: true } : undefined), { movable: true, accent: "#e2602a", line: "#999" });
    expect(scene.nodes.map((n) => n.id).sort()).toEqual(["g", "n", "t"]);
    const note = scene.nodes.find((n) => n.id === "n")!;
    expect([note.label, note.body, note.x, note.y, note.w]).toEqual(["The heist", "It goes wrong", 110, 120, 220]);
    expect(scene.nodes.find((n) => n.id === "g")!.movable).toBe(false);
    expect(scene.edges.map((e) => e.id)).toEqual(["e"]);
  });

  test("a note readers don't know yet isn't named", () => {
    const scene = boardScene(board, () => ({ title: "Secret", synopsis: null, known: false }), { movable: false, accent: "#000", line: "#999" });
    const note = scene.nodes.find((n) => n.id === "n")!;
    expect(note.label).toBe("Not revealed yet");
    expect(note.dim).toBe(true);
  });

  test("reading order is top to bottom", () => {
    expect(readingOrder(board)).toEqual(["t", "n"]);
  });
});

describe("dialogues", () => {
  const graph: DialogueGraph = {
    nodes: {
      start: { type: "start", x: 0, y: 0 },
      hello: { type: "line", x: 0, y: 100, speaker: "Ana", text: "You have {$gold} gold." },
      buy: { type: "choice", x: 0, y: 200, text: "Buy the map" },
      leave: { type: "choice", x: 200, y: 200, text: "Leave" },
      pay: { type: "set", x: 0, y: 300, expr: "gold -= 5" },
      rich: { type: "condition", x: 0, y: 400, expr: "gold > 0" },
      yes: { type: "line", x: 0, y: 500, text: "Still rich." },
      no: { type: "line", x: 200, y: 500, text: "Broke." },
    },
    edges: {
      a: { source: "start", target: "hello" },
      b: { source: "hello", target: "buy" },
      c: { source: "hello", target: "leave" },
      d: { source: "buy", target: "pay" },
      e: { source: "pay", target: "rich" },
      f: { source: "rich", target: "yes", sourceHandle: "true" },
      g: { source: "rich", target: "no", sourceHandle: "false" },
    },
    variables: { gold: { name: "gold", value: 5, order: 0 } },
  };

  test("plays as the web does: lines, choices, variables and conditions", () => {
    let state = startPlay(graph, { seed: 1 });
    // A line that leads to choices offers them with it.
    expect(state.transcript.at(-1)).toMatchObject({ kind: "line", text: "You have 5 gold." });
    expect(state.status).toBe("choices");
    expect(state.options.map((o) => o.text)).toEqual(["Buy the map", "Leave"]);
    state = choose(graph, state, "buy");
    expect(state.variables.gold).toBe(0);
    expect(state.transcript.at(-1)).toMatchObject({ kind: "line", text: "Broke." });
    expect(continuePlay(graph, state).status).toBe("ended");
  });

  test("the outline starts at Start and follows the branches", () => {
    expect(orderedNodes(graph).slice(0, 3)).toEqual(["start", "hello", "buy"]);
  });
});
