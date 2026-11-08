import { describe, expect, test } from "bun:test";
import { inflateRawSync } from "node:zlib";
import type { DocNode } from "@/lib/doc-index";
import { buildDocx } from "@/lib/io/docx";
import { dualInfo, toBlocks } from "@/lib/io/model";
import { renderBlocks } from "@/lib/publish/html";
import { ACTION, CHARACTER, DIALOGUE, dualPairs, dualRoles, PARENTHETICAL, SCENE_HEADING, speechCue } from "@/lib/script";

// Dual dialogue: which speeches are set side by side, from the flat block list.

/** One file out of a zip, from its local header (the DOCX writer records sizes there). */
function zipEntry(data: Uint8Array, name: string): string {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let at = 0; at + 30 < data.length; ) {
    if (view.getUint32(at, true) !== 0x04034b50) break;
    const method = view.getUint16(at + 8, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const extra = view.getUint16(at + 28, true);
    const start = at + 30 + nameLength + extra;
    if (new TextDecoder().decode(data.subarray(at + 30, at + 30 + nameLength)) === name) {
      const body = data.subarray(start, start + size);
      return new TextDecoder().decode(method === 8 ? inflateRawSync(body) : body);
    }
    at = start + size;
  }
  throw new Error(`${name} not found`);
}

const el = (type: string, text: string, extra: Record<string, unknown> = {}): DocNode => ({ type, ...extra, children: [{ text }] });
const cue = (name: string, dual = false) => el(CHARACTER, name, dual ? { dual: true } : {});

describe("dual dialogue pairs", () => {
  test("a dual cue sits beside the speech before it", () => {
    const value = [el(SCENE_HEADING, "INT. ROOM - DAY"), cue("ANN"), el(PARENTHETICAL, "(quietly)"), el(DIALOGUE, "Hi."), cue("BOB", true), el(DIALOGUE, "Hello."), el(ACTION, "They laugh.")];
    expect(dualPairs(value)).toEqual([{ start: 1, split: 4, end: 6 }]);
    expect(dualRoles(value)).toEqual([null, "left", "left", "left", "right", "last", null]);
  });

  test("a dual cue with no speech right before it is laid out as usual", () => {
    expect(dualPairs([el(ACTION, "A door."), cue("BOB", true), el(DIALOGUE, "Hello.")])).toEqual([]);
    expect(dualPairs([cue("ANN"), el(DIALOGUE, "Hi."), el(ACTION, "Beat."), cue("BOB", true), el(DIALOGUE, "Hello.")])).toEqual([]);
  });

  test("a speech is in one pair at most", () => {
    const value = [cue("ANN"), el(DIALOGUE, "1"), cue("BOB", true), el(DIALOGUE, "2"), cue("CAL", true), el(DIALOGUE, "3"), cue("DEE", true), el(DIALOGUE, "4")];
    expect(dualPairs(value)).toEqual([
      { start: 0, split: 2, end: 4 },
      { start: 4, split: 6, end: 8 },
    ]);
  });

  test("the first speech may itself be marked", () => {
    expect(dualPairs([cue("ANN", true), el(DIALOGUE, "1"), cue("BOB", true), el(DIALOGUE, "2")])).toEqual([{ start: 0, split: 2, end: 4 }]);
  });

  test("a cue with no lines still pairs, and is the last of its column", () => {
    const value = [cue("ANN"), el(DIALOGUE, "Hi."), cue("BOB", true)];
    expect(dualRoles(value)).toEqual(["left", "left", "last"]);
  });

  test("only `dual: true` counts", () => {
    expect(dualPairs([cue("ANN"), el(DIALOGUE, "1"), el(CHARACTER, "BOB", { dual: "yes" }), el(DIALOGUE, "2")])).toEqual([]);
  });

  test("finds the cue of the speech a line is in", () => {
    const value = [el(ACTION, "x"), cue("ANN"), el(PARENTHETICAL, "(a)"), el(DIALOGUE, "b")];
    expect(speechCue(value, 3)).toBe(1);
    expect(speechCue(value, 1)).toBe(1);
    expect(speechCue(value, 0)).toBe(-1);
    expect(speechCue([el(DIALOGUE, "no cue")], 0)).toBe(-1);
  });
});

describe("dual dialogue in exports", () => {
  const value = [cue("ANN"), el(DIALOGUE, "Hi."), cue("BOB", true), el(DIALOGUE, "Hello."), el(ACTION, "After.")];

  test("export blocks keep the mark and pair the same way", () => {
    const blocks = toBlocks(value);
    expect(blocks[2]).toMatchObject({ kind: "paragraph", script: CHARACTER, dual: true });
    expect(blocks[0]).not.toHaveProperty("dual");
    expect(dualPairs(blocks, dualInfo)).toEqual([{ start: 0, split: 2, end: 4 }]);
  });

  test("HTML sets the pair in two columns", () => {
    const html = renderBlocks(value);
    expect(html).toBe(
      '<div class="b-dual"><div class="b-dual-col"><p class="b-character">ANN</p><p class="b-dialogue">Hi.</p></div><div class="b-dual-col"><p class="b-character">BOB</p><p class="b-dialogue">Hello.</p></div></div>\n<p class="b-action">After.</p>',
    );
  });

  test("HTML pairs only what the reader may see", () => {
    const hidden = [cue("ANN"), el(DIALOGUE, "Hi."), el(ACTION, "Secret.", { canon: "draft" }), cue("BOB", true), el(DIALOGUE, "Hello.")];
    const html = renderBlocks(hidden, { showBlock: (tags) => !tags });
    expect(html).toContain('<div class="b-dual">');
  });

  test("DOCX sets the pair in a two-column table", async () => {
    const data = await buildDocx({ title: "T", author: "A", words: 3, pieces: [{ kind: "blocks", format: "screenplay", blocks: toBlocks(value) }] });
    const xml = zipEntry(data, "word/document.xml");
    expect(xml.match(/<w:tbl>/g)?.length).toBe(1);
    expect(xml.indexOf("ANN")).toBeLessThan(xml.indexOf("BOB"));
    expect(xml.indexOf("</w:tbl>")).toBeLessThan(xml.indexOf("After."));
  });
});
