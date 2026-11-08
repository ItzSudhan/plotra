import { describe, expect, test } from "bun:test";
import type { NodeKind, NodeProperties } from "@plotra/db/schema";
import { gregorian } from "@/lib/calendar";
import { buildSheet, checkContinuity, type ContinuityInput, type ContinuityNode, type RuleId } from "@/lib/continuity";

// A small project: Ada and Ben, two places, and a fact. Each test adds the
// scenes it needs, in reading order, after these.
const node = (id: string, kind: NodeKind, properties: NodeProperties = {}, canon: ContinuityNode["canon"] = "canon"): ContinuityNode => ({
  id,
  parentId: null,
  kind,
  title: id[0].toUpperCase() + id.slice(1),
  properties,
  canon,
});

const scene = (id: string, properties: NodeProperties = {}, canon?: ContinuityNode["canon"]) => node(id, "scene", properties, canon);

function project(overrides: Partial<ContinuityInput> & { scenes?: ContinuityNode[]; ada?: NodeProperties } = {}): ContinuityInput {
  const { scenes = [], ada = {}, ...rest } = overrides;
  return {
    nodes: [node("ada", "character", ada), node("ben", "character"), node("london", "location"), node("paris", "location"), node("letter", "note"), ...scenes],
    links: [],
    threads: [],
    cells: [],
    knowledge: [],
    setups: [],
    calendar: gregorian,
    ...rest,
  };
}

const rulesOf = (input: ContinuityInput) => checkContinuity(input).map((i) => i.rule);
const raises = (input: ContinuityInput, rule: RuleId) => rulesOf(input).includes(rule);

