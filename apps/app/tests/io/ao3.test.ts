import { describe, expect, test } from "bun:test";
import type { DocNode } from "@/lib/doc-index";
import { ao3Chapters, ao3Page, blocksToAo3 } from "@/lib/io/ao3";
import { layoutManuscript, type ExportSection } from "@/lib/io/manuscript";
import { toBlocks } from "@/lib/io/model";

// Archive of Our Own, chapter by chapter (lib/io/ao3.ts).

const p = (...children: DocNode[]): DocNode => ({ type: "p", children });
const section = (id: string, kind: ExportSection["kind"], title: string, depth: number, body: DocNode[] = []): ExportSection => ({
  id,
  kind,
  title,
  depth,
  format: "prose",
  tags: [],
  blocks: toBlocks(body),
});

describe("AO3 HTML", () => {
  test("marks, links and lists in tags AO3 keeps; markup in the text is escaped", () => {
    const html = blocksToAo3(
      toBlocks([
        p({ text: "She said " }, { text: "no", italic: true }, { text: " <twice>", bold: true }),
        p({ type: "a", url: "https://example.com", children: [{ text: "a link" }] }),
        { type: "p", listStyleType: "disc", indent: 1, children: [{ text: "one" }] },
        { type: "p", listStyleType: "disc", indent: 1, children: [{ text: "two" }] },
        { type: "hr", children: [{ text: "" }] },
        { type: "blockquote", children: [{ text: "Quoted." }] },
        { type: "img", url: "https://example.com/map.png", alt: "A map", children: [{ text: "" }] },
      ]),
    );
    expect(html).toContain("<p>She said <em>no</em><strong> &lt;twice&gt;</strong></p>");
    expect(html).toContain('<a href="https://example.com">a link</a>');
    expect(html).toContain("<ul>\n  <li>one</li>\n  <li>two</li>\n</ul>");
    expect(html).toContain("<hr />");
    expect(html).toContain("<blockquote><p>Quoted.</p></blockquote>");
    // A picture on the web, which AO3 can load (one stored in Plotra never reaches an export).
    expect(html).toContain('<p align="center"><img src="https://example.com/map.png" alt="A map" /></p>');
  });
});

describe("AO3 chapters", () => {
  const book: ExportSection[] = [
    section("pro", "scene", "Prologue", 0, [p({ text: "Before." })]),
    section("part", "folder", "Part One", 0),
    section("c1", "chapter", "The Feud", 1),
    section("s1", "scene", "The brawl", 2, [p({ text: "Swords in the square." })]),
    section("s2", "scene", "The prince", 2, [p({ text: "Peace, or death." })]),
    section("c2", "chapter", "The Feast", 1),
    section("s3", "scene", "Masks", 2, [p({ text: "A masked ball, at last." })]),
    section("c3", "chapter", "Empty", 1),
  ];

  test("one per chapter, a prologue its own, a part's title at the top of its first chapter, synopses as summaries", () => {
    const chapters = ao3Chapters(layoutManuscript(book), { title: "Verona", summaryOf: (id) => (id === "c2" ? " The ball. " : null) });
    expect(chapters.map((c) => c.title)).toEqual(["Prologue", "The Feud", "The Feast"]);
    expect(chapters[1].html).toBe("<h2>Part One</h2>\n<p>Swords in the square.</p>\n<hr />\n<p>Peace, or death.</p>");
    expect(chapters[2].summary).toBe("The ball.");
    expect(chapters[0].summary).toBe("");
    expect(chapters.map((c) => c.words)).toEqual([1, 7, 5]);
  });

  test("a story with no chapters is one chapter under the work's title", () => {
    const story = [section("a", "scene", "A", 0, [p({ text: "One." })]), section("b", "scene", "B", 0, [p({ text: "Two." })])];
    const chapters = ao3Chapters(layoutManuscript(story.map((s) => ({ ...s, depth: 1 }))), { title: "Short" });
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe("Short");
    expect(chapters[0].html).toBe("<p>One.</p>\n<hr />\n<p>Two.</p>");
  });

  test("the page to copy from carries every chapter's text, escaped in its box", () => {
    const page = ao3Page("Verona & Co", "W. S.", [{ title: "One", summary: "", html: "<p>Hi</p>", words: 1 }]);
    expect(page).toContain("<title>Verona &amp; Co: for AO3</title>");
    expect(page).toContain("&lt;p&gt;Hi&lt;/p&gt;</textarea>");
    expect(page).toContain('data-copy="text-0"');
  });
});
