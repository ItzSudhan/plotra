import { describe, expect, test } from "bun:test";
import { count, plural, pluralOf } from "@/lib/plural";

describe("plural", () => {
  test("English noun plurals", () => {
    expect(pluralOf("note")).toBe("notes");
    expect(pluralOf("story")).toBe("stories");
    expect(pluralOf("day")).toBe("days");
    expect(pluralOf("box")).toBe("boxes");
  });

  test("picks the form for the count", () => {
    expect(plural(1, "note")).toBe("note");
    expect(plural(0, "note")).toBe("notes");
    expect(plural(2, "person", "people")).toBe("people");
  });

  test("count formats the number", () => {
    expect(count(1, "word")).toBe("1 word");
    expect(count(1204, "word")).toBe("1,204 words");
  });
});