describe("continuity checks", () => {
  test("a clean project has nothing to report", () => {
    const input = project({
      ada: { "birth-date": "1800-01-01", "death-date": "1880-01-01", age: "20" },
      scenes: [
        scene("one", { "story-date": "1820-06-01", pov: "ada", location: "london" }),
        scene("two", { "story-date": "1820-06-02", pov: "ada", location: "paris" }),
      ],
      links: [{ source: "two", target: "letter", kind: "mention" }],
      knowledge: [{ id: "k1", characterNodeId: "ada", factNodeId: "letter", learnedInNodeId: "one", layer: "truth", note: null }],
      threads: [{ id: "t1", name: "The letter", closedNodeId: "two" }],
      cells: [
        { nodeId: "one", threadId: "t1" },
        { nodeId: "two", threadId: "t1" },
      ],
      setups: [{ id: "s1", title: "The pistol", setupNodeId: "one", payoffNodeId: "two", status: "paid" }],
    });
    expect(checkContinuity(input)).toEqual([]);
  });

  test("after-death: a character in a scene set after they died", () => {
    const dead = project({ ada: { "death-date": "1820-01-01" }, scenes: [scene("one", { "story-date": "1821-01-01", pov: "ada" })] });
    const issues = checkContinuity(dead);
    expect(issues).toEqual([
      { id: "after-death:ada:one", rule: "after-death", severity: "error", message: "Ada appears in “One”, which is set after their death.", nodeIds: ["one", "ada"] },
    ]);
    expect(raises(project({ ada: { "death-date": "1822-01-01" }, scenes: [scene("one", { "story-date": "1821-01-01", pov: "ada" })] }), "after-death")).toBe(false);
  });

  test("after-death: appearing through a link counts, as well as the point of view", () => {
    const input = project({ ada: { "death-date": "1820-01-01" }, scenes: [scene("one", { "story-date": "1821-01-01" })], links: [{ source: "one", target: "ada", kind: "mention" }] });
    expect(rulesOf(input)).toEqual(["after-death"]);
    expect(rulesOf({ ...input, links: [] })).toEqual([]);
  });

  test("before-birth: a scene that ends before they were born", () => {
    expect(rulesOf(project({ ada: { "birth-date": "1800-01-01" }, scenes: [scene("one", { "story-date": "1799-06-01", pov: "ada" })] }))).toEqual(["before-birth"]);
    expect(raises(project({ ada: { "birth-date": "1800-01-01" }, scenes: [scene("one", { "story-date": "1800-06-01", pov: "ada" })] }), "before-birth")).toBe(false);
    // A scene that lasts past the birth (the birth itself) is fine.
    expect(raises(project({ ada: { "birth-date": "1800-01-01" }, scenes: [scene("one", { "story-date": "1799-12-31", duration: "2 days", pov: "ada" })] }), "before-birth")).toBe(false);
  });

  test("age-mismatch: the stated age against the first dated scene", () => {
    const at = (age: string) => project({ ada: { "birth-date": "1800-01-01", age }, scenes: [scene("one", { "story-date": "1820-06-01", pov: "ada" })] });
    const issues = checkContinuity(at("25"));
    expect(issues.map((i) => [i.rule, i.message])).toEqual([["age-mismatch", "Ada's age is given as 25, but going by their birth date they're 20 in “One”."]]);
    expect(issues[0].nodeIds).toEqual(["ada", "one"]);
    expect(checkContinuity(at("20"))).toEqual([]);
    // An age that isn't a number isn't checked.
    expect(checkContinuity(at("twenties"))).toEqual([]);
  });

  test("age-mismatch: the first appearance named on the sheet is the anchor", () => {
    const input = (first: string) =>
      project({
        ada: { "birth-date": "1800-01-01", age: "30", "first-appearance": first },
        scenes: [scene("one", { "story-date": "1820-06-01", pov: "ada" }), scene("two", { "story-date": "1830-06-01" })],
      });
    expect(raises(input("two"), "age-mismatch")).toBe(false);
    expect(raises(input("one"), "age-mismatch")).toBe(true);
  });

  test("age-mismatch: dying before being born", () => {
    const issues = checkContinuity(project({ ada: { "birth-date": "1800-01-01", "death-date": "1790-01-01" } }));
    expect(issues.map((i) => i.id)).toEqual(["age-mismatch:ada:order"]);
    expect(checkContinuity(project({ ada: { "birth-date": "1800-01-01", "death-date": "1890-01-01" } }))).toEqual([]);
  });

  test("two-places: overlapping scenes in different places", () => {
    const at = (second: NodeProperties) =>
      project({ scenes: [scene("one", { "story-date": "1820-06-01 10:00", duration: "2h", pov: "ada", location: "london" }), scene("two", { pov: "ada", ...second })] });
    const issues = checkContinuity(at({ "story-date": "1820-06-01 11:00", location: "paris" }));
    expect(issues.map((i) => [i.id, i.severity, i.message])).toEqual([
      ["two-places:ada:one:two", "error", "Ada is in London (“One”) and Paris (“Two”) at the same time."],
    ]);
    // Same place, or after the first scene ends: fine.
    expect(checkContinuity(at({ "story-date": "1820-06-01 11:00", location: "london" }))).toEqual([]);
    expect(checkContinuity(at({ "story-date": "1820-06-01 12:00", location: "paris" }))).toEqual([]);
    expect(checkContinuity(at({ "story-date": "1820-06-01 13:00", location: "paris" }))).toEqual([]);
  });

  test("two-places: two undated-length scenes at the same moment", () => {
    const input = (date: string) =>
      project({ scenes: [scene("one", { "story-date": "1820-06-01", pov: "ada", location: "london" }), scene("two", { "story-date": date, pov: "ada", location: "paris" })] });
    expect(rulesOf(input("1820-06-01"))).toEqual(["two-places"]);
    expect(rulesOf(input("1820-06-02"))).toEqual([]);
  });

  test("closed-thread: a thread picked up after it was resolved", () => {
    const input = (cells: string[]) =>
      project({
        scenes: [scene("one"), scene("two"), scene("three")],
        threads: [{ id: "t1", name: "The letter", closedNodeId: "two" }],
        cells: cells.map((nodeId) => ({ nodeId, threadId: "t1" })),
      });
    const issues = checkContinuity(input(["one", "two", "three"]));
    expect(issues.map((i) => [i.id, i.message, i.nodeIds])).toEqual([
      ["closed-thread:t1:three", "“Three” is in the thread “The letter”, which was resolved in “Two”.", ["three", "two"]],
    ]);
    expect(checkContinuity(input(["one", "two"]))).toEqual([]);
  });

  test("knows-too-early: a POV scene that refers to a fact before the scene where it's learned", () => {
    const input = (links: string[]) =>
      project({
        scenes: [scene("one", { pov: "ada" }), scene("two", { pov: "ada" })],
        links: links.map((source) => ({ source, target: "letter", kind: "mention" })),
        knowledge: [{ id: "k1", characterNodeId: "ada", factNodeId: "letter", learnedInNodeId: "two", layer: "truth", note: null }],
      });
    const issues = checkContinuity(input(["one"]));
    expect(issues.map((i) => [i.id, i.nodeIds])).toEqual([["knows-too-early:k1:one", ["one", "two", "letter"]]]);
    expect(checkContinuity(input(["two"]))).toEqual([]);
  });

  test("knows-too-early: story time wins over reading order when both scenes are dated", () => {
    const input = (date: string) =>
      project({
        // Told first, but set after she learns it: a flash-forward, not a slip.
        scenes: [scene("one", { pov: "ada", "story-date": date }), scene("two", { pov: "ada", "story-date": "1820-06-01" })],
        links: [{ source: "one", target: "letter", kind: "mention" }],
        knowledge: [{ id: "k1", characterNodeId: "ada", factNodeId: "letter", learnedInNodeId: "two", layer: "truth", note: null }],
      });
    expect(raises(input("1820-07-01"), "knows-too-early")).toBe(false);
    expect(raises(input("1820-05-01"), "knows-too-early")).toBe(true);
  });

  test("payoff-before-setup", () => {
    const input = (setupNodeId: string, payoffNodeId: string) =>
      project({ scenes: [scene("one"), scene("two")], setups: [{ id: "s1", title: "The pistol", setupNodeId, payoffNodeId, status: "paid" }] });
    const issues = checkContinuity(input("two", "one"));
    expect(issues.map((i) => [i.id, i.message, i.nodeIds])).toEqual([["payoff-before-setup:s1", "“The pistol” pays off in “One”, before it's set up in “Two”.", ["one", "two"]]]);
    expect(checkContinuity(input("one", "two"))).toEqual([]);
  });

  test("open-setup: says how many scenes have passed", () => {
    const input = (status: string) =>
      project({ scenes: [scene("one"), scene("two"), scene("three")], setups: [{ id: "s1", title: "The pistol", setupNodeId: "one", payoffNodeId: null, status }] });
    const issues = checkContinuity(input("open"));
    expect(issues.map((i) => [i.id, i.severity, i.message])).toEqual([["open-setup:s1", "info", "“The pistol” is set up in “One”; 2 scenes later it still hasn't paid off."]]);
    expect(checkContinuity(input("paid"))).toEqual([]);
  });

  test("non-canon-reference: a canon scene linking to something retconned or non-canon", () => {
    const input = (canon: ContinuityNode["canon"], sceneCanon: ContinuityNode["canon"] = "canon") =>
      project({ scenes: [scene("one", {}, sceneCanon), node("rumour", "note", {}, canon)], links: [{ source: "one", target: "rumour", kind: "mention" }] });
    expect(checkContinuity(input("retconned")).map((i) => i.message)).toEqual(["“One” is canon but links to “Rumour”, which is retconned."]);
    expect(checkContinuity(input("non_canon")).map((i) => i.message)).toEqual(["“One” is canon but links to “Rumour”, which is non-canon."]);
    expect(checkContinuity(input("speculative"))).toEqual([]);
    // A draft scene may lean on anything.
    expect(checkContinuity(input("retconned", "draft"))).toEqual([]);
  });

  test("unreadable-date: a scene's story date the calendar can't read", () => {
    const issues = checkContinuity(project({ scenes: [scene("one", { "story-date": "the spring after the war" })] }));
    expect(issues.map((i) => [i.id, i.severity, i.message])).toEqual([
      ["unreadable-date:one", "info", "“One” has the story date “the spring after the war”, which isn't a date in the Gregorian calendar. Write it as YYYY-MM-DD."],
    ]);
    expect(checkContinuity(project({ scenes: [scene("one", { "story-date": "1820-06-01" })] }))).toEqual([]);
    // Only scenes are read for it.
    expect(checkContinuity(project({ scenes: [node("aside", "note", { "story-date": "whenever" })] }))).toEqual([]);
  });

  test("issues come errors first, then warnings, then notes", () => {
    const input = project({
      ada: { "death-date": "1820-01-01" },
      scenes: [scene("one", { "story-date": "someday" }), scene("two", { "story-date": "1821-01-01", pov: "ada" })],
      setups: [{ id: "s1", title: "The pistol", setupNodeId: "two", payoffNodeId: "one", status: "open" }],
    });
    expect(checkContinuity(input).map((i) => i.severity)).toEqual(["error", "warning", "info", "info"]);
  });
});

