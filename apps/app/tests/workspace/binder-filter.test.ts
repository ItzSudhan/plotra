import { describe, expect, test } from "bun:test";
import type { NodeKind } from "@plotra/db/schema";
import { filterBinder, fold, highlightParts, typeAhead } from "@/components/workspace/binder-filter";
import { indexNodes, type BinderNode } from "@/lib/tree";

// The binder's "Filter…" box and first-letter type-ahead.

const node = (id: string, title: string, parentId: string | null, position: string, kind: NodeKind = "scene", deleted = false) =>
  ({ id, parentId, position, kind, title, deletedAt: deleted ? new Date() : null }) as unknown as BinderNode;

// Part One > Chapter 1 > (The Café, Arrival), Part Two > (Leaving, Old café (trashed)), Notes
const index = indexNodes([
  node("p1", "Part One", null, "a0", "folder"),
  node("c1", "Chapter 1", "p1", "a0", "chapter"),
  node("cafe", "The Café", "c1", "a0"),
  node("arrival", "Arrival", "c1", "a1"),
  node("p2", "Part Two", null, "a1", "folder"),
  node("dep", "Leaving", "p2", "a0"),
  node("old", "Old café", "p2", "a1", "scene", true),
  node("notes", "Notes", null, "a2", "note"),
]);

describe("filterBinder", () => {
  test("blank text filters nothing", () => {
    expect(filterBinder(index, "")).toBeNull();
    expect(filterBinder(index, "   ")).toBeNull();
  });

  test("matches ignore case and accents, and keep the path to them open", () => {
    const f = filterBinder(index, "CAFE")!;
    expect([...f.matches]).toEqual(["cafe"]);
    expect(new Set(f.shown)).toEqual(new Set(["cafe", "c1", "p1"]));
    expect(new Set(f.open)).toEqual(new Set(["c1", "p1"]));
  });

  test("trashed notes don't match", () => {
    expect(filterBinder(index, "old")!.matches.size).toBe(0);
  });

  test("a matching folder shows without opening, unless something inside matches too", () => {
    const f = filterBinder(index, "part")!;
    expect(new Set(f.matches)).toEqual(new Set(["p1", "p2"]));
    expect(f.open.size).toBe(0);
    const g = filterBinder(index, "r")!;
    expect(g.matches.has("p1") && g.matches.has("arrival")).toBe(true);
    expect(g.open.has("p1")).toBe(true);
  });
});

describe("highlightParts", () => {
  test("marks the matching part, in the title's own spelling", () => {
    expect(highlightParts("The Café", "cafe")).toEqual([
      { text: "The ", match: false },
      { text: "Café", match: true },
    ]);
  });

  test("marks every match and copes with decomposed accents", () => {
    const title = "Café and cafe";
    const parts = highlightParts(title, "CAFÉ");
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(["Café", "cafe"]);
    expect(parts.map((p) => p.text).join("")).toBe(title);
  });

  test("no match leaves the title whole", () => {
    expect(highlightParts("Arrival", "zz")).toEqual([{ text: "Arrival", match: false }]);
    expect(highlightParts("Arrival", "")).toEqual([{ text: "Arrival", match: false }]);
  });
});

describe("typeAhead", () => {
  const rows = ["p1", "c1", "cafe", "arrival", "p2", "dep"].map((id) => index.byId.get(id)!);

  test("jumps to the next row starting with the letter, going round", () => {
    expect(typeAhead(rows, "p1", "p")?.id).toBe("p2");
    expect(typeAhead(rows, "p2", "P")?.id).toBe("p1");
    expect(typeAhead(rows, "cafe", "a")?.id).toBe("arrival");
    expect(typeAhead(rows, null, "c")?.id).toBe("c1");
  });

  test("nothing starting with it, nothing happens", () => {
    expect(typeAhead(rows, "p1", "z")).toBeUndefined();
  });

  test("fold takes off accents", () => {
    expect(fold("Élan")).toBe("elan");
  });
});
