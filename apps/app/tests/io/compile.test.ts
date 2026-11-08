import { describe, expect, test } from "bun:test";
import { unzipSync } from "fflate";
import type { DocNode } from "@/lib/doc-index";
import { chapterHeading, cleanCompile, cleanOwnPresets, compilePresets, standardManuscript, type CompileOptions } from "@/lib/io/compile";
import { buildDocx } from "@/lib/io/docx";
import { cleanFrontMatter, frontPages, standardCopyright } from "@/lib/io/front-matter";
import { buildFdx, hasScript } from "@/lib/io/fdx";
import { layoutManuscript, manuscriptToText, type ExportSection, type Piece } from "@/lib/io/manuscript";
import { toBlocks } from "@/lib/io/model";
import { rtfToValue } from "@/lib/io/rtf";
import { buildRtf, rtfText } from "@/lib/io/rtf-export";
import { parseXml } from "@/lib/io/scrivener";
import { ACTION, CHARACTER, DIALOGUE, PARENTHETICAL, SCENE_HEADING, TRANSITION } from "@/lib/script";

// Compile settings, RTF and Final Draft (beat-the-competitors.md, step 6).

const p = (text: string, extra: Partial<DocNode> = {}): DocNode => ({ type: "p", children: [{ text }], ...extra });
const section = (id: string, kind: ExportSection["kind"], title: string, depth: number, body: DocNode[] = []): ExportSection => ({
  id,
  kind,
  title,
  depth,
  format: "prose",
  tags: [],
  blocks: toBlocks(body),
});
const text = (n: DocNode): string => (typeof n.text === "string" ? n.text : (n.children ?? []).map(text).join(""));

const book: ExportSection[] = [
  section("part", "folder", "Part One", 0),
  section("c1", "chapter", "The Feud", 1),
  section("s1", "scene", "The brawl", 2, [p("Swords in the square.")]),
  section("s2", "scene", "The prince", 2, [p("Peace, or death.")]),
  section("c2", "chapter", "The Feast", 1),
  section("s3", "scene", "Masks", 2, [p("A masked ball.")]),
];

describe("compile settings", () => {
  test("anything unknown falls back to standard manuscript format", () => {
    expect(cleanCompile(null)).toEqual(standardManuscript);
    expect(cleanCompile({ font: "comic-sans", size: 99, spacing: "triple", indent: "yes", separator: "~~~", chapters: "roman" })).toEqual({ ...standardManuscript, size: 16 });
    for (const preset of compilePresets) expect(cleanCompile(preset.options)).toEqual(preset.options);
  });

  test("presets of your own are cleaned, named and capped", () => {
    const kept = cleanOwnPresets([{ title: "  Agent  submission ", options: { font: "mono" } }, { title: "" }, "junk"]);
    expect(kept).toHaveLength(1);
    expect(kept[0].title).toBe("Agent submission");
    expect(kept[0].options.font).toBe("mono");
    expect(kept[0].id).toMatch(/^own-/);
    expect(cleanOwnPresets(Array.from({ length: 20 }, (_, i) => ({ title: `P${i}` })))).toHaveLength(12);
  });

  test("chapter headings", () => {
    expect(chapterHeading("title", "The Feast", 2)).toBe("The Feast");
    expect(chapterHeading("number", "The Feast", 2)).toBe("Chapter 2");
    expect(chapterHeading("number-title", "The Feast", 2)).toBe("Chapter 2: The Feast");
    expect(chapterHeading("none", "The Feast", 2)).toBe("");
  });
});

describe("the manuscript's layout", () => {
  const headings = (pieces: Piece[]) => pieces.flatMap((x) => (x.kind === "heading" ? [x.title] : x.kind === "scene-break" ? ["—"] : []));

  test("by default: titles as they are, a break between scenes", () => {
    expect(headings(layoutManuscript(book))).toEqual(["Part One", "The Feud", "—", "The Feast"]);
  });

  test("chapters numbered, parts left alone; scene titles in place of breaks", () => {
    expect(headings(layoutManuscript(book, { chapters: "number-title", sceneTitles: false }))).toEqual(["Part One", "Chapter 1: The Feud", "—", "Chapter 2: The Feast"]);
    expect(headings(layoutManuscript(book, { chapters: "number", sceneTitles: true }))).toEqual(["Part One", "Chapter 1", "The brawl", "The prince", "Chapter 2", "Masks"]);
  });

  test("a book built of folders numbers the folders that hold scenes", () => {
    const folders = [section("f1", "folder", "Arrival", 0), section("a", "scene", "A", 1, [p("One.")]), section("f2", "folder", "Departure", 0), section("b", "scene", "B", 1, [p("Two.")])];
    expect(headings(layoutManuscript(folders, { chapters: "number", sceneTitles: false }))).toEqual(["Chapter 1", "Chapter 2"]);
  });

  test("plain text follows the separator and the title page", () => {
    const pieces = layoutManuscript(book);
    const plain = manuscriptToText({ title: "Verona", author: "W. S." }, pieces, null, { separator: "⁂", titlePage: false });
    expect(plain.startsWith("VERONA")).toBe(false);
    expect(plain).toContain("⁂");
  });
});