describe("continuity sheet", () => {
  test("lists a character's scenes by story date, with their age, place and what they learn", () => {
    const input = project({
      ada: { "birth-date": "1800-01-01", "death-date": "1880-01-01" },
      scenes: [
        scene("one", { "story-date": "1830-06-01", pov: "ada", location: "paris" }),
        scene("two", { "story-date": "1820-06-01", location: "london" }),
        scene("three", { "story-date": "1825-06-01" }),
        scene("elsewhere", { "story-date": "1821-01-01", pov: "ben" }),
      ],
      links: [{ source: "two", target: "ada", kind: "mention" }],
      knowledge: [
        { id: "k1", characterNodeId: "ada", factNodeId: "letter", learnedInNodeId: "three", layer: "belief", note: "Thinks Ben wrote it" },
        { id: "k2", characterNodeId: "ada", factNodeId: "london", learnedInNodeId: null, layer: "truth", note: null },
        { id: "k3", characterNodeId: "ada", factNodeId: "gone", learnedInNodeId: null, layer: "truth", note: null },
      ],
      relationships: [
        { fromNodeId: "ben", toNodeId: "ada", type: "sibling", label: "Brother", directed: false },
        { fromNodeId: "ada", toNodeId: "gone", type: "rival", label: null, directed: true },
      ],
    });
    const sheet = buildSheet(input, "ada")!;
    expect(sheet.chronological).toBe(true);
    expect(sheet.born).not.toBeNull();
    expect(sheet.died).toBeGreaterThan(sheet.born!);
    expect(sheet.rows.map((r) => [r.sceneId, r.age, r.locationId, r.pov])).toEqual([
      ["two", 20, "london", false],
      ["three", 25, null, false],
      ["one", 30, "paris", true],
    ]);
    expect(sheet.rows[1].learns).toEqual([{ factNodeId: "letter", layer: "belief", note: "Thinks Ben wrote it" }]);
    // A fact that no longer exists is left out.
    expect(sheet.knownFromStart).toEqual([{ factNodeId: "london", layer: "truth", note: null }]);
    expect(sheet.relationships).toEqual([{ otherId: "ben", type: "sibling", label: "Brother", outgoing: false, directed: false }]);
  });

  test("falls back to reading order when a scene has no date, and is null for an unknown character", () => {
    const input = project({ scenes: [scene("one", { "story-date": "1830-06-01", pov: "ada" }), scene("two", { pov: "ada" })] });
    const sheet = buildSheet(input, "ada")!;
    expect(sheet.chronological).toBe(false);
    expect(sheet.rows.map((r) => [r.sceneId, r.age])).toEqual([
      ["one", null],
      ["two", null],
    ]);
    expect(buildSheet(input, "nobody")).toBeNull();
  });
});
