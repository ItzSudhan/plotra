import { describe, expect, test } from "bun:test";
import { WIKILINK, type DocNode } from "@/lib/doc-index";
import type { ImportOptions } from "@/lib/io/outline";
import { slateToValue } from "@/lib/io/plottr";
import { planUpload, type UploadedFile } from "@/lib/io/upload";
import { bbcodeToMarkdown, bbcodeToValue } from "@/lib/io/worldanvil";
import { isWorldAnvilExport, worldAnvilKeep, worldAnvilPlace } from "@/lib/io/worldanvil-files";

// Plottr files and World Anvil exports in (beat-the-competitors.md, step 3).
// The shapes here follow real files: Plottr's Hamlet demo, and a World Anvil export.

const options: ImportOptions = { split: "headings", breaks: false, kind: "scene", lines: "wrap" };
const text = (n: DocNode): string => (typeof n.text === "string" ? n.text : n.type === WIKILINK ? `[[${String(n.title)}]]` : (n.children ?? []).map(text).join(""));
const file = (path: string, body: unknown): UploadedFile => {
  const parts = path.split("/");
  return { name: parts.at(-1)!, folder: parts.slice(0, -1), bytes: new TextEncoder().encode(typeof body === "string" ? body : JSON.stringify(body)) };
};
const p = (...children: unknown[]) => ({ type: "paragraph", children });

// ---- Plottr ---------------------------------------------------------------------------------

const hamlet = {
  file: { version: "2023.7.14" },
  books: { 1: { id: 1, title: "Hamlet" }, allIds: [1] },
  beats: {
    1: {
      children: { null: [2, 3], 2: [], 3: [] },
      heap: {},
      index: { 2: { id: 2, bookId: 1, position: 0, title: "Act 1" }, 3: { id: 3, bookId: 1, position: 1, title: "auto" } },
    },
  },
  hierarchyLevels: { 1: { 0: { name: "Act" } } },
  lines: [
    { id: 2, bookId: 1, title: "Scenes", color: "#78be20", position: 1 },
    { id: 1, bookId: 1, title: "Summary", color: "#6cace4", position: 0 },
    { id: 9, bookId: "series", title: "Main Plot", color: "#6cace4", position: 0 },
  ],
  cards: [
    { id: 11, lineId: 2, beatId: 2, positionInChapter: 0, positionWithinLine: 1, title: "Claudius makes an announcement", description: [p({ text: "The new king speaks." })], tags: [1], characters: [1, 2], places: [1] },
    { id: 10, lineId: 2, beatId: 2, positionInChapter: 0, positionWithinLine: 0, title: "The guards see a ghost", description: [p({ text: "On the ramparts." })], tags: [], characters: [], places: [] },
    { id: 12, lineId: 1, beatId: 2, positionInChapter: 0, positionWithinLine: 0, title: "Hamlet learns the truth", description: [p({ text: "x".repeat(2500) })], tags: [], characters: [], places: [] },
    { id: 13, lineId: 2, beatId: 3, positionInChapter: 0, positionWithinLine: 0, title: "", description: "", tags: [], characters: [], places: [] },
  ],
  characters: [{ id: 1, name: "Hamlet", description: "Prince of Denmark", notes: [p({ text: "Melancholy, " }, { text: "rash", italic: true }, { text: "." })], categoryId: "1", tags: [], Role: "Protagonist", Motivation: [p({ text: "Revenge" })] }, { id: 2, name: "Claudius", description: "", notes: [], tags: [] }],
  places: [{ id: 1, name: "Elsinore Castle", description: "The palace", notes: [], tags: [] }],
  notes: [{ id: 1, title: "Sources", content: [p({ text: "See " }, { type: "link", url: "https://folger.edu", children: [{ text: "Folger" }] })] }],
  tags: [{ id: 1, title: "STAGE: Exposition", color: "MediumBlue" }],
  categories: { characters: [{ id: 1, name: "Main", position: 0 }] },
  customAttributes: { characters: [{ name: "Role", type: "text" }, { name: "Motivation", type: "paragraph" }], places: [], notes: [] },
  images: { 1: { data: "data:image/jpeg;base64,AAAA" } },
};

