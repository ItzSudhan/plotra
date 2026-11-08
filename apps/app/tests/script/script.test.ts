import { describe, expect, test } from "bun:test";
import type { DocNode } from "@/lib/doc-index";
import {
  ACT_HEADING,
  ACTION,
  breakSpeech,
  CHARACTER,
  COMIC_CAPTION,
  COMIC_PAGE,
  COMIC_PANEL,
  DIALOGUE,
  MUSIC_CUE,
  PARENTHETICAL,
  plainText,
  SCENE_HEADING,
  SFX,
  SHOT,
  sliceBlock,
  tabElement,
  TRANSITION,
} from "@/lib/script";

// Tab and Shift+Tab per element (Final Draft's map), and where a speech breaks over a page.

describe("tab map", () => {
  test("a screenplay follows Final Draft on an empty line", () => {
    expect(tabElement("screenplay", ACTION).type).toBe(CHARACTER);
    expect(tabElement("screenplay", CHARACTER).type).toBe(TRANSITION);
    expect(tabElement("screenplay", TRANSITION).type).toBe(SCENE_HEADING);
    expect(tabElement("screenplay", SCENE_HEADING).type).toBe(ACTION);
    expect(tabElement("screenplay", DIALOGUE).type).toBe(PARENTHETICAL);
    expect(tabElement("screenplay", PARENTHETICAL).type).toBe(DIALOGUE);
    expect(tabElement("screenplay", SHOT).type).toBe(ACTION);
  });

  test("an empty line is changed, not followed by a new one", () => {
    expect(tabElement("screenplay", CHARACTER, { blank: true, atEnd: true }).insert).toBe(false);
  });

  test("Tab at the end of a written cue, line or parenthetical starts the next part of the speech below", () => {
    expect(tabElement("screenplay", CHARACTER, { blank: false, atEnd: true })).toEqual({ type: PARENTHETICAL, insert: true });
    expect(tabElement("screenplay", DIALOGUE, { blank: false, atEnd: true })).toEqual({ type: PARENTHETICAL, insert: true });
    expect(tabElement("screenplay", PARENTHETICAL, { blank: false, atEnd: true })).toEqual({ type: DIALOGUE, insert: true });
  });

  test("Tab mid-line, or on written action, turns the line into another element", () => {
    expect(tabElement("screenplay", CHARACTER, { blank: false, atEnd: false })).toEqual({ type: TRANSITION, insert: false });
    expect(tabElement("screenplay", ACTION, { blank: false, atEnd: true })).toEqual({ type: CHARACTER, insert: false });
  });

  test("Shift+Tab goes back, and reaches every element", () => {
    expect(tabElement("screenplay", CHARACTER, { reverse: true }).type).toBe(ACTION);
    expect(tabElement("screenplay", DIALOGUE, { reverse: true, blank: false, atEnd: true })).toEqual({ type: CHARACTER, insert: false });
    expect(tabElement("screenplay", ACTION, { reverse: true }).type).toBe(SHOT);
    expect(tabElement("screenplay", SHOT, { reverse: true }).type).toBe(SCENE_HEADING);
  });

  test("the other formats have a map of their own", () => {
    expect(tabElement("stageplay", CHARACTER).type).toBe(SCENE_HEADING);
    expect(tabElement("stageplay", SCENE_HEADING, { reverse: true }).type).toBe(ACT_HEADING);
    expect(tabElement("stageplay", CHARACTER, { blank: false, atEnd: true })).toEqual({ type: PARENTHETICAL, insert: true });
    expect(tabElement("audio", CHARACTER).type).toBe(SFX);
    expect(tabElement("audio", SFX).type).toBe(MUSIC_CUE);
    expect(tabElement("comic", CHARACTER).type).toBe(COMIC_CAPTION);
    expect(tabElement("comic", COMIC_PAGE).type).toBe(COMIC_PANEL);
    // A comic has no parentheticals: a written cue is retyped.
    expect(tabElement("comic", CHARACTER, { blank: false, atEnd: true })).toEqual({ type: COMIC_CAPTION, insert: false });
  });

  test("an element the format doesn't have joins it at its first element", () => {
    expect(tabElement("stageplay", TRANSITION).type).toBe(ACT_HEADING);
    expect(tabElement("comic", PARENTHETICAL).type).toBe(COMIC_PAGE);
  });

  test("Tab means nothing in prose", () => {
    expect(tabElement("prose", ACTION)).toEqual({ type: ACTION, insert: false });
  });
});

describe("breaking a speech", () => {
  const fitsChars = (n: number) => (part: string) => part.length <= n;

  test("breaks after the last whole sentence that fits", () => {
    const text = "One. Two two. Three three three.";
    const at = breakSpeech(text, fitsChars(15))!;
    expect(text.slice(0, at[0])).toBe("One. Two two.");
    expect(text.slice(at[1])).toBe("Three three three.");
  });

  test("one long sentence breaks between words", () => {
    const text = "This is one very long sentence that will not fit on the page";
    const at = breakSpeech(text, fitsChars(20))!;
    expect(text.slice(0, at[0])).toBe("This is one very");
    expect(text.slice(at[1])).toBe("long sentence that will not fit on the page");
  });

  test("a first sentence too long to fit breaks between its words", () => {
    const text = "A first sentence that is long. Short.";
    const at = breakSpeech(text, fitsChars(10))!;
    expect(text.slice(0, at[0])).toBe("A first");
  });

  test("nothing when not even a word fits", () => {
    expect(breakSpeech("Supercalifragilistic word", fitsChars(3))).toBeNull();
  });

  test("sentences end with closing quotes and brackets too", () => {
    const text = "He said “go.” Then left.";
    const at = breakSpeech(text, fitsChars(14))!;
    expect(text.slice(0, at[0])).toBe("He said “go.”");
  });

  test("slicing a block keeps marks", () => {
    const block: DocNode = { type: DIALOGUE, children: [{ text: "Plain " }, { text: "bold words", bold: true }, { text: " end." }] };
    const first = sliceBlock(block, 0, 10);
    expect(first.children).toEqual([{ text: "Plain " }, { text: "bold", bold: true }]);
    const rest = sliceBlock(block, 11);
    expect(plainText(rest)).toBe("words end.");
    expect(rest.children?.[0]).toEqual({ text: "words", bold: true });
    expect(rest.type).toBe(DIALOGUE);
  });
});
