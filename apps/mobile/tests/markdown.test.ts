import { describe, expect, test } from "bun:test";
import { countWords, parseInline, parseMarkdown, parseWiki } from "../src/lib/markdown";

describe("inline Markdown", () => {
  test("marks", () => {
    expect(parseInline("a **b** *c* ~~d~~ ==e== <u>f</u> `g`")).toEqual([
      { text: "a " },
      { text: "b", bold: true },
      { text: " " },
      { text: "c", italic: true },
      { text: " " },
      { text: "d", strike: true },
      { text: " " },
      { text: "e", highlight: true },
      { text: " " },
      { text: "f", underline: true },
      { text: " " },
      { text: "g", code: true },
    ]);
  });

  test("nested marks", () => {
    expect(parseInline("**bold *both***")).toEqual([{ text: "bold ", bold: true }, { text: "both", bold: true, italic: true }]);
  });

  test("wiki-links, with headings and aliases", () => {
    expect(parseWiki("Juliet#Balcony|her")).toEqual({ title: "Juliet", heading: "Balcony", alias: "her" });
    expect(parseInline("Meet [[Juliet]] and [[Verona|the city]].")).toEqual([
      { text: "Meet " },
      { text: "Juliet", wiki: { title: "Juliet" } },
      { text: " and " },
      { text: "the city", wiki: { title: "Verona", alias: "the city" } },
      { text: "." },
    ]);
  });

  test("links, escapes, entities and line breaks", () => {
    expect(parseInline("[the *site*](https://plotra.ink)")).toEqual([
      { text: "the ", href: "https://plotra.ink" },
      { text: "site", italic: true, href: "https://plotra.ink" },
    ]);
    expect(parseInline("2 \\* 3 \\[x\\] snake_case_name &amp; a<br>b")).toEqual([{ text: "2 * 3 [x] snake_case_name & a\nb" }]);
  });

  test("a mark that never closes is just a character", () => {
    expect(parseInline("5 * 4 = 20")).toEqual([{ text: "5 * 4 = 20" }]);
  });
});

describe("block Markdown", () => {
  test("what the app's exporter writes", () => {
    const blocks = parseMarkdown(
      [
        "# Act One",
        "",
        "The *first* line\\",
        "and the second.",
        "",
        "> A quote",
        "",
        "> [!note]",
        "> Remember this.",
        "",
        "- one",
        "    - nested",
        "1. first",
        "- [x] done",
        "- [ ] to do",
        "",
        "---",
        "",
        "| Name | Age |",
        "| --- | --- |",
        "| Romeo | 16 |",
        "",
        "![A map](https://x.test/map.png)",
        "",
        "![[Verona]]",
      ].join("\n"),
    );
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "paragraph", "quote", "callout", "list", "list", "list", "list", "list", "rule", "table", "image", "embed"]);
    expect(blocks[1]).toEqual({ kind: "paragraph", runs: [{ text: "The " }, { text: "first", italic: true }, { text: " line\nand the second." }] });
    expect(blocks[3]).toEqual({ kind: "callout", label: "note", runs: [{ text: "Remember this." }] });
    expect(blocks[5]).toMatchObject({ kind: "list", style: "bullet", level: 2 });
    expect(blocks[6]).toMatchObject({ kind: "list", style: "ordered", number: 1 });
    expect(blocks[7]).toMatchObject({ kind: "list", style: "todo", checked: true });
    expect(blocks[8]).toMatchObject({ kind: "list", style: "todo", checked: false });
    expect(blocks[10]).toMatchObject({ kind: "table", rows: [[[{ text: "Name" }], [{ text: "Age" }]], [[{ text: "Romeo" }], [{ text: "16" }]]] });
    expect(blocks[11]).toEqual({ kind: "image", alt: "A map", url: "https://x.test/map.png" });
    expect(blocks[12]).toEqual({ kind: "embed", wiki: { title: "Verona" } });
  });

  test("empty text is no blocks", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("\n\n")).toEqual([]);
  });

  test("counts words", () => {
    expect(countWords("# Title\n\nThe **quick** [[Fox|fox]] - jumps.")).toBe(5);
  });
});
