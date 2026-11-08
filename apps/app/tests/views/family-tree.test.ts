import { describe, expect, test } from "bun:test";
import { familyTree, PARENT, SIBLING, SPOUSE } from "@/lib/family-tree";

// The family tree layout of the relationship map (lib/family-tree.ts).

const people = ["Montague", "Lady Montague", "Romeo", "Capulet", "Lady Capulet", "Juliet", "Tybalt", "Benvolio", "Mercutio"].map((title) => ({ id: title, title }));
const links = [
  { from: "Montague", to: "Lady Montague", type: SPOUSE },
  { from: "Montague", to: "Romeo", type: PARENT },
  { from: "Lady Montague", to: "Romeo", type: PARENT },
  { from: "Capulet", to: "Lady Capulet", type: SPOUSE },
  { from: "Capulet", to: "Juliet", type: PARENT },
  { from: "Lady Capulet", to: "Juliet", type: PARENT },
  { from: "Romeo", to: "Juliet", type: SPOUSE },
  { from: "Benvolio", to: "Romeo", type: "friend" },
  { from: "Tybalt", to: "Juliet", type: SIBLING },
];

describe("a family tree", () => {
  const tree = familyTree(people, links);

  test("parents above their children, spouses and siblings level with each other", () => {
    expect(tree.generation.get("Montague")).toBe(0);
    expect(tree.generation.get("Lady Capulet")).toBe(0);
    expect(tree.generation.get("Romeo")).toBe(1);
    expect(tree.generation.get("Juliet")).toBe(1);
    expect(tree.generation.get("Tybalt")).toBe(1);
    expect(tree.positions.get("Romeo")!.y).toBeGreaterThan(tree.positions.get("Montague")!.y);
  });

  test("only family is in the tree: friends and strangers are left out", () => {
    expect(tree.left.sort()).toEqual(["Benvolio", "Mercutio"]);
    expect(tree.positions.has("Benvolio")).toBe(false);
  });

  test("a married couple sits side by side, and nobody overlaps", () => {
    const romeo = tree.positions.get("Romeo")!;
    const juliet = tree.positions.get("Juliet")!;
    expect(Math.abs(romeo.x - juliet.x)).toBeLessThan(300);
    const row = [...tree.positions.entries()].filter(([, p]) => p.y === romeo.y).map(([, p]) => p.x).sort((a, b) => a - b);
    for (let i = 1; i < row.length; i++) expect(row[i] - row[i - 1]).toBeGreaterThanOrEqual(190);
  });

  test("a loop of parents, which only a mistake makes, still ends", () => {
    const loop = familyTree(
      [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ],
      [
        { from: "a", to: "b", type: PARENT },
        { from: "b", to: "a", type: PARENT },
      ],
    );
    expect(loop.positions.size).toBe(2);
  });
});
