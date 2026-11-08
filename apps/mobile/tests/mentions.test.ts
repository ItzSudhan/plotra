import { describe, expect, test } from "bun:test";
import { insertMention, mentionAt, splitMentions, suggest } from "../src/lib/mentions";

const people = [
  { id: "1", name: "Ann" },
  { id: "2", name: "Ann Lee" },
  { id: "3", name: "Ben" },
];

describe("mentions", () => {
  test("are noticed after an @ at the start or after a space", () => {
    expect(mentionAt("Hi @An", 6)).toEqual({ query: "An", at: 3 });
    expect(mentionAt("@", 1)).toEqual({ query: "", at: 0 });
    expect(mentionAt("mail@an", 7)).toBeNull();
    expect(mentionAt("no mention", 10)).toBeNull();
    // Only what's before the caret counts.
    expect(mentionAt("Hi @An and more", 6)).toEqual({ query: "An", at: 3 });
  });

  test("suggest people by the start of their name", () => {
    expect(suggest(people, "ann").map((p) => p.id)).toEqual(["1", "2"]);
    expect(suggest(people, "").length).toBe(3);
    expect(suggest(people, "z")).toEqual([]);
  });

  test("write the whole name and put the caret after it", () => {
    const text = "Hi @An, look";
    expect(insertMention(text, { query: "An", at: 3 }, "Ann Lee")).toEqual({ text: "Hi @Ann Lee , look", caret: 12 });
  });

  test("are picked out of a comment, longest name first", () => {
    expect(splitMentions("Ask @ann lee about @Ben. me@x", ["Ann", "Ann Lee", "Ben"])).toEqual([
      { text: "Ask ", mention: false },
      { text: "@ann lee", mention: true },
      { text: " about ", mention: false },
      { text: "@Ben", mention: true },
      { text: ". me@x", mention: false },
    ]);
    expect(splitMentions("plain", [])).toEqual([{ text: "plain", mention: false }]);
  });
});
