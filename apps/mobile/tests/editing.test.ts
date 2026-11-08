import { describe, expect, test } from "bun:test";
import { continueList, insert, setLinePrefix, wrap } from "../src/lib/editing";

describe("toolbar edits", () => {
  test("wrap and unwrap a selection", () => {
    expect(wrap("say hi now", { start: 4, end: 6 }, "**")).toEqual({ text: "say **hi** now", selection: { start: 6, end: 8 } });
    expect(wrap("say **hi** now", { start: 6, end: 8 }, "**")).toEqual({ text: "say hi now", selection: { start: 4, end: 6 } });
    expect(wrap("say **hi** now", { start: 4, end: 10 }, "**")).toEqual({ text: "say hi now", selection: { start: 4, end: 6 } });
    expect(wrap("ab", { start: 1, end: 1 }, "[[", "]]")).toEqual({ text: "a[[]]b", selection: { start: 3, end: 3 } });
  });

  test("line prefixes", () => {
    expect(setLinePrefix("one\ntwo", { start: 0, end: 7 }, "- ").text).toBe("- one\n- two");
    expect(setLinePrefix("- one\n- two", { start: 0, end: 11 }, "- ").text).toBe("one\ntwo");
    expect(setLinePrefix("one\ntwo", { start: 0, end: 7 }, "1. ").text).toBe("1. one\n2. two");
    expect(setLinePrefix("## Title", { start: 3, end: 3 }, "# ")).toEqual({ text: "# Title", selection: { start: 2, end: 2 } });
    expect(setLinePrefix("a\nline", { start: 3, end: 3 }, "> ")).toEqual({ text: "a\n> line", selection: { start: 5, end: 5 } });
  });

  test("insert", () => {
    expect(insert("ab", { start: 1, end: 1 }, "---")).toEqual({ text: "a---b", selection: { start: 4, end: 4 } });
  });

  test("lists carry on after Enter, and end on an empty item", () => {
    expect(continueList("- milk", "- milk\n")).toEqual({ text: "- milk\n- ", selection: { start: 9, end: 9 } });
    expect(continueList("1. a", "1. a\n")?.text).toBe("1. a\n2. ");
    expect(continueList("- [x] a", "- [x] a\n")?.text).toBe("- [x] a\n- [ ] ");
    expect(continueList("- a\n- ", "- a\n- \n")).toEqual({ text: "- a\n", selection: { start: 4, end: 4 } });
    expect(continueList("plain", "plain\n")).toBeNull();
  });
});
