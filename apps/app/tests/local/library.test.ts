import { describe, expect, test } from "bun:test";
import { safeName } from "@/lib/library";

// Folder and file names in a library's Markdown copy (lib/library.ts).
describe("names in the Markdown copy", () => {
  test("keep a title as it is when they can", () => {
    expect(safeName("The Long Night", "x")).toBe("The Long Night");
  });

  test("lose characters no file system allows", () => {
    expect(safeName('Act 1: "Arrival" / Part?', "x")).toBe("Act 1- -Arrival- - Part-");
  });

  test("never start with a dot or end with a space", () => {
    expect(safeName("..hidden ", "x")).toBe("hidden");
  });

  test("fall back when nothing is left", () => {
    expect(safeName("   ", "Untitled project")).toBe("Untitled project");
  });
});
