import { describe, expect, test } from "bun:test";
import { checkDialogue } from "@/lib/interactive/check";
import { toInk, toTwee, toYarn } from "@/lib/interactive/export";
import { detectImportFormat, extractTwineStory, importDialogue, linkSpeakers, type ImportFormat } from "@/lib/interactive/import";
import { graphStrings, successors, type DialogueGraph } from "@/lib/interactive/model";
import { choose, continuePlay, startPlay, type PlayState } from "@/lib/interactive/play";
import { barks, errands, gate, graph } from "./fixtures";

const options = { prefix: "beef" };
const read = (source: string, format: ImportFormat, extra: Partial<Parameters<typeof importDialogue>[2]> = {}) => importDialogue(source, format, { ...options, ...extra });

/**
 * Every play-through of a dialogue, up to `depth` picks: the lines shown, the
 * choices offered and picked, how it ended and the variables it ended with.
 * Two dialogues that play the same give the same list, whatever their cards look like.
 * With Random cards it's played with several seeds and every play-through seen is listed once, in order.
 */
function playthroughs(g: DialogueGraph, variables: string[], depth = 6): string[] {
  const out: string[] = [];
  const describe = (state: PlayState) =>
    state.transcript
      .flatMap((e) => (e.kind === "line" ? [`${e.speaker ?? ""}: ${e.text} [${e.sid}]`] : e.kind === "choice" ? [`> ${e.text} [${e.sid}]`] : e.kind === "problem" ? [`! ${e.text}`] : []))
      .join("\n");
  const walk = (state: PlayState, picks: number) => {
    let s = state;
    for (let guard = 0; s.status === "line" && guard < 200; guard++) s = continuePlay(g, s);
    if (s.status === "choices" && picks < depth) {
      for (const option of s.options) walk(choose(g, s, option.nodeId), picks + 1);
      return;
    }
    const offered = s.status === "choices" ? `\noffered: ${s.options.map((o) => o.text).join(" | ")}` : "";
    const ending = s.status === "ended" ? (s.ending === "stuck" ? "stuck" : "ended") : "cut";
    out.push(`${describe(s)}${offered}\n${ending} ${JSON.stringify(variables.map((v) => s.variables[v]))}`);
  };
  const random = Object.values(g.nodes).some((n) => n.type === "random");
  if (!random) walk(startPlay(g), 0);
  else for (let seed = 1; seed <= 24; seed++) walk(startPlay(g, { seed }), 0);
  return random ? [...new Set(out)].sort() : out;
}

const exporters = { ink: toInk, yarn: toYarn, twee: toTwee } as const;

function roundTrip(g: DialogueGraph, format: keyof typeof exporters) {
  const text = exporters[format](g, { title: "The Gate" });
  const result = read(text, format);
  const names = Object.values(g.variables).map((v) => v.name);
  expect(playthroughs(result.graph, names)).toEqual(playthroughs(g, names));
  return result;
}

/** A line whose only choice sits behind a condition; its false side goes on to another line. */
const guarded = () =>
  graph(
    {
      start: { type: "start" },
      l: { type: "line", sid: "abcd_0001", text: "Hi" },
      c: { type: "condition", expr: "gold > 1" },
      ch: { type: "choice", sid: "abcd_0002", text: "Rich" },
      m: { type: "line", sid: "abcd_0003", text: "Poor then." },
    },
    [
      ["start", "l"],
      ["l", "c"],
      ["c", "ch", "true"],
      ["c", "m", "false"],
    ],
    { gold: 0 },
  );

/** A question asked again until the player says no, with a counter and a branch on it. */
const loop = () =>
  graph(
    {
      start: { type: "start" },
      l: { type: "line", sid: "abcd_0001", speaker: "Bo", text: "Again? (it costs $1 [sic] {really} #1 // ok)" },
      yes: { type: "choice", sid: "abcd_0002", text: "Yes: once more" },
      no: { type: "choice", sid: "abcd_0003", text: "No" },
      s: { type: "set", expr: "count += 1" },
      c: { type: "condition", expr: 'count >= 2 || name == "Bo"' },
      tired: { type: "line", sid: "abcd_0004", speaker: "Bo", text: "I'm tired." },
      end: { type: "end" },
    },
    [
      ["start", "l"],
      ["l", "yes"],
      ["l", "no"],
      ["yes", "s"],
      ["s", "c"],
      ["c", "tired", "true"],
      ["c", "l", "false"],
      ["tired", "end"],
      ["no", "end"],
    ],
    { count: 0, name: "" },
  );

