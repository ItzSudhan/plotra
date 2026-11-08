import { describe, expect, test } from "bun:test";
import type { DocNode } from "@/lib/doc-index";
import { commonPairs, markdownUnits, planUpdate } from "@/lib/api/note-update";

// Saving a note's Markdown from the phone without rewriting what didn't change.

const p = (id: string, text: string, extra: Record<string, unknown> = {}): DocNode => ({ type: "p", id, children: [{ text, ...extra }] }) as DocNode;
const md = (block: DocNode) => (block.children ?? []).map((c) => (c as { text?: string }).text ?? "").join("");
let made = 0;
const toBlocks = (text: string) => text.split("\n").map((line) => p(`new${++made}`, line));

describe("markdown units", () => {
  test("paragraphs apart, list items a line each, tables and quotes whole", () => {
    expect(markdownUnits("# Title\n\nOne line\\\nsame paragraph\n\n- a\n- b\n1. c\n\n| x |\n| --- |\n| 1 |\n\n> [!note]\n> hi\n")).toEqual([
      "# Title",
      "One line\\\nsame paragraph",
      "- a",
      "- b",
      "1. c",
      "| x |\n| --- |\n| 1 |",
      "> [!note]\n> hi",
    ]);
  });
});

describe("common pairs", () => {
  test("finds what stayed, in order", () => {
    expect(commonPairs(["a", "b", "c", "d"], ["a", "x", "c", "d", "e"])).toEqual([
      [0, 0],
      [2, 2],
      [3, 3],
    ]);
    expect(commonPairs(["a", "b"], ["b", "a"])).toHaveLength(1);
    expect(commonPairs([], ["a"])).toEqual([]);
  });
});

describe("planning an update", () => {
  const commented = p("b2", "She ran.", { comment_x: true });
  const current = [p("b1", "Once upon a time."), p("e1", ""), commented, p("b3", "The end.")];

  test("keeps unchanged blocks as they are, comments and all", () => {
    const next = planUpdate(current, "Once upon a time.\n\nShe ran.\n\nThe very end.", md, toBlocks);
    expect(next[0]).toBe(current[0]);
    expect(next[1]).toBe(current[1]);
    expect(next[2]).toBe(commented);
    expect(next[3].id).toMatch(/^new/);
    expect(md(next[3])).toBe("The very end.");
    expect(next).toHaveLength(4);
  });

  test("adds and removes around kept blocks", () => {
    const next = planUpdate(current, "A new start.\n\nShe ran.", md, toBlocks);
    expect(next.map(md)).toEqual(["A new start.", "She ran."]);
    expect(next[1]).toBe(commented);
  });

  test("ordered list numbers don't count as changes", () => {
    const list = [p("l1", "1. first"), p("l2", "1. second")];
    const next = planUpdate(list, "1. first\n2. second", md, toBlocks);
    expect(next[0]).toBe(list[0]);
    expect(next[1]).toBe(list[1]);
  });
});
