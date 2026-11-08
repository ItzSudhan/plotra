import { describe, expect, test } from "bun:test";
import { matchIndex, parseQuery } from "../src/lib/text-match";

const entry = (id: string, title: string, text: string) => ({ id, title, kind: "scene" as const, aliases: [], tags: [], synopsis: null, text });

describe("offline search", () => {
  test("reads quotes and minus words", () => {
    expect(parseQuery('Juliet "the balcony" -nurse or')).toEqual({ all: ["juliet", "the balcony"], none: ["nurse"] });
  });

  test("finds words inside notes, names first", () => {
    const notes = [entry("a", "Market", "Juliet waits by the balcony at dusk."), entry("b", "Juliet", "She sleeps."), entry("c", "Tomb", "The nurse and Juliet.")];
    expect(matchIndex(notes, "juliet").map((h) => h.id)).toEqual(["b", "a", "c"]);
    expect(matchIndex(notes, "juliet -nurse").map((h) => h.id)).toEqual(["b", "a"]);
    expect(matchIndex(notes, '"the balcony"')[0]).toMatchObject({ id: "a", snippet: "Juliet waits by the balcony at dusk." });
    expect(matchIndex(notes, "")).toEqual([]);
  });
});