describe("round trips: export, import, and it plays the same", () => {
  for (const format of ["ink", "yarn", "twee"] as const) {
    test(`${format}: the gate`, () => {
      const result = roundTrip(gate(), format);
      // Every line and choice keeps its String ID and text.
      const before = graphStrings(gate()).map((s) => [s.id, s.speaker, s.text, s.kind]);
      expect(graphStrings(result.graph).map((s) => [s.id, s.speaker, s.text, s.kind])).toEqual(before);
      expect(Object.values(result.graph.variables).map((v) => [v.name, v.value])).toEqual([
        ["gold", 10],
        ["paid", false],
      ]);
      // The Set card comes back as one card, written as it was.
      expect(Object.values(result.graph.nodes).filter((n) => n.type === "set").map((n) => n.expr)).toEqual(["gold -= 5; paid = true"]);
      expect(result.warnings).toEqual([]);
      expect(checkDialogue(result.graph).filter((p) => p.severity === "error")).toEqual([]);
    });

    test(`${format}: every choice behind a condition`, () => {
      roundTrip(guarded(), format);
    });

    test(`${format}: a loop with markup in the text`, () => {
      const result = roundTrip(loop(), format);
      expect(graphStrings(result.graph).find((s) => s.id === "abcd_0001")?.text).toBe("Again? (it costs $1 [sic] {really} #1 // ok)");
    });
  }
});

describe("Ink", () => {
  const sample = `
// The ferry.
VAR coins = 3
CONST fare = 2
LIST moods = happy, sad
INCLUDE other.ink

-> dock

=== dock ===
Ferryman: Where to? # id:ferry_01 # mood:grim
* (rich) {coins >= fare} [The island.] You hand over the coins.
    ~ coins = coins - fare
    ~ visits++
    -> island
+ [Nowhere # id:ferry_02]
    -> DONE
+ -> island
- (after) Never mind.
-> END

=== island ===
= shore
You step onto the sand.
{ visits > 1:
    You've been here before.
- else:
    It's new to you.
}
{coins > 0: You still have coins.|You're broke.}
~ say_hello()
<- thread
-> dock.after

=== function add(a, b) ===
~ return a + b
`;

  test("knots, stitches, choices, gathers, diverts, conditions and variables", () => {
    const { graph: g, warnings } = read(sample, "ink");
    const lines = Object.values(g.nodes).filter((n) => n.type === "line");
    expect(lines.find((n) => n.sid === "ferry_01")).toMatchObject({ speaker: "Ferryman", text: "Where to?" });
    expect(lines.map((n) => n.text)).toContain("You hand over the coins.");
    expect(lines.map((n) => n.text)).toContain("Never mind.");
    expect(Object.values(g.nodes).find((n) => n.type === "choice" && n.sid === "ferry_02")?.text).toBe("Nowhere");
    expect(Object.values(g.nodes).find((n) => n.type === "set")?.expr).toBe("coins -= fare; visits += 1");
    expect(Object.values(g.nodes).filter((n) => n.type === "condition").map((n) => n.expr)).toEqual(expect.arrayContaining(["coins >= fare", "visits > 1", "coins > 0"]));
    expect(Object.values(g.variables).map((v) => [v.name, v.value])).toEqual([
      ["coins", 3],
      ["fare", 2],
      ["visits", 0],
    ]);
    const said = warnings.map((w) => `${w.line}: ${w.text}`).join("\n");
    expect(said).toContain("5: LIST isn't supported");
    expect(said).toContain("6: INCLUDE isn't followed");
    expect(said).toContain("Tags other than “id:” aren't kept.");
    // `*` is a once-only choice, `+` a sticky one.
    expect(Object.values(g.nodes).find((n) => n.type === "choice" && n.text === "The island.")?.once).toBe(true);
    expect(Object.values(g.nodes).find((n) => n.type === "choice" && n.sid === "ferry_02")?.once).toBeUndefined();
    expect(said).toContain("say_hello()");
    expect(said).toContain("Threads (<-)");
    expect(said).toContain("Ink functions");
    expect(said).toContain("“visits”");
  });

  test("it plays as Ink would", () => {
    const { graph: g } = read(sample, "ink");
    let state = startPlay(g);
    expect(state.options.map((o) => o.text)).toEqual(["The island.", "Nowhere"]);
    state = choose(g, state, state.options[0].nodeId);
    const shown = () => state.transcript.filter((e) => e.kind === "line").map((e) => (e.kind === "line" ? e.text : ""));
    for (let i = 0; i < 10 && state.status === "line"; i++) state = continuePlay(g, state);
    expect(shown()).toEqual(["Where to?", "You hand over the coins.", "You step onto the sand.", "It's new to you.", "You still have coins.", "Never mind."]);
    expect(state.variables).toMatchObject({ coins: 1, visits: 1 });
  });

  test("a fallback choice is taken when nothing else is on offer", () => {
    const { graph: g } = read("VAR gold = 0\nHi\n+ {gold > 0} [Pay] -> paid\n+ -> broke\n== paid\nThanks.\n-> END\n== broke\nNo money.\n-> END\n", "ink");
    let state = startPlay(g);
    for (let i = 0; i < 5 && state.status === "line"; i++) state = continuePlay(g, state);
    expect(state.transcript.filter((e) => e.kind === "line").map((e) => (e.kind === "line" ? e.text : ""))).toEqual(["Hi", "No money."]);
  });

  test("a switch on a value", () => {
    const { graph: g } = read("VAR n = 2\n{ n:\n- 1: One.\n- 2: Two.\n- else: Many.\n}\n", "ink");
    expect(Object.values(g.nodes).filter((n) => n.type === "condition").map((n) => n.expr)).toEqual(expect.arrayContaining(["n == 1", "n == 2"]));
    let state = startPlay(g);
    for (let i = 0; i < 5 && state.status === "line"; i++) state = continuePlay(g, state);
    expect(state.transcript.filter((e) => e.kind === "line").map((e) => (e.kind === "line" ? e.text : ""))).toEqual(["Two."]);
  });

  test("nested choices rejoin at their gather", () => {
    const { graph: g } = read("* [A]\n    ** [A1] One.\n    ** [A2] Two.\n    -- Joined.\n* [B] Bee.\n- All done.\n", "ink");
    let state = startPlay(g);
    state = choose(g, state, state.options[0].nodeId);
    expect(state.options.map((o) => o.text)).toEqual(["A1", "A2"]);
    state = choose(g, state, state.options[1].nodeId);
    for (let i = 0; i < 5 && state.status === "line"; i++) state = continuePlay(g, state);
    expect(state.transcript.filter((e) => e.kind === "line").map((e) => (e.kind === "line" ? e.text : ""))).toEqual(["Two.", "Joined.", "All done."]);
  });

  test("a divert to nowhere ends there, with a warning", () => {
    const { graph: g, warnings } = read("Hello.\n-> nowhere\n", "ink");
    expect(warnings).toContainEqual({ line: 2, text: "There's nothing called “nowhere” to jump to, so the dialogue ends there." });
    expect(Object.values(g.nodes).filter((n) => n.type === "end")).toHaveLength(1);
  });
});

