import { describe, expect, test } from "bun:test";
import { computeHorizon, NEVER } from "../src/lib/horizon";

// The phone's copy of the web's spoiler horizon (apps/app/lib/horizon.ts).

const releases = [
  { id: "b1", position: "a", nodeId: "book1" },
  { id: "b2", position: "b", nodeId: "book2" },
];
const nodes = [
  { id: "book1", parentId: null, revealReleaseId: null },
  { id: "s1", parentId: "book1", revealReleaseId: null },
  { id: "book2", parentId: null, revealReleaseId: null },
  { id: "s2", parentId: "book2", revealReleaseId: null },
  { id: "secret", parentId: "book1", revealReleaseId: "b2" },
  { id: "loose", parentId: null, revealReleaseId: null },
];

describe("horizon", () => {
  test("as of book one", () => {
    const h = computeHorizon(nodes, releases, "b1")!;
    expect(["book1", "s1", "book2", "s2", "secret", "loose"].map(h.knows)).toEqual([true, true, false, false, false, false]);
    expect(h.knowsBlock(null)).toBe(true);
    expect(h.knowsBlock("b1")).toBe(true);
    expect(h.knowsBlock("b2")).toBe(false);
    expect(h.knowsBlock(NEVER)).toBe(false);
  });

  test("as of book two, and an unknown release", () => {
    expect(computeHorizon(nodes, releases, "b2")!.knows("secret")).toBe(true);
    expect(computeHorizon(nodes, releases, "nope")).toBeNull();
  });
});