describe("RTF", () => {
  const pieces = layoutManuscript(book);

  test("escapes RTF's own characters and writes anything past ASCII as \\u", () => {
    expect(rtfText("a {b} \\ c")).toBe("a \\{b\\} \\\\ c");
    expect(rtfText("café — “x”")).toBe("caf\\u233? \\u8212? \\u8220?x\\u8221?");
    expect(rtfText("😀")).toBe("\\u-10179?\\u-8704?");
  });

  test("reads back as the same text, in order", () => {
    const rtf = buildRtf({ title: "Verona", author: "W. S.", words: 9, pieces });
    // The "#" between scenes comes back as a scene break, as an RTF import reads it.
    const back = rtfToValue(rtf).map((b) => (b.type === "hr" ? "(break)" : text(b)));
    expect(back).toEqual(["W. S.\tabout 100 words", "Verona", "by W. S.", "Part One", "The Feud", "Swords in the square.", "(break)", "Peace, or death.", "The Feast", "A masked ball."]);
  });

  test("follows the settings: font, spacing, indent, header, title page", () => {
    const options: CompileOptions = { ...standardManuscript, font: "garamond", spacing: "onehalf", indent: false, header: false, titlePage: false, separator: "⁂" };
    const rtf = buildRtf({ title: "Verona", author: "W. S.", words: 9, pieces, options });
    expect(rtf).toContain("{\\f0\\fnil Garamond;}");
    expect(rtf).toContain("\\sl360\\slmult1");
    expect(rtf).not.toContain("\\fi720");
    expect(rtf).not.toContain("{\\header");
    expect(rtf).not.toContain("\\titlepg");
    expect(rtf).toContain("\\u8258?");
    const standard = buildRtf({ title: "Verona", author: "W. S.", words: 9, pieces });
    expect(standard).toContain("{\\header");
    expect(standard).toContain("\\fi720");
  });
});

describe("Final Draft", () => {
  const scene: DocNode[] = [
    p("INT. CAPULET HALL - NIGHT", { type: SCENE_HEADING }),
    p("Masks & music.", { type: ACTION }),
    p("ROMEO", { type: CHARACTER }),
    p("(aside)", { type: PARENTHETICAL }),
    p("What lady is that?", { type: DIALOGUE }),
    p("CUT TO:", { type: TRANSITION }),
  ];
  const pieces: Piece[] = [{ kind: "heading", title: "Act One", level: 1 }, { kind: "blocks", format: "screenplay", blocks: toBlocks(scene) }];

  test("each element is a paragraph of Final Draft's type; binder titles aren't script", () => {
    expect(hasScript(pieces)).toBe(true);
    const fdx = buildFdx({ title: "R & J", author: "W. S.", pieces });
    const root = parseXml(fdx).children.find((n) => n.name === "FinalDraft")!;
    const content = root.children.find((n) => n.name === "Content")!;
    expect(content.children.map((n) => n.attrs.Type)).toEqual(["Scene Heading", "Action", "Character", "Parenthetical", "Dialogue", "Transition"]);
    expect(content.children[1].children[0].text).toBe("Masks & music.");
    expect(fdx).toContain("Masks &amp; music.");
    expect(fdx).not.toContain("Act One");
    expect(root.children.some((n) => n.name === "TitlePage")).toBe(true);
  });

  test("bold and italic travel as text styles; dual dialogue stays side by side", () => {
    const dual: DocNode[] = [
      p("ROMEO", { type: CHARACTER }),
      { type: DIALOGUE, children: [{ text: "My ", italic: true }, { text: "lips", bold: true, italic: true }] },
      p("JULIET", { type: CHARACTER, dual: true }),
      p("Good pilgrim.", { type: DIALOGUE }),
    ];
    const fdx = buildFdx({ title: "T", author: "A", pieces: [{ kind: "blocks", format: "screenplay", blocks: toBlocks(dual) }] });
    expect(fdx).toContain('<Text Style="Italic">My </Text><Text Style="Bold+Italic">lips</Text>');
    expect(fdx).toContain("<Paragraph><DualDialogue>");
    expect(fdx.match(/Type="Character"/g)).toHaveLength(2);
  });

  test("prose with no script in it says so", () => {
    expect(() => buildFdx({ title: "T", author: "A", pieces: [] })).toThrow("no script");
  });
});

