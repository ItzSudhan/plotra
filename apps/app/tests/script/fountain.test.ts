import { describe, expect, test } from "bun:test";
import { fountainToOutline, parseFountain, sectionsToFountain, serializeFountain } from "@/lib/fountain";
import { cueName } from "@/lib/script";

// Fountain in and out: what's read, and that writing it back reads the same.

const source = `Title: **BIG FISH**
Credit: written by
Author: John August
Draft date: 1/1/2020

# ACT ONE

= The setup

FADE IN:

INT. KITCHEN - NIGHT #1#

Jane enters. She looks *tired*.

JANE (V.O.)
(quietly)
I'm home.
Anyone?

BOB ^
Hi.

!SHE SCREAMS.

@McCLANE
Yippee.
~Now I'm singing
~a second line

> THE END <

CUT TO:

.FLASHBACK

===

~A lyric out of speech

[[a note]]

> FADE OUT.
`;

describe("fountain", () => {
  const script = parseFountain(source);

  test("reads the title page", () => {
    expect(script.titlePage).toEqual({ Title: "**BIG FISH**", Credit: "written by", Author: "John August", "Draft date": "1/1/2020" });
  });

  test("reads every element", () => {
    const types = script.blocks.map((b) => b.type);
    expect(types).toEqual([
      "h1",
      "action",
      "action",
      "scene_heading",
      "action",
      "character",
      "parenthetical",
      "dialogue",
      "character",
      "dialogue",
      "action",
      "character",
      "dialogue",
      "dialogue",
      "action",
      "transition",
      "scene_heading",
      "hr",
      "action",
      "action",
      "transition",
    ]);
    expect(script.blocks[3].number).toBe("1");
  });

  test("keeps dual dialogue's caret, out of the name", () => {
    const bob = script.blocks[8];
    expect(bob.dual).toBe(true);
    expect(cueName("BOB")).toBe("BOB");
    expect(serializeFountain(script.blocks)).toContain("BOB ^\nHi.");
  });

  test("reads lyrics, in a speech and out of one", () => {
    const sung = script.blocks[13];
    expect(sung.fountain).toBe("lyric");
    expect(sung.type).toBe("dialogue");
    expect(script.blocks[18]).toMatchObject({ type: "action", fountain: "lyric", children: [{ text: "A lyric out of speech" }] });
    const out = serializeFountain(script.blocks);
    expect(out).toContain("Yippee.\n~Now I'm singing\n~a second line");
    expect(out).toContain("\n\n~A lyric out of speech\n\n");
  });

  test("writing it back reads the same", () => {
    const again = parseFountain(serializeFountain(script.blocks));
    expect(again.blocks).toEqual(script.blocks);
  });

  test("a whole outline round-trips through sections and synopses", () => {
    const outline = fountainToOutline(script, "file");
    expect(outline[0]).toMatchObject({ kind: "folder", title: "BIG FISH" });
    expect(outline[1]).toMatchObject({ kind: "chapter", title: "ACT ONE", synopsis: "The setup" });
    const scenes = outline.filter((n) => n.kind === "scene");
    expect(scenes.map((n) => n.title)).toEqual(["INT. KITCHEN - NIGHT", "FLASHBACK"]);
    const text = sectionsToFountain(
      outline.map((n, i) => ({ title: n.title, kind: n.kind, depth: i === 0 ? 0 : n.kind === "chapter" ? 1 : 2, synopsis: n.synopsis, value: n.value ?? [] })),
      script.titlePage,
    );
    const back = fountainToOutline(parseFountain(text), "file");
    expect(back.map((n) => [n.kind, n.title, n.synopsis])).toEqual(outline.map((n) => [n.kind, n.title, n.synopsis]));
    expect(back.filter((n) => n.kind === "scene").map((n) => n.value)).toEqual(scenes.map((n) => n.value));
  });

  test("forces what Fountain would misread", () => {
    const out = serializeFountain([
      { type: "action", children: [{ text: "INT. NOT A HEADING" }] },
      { type: "character", children: [{ text: "mcclane" }] },
      { type: "dialogue", children: [{ text: "Hi." }] },
      { type: "transition", children: [{ text: "SMASH CUT" }] },
      { type: "scene_heading", children: [{ text: "THE MOON" }] },
    ]);
    expect(out).toBe("!INT. NOT A HEADING\n\nMCCLANE\nHi.\n\n> SMASH CUT\n\n.THE MOON");
  });
});
