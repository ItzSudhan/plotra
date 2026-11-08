import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { canvasMaps, indexCanvas, isMap } from "@/lib/canvas";
import { nodeIcon } from "@/lib/tree";

// Maps (beat-the-competitors.md step 5): a canvas made as a map keeps its
// picture and its pins, regions and paths in the canvas's Yjs doc.

describe("a map", () => {
  test("is a canvas marked as one", () => {
    expect(isMap({ kind: "canvas", settings: { board: "map" } })).toBe(true);
    expect(isMap({ kind: "canvas", settings: {} })).toBe(false);
    expect(isMap({ kind: "scene", settings: { board: "map" } })).toBe(false);
    expect(nodeIcon({ kind: "canvas", settings: { board: "map" } })).toBe("map-linear");
    expect(nodeIcon({ kind: "canvas", settings: {} })).not.toBe("map-linear");
  });

  test("its marks' labels are its text, and the notes they stand for are its links, once each", () => {
    const doc = new Y.Doc();
    const { marks, meta } = canvasMaps(doc);
    meta.set("fileId", "f1");
    meta.set("width", 4000);
    marks.set("a", { type: "pin", x: 10, y: 20, nodeId: "verona" });
    marks.set("b", { type: "region", points: [0, 0, 10, 0, 10, 10], nodeId: "mantua", label: "The duchy of Mantua" });
    marks.set("c", { type: "path", points: [0, 0, 50, 50], label: "Road to Mantua" });
    marks.set("d", { type: "pin", x: 30, y: 40, nodeId: "verona", label: "Verona again" });
    const index = indexCanvas(doc);
    expect(index.text.split("\n")).toEqual(["The duchy of Mantua", "Road to Mantua", "Verona again"]);
    expect(index.links.map((l) => [l.targetNodeId, l.context])).toEqual([
      ["verona", "Pinned on the map"],
      ["mantua", "Drawn on the map"],
    ]);
    expect(meta.toJSON()).toEqual({ fileId: "f1", width: 4000 });
  });

  test("an ordinary canvas is unchanged: no marks, cards still linked", () => {
    const doc = new Y.Doc();
    canvasMaps(doc).cards.set("x", { type: "note", x: 0, y: 0, nodeId: "n" });
    expect(indexCanvas(doc).links.map((l) => l.context)).toEqual(["Card on the canvas"]);
  });
});

describe("a pen stroke", () => {
  test("is a card boxed around the line, its points scaled to 0–1000 in the box", async () => {
    const { strokeCard } = await import("@/lib/canvas");
    // A canvas at twice the size of the screen, moved 100 to the right.
    const toFlow = (p: { x: number; y: number }) => ({ x: p.x / 2 + 100, y: p.y / 2 });
    const card = strokeCard([{ x: 0, y: 0 }, { x: 200, y: 100 }], toFlow, "#1971c2");
    expect(card).toMatchObject({ type: "stroke", x: 96, y: -4, w: 108, h: 58, strokeWidth: 3, color: "#1971c2" });
    expect(card.points!.every((v) => v >= 0 && v <= 1000)).toBe(true);
    expect(card.points!.slice(0, 2)).toEqual([37, 69]);
    // A straight, flat line still has a box to draw in.
    expect(strokeCard([{ x: 0, y: 0 }, { x: 10, y: 0 }], (p) => p).h).toBe(8);
  });
});
