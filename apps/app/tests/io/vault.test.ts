import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { valueToYdoc, ydocToValue } from "@/lib/collab/ydoc";
import { placeInDoc } from "@/lib/io/picture-place";
import { inferProperties, propertyValue } from "@/lib/io/properties";
import { PENDING_PICTURE, pictureFinder } from "@/lib/io/vault-pictures";
import { EMBED, WIKILINK, type DocNode } from "@/lib/doc-index";
import { markdownToValue, parseFrontMatter, resolveLinks } from "@/lib/io/markdown";
import { buildOutline, extras, linkFinder, type ImportOptions } from "@/lib/io/outline";
import { planImport, type UploadedFile } from "@/lib/io/upload";

// Bringing an Obsidian vault in (plan.md 2.7): a folder of Markdown notes
// keeps its folders, its links, its aliases and its lines.

const vault: ImportOptions = { split: "file", breaks: false, kind: "note", lines: "keep" };

const file = (path: string, text: string): UploadedFile => {
  const parts = path.split("/");
  return { name: parts.at(-1)!, folder: parts.slice(0, -1), bytes: new TextEncoder().encode(text) };
};

const text = (n: DocNode): string => (typeof n.text === "string" ? n.text : (n.children ?? []).map(text).join(""));
const find = (nodes: DocNode[], type: string): DocNode[] => nodes.flatMap((n) => [...(n.type === type ? [n] : []), ...find(n.children ?? [], type)]);

describe("Obsidian Markdown", () => {
  test("aliases are read from front matter, as a list or on one line", () => {
    expect(parseFrontMatter("---\naliases:\n  - Romeo M.\n  - \"The Montague boy\"\ntags: [character, verona]\n---\nText").meta).toMatchObject({
      aliases: ["Romeo M.", "The Montague boy"],
      tags: ["character", "verona"],
    });
    expect(parseFrontMatter("---\naliases: [Juliet C., Jule]\n---\n").meta.aliases).toEqual(["Juliet C.", "Jule"]);
    expect(parseFrontMatter("---\nalias: The Prince\n---\n").meta.aliases).toEqual(["The Prince"]);
    expect(parseFrontMatter("No front matter").meta.aliases).toEqual([]);
  });

  test("comments are left out, on one line or across several, and code keeps them", () => {
    const value = markdownToValue("Seen %%not this%% too.\n\n%%\nA whole\nhidden block\n%%\n\nAfter.\n\n```\n%%kept%%\n```");
    expect(value.map(text)).toEqual(["Seen  too.", "After.", "%%kept%%"]);
    // One `%%` with nothing to close it is something the writer typed.
    expect(markdownToValue("100%% sure").map(text)).toEqual(["100%% sure"]);
  });

  test("a block's id is dropped, and a link to a block goes to its note", () => {
    const value = markdownToValue("The feud is older than either house. ^feud\n\n^lone\n\n- An item ^item\n\nSee [[Verona#^feud]] and [[Verona#The square]].");
    expect(value.map(text).slice(0, 2)).toEqual(["The feud is older than either house.", "An item"]);
    const links = find(value, WIKILINK);
    expect(links.map((l) => [l.title, l.heading])).toEqual([
      ["Verona", undefined],
      ["Verona", "The square"],
    ]);
  });

  test("lines are kept as lines when asked, and run together otherwise", () => {
    const source = "Name: Romeo\nHouse: Montague\n\n- one\n  still one";
    expect(markdownToValue(source, { lines: "keep" }).map(text)).toEqual(["Name: Romeo\nHouse: Montague", "one\nstill one"]);
    expect(markdownToValue(source).map(text)).toEqual(["Name: Romeo House: Montague", "one still one"]);
  });
});

