import { describe, expect, test } from "bun:test";
import type { NodeKind } from "@plotra/db/schema";
import { countWithin, indent, moveDown, moveInto, moveTargets, moveUp, newMenuKinds, outdent, quickKind } from "@/components/workspace/binder-moves";
import { indexNodes, liveChildren, type BinderNode } from "@/lib/tree";

// Moving notes in the binder by keyboard and from "Move to…" (ux-audit.md #10).

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

/** The live order under a parent after applying a move. */
function after(id: string, place: { parentId: string | null; position: string } | null) {
  if (!place) throw new Error("no move");
  const moved = indexNodes(nodes.map((n) => (n.id === id ? { ...n, ...place } : n)));
  return (parentId: string | null) => liveChildren(moved, parentId).map((n) => n.id);
}

describe("Alt+arrows", () => {
  test("up and down swap with the visible neighbour, skipping trashed notes", () => {
    expect(after("c", moveUp(index, "c"))("p1")).toEqual(["a", "c", "b"]);
    expect(after("b", moveDown(index, "b"))("p1")).toEqual(["a", "c", "b"]);
    expect(after("b", moveUp(index, "b"))("p1")).toEqual(["b", "a", "c"]);
    expect(moveUp(index, "a")).toBeNull();
    expect(moveDown(index, "c")).toBeNull();
  });

  test("right goes inside the note above, at its end; left comes out just after the parent", () => {
    expect(after("b", indent(index, "b"))("a")).toEqual(["b"]);
    expect(indent(index, "a")).toBeNull();
    const out = after("b", outdent(index, "b"));
    expect(out(null)).toEqual(["p1", "b", "p2", "loose"]);
    expect(out("p1")).toEqual(["a", "c"]);
    expect(outdent(index, "loose")).toBeNull();
  });
});

describe("Move to…", () => {
  test("offers folders outside the note, not the note or anything in it", () => {
    expect(moveTargets(index, "d").map((t) => t.node.id)).toEqual(["p1", "p2"]);
    expect(moveTargets(index, "p1").map((t) => t.node.id)).toEqual(["p2"]);
  });

  test("puts it at the end of the folder, and refuses to put a folder inside itself", () => {
    expect(after("d", moveInto(index, "d", "p1"))("p1")).toEqual(["a", "b", "c", "d"]);
    expect(after("a", moveInto(index, "a", null))(null)).toEqual(["p1", "p2", "loose", "a"]);
    expect(moveInto(index, "p1", "a")).toBeNull();
    expect(moveInto(index, "a", "p1")).toBeNull();
  });
});

test("counts a note with everything inside it", () => {
  expect(countWithin(index, "p1")).toBe(5);
  expect(countWithin(index, "loose")).toBe(1);
});

test("the New menu leads with the project's own main kinds", () => {
  expect(newMenuKinds("novel", new Set()).main).toEqual(["scene", "chapter"]);
  expect(newMenuKinds("ttrpg", new Set()).main[0]).toBe("chapter");
  const game = newMenuKinds("game", new Set(["interactive"]));
  expect(game.main).toContain("dialogue");
  expect(game.rest).not.toContain("dialogue");
  expect(newMenuKinds("game", new Set()).main).not.toContain("dialogue");
  const { main, rest } = newMenuKinds("screenplay", new Set());
  expect(new Set([...main, ...rest]).size).toBe(main.length + rest.length);
});

test("the quick New (⌘⌥N) makes the project's main kind, never the generic note", () => {
  expect(quickKind("novel", new Set())).toBe("scene");
  expect(quickKind("screenplay", new Set())).toBe("scene");
  // A campaign's chapters are called Sessions (lib/vocabulary.ts trackVocabulary).
  expect(quickKind("ttrpg", new Set())).toBe("chapter");
  expect(quickKind("nonfiction", new Set())).toBe("chapter");
  for (const type of ["novel", "screenplay", "ttrpg", "nonfiction", "game", "franchise"] as const) expect(quickKind(type, new Set())).not.toBe("note");
});
