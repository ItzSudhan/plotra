import { describe, expect, test } from "bun:test";
import { nextStringId, repairStringIds, stringIdPrefix, dialogueMaps } from "@/lib/interactive/model";
import { questTiers, wouldLoop } from "@/lib/interactive/quests";
import { stringKeyProblem, textLength } from "@/lib/interactive/strings";
import * as Y from "yjs";

describe("short-text fields", () => {
  test("keys", () => {
    expect(stringKeyProblem("menu.start")).toBeNull();
    expect(stringKeyProblem("")).toBe("A string needs an ID.");
    expect(stringKeyProblem("has space")).toBe("An ID can only use letters, digits, dots, dashes and underscores.");
    expect(stringKeyProblem("x".repeat(81))).toBe("An ID can be at most 80 characters.");
    expect(stringKeyProblem("menu.start", ["menu.start"])).toBe("“menu.start” is already another string's ID.");
    // A dialogue line's shape is kept for dialogue lines.
    expect(stringKeyProblem("d3f9_0001")).toMatch(/shape of a dialogue line/);
    expect(stringKeyProblem("dlg_0012")).toMatch(/shape of a dialogue line/);
    expect(stringKeyProblem("menu_0001")).toBeNull();
  });

  test("length counts characters as a reader does", () => {
    expect(textLength("café 👋")).toBe(6);
  });
});

describe("dialogue String IDs", () => {
  test("never reused, and clashes renumbered", () => {
    const doc = new Y.Doc();
    const maps = dialogueMaps(doc);
    const prefix = stringIdPrefix("D3F9a1b2-0000");
    expect(prefix).toBe("d3f9");
    maps.nodes.set("a", { type: "line", x: 0, y: 0, sid: nextStringId(maps, prefix) });
    maps.nodes.set("b", { type: "line", x: 0, y: 0, sid: nextStringId(maps, prefix) });
    maps.nodes.delete("b");
    expect(nextStringId(maps, prefix)).toBe("d3f9_0003");
    maps.nodes.set("c", { type: "choice", x: 0, y: 0, sid: "d3f9_0001" });
    maps.nodes.set("d", { type: "choice", x: 0, y: 0 });
    expect(repairStringIds(maps, prefix)).toBe(2);
    const sids = [...maps.nodes.values()].map((n) => n.sid);
    expect(new Set(sids).size).toBe(3);
    expect(maps.nodes.get("a")!.sid).toBe("d3f9_0001");
  });
});

describe("quest chains", () => {
  const quests = [
    { id: "a", prerequisites: [] },
    { id: "b", prerequisites: ["a"] },
    { id: "c", prerequisites: ["a", "b", "gone"] },
  ];

  test("tiers", () => {
    expect(Object.fromEntries(questTiers(quests))).toEqual({ a: 1, b: 2, c: 3 });
    // Safe on data that already loops.
    expect(questTiers([{ id: "x", prerequisites: ["y"] }, { id: "y", prerequisites: ["x"] }]).size).toBe(2);
  });

  test("loops are refused", () => {
    expect(wouldLoop(quests, "c", "a")).toBe(true);
    expect(wouldLoop(quests, "a", "a")).toBe(true);
    expect(wouldLoop(quests, "a", "c")).toBe(false);
  });
});
