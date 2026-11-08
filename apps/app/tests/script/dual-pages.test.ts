import { describe, expect, test } from "bun:test";
import type { DocNode } from "@/lib/doc-index";
import { breakColumn, CHARACTER, DIALOGUE, PARENTHETICAL, plainText, splitDual } from "@/lib/script";

// Dual dialogue taller than a page: each column split in step, with (MORE) and (CONT'D).

const el = (type: string, text: string): DocNode => ({ type, children: [{ text }] });
const texts = (blocks: DocNode[]) => blocks.map(plainText);

/** A stand-in for measuring: each block takes a line per 15 characters (at least one). */
const lines = (blocks: DocNode[]) => blocks.reduce((n, b) => n + Math.max(1, Math.ceil(plainText(b).length / 15)), 0);
const fitsLines = (room: number) => (blocks: DocNode[]) => lines(blocks) <= room;

describe("breakColumn", () => {
  const column = [el(CHARACTER, "ANN (O.S.)"), el(DIALOGUE, "One. Two. Three. Four.")];

  test("breaks a line of dialogue between sentences, with (MORE) and (CONT'D)", () => {
    // Cue, one line of text and (MORE).
    const [first, rest] = breakColumn(column, fitsLines(3))!;
    expect(texts(first)).toEqual(["ANN (O.S.)", "One. Two.", "(MORE)"]);
    expect(texts(rest)).toEqual(["ANN (CONT'D)", "Three. Four."]);
    expect(rest[0].type).toBe(CHARACTER);
    expect(first.at(-1)!.type).toBe(CHARACTER);
  });

  test("breaks between words when not one sentence fits", () => {
    const [first, rest] = breakColumn([el(CHARACTER, "ANN"), el(DIALOGUE, "a long sentence with no stop at all")], fitsLines(3))!;
    expect(texts(first)).toEqual(["ANN", "a long sentence", "(MORE)"]);
    expect(texts(rest)).toEqual(["ANN (CONT'D)", "with no stop at all"]);
  });

  test("breaks between lines, never right after a parenthetical", () => {
    const blocks = [el(CHARACTER, "BOB"), el(DIALOGUE, "Hi."), el(PARENTHETICAL, "(beat)"), el(DIALOGUE, "Okay.")];
    const [first, rest] = breakColumn(blocks, fitsLines(4))!;
    expect(texts(first)).toEqual(["BOB", "Hi.", "(MORE)"]);
    expect(texts(rest)).toEqual(["BOB (CONT'D)", "(beat)", "Okay."]);
  });

  test("null when not even the first word fits", () => {
    expect(breakColumn(column, fitsLines(2))).toBeNull();
  });
});

describe("splitDual", () => {
  const left = [el(CHARACTER, "ANN"), el(DIALOGUE, "One. Two. Three. Four. Five. Six.")];
  const right = [el(CHARACTER, "BOB"), el(DIALOGUE, "Yes.")];

  test("a pair that fits is one part", () => {
    expect(splitDual(left, right, (column) => lines(column) <= 20)).toEqual([[left, right]]);
  });

  test("splits both columns in step; a column that ended is empty on the next page", () => {
    // Three lines left on this page, five on each page after.
    const parts = splitDual(left, right, (column, n) => lines(column) <= (n === 0 ? 3 : 5))!;
    expect(parts.map(([l, r]) => [texts(l), texts(r)])).toEqual([
      [
        ["ANN", "One. Two.", "(MORE)"],
        ["BOB", "Yes."],
      ],
      [["ANN (CONT'D)", "Three. Four. Five. Six."], []],
    ]);
  });

  test("a pair longer than two pages goes on over as many as it takes", () => {
    const long = [el(CHARACTER, "ANN"), el(DIALOGUE, "One. Two. Three. Four. Five.")];
    const longer = [el(CHARACTER, "BOB"), el(DIALOGUE, "Aa. Bb. Cc. Dd. Ee. Ff. Gg. Hh. Ii. Jj. Kk. Ll. Mm. Nn.")];
    const parts = splitDual(long, longer, (column) => lines(column) <= 3)!;
    expect(parts.length).toBeGreaterThan(2);
    for (const [l, r] of parts) {
      expect(lines(l)).toBeLessThanOrEqual(3);
      expect(lines(r)).toBeLessThanOrEqual(3);
    }
    // Every part but the last ends a column still going with (MORE); every part after the first carries on with (CONT'D).
    const words = (column: DocNode[]) => column.filter((b) => b.type === DIALOGUE).map(plainText).join(" ");
    expect(parts.map(([l]) => words(l)).filter(Boolean).join(" ")).toBe(plainText(long[1]));
    expect(parts.map(([, r]) => words(r)).join(" ")).toBe(plainText(longer[1]));
    expect(texts(parts[1][1])[0]).toBe("BOB (CONT'D)");
    expect(texts(parts[0][1]).at(-1)).toBe("(MORE)");
    expect(parts.at(-1)![0]).toEqual([]);
  });

  test("null when a column can't be broken in the room at the foot", () => {
    expect(splitDual(left, right, (column, n) => lines(column) <= (n === 0 ? 2 : 5))).toBeNull();
  });

  test("sets the rest as it is rather than loop when not a word fits on a page", () => {
    const parts = splitDual(left, right, (column, n) => lines(column) <= (n === 0 ? 3 : 1))!;
    expect(parts.length).toBe(2);
    expect(texts(parts[1][0])).toEqual(["ANN (CONT'D)", "Three. Four. Five. Six."]);
  });
});
