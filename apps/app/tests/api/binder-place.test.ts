import { describe, expect, test } from "bun:test";
import type { NodeKind } from "@plotra/db/schema";
import { placeFor, type MoveTo } from "@/lib/api/binder-place";
import { indexNodes, liveChildren, type BinderNode } from "@/lib/tree";

// Where the API (and so the phone app) moves a note: the web binder's rules, without position keys.

const node = (id: string, parentId: string | null, position: string, kind: NodeKind = "scene", deleted = false) =>
  ({ id, parentId, position, kind, title: id, deletedAt: deleted ? new Date() : null }) as unknown as BinderNode;

// Part 1 (a, b, gone (trashed), c), Part 2 (d), loose
const nodes = [
  node("p1", null, "a0", "folder"),
  node("a", "p1", "a0"),
  node("b", "p1", "a1"),
  node("gone", "p1", "a2", "scene", true),
  node("c", "p1", "a3"),
  node("p2", null, "a1", "folder"),
  node("d", "p2", "a0"),
  node("loose", null, "a2"),
];
const index = indexNodes(nodes);

/** The live order under each parent after the move. */
function moved(id: string, to: MoveTo) {
  const result = placeFor(index, id, to);
  if ("error" in result) throw new Error(result.error);
  const next = indexNodes(nodes.map((n) => (n.id === id ? { ...n, ...result.place } : n)));
  return (parentId: string | null) => liveChildren(next, parentId).map((n) => n.id);
}

describe("moving a note through the API", () => {
  test("steps up and down past visible neighbours", () => {
    expect(moved("c", { step: "up" })("p1")).toEqual(["a", "c", "b"]);
    expect(moved("a", { step: "down" })("p1")).toEqual(["b", "a", "c"]);
    expect(placeFor(index, "a", { step: "up" })).toEqual({ error: "It's already at the top." });
  });

  test("goes to the end of a folder, or of the top level", () => {
    expect(moved("a", { parentId: "p2" })("p2")).toEqual(["d", "a"]);
    expect(moved("a", { parentId: null })(null)).toEqual(["p1", "p2", "loose", "a"]);
    // Already there: to its end.
    expect(moved("a", { parentId: "p1" })("p1")).toEqual(["b", "c", "a"]);
  });

  test("goes just before or after another note, wherever it is", () => {
    expect(moved("d", { before: "b" })("p1")).toEqual(["a", "d", "b", "c"]);
    expect(moved("d", { after: "c" })("p1")).toEqual(["a", "b", "c", "d"]);
    expect(moved("a", { after: "b" })("p1")).toEqual(["b", "a", "c"]);
    expect(moved("loose", { before: "p1" })(null)).toEqual(["loose", "p1", "p2"]);
  });

  test("never into itself, or next to a note in the trash", () => {
    expect(placeFor(index, "p1", { parentId: "p1" })).toEqual({ error: "Can't move a folder inside itself." });
    expect(placeFor(index, "p1", { before: "b" })).toEqual({ error: "Can't move a folder inside itself." });
    expect("error" in placeFor(index, "a", { after: "gone" })).toBe(true);
    expect("error" in placeFor(index, "a", { before: "b", after: "c" })).toBe(true);
    expect(placeFor(index, "gone", { step: "up" })).toEqual({ error: "Not found." });
  });
});
