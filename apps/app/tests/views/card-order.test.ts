import { describe, expect, test } from "bun:test";
import { stepPosition } from "@/lib/card-order";
import { linkList } from "@/lib/graph-list";

// Moving a corkboard card one place left or right (lib/card-order.ts).
describe("stepPosition", () => {
  const cards = [
    { id: "a", position: "a0" },
    { id: "b", position: "a1" },
    { id: "c", position: "a2" },
  ];
  const order = (moved: string, position: string) =>
    cards
      .map((c) => (c.id === moved ? { ...c, position } : c))
      .sort((x, y) => (x.position < y.position ? -1 : 1))
      .map((c) => c.id)
      .join("");

  test("moves left past one neighbour", () => {
    expect(order("c", stepPosition(cards, "c", -1)!)).toBe("acb");
    expect(order("b", stepPosition(cards, "b", -1)!)).toBe("bac");
  });
  test("moves right past one neighbour", () => {
    expect(order("a", stepPosition(cards, "a", 1)!)).toBe("bac");
    expect(order("b", stepPosition(cards, "b", 1)!)).toBe("acb");
  });
  test("stays put at either end, or when unknown", () => {
    expect(stepPosition(cards, "a", -1)).toBeNull();
    expect(stepPosition(cards, "c", 1)).toBeNull();
    expect(stepPosition(cards, "x", 1)).toBeNull();
  });
  test("gives up when neighbours share a position", () => {
    const tied = [
      { id: "a", position: "a0" },
      { id: "b", position: "a1" },
      { id: "c", position: "a1" },
    ];
    expect(stepPosition(tied, "a", 1)).toBeNull();
  });
});

// The graph's List mode (lib/graph-list.ts).
describe("linkList", () => {
  const notes = [
    { id: "1", label: "Romeo" },
    { id: "2", label: "Juliet" },
    { id: "3", label: "Verona" },
  ];
  test("lists links both ways, by title", () => {
    const list = linkList(notes, [
      { source: "1", target: "2", kind: "wiki" },
      { source: "1", target: "3", kind: "wiki" },
      { source: "2", target: "1", kind: "embed" },
      { source: "1", target: "1", kind: "wiki" },
      { source: "1", target: "9", kind: "wiki" },
    ]);
    expect(list.map((n) => n.label)).toEqual(["Juliet", "Romeo", "Verona"]);
    const romeo = list.find((n) => n.id === "1")!;
    expect(romeo.linksTo.map((n) => n.label)).toEqual(["Juliet", "Verona"]);
    expect(romeo.linkedFrom.map((n) => n.label)).toEqual(["Juliet"]);
    expect(list.find((n) => n.id === "3")!.linkedFrom.map((n) => n.id)).toEqual(["1"]);
  });
  test("leaves out a kind of link", () => {
    const list = linkList(notes, [{ source: "1", target: "2", kind: "property" }], "property");
    expect(list.every((n) => n.linksTo.length === 0 && n.linkedFrom.length === 0)).toBe(true);
  });
});
