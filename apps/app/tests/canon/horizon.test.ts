import { describe, expect, test } from "bun:test";
import { computeHorizon, releaseOrder, revealMap, revealState, type HorizonNode, type HorizonRelease } from "@/lib/horizon";
import { NEVER } from "@/lib/world";

// The spoiler horizon (lib/horizon.ts): what the audience knows as of a release.

const node = (id: string, parentId: string | null = null, revealReleaseId: string | null = null): HorizonNode => ({ id, parentId, revealReleaseId });

const nodes: HorizonNode[] = [
  node("book1"),
  node("s1a", "book1"),
  node("s1b", "book1", "r2"), // its own tag wins over Book 1
  node("book2"),
  node("s2a", "book2"),
  node("s2b", "book2", "ghost"), // names no release, so falls back to Book 2
  node("ch3", "book2", "r3"), // a tagged folder inside Book 2
  node("s3", "ch3"),
  node("extras"), // never tagged or shipped
  node("deleted-scene", "extras", "r1"),
  node("loose"),
];

// Listed out of order on purpose.
const releases: HorizonRelease[] = [
  { id: "r3", position: "c", nodeId: null },
  { id: "r1", position: "a", nodeId: "book1" },
  { id: "r2", position: "b", nodeId: "book2" },
];

describe("releaseOrder", () => {
  test("sorts by position", () => {
    const order = releaseOrder(releases);
    expect(order.get("r1")).toBe(0);
    expect(order.get("r2")).toBe(1);
    expect(order.get("r3")).toBe(2);
  });

  test("breaks a tie on position by id", () => {
    const order = releaseOrder([
      { id: "b", position: "x", nodeId: null },
      { id: "a", position: "x", nodeId: null },
    ]);
    expect(order.get("a")).toBe(0);
    expect(order.get("b")).toBe(1);
  });
});

describe("revealMap", () => {
  const revealed = revealMap(nodes, releases);

  test("a folder a release ships is revealed by it, and so are the notes inside", () => {
    expect(revealed.get("book1")).toBe("r1");
    expect(revealed.get("s1a")).toBe("r1");
    expect(revealed.get("s2a")).toBe("r2");
  });

  test("a note's own tag wins over its folder", () => {
    expect(revealed.get("s1b")).toBe("r2");
    expect(revealed.get("deleted-scene")).toBe("r1");
  });

  test("a note takes the nearest tagged folder above it", () => {
    expect(revealed.get("ch3")).toBe("r3");
    expect(revealed.get("s3")).toBe("r3");
  });

  test("a tag naming a release that doesn't exist is ignored", () => {
    expect(revealed.get("s2b")).toBe("r2");
  });

  test("a note with nothing above it is unrevealed", () => {
    expect(revealed.has("loose")).toBe(false);
    expect(revealed.has("extras")).toBe(false);
  });

  test("a tree with a cycle doesn't hang", () => {
    const cycle = [node("A", "B"), node("B", "A")];
    expect(revealMap(cycle, releases).size).toBe(0);
    const h = computeHorizon(cycle, releases, "r3")!;
    expect(h.knows("A")).toBe(false);
    expect(h.shows("B")).toBe(false);
  });

  test("a cycle with a tagged note in it still resolves", () => {
    const cycle = [node("A", "B"), node("B", "A", "r1")];
    const h = computeHorizon(cycle, releases, "r1")!;
    expect(h.knows("A")).toBe(true);
    expect(h.shows("A")).toBe(true);
    expect(h.shows("B")).toBe(true);
  });
});

describe("computeHorizon", () => {
  test("is null for an unknown release", () => {
    expect(computeHorizon(nodes, releases, "nope")).toBeNull();
  });

  test("as of Book 1, only Book 1 is known", () => {
    const h = computeHorizon(nodes, releases, "r1")!;
    expect(h.releaseId).toBe("r1");
    expect(h.knows("book1")).toBe(true);
    expect(h.knows("s1a")).toBe(true);
    expect(h.knows("s1b")).toBe(false);
    expect(h.knows("book2")).toBe(false);
    expect(h.knows("s3")).toBe(false);
    expect(h.knows("loose")).toBe(false);
  });

  test("as of Book 2, Books 1 and 2 are known, but not what comes later", () => {
    const h = computeHorizon(nodes, releases, "r2")!;
    for (const id of ["book1", "s1a", "s1b", "book2", "s2a", "s2b"]) expect(h.knows(id)).toBe(true);
    expect(h.knows("ch3")).toBe(false);
    expect(h.knows("s3")).toBe(false);
  });

  test("a folder that holds a known note is shown even when it isn't known", () => {
    const h = computeHorizon(nodes, releases, "r1")!;
    expect(h.knows("extras")).toBe(false);
    expect(h.shows("extras")).toBe(true);
    expect(h.shows("deleted-scene")).toBe(true);
    expect(h.shows("book2")).toBe(false);
    expect(h.shows("loose")).toBe(false);
  });

  test("knowsBlock: untagged is known, never isn't, later isn't, earlier is", () => {
    const h = computeHorizon(nodes, releases, "r2")!;
    expect(h.knowsBlock(null)).toBe(true);
    expect(h.knowsBlock(undefined)).toBe(true);
    expect(h.knowsBlock("")).toBe(true);
    expect(h.knowsBlock(NEVER)).toBe(false);
    expect(h.knowsBlock("r3")).toBe(false);
    expect(h.knowsBlock("r1")).toBe(true);
    expect(h.knowsBlock("r2")).toBe(true);
    expect(h.knowsBlock("ghost")).toBe(false);
  });
});

describe("revealState", () => {
  const h = computeHorizon(nodes, releases, "r1")!;

  test("known, later, unrevealed", () => {
    expect(revealState(h, "s1a")).toBe("known");
    expect(revealState(h, "s2a")).toBe("later");
    expect(revealState(h, "loose")).toBe("unrevealed");
  });

  test("with no horizon, everything is shown", () => {
    expect(revealState(null, "loose")).toBe("all");
  });
});