describe("Word, laid out by the settings", () => {
  const documentXml = (data: Uint8Array) => new TextDecoder().decode(unzipSync(data)["word/document.xml"]);
  const pieces = layoutManuscript(book);

  test("font, size, spacing and indent, and no header or title page when asked", async () => {
    const files = unzipSync(await buildDocx({ title: "Verona", author: "W. S.", words: 9, pieces, options: { ...standardManuscript, font: "garamond", size: 11, spacing: "onehalf", indent: false, header: false, titlePage: false } }));
    const styles = new TextDecoder().decode(files["word/styles.xml"]);
    expect(styles).toContain('w:ascii="Garamond"');
    expect(styles).toContain('w:val="22"');
    const doc = new TextDecoder().decode(files["word/document.xml"]);
    expect(doc).toContain('w:line="360"');
    expect(doc).not.toContain("w:firstLine");
    expect(doc).not.toContain("about 100 words");
    expect(Object.keys(files).some((f) => f.startsWith("word/header"))).toBe(false);
  });

  test("standard manuscript format by default", async () => {
    const doc = documentXml(await buildDocx({ title: "Verona", author: "W. S.", words: 9, pieces }));
    expect(doc).toContain('w:line="480"');
    expect(doc).toContain("w:firstLine");
    expect(doc).toContain("about 100 words");
  });
});

describe("front matter", () => {
  const front = { copyright: "Copyright © 2026 W. S.\n\nAll rights reserved.", dedication: "For Anne,\nwho waited.", epigraph: "What's in a name?", epigraphSource: "Juliet" };
  const opening: Piece[] = frontPages(front).map((page) => ({ kind: "front", page }));
  const pieces = [...opening, ...layoutManuscript(book)];

  test("is cleaned, and comes out as pages in print order", () => {
    expect(cleanFrontMatter({ copyright: "  x  ", dedication: "", epigraph: "", epigraphSource: "Nobody", junk: 1 })).toEqual({ copyright: "x" });
    expect(cleanFrontMatter({ dedication: "a\r\n\r\n\r\n\r\nb" })).toEqual({ dedication: "a\n\nb" });
    expect(frontPages(front).map((page) => page.role)).toEqual(["copyright", "dedication", "epigraph"]);
    expect(frontPages(front)[0].paragraphs).toEqual(["Copyright © 2026 W. S.", "All rights reserved."]);
    expect(frontPages(front)[2].source).toBe("Juliet");
    expect(frontPages(undefined)).toEqual([]);
    expect(standardCopyright("W. S.", 2026)).toStartWith("Copyright © 2026 W. S.");
  });

  test("is off in standard manuscript format and on in the reading copy", () => {
    expect(standardManuscript.frontMatter).toBe(false);
    expect(compilePresets.find((preset) => preset.id === "reading")?.options.frontMatter).toBe(true);
    expect(cleanCompile({ frontMatter: true }).frontMatter).toBe(true);
  });

  test("plain text: after the title, before the text", () => {
    const plain = manuscriptToText({ title: "Verona", author: "W. S." }, pieces);
    expect(plain.indexOf("by W. S.")).toBeLessThan(plain.indexOf("All rights reserved."));
    expect(plain.indexOf("who waited.")).toBeLessThan(plain.indexOf("PART ONE"));
    expect(plain).toContain("— Juliet");
  });

  test("RTF: each page on a page of its own, and the text after them on a new page", () => {
    const rtf = buildRtf({ title: "Verona", author: "W. S.", words: 9, pieces, options: { ...standardManuscript, frontMatter: true } });
    const back = rtfToValue(rtf).map(text);
    expect(back.slice(3, 8)).toEqual(["Copyright © 2026 W. S.", "All rights reserved.", "For Anne,\nwho waited.", "What's in a name?", "— Juliet"]);
    expect(rtf.match(/\\page /g)?.length).toBeGreaterThanOrEqual(4);
    // The text starts a page of its own after the epigraph.
    expect(rtf.slice(rtf.indexOf("Juliet"), rtf.indexOf("Part One"))).toContain("\\page ");
  });

  test("Word: the dedication in italics on its own page", async () => {
    const doc = new TextDecoder().decode(unzipSync(await buildDocx({ title: "Verona", author: "W. S.", words: 9, pieces }))["word/document.xml"]);
    const at = doc.indexOf("who waited.");
    expect(at).toBeGreaterThan(doc.indexOf("All rights reserved."));
    expect(doc.lastIndexOf("<w:i/>", at)).toBeGreaterThan(doc.lastIndexOf("<w:p>", at));
    expect(doc.split("w:pageBreakBefore").length - 1).toBeGreaterThanOrEqual(4);
  });
});

describe("paper", () => {
  const pieces = layoutManuscript(book);

  test("US Letter unless A4 is chosen, in Word and in RTF", async () => {
    expect(standardManuscript.paper).toBe("letter");
    expect(cleanCompile({ paper: "a4" }).paper).toBe("a4");
    expect(cleanCompile({ paper: "legal" }).paper).toBe("letter");
    const a4 = { ...standardManuscript, paper: "a4" as const };
    const doc = new TextDecoder().decode(unzipSync(await buildDocx({ title: "Verona", author: "W. S.", words: 9, pieces, options: a4 }))["word/document.xml"]);
    expect(doc).toContain('w:w="11909"');
    expect(doc).toContain('w:h="16834"');
    expect(buildRtf({ title: "Verona", author: "W. S.", words: 9, pieces, options: a4 })).toContain("\\paperw11909\\paperh16834");
    expect(buildRtf({ title: "Verona", author: "W. S.", words: 9, pieces })).toContain("\\paperw12240\\paperh15840");
  });
});