describe("a vault's folders", () => {
  test("folders come first, then notes, each inside its own", async () => {
    const outline = await planImport(
      [
        file("Welcome.md", "Start here."),
        file("Places/Verona.md", "A city."),
        file("Characters/Romeo.md", "A Montague."),
        file("Characters/Capulets/Juliet.md", "A Capulet."),
        file("Characters/Capulets/Tybalt.md", "Her cousin."),
      ],
      vault,
    );
    expect(outline.map((e) => [e.kind, e.title, e.parent])).toEqual([
      ["folder", "Characters", null],
      ["folder", "Capulets", 0],
      ["note", "Juliet", 1],
      ["note", "Tybalt", 1],
      ["note", "Romeo", 0],
      ["folder", "Places", null],
      ["note", "Verona", 5],
      ["note", "Welcome", null],
    ]);
    expect(outline[2].path).toBe("Characters/Capulets/Juliet");
  });

  test("files with no folder import as they always did", () => {
    const one = (name: string) => ({ name, tags: [], value: markdownToValue("Text") });
    const outline = buildOutline([one("Chapter 10"), one("Chapter 2")], { ...vault, kind: "scene" });
    expect(outline.map((e) => [e.kind, e.title, e.parent])).toEqual([
      ["scene", "Chapter 2", null],
      ["scene", "Chapter 10", null],
    ]);
  });

  test("split at headings, a file in a folder puts its chapters there", async () => {
    const outline = await planImport([file("Book/Act One.md", "# The brawl\n\nSwords.\n\n# The feast\n\nMasks.")], { ...vault, split: "headings" });
    expect(outline.map((e) => [e.kind, e.title, e.parent])).toEqual([
      ["folder", "Book", null],
      ["folder", "Act One", 0],
      ["chapter", "The brawl", 1],
      ["chapter", "The feast", 1],
    ]);
  });
});

describe("a vault's links", () => {
  const files = [
    file("Characters/Romeo.md", "---\naliases: [The Montague boy]\n---\nLoves [[Juliet]], lives in [[Places/Verona]], fled to [[Mantua]].\n\n![[Juliet]]"),
    file("Characters/Juliet.md", "---\ntitle: Juliet Capulet\n---\nLoves [[the montague boy|him]]."),
    file("Places/Verona.md", "The city, not [[People/Verona|the duchess]] and not [[Nowhere]]."),
    file("People/Verona.md", "A duchess. See [[Old notes]] and [[Verona.md]]."),
  ];

  test("links find their notes by title, file name, alias and path", async () => {
    const outline = await planImport(files, vault);
    const ids = outline.map((_, i) => `id-${i}`);
    const id = (path: string) => ids[outline.findIndex((e) => e.path === path)];
    const linked = (path: string) => {
      const entry = outline.find((e) => e.path === path)!;
      const value = resolveLinks(entry.value, linkFinder(outline, ids, [["Old notes", "existing"], ["Mantua", "existing-mantua"]]));
      return { ids: [...find(value, WIKILINK), ...find(value, EMBED)].map((l) => l.nodeId), text: value.map(text).join(" ") };
    };

    // The title in front matter isn't the name links use; the file's name is.
    expect(outline.find((e) => e.path === "Characters/Juliet")!.title).toBe("Juliet Capulet");
    expect(linked("Characters/Romeo").ids).toEqual([id("Characters/Juliet"), id("Places/Verona"), "existing-mantua", id("Characters/Juliet")]);
    expect(linked("Characters/Juliet").ids).toEqual([id("Characters/Romeo")]);
    // A path picks between two notes of one name; a link to nothing stays as it was typed.
    const verona = linked("Places/Verona");
    expect(verona.ids).toEqual([id("People/Verona")]);
    expect(verona.text).toContain("[[Nowhere]]");
    // Without a path, the first note of that name; notes the project already has come after the import's own.
    expect(linked("People/Verona").ids).toEqual(["existing", id("People/Verona")]);
  });

  test("aliases are kept on the note", async () => {
    const outline = await planImport(files, vault);
    expect(outline.find((e) => e.path === "Characters/Romeo")!.aliases).toEqual(["The Montague boy"]);
    expect(outline.find((e) => e.path === "Places/Verona")!.aliases).toBeUndefined();
  });
});

