import { describe, expect, test } from "bun:test";
import { parseRoom, roomName } from "@/lib/collab/rooms";
import { interpolate, textParts, textVariables } from "@/lib/interactive/text";
import { propertyText } from "@/lib/property-text";
import { documentKinds, isDocumentKind, nextSwatch, relationshipMeta, relationshipTypesFor, swatches } from "@/lib/story";

describe("propertyText", () => {
  const titles: Record<string, string> = { a: "Alice", b: "Bob" };
  const titleOf = (id: string) => titles[id];

  test("nothing gives empty text", () => {
    expect(propertyText("text", undefined, titleOf)).toBe("");
    expect(propertyText("text", null, titleOf)).toBe("");
    expect(propertyText("text", "", titleOf)).toBe("");
    expect(propertyText("multi_select", [], titleOf)).toBe("");
    expect(propertyText("node", [], titleOf)).toBe("");
  });

  test("a checkbox reads Yes or No", () => {
    expect(propertyText("checkbox", true, titleOf)).toBe("Yes");
    expect(propertyText("checkbox", false, titleOf)).toBe("No");
  });

  test("a url drops the scheme, www. and a trailing slash", () => {
    expect(propertyText("url", "https://www.example.com/", titleOf)).toBe("example.com");
    expect(propertyText("url", "http://example.com/a/b/", titleOf)).toBe("example.com/a/b");
    expect(propertyText("url", "HTTPS://WWW.Example.com", titleOf)).toBe("Example.com");
    expect(propertyText("url", "example.com", titleOf)).toBe("example.com");
  });

  test("a node property names the notes it can find", () => {
    expect(propertyText("node", ["a", "b"], titleOf)).toBe("Alice, Bob");
    expect(propertyText("node", ["a", "hidden", "b"], titleOf)).toBe("Alice, Bob");
    expect(propertyText("node", "b", titleOf)).toBe("Bob");
    expect(propertyText("node", ["hidden"], titleOf)).toBe("");
  });

  test("a list joins with a comma", () => {
    expect(propertyText("multi_select", ["red", "green", "blue"], titleOf)).toBe("red, green, blue");
  });

  test("plain values are written as they are", () => {
    expect(propertyText("number", 0, titleOf)).toBe("0");
    expect(propertyText("number", 42, titleOf)).toBe("42");
    expect(propertyText("text", "Hello", titleOf)).toBe("Hello");
    expect(propertyText("date", "2026-10-20", titleOf)).toBe("2026-10-20");
  });
});

describe("relationshipMeta", () => {
  test("a known type gives its label, colour and direction", () => {
    expect(relationshipMeta("parent")).toEqual({ label: "Parent of", color: "#5f3dc4", directed: true });
    expect(relationshipMeta("ally")).toEqual({ label: "Ally", color: "#2b8a3e", directed: false });
  });

  test("an unknown type gives its own name, grey, and not directed", () => {
    expect(relationshipMeta("owes money to")).toEqual({ label: "owes money to", color: "#868e96", directed: false });
  });
});

describe("relationshipTypesFor", () => {
  test("people get both-ways types and not powers-only ones", () => {
    const ids = relationshipTypesFor("people").map((t) => t.id);
    expect(ids).toContain("ally");
    expect(ids).toContain("enemy");
    expect(ids).toContain("friend");
    expect(ids).not.toContain("war");
    expect(ids).not.toContain("trade");
  });

  test("powers get both-ways types and not people-only ones", () => {
    const ids = relationshipTypesFor("powers").map((t) => t.id);
    expect(ids).toContain("ally");
    expect(ids).toContain("war");
    expect(ids).not.toContain("friend");
    expect(ids).not.toContain("parent");
  });
});

describe("nextSwatch", () => {
  test("the first unused colour", () => {
    expect(nextSwatch([])).toBe(swatches[0]);
    expect(nextSwatch([swatches[0]])).toBe(swatches[1]);
    expect(nextSwatch([swatches[0], swatches[2]])).toBe(swatches[1]);
  });

  test("once all are used it cycles", () => {
    expect(nextSwatch([...swatches])).toBe(swatches[0]);
    expect(nextSwatch([...swatches, swatches[0]])).toBe(swatches[1]);
  });
});

describe("isDocumentKind", () => {
  test("documents open in the editor, boards don't", () => {
    for (const kind of documentKinds) expect(isDocumentKind(kind)).toBe(true);
    expect(isDocumentKind("canvas")).toBe(false);
    expect(isDocumentKind("timeline")).toBe(false);
    expect(isDocumentKind("dialogue")).toBe(false);
  });
});

describe("rooms", () => {
  test("names round-trip for both kinds", () => {
    expect(roomName({ kind: "node", id: "abc-123" })).toBe("node-abc-123");
    expect(parseRoom(roomName({ kind: "node", id: "abc-123" }))).toEqual({ kind: "node", id: "abc-123" });
    expect(parseRoom(roomName({ kind: "presence", id: "P1" }))).toEqual({ kind: "presence", id: "P1" });
  });

  test("an id of exactly 64 characters is fine", () => {
    const id = "a".repeat(64);
    expect(parseRoom(`node-${id}`)).toEqual({ kind: "node", id });
  });

  test("anything else is not a room", () => {
    expect(parseRoom("canvas-abc")).toBeNull();
    expect(parseRoom("node-")).toBeNull();
    expect(parseRoom("node-a/b")).toBeNull();
    expect(parseRoom("node-a.b")).toBeNull();
    expect(parseRoom(`node-${"a".repeat(65)}`)).toBeNull();
    expect(parseRoom("")).toBeNull();
  });
});

describe("dialogue text variables", () => {
  test("textParts cuts text into variables and what's written", () => {
    expect(textParts("{$a}{$b} c")).toEqual([{ variable: "a" }, { variable: "b" }, { text: " c" }]);
    expect(textParts("You have {$gold} gold.")).toEqual([{ text: "You have " }, { variable: "gold" }, { text: " gold." }]);
    expect(textParts("plain")).toEqual([{ text: "plain" }]);
  });

  test("an empty text is one empty part", () => {
    expect(textParts("")).toEqual([{ text: "" }]);
  });

  test("textVariables lists each name once", () => {
    expect(textVariables("{$a} {$b} {$a}")).toEqual(["a", "b"]);
    expect(textVariables(undefined)).toEqual([]);
    expect(textVariables("{$1bad} {gold}")).toEqual([]);
  });

  test("interpolate fills in known variables and leaves unknown ones", () => {
    expect(interpolate("{$name} has {$gold} gold, brave: {$brave}", { name: "Ada", gold: 12, brave: false })).toBe("Ada has 12 gold, brave: false");
    expect(interpolate("{$gold} and {$missing}", { gold: 0 })).toBe("0 and {$missing}");
  });

  test("interpolate doesn't read inherited names", () => {
    expect(interpolate("{$toString}", {})).toBe("{$toString}");
  });
});
