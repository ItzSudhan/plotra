import { describe, expect, test } from "bun:test";
import { standardManuscript } from "@/lib/io/compile";
import { buildPrintHtml, printPage } from "@/lib/io/print-html";

// The manuscript laid out for a PDF (lib/io/print-html.ts): the DOCX export's layout, as HTML.

const base = { title: "The Ninth Bell", author: "Alex Morgan", words: 1234 };

describe("print layout", () => {
  test("title page, chapters on new pages, scene breaks and escaped text", () => {
    const html = buildPrintHtml({
      ...base,
      pieces: [
        { kind: "heading", title: "Chapter 1", level: 1, chapter: true },
        { kind: "blocks", format: "prose", blocks: [{ kind: "paragraph", runs: [{ text: "It was <dark>", italic: true }] }] },
        { kind: "scene-break" },
        { kind: "blocks", format: "prose", blocks: [{ kind: "list", style: "ordered", level: 1, number: 1, checked: false, runs: [{ text: "one" }] }] },
      ],
      options: standardManuscript,
    });
    expect(html).toContain('<h1 class="book">The Ninth Bell</h1>');
    expect(html).toContain("about 1,200 words");
    expect(html).toContain('<h1 class="chapter page">Chapter 1</h1>');
    expect(html).toContain("<em>It was &lt;dark&gt;</em>");
    expect(html).toContain('<p class="sep">#</p>');
    expect(html).toContain("<ol><li");
    expect(html).toContain("</ol>");
    expect(html).toContain("size: 8.5in 11in");
    expect(html).toContain("line-height: 2;");
  });

  test("no title page and A4 when the layout says so", () => {
    const html = buildPrintHtml({ ...base, pieces: [], options: { ...standardManuscript, titlePage: false, paper: "a4" } });
    expect(html).not.toContain(`<section class="title-page">`);
    expect(printPage({ options: { ...standardManuscript, paper: "a4" } })).toEqual({ width: 595, height: 842 });
  });

  test("a script keeps its columns", () => {
    const html = buildPrintHtml({
      ...base,
      pieces: [{ kind: "blocks", format: "screenplay", blocks: [{ kind: "paragraph", script: "character", runs: [{ text: "ROMEO" }] }, { kind: "paragraph", script: "dialogue", runs: [{ text: "Hello." }] }] }],
    });
    expect(html).toContain('class="script s-character keep">ROMEO');
    expect(html).toContain('class="script s-dialogue">Hello.');
  });
});