describe("Yarn Spinner", () => {
  const sample = `title: Start
tags: intro
position: 0,0
---
<<declare $gold = 5 as Number>>
<<declare $name to "Mae">>
Mae: Hi there! #line:a1b2c3 #happy
// a comment
-> Buy a map <<if $gold gte 3>> #line:a1b2c4
    <<set $gold to $gold - 3>>
    Mae: Enjoy.
-> Leave
    <<jump Goodbye>>
-> Ask her name
    Mae\\: Who? That's me.
<<if $gold is 5>>
    You kept your gold.
<<elseif $gold > 0>>
    Some left.
<<else>>
    Broke.
<<endif>>
<<wait 2>>
=> Line group one
<<jump Goodbye>>
===
title: Goodbye
---
Mae: Bye, {$name}!
<<stop>>
===
`;

  test("nodes, speakers, options, conditions, sets and line tags", () => {
    const { graph: g, warnings } = read(sample, "yarn");
    const nodes = Object.values(g.nodes);
    expect(nodes.find((n) => n.sid === "a1b2c3")).toMatchObject({ type: "line", speaker: "Mae", text: "Hi there!" });
    expect(nodes.find((n) => n.sid === "a1b2c4")).toMatchObject({ type: "choice", text: "Buy a map" });
    // An escaped colon isn't a speaker.
    expect(nodes.find((n) => n.text === "Mae: Who? That's me.")).toMatchObject({ speaker: undefined });
    expect(nodes.filter((n) => n.type === "condition").map((n) => n.expr)).toEqual(expect.arrayContaining(["gold >= 3", "gold == 5", "gold > 0"]));
    expect(nodes.find((n) => n.type === "set")?.expr).toBe("gold -= 3");
    expect(Object.values(g.variables).map((v) => [v.name, v.value])).toEqual([
      ["gold", 5],
      ["name", "Mae"],
    ]);
    const said = warnings.map((w) => `${w.line}: ${w.text}`).join("\n");
    expect(said).toContain("7: Hashtags other than #line:");
    expect(said).toContain("23: <<wait>> isn't something a dialogue can do; it's kept in the note of the line next to it.");
    // A line group is a Random card, even with one line in it.
    expect(said).not.toContain("Line groups");
    expect(nodes.filter((n) => n.type === "random")).toHaveLength(1);
    // {$name} is Plotra's own way of showing a variable.
    expect(said).not.toContain("Inline expressions");
    expect(nodes.find((n) => n.text === "Line group one")?.note).toBe("Before this line: <<wait 2>>");
    expect(nodes.find((n) => n.text === "Bye, {$name}!")).toBeDefined();
  });

  test("after an option's body the node goes on below the options", () => {
    const { graph: g } = read(sample, "yarn");
    let state = startPlay(g);
    expect(state.options.map((o) => o.text)).toEqual(["Buy a map", "Leave", "Ask her name"]);
    state = choose(g, state, state.options[0].nodeId);
    for (let i = 0; i < 10 && state.status === "line"; i++) state = continuePlay(g, state);
    expect(state.transcript.filter((e) => e.kind === "line").map((e) => (e.kind === "line" ? e.text : ""))).toEqual([
      "Hi there!",
      "Enjoy.",
      "Some left.",
      "Line group one",
      "Bye, Mae!",
    ]);
  });

  test("a String ID taken elsewhere in the project gets a new one", () => {
    const { graph: g, warnings, counter } = read(sample, "yarn", { taken: new Set(["a1b2c3"]), counter: 7 });
    const ids = Object.values(g.nodes).map((n) => n.sid).filter(Boolean);
    expect(ids).not.toContain("a1b2c3");
    expect(ids).toContain("a1b2c4");
    expect(ids).toContain("beef_0008");
    expect(counter).toBeGreaterThan(7);
    expect(new Set(ids).size).toBe(ids.length);
    expect(warnings.some((w) => w.text.includes("given a new one"))).toBe(true);
  });
});

