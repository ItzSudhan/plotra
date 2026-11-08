import { describe, expect, test } from "bun:test";
import { nextTabIndex, rovingTabIndex } from "@/lib/tabs";

// Arrow keys, Home and End in a row of tabs (the inspector's, issue #12).

describe("nextTabIndex", () => {
  test("Right and Left move one tab and wrap at the ends", () => {
    expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 1, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
  });

  test("Home and End go to the first and last tab", () => {
    expect(nextTabIndex("Home", 2, 4)).toBe(0);
    expect(nextTabIndex("End", 0, 4)).toBe(3);
  });

  test("other keys are left alone", () => {
    expect(nextTabIndex("ArrowDown", 0, 3)).toBeNull();
    expect(nextTabIndex("Enter", 0, 3)).toBeNull();
    expect(nextTabIndex("a", 0, 3)).toBeNull();
  });

  test("a row of one stays put, an empty row has nowhere to go", () => {
    expect(nextTabIndex("ArrowRight", 0, 1)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 1)).toBe(0);
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
  });

  test("from outside the row it counts from the first tab", () => {
    expect(nextTabIndex("ArrowRight", -1, 3)).toBe(1);
    expect(nextTabIndex("ArrowLeft", 7, 3)).toBe(2);
  });
});

describe("rovingTabIndex", () => {
  test("only the selected tab is in the Tab order", () => {
    expect([0, 1, 2].map((index) => rovingTabIndex(index, 1))).toEqual([-1, 0, -1]);
  });

  test("with none selected, the first tab is", () => {
    expect([0, 1, 2].map((index) => rovingTabIndex(index, -1))).toEqual([0, -1, -1]);
  });
});