describe("a Plottr file", () => {
  test("beats are chapters, cards are scenes in Plottr's order, plotlines are threads", async () => {
    const { outline, threads, format } = await planUpload([file("Hamlet.pltr", hamlet)], options);
    expect(format).toBe("plottr");
    expect(threads).toEqual([
      { name: "Summary", color: "#6cace4" },
      { name: "Scenes", color: "#78be20" },
    ]);
    expect(outline.map((e) => [e.kind, e.title, e.parent === null ? null : outline[e.parent].title])).toEqual([
      ["chapter", "Act 1", null],
      ["scene", "Hamlet learns the truth", "Act 1"],
      ["scene", "The guards see a ghost", "Act 1"],
      ["scene", "Claudius makes an announcement", "Act 1"],
      // "auto" is a beat Plottr numbers itself.
      ["chapter", "Act 2", null],
      ["scene", "Untitled scene", "Act 2"],
      ["folder", "Characters", null],
      ["character", "Hamlet", "Characters"],
      ["character", "Claudius", "Characters"],
      ["folder", "Places", null],
      ["location", "Elsinore Castle", "Places"],
      ["folder", "Notes", null],
      ["note", "Sources", "Notes"],
    ]);
  });

  test("a card's description is its synopsis and its plot grid cell; its people and places are linked", async () => {
    const { outline } = await planUpload([file("Hamlet.pltr", hamlet)], options);
    const announcement = outline.find((e) => e.title === "Claudius makes an announcement")!;
    expect(announcement.synopsis).toBe("The new king speaks.");
    expect(announcement.threads).toEqual([{ thread: 1, note: "The new king speaks." }]);
    expect(announcement.tags).toEqual(["stage-exposition"]);
    expect(announcement.value.map(text)).toEqual(["Characters: [[Hamlet]], [[Claudius]]", "Places: [[Elsinore Castle]]"]);
    // Too long for a synopsis: it's the scene's text instead.
    const truth = outline.find((e) => e.title === "Hamlet learns the truth")!;
    expect(truth.synopsis).toBeUndefined();
    expect(truth.value.map(text)).toEqual(["x".repeat(2500)]);
  });

  test("characters keep their custom attributes, notes and category; notes keep their links", async () => {
    const { outline } = await planUpload([file("Hamlet.pltr", hamlet)], options);
    const prince = outline.find((e) => e.title === "Hamlet")!;
    expect(prince.synopsis).toBe("Prince of Denmark");
    expect(prince.tags).toEqual(["main"]);
    expect(prince.value.map(text)).toEqual(["Role: Protagonist", "Motivation: Revenge", "Melancholy, rash."]);
    expect(prince.value[2].children).toContainEqual({ text: "rash", italic: true });
    expect(outline.find((e) => e.title === "Sources")!.value[0].children).toContainEqual({ type: "a", url: "https://folger.edu", children: [{ text: "Folger" }] });
  });

  test("an older file, with chapters as a list, reads too", async () => {
    const old = { books: { 1: { id: 1, title: "Old" }, allIds: [1] }, chapters: [{ id: 1, bookId: 1, position: 0, title: "Chapter One" }], lines: [{ id: 1, bookId: 1, title: "Main", position: 0 }], cards: [{ id: 1, lineId: 1, chapterId: 1, title: "Opening", description: "It begins." }] };
    const { outline } = await planUpload([file("Old.pltr", old)], options);
    expect(outline.map((e) => [e.kind, e.title, e.synopsis])).toEqual([
      ["chapter", "Chapter One", undefined],
      ["scene", "Opening", "It begins."],
    ]);
  });

  test("Slate lists become list paragraphs", () => {
    const value = slateToValue([{ type: "bulleted-list", children: [{ type: "list-item", children: [{ text: "One" }] }, { type: "list-item", children: [{ text: "Two" }] }] }]);
    expect(value).toEqual([
      { type: "p", indent: 1, listStyleType: "disc", children: [{ text: "One" }] },
      { type: "p", indent: 1, listStyleType: "disc", children: [{ text: "Two" }] },
    ]);
  });
});

// ---- World Anvil ------------------------------------------------------------------------------

const article = (title: string, entityClass: string, extra: Record<string, unknown> = {}) => ({ id: title, title, entityClass, tags: "", content: "", sections: { displaySidebar: { content: true }, folderId: { content: "-1" } }, relations: {}, ...extra });