describe("Twine", () => {
  const sugar = `:: StoryTitle
The Cellar

:: StoryData
{"ifid": "D674C58C-DEFA-4F70-B7A2-27742230C0FC", "format": "SugarCube", "start": "Top"}

:: StoryInit
<<set $lamp to false, $steps = 0>>

:: Top [intro] {"position":"100,100"}
Narrator: The stairs go down into the dark.
<<if $lamp>>[[Go down|Cellar][$steps += 1]]<<else>>[[Feel your way->Cellar]]<</if>>
[[Light the lamp->Lamp]]
<<link "Leave" "Outside">><</link>>

:: Lamp
<<set $lamp to true>>The lamp flickers on.
<<goto "Top">>

:: Cellar
It smells of apples. Steps taken: $steps
<<run alert("hi")>>
[[Continue|Outside]]

:: Outside
The end of the cellar.

:: Menu [widget]
<<widget "x">><</widget>>
`;

  test("SugarCube: passages, links in all forms, <<set>>, <<if>>, <<link>>, <<goto>>", () => {
    const { graph: g, warnings, title } = read(sugar, "twee");
    expect(title).toBe("The Cellar");
    const nodes = Object.values(g.nodes);
    expect(nodes.find((n) => n.text === "The stairs go down into the dark.")).toMatchObject({ type: "line", speaker: "Narrator" });
    expect(nodes.filter((n) => n.type === "choice").map((n) => n.text)).toEqual(expect.arrayContaining(["Go down", "Feel your way", "Light the lamp", "Leave"]));
    // “Continue” is how a passage moves on, not a choice.
    expect(nodes.some((n) => n.type === "choice" && n.text === "Continue")).toBe(false);
    expect(Object.values(g.variables).map((v) => [v.name, v.value])).toEqual([
      ["lamp", false],
      ["steps", 0],
    ]);
    const said = warnings.map((w) => `${w.line}: ${w.text}`).join("\n");
    expect(said).toContain("<<run>> isn't something a dialogue can do");
    expect(said).not.toContain("printed in text");
    expect(nodes.some((n) => n.text === "It smells of apples. Steps taken: {$steps}")).toBe(true);
    expect(said).toContain("special passage “Menu”");
  });

  test("SugarCube plays: the lamp opens the other way down", () => {
    const { graph: g } = read(sugar, "twee");
    let state = startPlay(g);
    expect(state.options.map((o) => o.text)).toEqual(["Feel your way", "Light the lamp", "Leave"]);
    state = choose(g, state, state.options[1].nodeId);
    for (let i = 0; i < 5 && state.status === "line"; i++) state = continuePlay(g, state);
    expect(state.options.map((o) => o.text)).toEqual(["Go down", "Light the lamp", "Leave"]);
    state = choose(g, state, state.options[0].nodeId);
    expect(state.variables.steps).toBe(1);
  });

  test("Harlowe basics", () => {
    const harlowe = `:: StoryData
{"format": "Harlowe", "start": "Hall"}

:: Hall
(set: $key to true)(set: $n to 1)
A cold hall.
(if: $key is true)[You have a key. [[Open the door->Room]]](else:)[No key.]
(link-goto: "Turn back", "Out")
(link: "Knock")[(set: $n to it + 1)(goto: "Room")]
(print: $n)

:: Room
Warm in here.

:: Out
(goto: "Hall")
`;
    const { graph: g, warnings } = read(harlowe, "twee");
    const nodes = Object.values(g.nodes);
    expect(nodes.filter((n) => n.type === "choice").map((n) => n.text)).toEqual(expect.arrayContaining(["Open the door", "Turn back", "Knock"]));
    expect(nodes.filter((n) => n.type === "line").map((n) => n.text)).toEqual(expect.arrayContaining(["A cold hall.", "You have a key.", "No key.", "Warm in here."]));
    // `it` is the variable being set.
    expect(nodes.filter((n) => n.type === "set").map((n) => n.expr)).toEqual(expect.arrayContaining(["key = true; n = 1", "n += 1"]));
    // (print: $n) shows the variable.
    expect(nodes.some((n) => n.type === "line" && n.text === "{$n}")).toBe(true);
    expect(warnings.some((w) => w.text.includes("(print:)"))).toBe(false);
  });

  test("a Twine 2 archive (HTML)", () => {
    const html = `<!DOCTYPE html><html><body>
<tw-storydata name="Cellar &amp; Co" startnode="2" format="SugarCube" format-version="2.37.3" ifid="X">
<style role="stylesheet" id="twine-user-stylesheet" type="text/twine-css"></style>
<script role="script" id="twine-user-script" type="text/twine-javascript"></script>
<tw-passagedata pid="1" name="Other" tags="" position="0,0" size="100,100">Not the start.</tw-passagedata>
<tw-passagedata pid="2" name="First" tags="" position="0,0" size="100,100">Anna: &quot;Hello&quot; &lt;3
&lt;&lt;if $x &gt; 1&gt;&gt;[[Go-&gt;Other]]&lt;&lt;/if&gt;&gt;
[[Stay|Other]]</tw-passagedata>
</tw-storydata></body></html>`;
    expect(detectImportFormat("story.html", html)).toBe("twine-html");
    const { graph: g, title, warnings } = read(html, "twine-html");
    expect(title).toBe("Cellar & Co");
    let state = startPlay(g);
    expect(state.transcript[0]).toMatchObject({ kind: "line", speaker: "Anna", text: '"Hello" <3' });
    expect(state.options.map((o) => o.text)).toEqual(["Stay"]);
    // Undeclared variables start empty, and that's said.
    expect(Object.values(g.variables).map((v) => [v.name, v.value])).toEqual([["x", false]]);
    expect(warnings.some((w) => w.text.includes("without declaring"))).toBe(true);
    // Line numbers point into the HTML file.
    state = choose(g, state, state.options[0].nodeId);
    expect(extractTwineStory(html)?.split("\n").length).toBe(html.split("\n").length);
  });
});

