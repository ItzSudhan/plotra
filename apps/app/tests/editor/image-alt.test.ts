import { describe, expect, test } from "bun:test";
import { ALT_MAX, altChange, cleanAlt } from "@/lib/image-alt";

// Alt text on pictures in the editor (lib/image-alt.ts).

describe("cleanAlt", () => {
  test("trims and folds whitespace and line breaks into single spaces", () => {
    expect(cleanAlt("  The bell tower\n at   dusk ")).toBe("The bell tower at dusk");
  });

  test("an empty or blank value means no alt text", () => {
    expect(cleanAlt("")).toBeUndefined();
    expect(cleanAlt(" \n\t ")).toBeUndefined();
  });

  test("is cut to ALT_MAX characters with no trailing space", () => {
    expect(cleanAlt("a".repeat(ALT_MAX + 50))).toHaveLength(ALT_MAX);
    expect(cleanAlt(`${"a".repeat(ALT_MAX - 1)} b`)).toBe("a".repeat(ALT_MAX - 1));
  });

  test("keeps text in any script", () => {
    expect(cleanAlt("鐘楼の地図")).toBe("鐘楼の地図");
  });
});

describe("altChange", () => {
  test("sets alt text on a picture that has none", () => {
    expect(altChange(undefined, "A map of Verona")).toEqual({ set: "A map of Verona" });
  });

  test("changes existing alt text", () => {
    expect(altChange("A map", "A map of Verona")).toEqual({ set: "A map of Verona" });
  });

  test("an empty value removes alt text", () => {
    expect(altChange("A map", "   ")).toEqual({ unset: true });
  });

  test("no change when the value is the same after tidying, or both are empty", () => {
    expect(altChange("A map", " A  map ")).toBeNull();
    expect(altChange(undefined, "")).toBeNull();
    expect(altChange("", "")).toBeNull();
  });
});
