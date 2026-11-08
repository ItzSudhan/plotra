import { expect, test } from "bun:test";
import { htmlToValue } from "@/lib/io/html";
import { blocksToText, isBreakLine, isChapterLine, textToValue } from "@/lib/io/text";

// Plain-text import (lib/io/text.ts) and the HTML reader behind Word import (lib/io/html.ts).

const p = (text: string) => ({ type: "p", children: [{ text }] });

test("chapter lines: numbered, worded, titled and named headings", () => {
  for (const line of ["Chapter 1", "CHAPTER ONE: The Storm", "Chapter Twenty-One", "Part II", "Book 2 - Winter", "Prologue", "Prologue: Fire", "Chapter 12.", "Prologue.", "Epilogue.", "Epilogue:"]) {
    expect(isChapterLine(line)).toBe(true);
  }
});

test("chapter lines: sentences that only start like a heading are not chapters", () => {
  for (const line of ["Chapter 1 was the hard part.", "Book I never finished", "Prologues are overrated.", "", "Chapter"]) {
    expect(isChapterLine(line)).toBe(false);
  }
});

test("break lines: rows of asterisks, hashes, dashes and the asterism", () => {
  for (const line of ["***", "* * *", "#", "---", "⁂", "  ***  "]) expect(isBreakLine(line)).toBe(true);
  for (const line of ["--", "* *", "", "# Heading", "Text"]) expect(isBreakLine(line)).toBe(false);
});

test("text: Windows line endings and a leading byte order mark are read as plain lines", () => {
  expect(textToValue("﻿Roses are red,\r\nViolets are blue.\r\n\r\nSugar is sweet.")).toEqual([p("Roses are red,\nViolets are blue."), p("Sugar is sweet.")]);
});

test("text: hard-wrapped prose is joined with spaces, short lines keep their breaks", () => {
  const wrapped = "It was a dark and stormy night; the rain fell in torrents,\nexcept at occasional intervals, when it was checked by a\nviolent gust of wind which swept up the streets.\n\nNext.";
  expect(textToValue(wrapped)).toEqual([
    p("It was a dark and stormy night; the rain fell in torrents, except at occasional intervals, when it was checked by a violent gust of wind which swept up the streets."),
    p("Next."),
  ]);
  expect(textToValue("Roses are red,\nViolets are blue.\n\nSugar is sweet,\nAnd so are you.")).toEqual([p("Roses are red,\nViolets are blue."), p("Sugar is sweet,\nAnd so are you.")]);
});

test("text: a file with no blank lines has a paragraph per line", () => {
  expect(textToValue("Line one\nLine two\nLine three\n")).toEqual([p("Line one"), p("Line two"), p("Line three")]);
});

test("text: scene breaks become rules; chapter lines become headings only when asked", () => {
  const source = "Chapter 1\n\nText.\n\n* * *\n\nMore.\n\nPrologue.\n\nEnd.";
  const hr = { type: "hr", children: [{ text: "" }] };
  expect(textToValue(source)).toEqual([p("Chapter 1"), p("Text."), hr, p("More."), p("Prologue."), p("End.")]);
  expect(textToValue(source, { chapters: true })).toEqual([{ type: "h1", children: [{ text: "Chapter 1" }] }, p("Text."), hr, p("More."), { type: "h1", children: [{ text: "Prologue." }] }, p("End.")]);
});

test("text: a chapter line in the middle of a paragraph stays text", () => {
  expect(textToValue("She said\nChapter 1\nwas hard.\n\nNext.", { chapters: true })).toEqual([p("She said\nChapter 1\nwas hard."), p("Next.")]);
});

test("text out: paragraphs, lists, breaks and tables", () => {
  const text = blocksToText([
    { kind: "paragraph", runs: [{ text: "Hello." }] },
    { kind: "list", style: "bullet", level: 1, runs: [{ text: "one" }] },
    { kind: "list", style: "ordered", number: 2, level: 2, runs: [{ text: "two" }] },
    { kind: "break" },
    { kind: "table", rows: [[{ runs: [{ text: "a" }] }, { runs: [{ text: "b" }] }]] },
  ] as Parameters<typeof blocksToText>[0]);
  expect(text).toBe("Hello.\n\n- one\n  2. two\n\n* * *\n\na\tb");
});

test("html: headings, marks, nested lists, links, line breaks and tables", () => {
  const value = htmlToValue(
    "<h1>Title</h1><h4>Small</h4>" +
      "<p>Some <strong>bold</strong> and <em>italic</em>.</p>" +
      "<ul><li>One<ul><li>Two</li></ul></li></ul>" +
      '<p><a href="https://example.com">a link</a> and <a href="javascript:alert(1)">a trap</a></p>' +
      "<script>alert('no')</script>" +
      "<p>first<br>second</p>" +
      "<p>  </p>" +
      "<table><tr><th>Name</th></tr><tr><td>Romeo</td></tr></table>",
  );
  expect(value).toEqual([
    { type: "h1", children: [{ text: "Title" }] },
    { type: "h3", children: [{ text: "Small" }] },
    { type: "p", children: [{ text: "Some " }, { text: "bold", bold: true }, { text: " and " }, { text: "italic", italic: true }, { text: "." }] },
    { type: "p", indent: 1, listStyleType: "disc", children: [{ text: "One" }] },
    { type: "p", indent: 2, listStyleType: "disc", children: [{ text: "Two" }] },
    { type: "p", children: [{ text: "" }, { type: "a", url: "https://example.com", children: [{ text: "a link" }] }, { text: " and a trap" }] },
    p("first\nsecond"),
    {
      type: "table",
      children: [
        { type: "tr", children: [{ type: "th", children: [p("Name")] }] },
        { type: "tr", children: [{ type: "td", children: [p("Romeo")] }] },
      ],
    },
  ]);
  expect(JSON.stringify(value)).not.toContain("alert");
});

test("html: an ordered list keeps its start and a line of asterisks is a scene break", () => {
  expect(htmlToValue('<ol start="3"><li>c</li><li>d</li></ol><p>* * *</p>')).toEqual([
    { type: "p", indent: 1, listStyleType: "decimal", listStart: 3, children: [{ text: "c" }] },
    { type: "p", indent: 1, listStyleType: "decimal", listStart: 4, children: [{ text: "d" }] },
    { type: "hr", children: [{ text: "" }] },
  ]);
});
