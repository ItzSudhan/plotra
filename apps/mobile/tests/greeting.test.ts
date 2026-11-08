import { expect, test } from "bun:test";
import { partOfDay } from "../src/lib/greeting";

test("greets by the time of day, and not at all in the small hours", () => {
  expect([2, 5, 11, 12, 17, 18, 23].map(partOfDay)).toEqual([null, "Good morning", "Good morning", "Good afternoon", "Good afternoon", "Good evening", "Good evening"]);
});