describe("a vault's properties", () => {
  test("front matter fields other than title, tags and aliases are kept by name, lists as lists", () => {
    const { meta } = parseFrontMatter(
      '---\ntitle: Romeo\nstatus: draft\nage: 16\nhome: "[[Verona]]"\nfactions:\n  - Montague\n  - "Friends of Mercutio"\nfirst seen: 1592-07-31\nnotes: |\n  long text\ncssclasses: [wide]\n---\nText',
    );
    expect(meta.title).toBe("Romeo");
    expect(meta.properties).toEqual({ status: "draft", age: "16", home: "[[Verona]]", factions: ["Montague", "Friends of Mercutio"], "first seen": "1592-07-31" });
  });

  test("each field is typed from every note's value", () => {
    const props = inferProperties([
      { age: "16", alive: "true", home: "[[Verona]]", born: "1576-07-31", site: "https://example.com", factions: ["Montague"], mood: "sulky" },
      { age: "13", alive: "false", home: "[[Verona]]", born: "1579-07-31", site: "https://example.org", factions: ["Capulet", "Nurse"], mood: "in love" },
      { age: "about forty" },
    ]);
    const byKey = Object.fromEntries(props.map((p) => [p.key, p]));
    expect(byKey.age.type).toBe("text");
    expect(byKey.alive.type).toBe("checkbox");
    expect(byKey.home).toMatchObject({ type: "node", options: { multiple: false } });
    expect(byKey.born.type).toBe("date");
    expect(byKey.site.type).toBe("url");
    expect(byKey.factions).toMatchObject({ type: "multi_select", options: { choices: ["Montague", "Capulet", "Nurse"] } });
    expect(byKey.mood.type).toBe("text");
    expect(inferProperties([{ "First seen": "x" }])[0]).toMatchObject({ key: "first-seen", label: "First seen" });
  });

  test("values take their property's type; links become notes", () => {
    const find = (title: string) => (title === "Verona" ? "v1" : undefined);
    expect(propertyValue("number", "16", {}, find)).toBe(16);
    expect(propertyValue("number", "sixteen", {}, find)).toBeUndefined();
    expect(propertyValue("checkbox", "yes", {}, find)).toBe(true);
    expect(propertyValue("date", "1592-07-31T10:00", {}, find)).toBe("1592-07-31");
    expect(propertyValue("node", "[[Verona]]", { multiple: false }, find)).toBe("v1");
    expect(propertyValue("node", ["[[Verona]]", "[[Mantua]]"], { multiple: true }, find)).toEqual(["v1"]);
    expect(propertyValue("text", ["[[Verona]]", "Mantua"], {}, find)).toBe("Verona, Mantua");
  });

  test("they reach the outline on the note the file becomes", async () => {
    const outline = await planImport([file("Characters/Romeo.md", "---\nage: 16\n---\nA Montague.")], vault);
    expect(outline.find((e) => e.title === "Romeo")?.properties).toEqual({ age: "16" });
    expect(extras(outline).properties).toBe(1);
  });
});

describe("a vault's pictures", () => {
  const find = pictureFinder(["Attachments/map.png", "Places/Verona/map.png", "Places/square.JPG", "notes.md", "Art/My cover.webp"]);

  test("found next to the note, from the top, or by name anywhere, as Obsidian finds them", () => {
    expect(find("map.png", ["Places", "Verona"])).toBe("Places/Verona/map.png");
    expect(find("map.png", ["Characters"])).toBe("Attachments/map.png");
    expect(find("../square.jpg", ["Places", "Verona"])).toBe("Places/square.JPG");
    expect(find("Art/My%20cover.webp")).toBe("Art/My cover.webp");
    expect(find("map.png|300")).toBe("Attachments/map.png");
    expect(find("notes.md")).toBeNull();
    expect(find("https://example.com/map.png")).toBeNull();
    expect(find("missing.png")).toBeNull();
  });

  test("a note shows one as a picture waiting for its file; one the vault doesn't have stays as it was", () => {
    const value = markdownToValue("![[map.png]]\n\n![The square](../square.jpg)\n\n![[missing.png]]", { picture: (ref) => find(ref, ["Places", "Verona"]) });
    expect(value[0]).toMatchObject({ type: "img", url: `${PENDING_PICTURE}Places/Verona/map.png`, alt: "map" });
    expect(value[1]).toMatchObject({ type: "img", url: `${PENDING_PICTURE}Places/square.JPG`, alt: "The square" });
    expect(value[2]).toMatchObject({ type: EMBED, title: "missing.png" });
  });

  test("the preview counts them, and placing them points each at its file or takes it out", async () => {
    const outline = await planImport([file("Places/Verona/Verona.md", "![[map.png]]\n\nA city.\n\n![[../square.jpg]]")], vault, ["Places/Verona/map.png", "Places/square.jpg"]);
    expect(extras(outline).pictures).toBe(2);

    const doc = new Y.Doc();
    Y.applyUpdate(doc, valueToYdoc(outline.find((e) => e.title === "Verona" && e.kind === "note")!.value));
    const changed = placeInDoc(doc, new Map([["Places/Verona/map.png", "f1"], ["Places/square.jpg", null]]));
    expect(changed).toBe(2);
    const value = ydocToValue(Y.encodeStateAsUpdate(doc));
    expect(value.map((n) => (n.type === "img" ? n.url : text(n)))).toEqual(["/api/files/f1", "A city."]);
  });
});