describe("the cards", () => {
  test("are laid out left to right, choices top to bottom in the order offered, nothing on top of anything", () => {
    const { graph: g } = read(toYarn(loop(), { title: "Loop" }), "yarn");
    const start = Object.keys(g.nodes).find((id) => g.nodes[id].type === "start")!;
    expect(g.nodes[start]).toMatchObject({ x: 0, y: 0 });
    for (const [id, node] of Object.entries(g.nodes)) {
      if (id === start) continue;
      expect(node.x).toBeGreaterThanOrEqual(0);
      // No two cards in one spot.
      for (const [other, n] of Object.entries(g.nodes)) if (other !== id) expect(n.x === node.x && n.y === node.y).toBe(false);
    }
    const line = Object.keys(g.nodes).find((id) => g.nodes[id].sid === "abcd_0001")!;
    expect(successors(g, line).map((id) => g.nodes[id].text)).toEqual(["Yes: once more", "No"]);
  });

  test("an empty or unreadable file is an error; unknown constructs are not", () => {
    expect(() => read("", "ink")).toThrow();
    expect(() => read("<html></html>", "twine-html")).toThrow("tw-storydata");
    expect(() => read("x".repeat(1_000_000), "ink")).toThrow("too large");
    expect(read("<<weird>>\n{&a|b}\nHello.", "ink").warnings.length).toBeGreaterThan(0);
  });

  test("formats are told apart by name, and a .txt by its text", () => {
    expect(detectImportFormat("a.ink", "")).toBe("ink");
    expect(detectImportFormat("a.yarn", "")).toBe("yarn");
    expect(detectImportFormat("a.tw", "")).toBe("twee");
    expect(detectImportFormat("a.txt", "title: A\n---\nHi\n===\n")).toBe("yarn");
    expect(detectImportFormat("a.txt", ":: Start\nHi")).toBe("twee");
    expect(detectImportFormat("a.txt", "=== knot ===\nHi")).toBe("ink");
    expect(detectImportFormat("a.txt", "Just prose.")).toBeNull();
  });
});

/** Two questions that can each be asked once; with both asked, the dialogue moves on. */
const questions = () =>
  graph(
    {
      start: { type: "start" },
      l: { type: "line", sid: "abcd_0001", speaker: "Bo", text: "Ask away. You have {$gold} gold." },
      a: { type: "choice", sid: "abcd_0002", text: "Who are you?", once: true },
      b: { type: "choice", sid: "abcd_0003", text: "Spend {$gold}", once: true },
      la: { type: "line", sid: "abcd_0004", speaker: "Bo", text: "Bo, {$name}." },
      s: { type: "set", expr: "gold -= 1" },
      done: { type: "line", sid: "abcd_0005", speaker: "Bo", text: "That's all." },
      end: { type: "end" },
    },
    [
      ["start", "l"],
      ["l", "a"],
      ["l", "b"],
      ["l", "done"],
      ["a", "la"],
      ["la", "l"],
      ["b", "s"],
      ["s", "l"],
      ["done", "end"],
    ],
    { gold: 3, name: "the ferryman" },
  );