const world = [
  file("worlds/Arteria/metadata.json", { name: "Arteria" }),
  file("worlds/Arteria/articles/Arteria, Continent/category-metadata.json", article("Arteria, Continent", "Category")),
  file("worlds/Arteria/articles/Arteria, Continent/Farofaen/Thornfield/Baron Darius Thornfield.json", article("Baron Darius Thornfield", "Person", {
    content: "Archmage of the [b]Society[/b].[br]Beloved by his people.",
    sections: { displaySidebar: { content: true }, ggmjob: { content: "Ruler of Farofaen" }, alternativeNames: { content: "The Baron" } },
    relations: {
      locations: { items: [{ title: "Thornfield", relationshipType: "article", type: "settlement" }] },
      maps: { items: [{ title: "The barony", relationshipType: "", type: "map" }] },
      cover: { items: { title: "baron.jpg", relationshipType: "", type: "image" } },
      species: { items: { title: "Human", relationshipType: "article", type: "species" } },
    },
  })),
  file("worlds/Arteria/articles/Arteria, Continent/Farofaen/Thornfield/Thornfield.json", article("Thornfield", "Settlement", { tags: "city, Farofaen", relations: { type: { items: { title: "Town", relationshipType: "", type: "settlementtype" } } } })),
  file("worlds/Arteria/articles/Arteria, Continent/Farofaen/Thornfield/Thornfield.html", "<div>rendered</div>"),
  file("worlds/Arteria/articles/Uncategorized Articles/Forestry Guild.json", article("Forestry Guild", "Organization", { content: "[quote]We fell trees.[/quote]Founded by @[Baron Darius Thornfield](person:abc)." })),
];

describe("a World Anvil export", () => {
  test("only the articles' JSON is sent", () => {
    const paths = world.map((f) => [...(f.folder ?? []), f.name].join("/"));
    expect(paths.filter(worldAnvilKeep)).toHaveLength(4);
    expect(isWorldAnvilExport(paths)).toBe(true);
    expect(worldAnvilPlace("worlds/Arteria/articles/A/B/C.json")).toEqual({ world: "Arteria", categories: ["A", "B"] });
  });

  test("categories are folders; people are characters, settlements places, the rest tagged notes", async () => {
    const { outline, format } = await planUpload(world, options);
    expect(format).toBe("worldanvil");
    expect(outline.map((e) => [e.kind, e.title, e.parent === null ? null : outline[e.parent].title, e.tags])).toEqual([
      ["folder", "Arteria, Continent", null, []],
      ["folder", "Farofaen", "Arteria, Continent", []],
      ["folder", "Thornfield", "Farofaen", []],
      ["character", "Baron Darius Thornfield", "Thornfield", []],
      ["location", "Thornfield", "Thornfield", ["city", "farofaen"]],
      ["folder", "Uncategorized Articles", null, []],
      ["note", "Forestry Guild", "Uncategorized Articles", ["organization"]],
    ]);
  });

  test("the text, the template's fields and the related articles come across", async () => {
    const { outline } = await planUpload(world, options);
    const baron = outline.find((e) => e.title === "Baron Darius Thornfield")!;
    expect(baron.value.map(text)).toEqual(["Archmage of the Society.\nBeloved by his people.", "Job: Ruler of Farofaen", "Alternative names: The Baron", "Locations: [[Thornfield]]", "Species: [[Human]]"]);
    expect(outline.find((e) => e.title === "Thornfield" && e.kind === "location")!.value.map(text)).toEqual(["Type: Town"]);
    const guild = outline.find((e) => e.title === "Forestry Guild")!;
    expect(guild.value.map((b) => b.type)).toEqual(["blockquote", "p"]);
    expect(guild.value.map(text)).toEqual(["We fell trees.", "Founded by [[Baron Darius Thornfield]]."]);
  });

  test("BBCode: marks, headings, lists, links; embeds and pictures go; stray brackets stay as typed", () => {
    expect(bbcodeToMarkdown("[h2]Ecology[/h2]")).toBe("\n\n## Ecology\n\n");
    expect(bbcodeToMarkdown("[url=https://x.org/a b]the page[/url]")).toBe("[the page](https://x.org/a%20b)");
    const value = bbcodeToValue("[ul][li]One[/li][li][i]Two[/i][/li][/ul]See [img]x.png[/img][calendar:19679|2999]note [2] and *stars*.");
    expect(value.map(text)).toEqual(["One", "Two", "See note [2] and *stars*."]);
    expect(value[1].children).toContainEqual({ text: "Two", italic: true });
  });
});