describe("once-only choices and variables in text", () => {
  for (const format of ["ink", "yarn", "twee"] as const) {
    test(`${format}: round trip`, () => {
      const result = roundTrip(questions(), format);
      expect(result.warnings).toEqual([]);
      const nodes = Object.values(result.graph.nodes);
      // {$name} comes back as written, wherever it was.
      expect(nodes.find((n) => n.sid === "abcd_0001")?.text).toBe("Ask away. You have {$gold} gold.");
      expect(nodes.find((n) => n.sid === "abcd_0003")?.text).toBe("Spend {$gold}");
      // Ink and Yarn have once-only choices; Twine plays the same with a variable of its own.
      if (format !== "twee") expect(nodes.filter((n) => n.type === "choice").every((n) => n.once)).toBe(true);
      else expect(Object.values(result.graph.variables).map((v) => v.name)).toEqual(["gold", "name", "picked_abcd_0002", "picked_abcd_0003"]);
      expect(checkDialogue(result.graph).filter((p) => p.severity === "error")).toEqual([]);
    });
  }

  test("the exports say it in each format's words", () => {
    const ink = toInk(questions(), { title: "Q" });
    expect(ink).toContain("* [Who are you? # id:abcd_0002]");
    expect(ink).toContain("Bo: Ask away. You have {gold} gold.");
    const yarn = toYarn(questions(), { title: "Q" });
    expect(yarn).toContain("-> Spend {$gold} <<once>> #line:abcd_0003");
    const twee = toTwee(questions(), { title: "Q" });
    expect(twee).toContain("<<if !$picked_abcd_0002>>[[Who are you?->");
    expect(twee).toContain("][$picked_abcd_0002 to true]]");
    expect(twee).toContain("You have <<print $gold>> gold.");
  });

  test("the play-through offers a once-only choice until it's picked, then moves on", () => {
    let state = startPlay(questions());
    const g = questions();
    expect(state.transcript.at(-1)).toMatchObject({ kind: "line", text: "Ask away. You have 3 gold." });
    expect(state.options.map((o) => o.text)).toEqual(["Who are you?", "Spend 3"]);
    state = choose(g, state, state.options[1].nodeId);
    expect(state.options.map((o) => o.text)).toEqual(["Who are you?"]);
    state = choose(g, state, state.options[0].nodeId);
    for (let i = 0; i < 5 && state.status === "line"; i++) state = continuePlay(g, state);
    expect(state.transcript.filter((e) => e.kind === "line").map((e) => (e.kind === "line" ? e.text : ""))).toEqual([
      "Ask away. You have 3 gold.",
      "Ask away. You have 2 gold.",
      "Bo, the ferryman.",
      "Ask away. You have 2 gold.",
      "That's all.",
    ]);
    expect(state.ending).toBe("end");
  });

  test("a variable shown in text that doesn't exist is a problem", () => {
    const g = graph({ start: { type: "start" }, l: { type: "line", sid: "a_0001", text: "Hi {$nope}" }, e: { type: "end" } }, [
      ["start", "l"],
      ["l", "e"],
    ]);
    expect(checkDialogue(g)).toContainEqual({ nodeId: "l", severity: "error", text: "There's no variable called “nope”." });
    expect(startPlay(g).transcript[0]).toMatchObject({ text: "Hi {$nope}" });
  });
});

describe("Ink, more", () => {
  test("glue joins lines; across a choice it can't, and says so", () => {
    const { graph: g, warnings } = read("Anna: Well, <>\nhello <>\n<>there.\nThe end <>\n* [Ok]\n", "ink");
    const lines = Object.values(g.nodes).filter((n) => n.type === "line");
    expect(lines.map((n) => [n.speaker, n.text])).toContainEqual(["Anna", "Well, hello there."]);
    expect(warnings.some((w) => w.line === 5 && w.text.startsWith("Glue (<>)"))).toBe(true);
  });

  test("{variable} in text shows it; other inline logic stays as written", () => {
    const { graph: g, warnings } = read("VAR gold = 3\nYou have {gold} coins, {seen}.\n* [Give {gold}] -> END\n* {gold} [Rich] -> END\n", "ink");
    const nodes = Object.values(g.nodes);
    expect(nodes.find((n) => n.type === "line")?.text).toBe("You have {$gold} coins, {seen}.");
    expect(nodes.filter((n) => n.type === "choice").map((n) => n.text)).toEqual(expect.arrayContaining(["Give {$gold}", "Rich"]));
    // A test on a choice is still a condition, not text.
    expect(nodes.find((n) => n.type === "condition")?.expr).toBe("gold");
    expect(warnings.some((w) => w.text.startsWith("Inline logic"))).toBe(true);
    expect(startPlay(g).transcript[0]).toMatchObject({ text: "You have 3 coins, {seen}." });
  });

  test("once-only choices used up take the fallback", () => {
    const { graph: g } = read("- (top) Pick.\n* [A] -> top\n* [B] -> top\n* -> out\n= out\nDone.\n-> END\n", "ink");
    let state = startPlay(g);
    state = choose(g, state, state.options[0].nodeId);
    expect(state.options.map((o) => o.text)).toEqual(["B"]);
    state = choose(g, state, state.options[0].nodeId);
    for (let i = 0; i < 5 && state.status === "line"; i++) state = continuePlay(g, state);
    expect(state.transcript.filter((e) => e.kind === "line").map((e) => (e.kind === "line" ? e.text : ""))).toEqual(["Pick.", "Pick.", "Pick.", "Done."]);
  });
});

describe("Yarn Spinner, more", () => {
  test("<<once>> on options, lines and blocks", () => {
    const yarn = `title: Start
---
Mae: First time only. <<once>>
<<once>>
    Mae: Welcome!
<<else>>
    Mae: Back again.
<<endonce>>
-> Ask <<once>>
    <<jump Start>>
-> Ask if rich <<once if $gold > 1>>
    <<jump Start>>
<<custom thing>>
Mae: Bye.
===
`;
    const { graph: g, warnings } = read(yarn, "yarn");
    expect(Object.values(g.nodes).filter((n) => n.type === "choice").every((n) => n.once)).toBe(true);
    expect(warnings.map((w) => w.text)).toContainEqual("<<custom>> isn't something a dialogue can do; it's kept in the note of the line next to it.");
    expect(Object.values(g.nodes).find((n) => n.text === "Bye.")?.note).toBe("Before this line: <<custom thing>>");
    let state = startPlay(g);
    const said = () => state.transcript.filter((e) => e.kind === "line").map((e) => (e.kind === "line" ? e.text : ""));
    const onward = () => {
      for (let i = 0; i < 5 && state.status === "line"; i++) state = continuePlay(g, state);
    };
    onward();
    expect(said()).toEqual(["First time only.", "Welcome!"]);
    expect(state.options.map((o) => o.text)).toEqual(["Ask"]);
    state = choose(g, state, state.options[0].nodeId);
    onward();
    // The first line isn't said again. With “Ask” used up and the other needing gold, on below the options.
    expect(said().slice(2)).toEqual(["Back again.", "Bye."]);
  });
});

describe("Twine, more", () => {
  test("a printed variable stays part of its sentence", () => {
    const { graph: g, warnings } = read(":: Start\n<<set $n to 2>>You have <<print $n>> keys and $n.length doors.\n", "twee");
    expect(Object.values(g.nodes).find((n) => n.type === "line")?.text).toBe("You have {$n} keys and $n.length doors.");
    expect(warnings.some((w) => w.text.startsWith("Only plain variables"))).toBe(true);
  });
});

describe("speakers", () => {
  const characters = [
    { id: "anna", title: "Anna Grey", aliases: ["Anna"] },
    { id: "bo1", title: "Bo", aliases: [] },
    { id: "bo2", title: "Bo the Elder", aliases: ["bo"] },
  ];

  test("link to the one character note with that title or alias; the rest stay typed, and the report says why", () => {
    const { graph: g } = read("anna grey: Hi.\nANNA: Hello.\nBo: Hm.\nCleo: Who?\n", "ink");
    const warnings = linkSpeakers(g, characters);
    const lines = Object.values(g.nodes).filter((n) => n.type === "line");
    expect(lines.filter((n) => n.speakerId === "anna").map((n) => n.text)).toEqual(expect.arrayContaining(["Hi.", "Hello."]));
    expect(lines.filter((n) => n.speakerId === "anna").every((n) => n.speaker === undefined)).toBe(true);
    expect(lines.find((n) => n.text === "Hm.")).toMatchObject({ speaker: "Bo" });
    expect(lines.find((n) => n.text === "Hm.")?.speakerId).toBeUndefined();
    expect(lines.find((n) => n.text === "Who?")).toMatchObject({ speaker: "Cleo" });
    expect(lines.find((n) => n.text === "Who?")?.speakerId).toBeUndefined();
    expect(warnings.map((w) => w.text)).toEqual([
      "“Bo” matches more than one character note, so it stays a typed name. Pick the right character on the line.",
      "No character note is called “Cleo” (by title or alias), so that speaker stays a typed name.",
    ]);
  });
});

describe("Random and Call cards", () => {
  for (const format of ["ink", "yarn", "twee"] as const) {
    test(`${format}: a Random card comes back as one, and plays the same`, () => {
      const result = roundTrip(barks(), format);
      expect(result.warnings).toEqual([]);
      const nodes = Object.values(result.graph.nodes);
      const random = Object.keys(result.graph.nodes).find((id) => result.graph.nodes[id].type === "random")!;
      expect(successors(result.graph, random).map((id) => result.graph.nodes[id].text)).toEqual(["Halt!", "Who goes there?", "Stop right there."]);
      expect(nodes.filter((n) => n.type === "random")).toHaveLength(1);
      // Every bark is heard in some play-through.
      expect(playthroughs(result.graph, [])).toHaveLength(3);
      expect(checkDialogue(result.graph)).toEqual([]);
    });

    test(`${format}: a Random card after a line, with a choice among its ways`, () => {
      const g = graph(
        {
          start: { type: "start" },
          l: { type: "line", sid: "abcd_0001", text: "Hm." },
          r: { type: "random" },
          a: { type: "line", sid: "abcd_0002", text: "Yes." },
          ch: { type: "choice", sid: "abcd_0003", text: "Wait" },
          e: { type: "end" },
        },
        [
          ["start", "l"],
          ["l", "r"],
          ["r", "a"],
          ["r", "ch"],
          ["a", "e"],
          ["ch", "e"],
        ],
      );
      expect(roundTrip(g, format).warnings).toEqual([]);
      expect(playthroughs(g, [])).toHaveLength(2);
    });

    test(`${format}: calls inside calls, returns and an End inside a call`, () => {
      const result = roundTrip(errands(), format);
      expect(result.warnings).toEqual([]);
      const nodes = Object.values(result.graph.nodes);
      expect(nodes.filter((n) => n.type === "call")).toHaveLength(2);
      expect(nodes.filter((n) => n.type === "return").length).toBeGreaterThanOrEqual(1);
      for (const call of nodes.filter((n) => n.type === "call")) expect(result.graph.nodes[call.target!]).toBeDefined();
      expect(checkDialogue(result.graph).filter((p) => p.severity === "error")).toEqual([]);
    });
  }

  test("Ink: shuffles, a shuffle block and tunnels", () => {
    const source = `
-> gate
=== gate ===
Guard: {~Halt!|Who goes there?} -> papers
=== papers ===
{ shuffle:
    - Guard: Papers.
    - Guard: Show me your papers.
}
-> ask ->
Guard: Move along.
-> END
=== ask ===
Guard: Where are you headed?
* [North] ->->
* [Home] -> END
`;
    const { graph: g, warnings } = read(source, "ink");
    expect(warnings).toEqual([]);
    const nodes = Object.values(g.nodes);
    expect(nodes.filter((n) => n.type === "random")).toHaveLength(2);
    expect(nodes.filter((n) => n.type === "call")).toHaveLength(1);
    expect(nodes.filter((n) => n.type === "return")).toHaveLength(1);
    const lines = (state: PlayState) => state.transcript.flatMap((e) => (e.kind === "line" ? [e.text] : []));
    const heard = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      let state = startPlay(g, { seed });
      for (let i = 0; i < 10 && state.status === "line"; i++) state = continuePlay(g, state);
      expect(state.options.map((o) => o.text)).toEqual(["North", "Home"]);
      const said = lines(state);
      heard.add(said[0]).add(said[1]);
      state = choose(g, state, state.options[0].nodeId);
      for (let i = 0; i < 10 && state.status === "line"; i++) state = continuePlay(g, state);
      expect(lines(state).slice(2)).toEqual(["Where are you headed?", "Move along."]);
      expect(state.ending).toBe("end");
    }
    expect([...heard].sort()).toEqual(["Halt!", "Papers.", "Show me your papers.", "Who goes there?"]);
  });

  test("Ink: other sequences play their first alternative, with a warning", () => {
    const { graph: g, warnings } = read("{ stopping:\n    - First.\n    - Then.\n}\n-> END\n", "ink");
    expect(warnings.map((w) => w.text)).toEqual(["Only a plain {shuffle:} becomes a Random card; this {stopping:} block is imported as its first alternative."]);
    expect(startPlay(g).transcript).toMatchObject([{ kind: "line", text: "First." }]);
  });

  test("Yarn: line groups, detours and returns", () => {
    const source = `title: Start
---
=> Guard: Halt!
=> Guard: Who goes there?
    Guard: Well?
<<detour Ask>>
Guard: Move along.
===
title: Ask
---
Guard: Papers?
<<return>>
Guard: Never said.
===
`;
    const { graph: g, warnings } = read(source, "yarn");
    expect(warnings).toEqual([]);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      let state = startPlay(g, { seed });
      for (let i = 0; i < 10 && state.status === "line"; i++) state = continuePlay(g, state);
      const said = state.transcript.flatMap((e) => (e.kind === "line" ? [e.text] : []));
      seen.add(said.join(" / "));
      expect(state.ending).toBe("end");
    }
    expect([...seen].sort()).toEqual(["Halt! / Papers? / Move along.", "Who goes there? / Well? / Papers? / Move along."]);
  });

  test("Yarn: a detour straight back out is a jump, so it doesn't stack up", () => {
    const source = "title: Start\n---\nHi.\n<<detour Next>>\n<<return>>\n===\ntitle: Next\n---\nBye.\n===\n";
    const { graph: g } = read(source, "yarn");
    expect(Object.values(g.nodes).some((n) => n.type === "call" || n.type === "return")).toBe(false);
  });
});
