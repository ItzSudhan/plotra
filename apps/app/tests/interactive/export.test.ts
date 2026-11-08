import { describe, expect, test } from "bun:test";
import { buildScript, exportDialogue, exportFileName, stringsToCsv, toInk, toJson, toTwee, toYarn } from "@/lib/interactive/export";
import { graphStrings } from "@/lib/interactive/model";
import { gate, graph } from "./fixtures";

const options = { title: "The Gate" };

/** A start, one line with the given text, and an end. */
const oneLine = (text: string, speaker?: string) =>
  graph({ start: { type: "start" }, l: { type: "line", sid: "abcd_0001", text, speaker }, end: { type: "end" } }, [
    ["start", "l"],
    ["l", "end"],
  ]);

/** A line then one choice with the given text. */
const oneChoice = (text: string) =>
  graph({ start: { type: "start" }, l: { type: "line", sid: "abcd_0001", text: "Well?" }, ch: { type: "choice", sid: "abcd_0002", text } }, [
    ["start", "l"],
    ["l", "ch"],
  ]);

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

describe("the outline", () => {
  test("a run of cards stays in one passage and passages are named after their first card", () => {
    const script = buildScript(gate());
    expect(script.first).toBe("line_abcd_0001");
    expect(script.passages.map((p) => p.name)).toEqual(["line_abcd_0001", "set_s1", "end_end"]);
    // The set, the line after it and the jump to End share a passage.
    expect(script.passages[1].steps.map((s) => s.kind)).toEqual(["set", "line", "jump"]);
  });

  test("a condition in front of choices becomes a guard, not a passage", () => {
    const [first] = buildScript(gate()).passages;
    const choices = first.steps.find((s) => s.kind === "choices");
    expect(choices?.kind === "choices" && choices.options.map((o) => [o.text, o.guard !== null])).toEqual([
      ["Pay her.", true],
      ["Walk away.", false],
    ]);
    // One unguarded option is always on offer, so there's no fallback.
    expect(choices?.kind === "choices" && choices.fallback).toBeUndefined();
  });

  test("when every choice is guarded, the script moves on as the play-through does", () => {
    const script = buildScript(guarded());
    const choices = script.passages[0].steps.find((s) => s.kind === "choices");
    expect(choices?.kind === "choices" && choices.fallback).toBe("condition_c");
    // And the false side's line is reached from there.
    expect(script.passages.find((p) => p.name === "condition_c")?.steps[0]).toMatchObject({ kind: "branch", no: "line_abcd_0003" });
  });

  test("cards Start never reaches are still written out", () => {
    const g = graph({ start: { type: "start" }, lost: { type: "line", sid: "abcd_0009", text: "Nobody hears this." } }, []);
    const script = buildScript(g);
    expect(script.first).toBeNull();
    expect(script.passages.map((p) => p.name)).toEqual(["line_abcd_0009"]);
  });

  test("loops back to an earlier card terminate", () => {
    const g = graph(
      {
        start: { type: "start" },
        l: { type: "line", sid: "abcd_0001", text: "Again?" },
        yes: { type: "choice", sid: "abcd_0002", text: "Yes" },
        no: { type: "choice", sid: "abcd_0003", text: "No" },
      },
      [
        ["start", "l"],
        ["l", "yes"],
        ["l", "no"],
        ["yes", "l"],
      ],
    );
    const ink = toInk(g, options);
    expect(ink).toContain("+ [Yes # id:abcd_0002]\n    -> line_abcd_0001");
    expect(ink).toContain("+ [No # id:abcd_0003]\n    -> END");
  });

  test("passage names are unique and safe", () => {
    const g = graph(
      {
        start: { type: "start" },
        a: { type: "line", sid: "ab-cd 1", text: "One" },
        b: { type: "line", sid: "ab_cd_1", text: "Two" },
        c: { type: "choice", sid: "abcd_0003", text: "x" },
      },
      [
        ["start", "a"],
        ["start", "b"],
        ["a", "c"],
        ["b", "c"],
      ],
    );
    const names = buildScript(g).passages.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
  });

  test("variables made by a Set card are declared, with an empty value of their kind", () => {
    const g = graph({ start: { type: "start" }, s: { type: "set", expr: 'name = "Anna"; met = true; seen = 2' } }, [["start", "s"]], { gold: 1 });
    expect(buildScript(g).variables).toEqual([
      { name: "gold", value: 1 },
      { name: "name", value: "" },
      { name: "met", value: false },
      { name: "seen", value: 0 },
    ]);
  });

  test("a variable name the editor would refuse is left out", () => {
    const g = graph({ start: { type: "start" } }, [], { gold: 1, "bad name": 2, gold_2: 3 });
    expect(buildScript(g).variables.map((v) => v.name)).toEqual(["gold", "gold_2"]);
  });
});

describe("Ink", () => {
  test("the gate", () => {
    const ink = toInk(gate(), options);
    expect(ink).toContain("VAR gold = 10\nVAR paid = false");
    expect(ink).toContain("-> line_abcd_0001\n\n=== line_abcd_0001 ===");
    expect(ink).toContain("Anna: The toll is five gold. # id:abcd_0001");
    expect(ink).toContain("+ {gold >= 5} [Pay her. # id:abcd_0002]\n    -> set_s1");
    expect(ink).toContain("~ gold -= 5\n~ paid = true");
    expect(ink).toContain("=== end_end ===\n-> END");
  });

  test("markup in text is escaped", () => {
    const ink = toInk(oneLine("Tag #x {logic} a|b [x] // not /* a comment -> nowhere <> glue \\ done"), options);
    expect(ink).toContain("Tag \\#x \\{logic\\} a\\|b \\[x\\] \\// not \\/* a comment -\\> nowhere \\<> glue \\\\ done # id:abcd_0001");
  });

  test("a line can't start like a choice, a gather, a divert or a TODO", () => {
    for (const text of ["* not a choice", "+ nor this", "- nor a gather", "= nor a stitch", "~ nor logic", "<- nor a thread", "TODO: nor a note"]) {
      expect(toInk(oneLine(text), options)).toContain(`\n\\${text} # id:`);
    }
    // A speaker's name is the start of the line too.
    expect(toInk(oneLine("hello", "*Star"), options)).toContain("\\*Star: hello # id:");
  });

  test("conditions, not and text values", () => {
    const g = graph(
      { start: { type: "start" }, c: { type: "condition", expr: `!met && name == "say \\"hi\\" \\\\ ok"` }, a: { type: "end" }, b: { type: "end" } },
      [
        ["start", "c"],
        ["c", "a", "true"],
        ["c", "b", "false"],
      ],
      { met: false, name: "" },
    );
    const ink = toInk(g, options);
    expect(ink).toContain(`{ not met && name == "say 'hi' \\\\ ok":`);
    expect(ink).toContain("- else:");
  });

  test("a variable named like an Ink keyword is renamed", () => {
    const g = graph({ start: { type: "start" }, s: { type: "set", expr: "temp += 1" } }, [["start", "s"]], { temp: 0 });
    const ink = toInk(g, options);
    expect(ink).toContain("VAR temp_var = 0");
    expect(ink).toContain("~ temp_var += 1");
  });

  test("a fallback choice when every choice is guarded", () => {
    expect(toInk(guarded(), options)).toContain("+ {gold > 1} [Rich # id:abcd_0002]\n    -> END\n+ -> condition_c");
  });

  test("broken expressions and empty lines become comments", () => {
    const g = graph(
      { start: { type: "start" }, s: { type: "set", expr: "gold +" }, l: { type: "line", sid: "abcd_0001", text: "" }, c: { type: "condition", expr: "(" }, e: { type: "end" } },
      [
        ["start", "s"],
        ["s", "l"],
        ["l", "c"],
        ["c", "e", "false"],
      ],
    );
    const ink = toInk(g, options);
    expect(ink).toContain("// TODO: couldn't read this assignment: gold +");
    expect(ink).toContain("// An empty line (id:abcd_0001)");
    expect(ink).toContain("// TODO: couldn't read this condition, so it's taken as false: (");
  });

  test("an empty choice still has something to click", () => {
    expect(toInk(oneChoice(""), options)).toContain("+ […");
  });
});

describe("Yarn Spinner", () => {
  test("the gate", () => {
    const yarn = toYarn(gate(), options);
    expect(yarn.startsWith("title: Start\n---\n")).toBe(true);
    expect(yarn).toContain("<<declare $gold = 10>>\n<<declare $paid = false>>\n<<jump line_abcd_0001>>\n===");
    expect(yarn).toContain("title: line_abcd_0001\nposition: 10,100\n---");
    expect(yarn).toContain("-> Pay her. <<if $gold >= 5>> #line:abcd_0002\n    <<jump set_s1>>");
    expect(yarn).toContain("<<set $gold to $gold - 5>>\n<<set $paid to true>>");
    expect(yarn).toContain("title: end_end\nposition: 70,700\n---\n<<stop>>\n===");
  });

  test("markup in text is escaped with the escapes Yarn accepts", () => {
    const yarn = toYarn(oneLine("a #b {c} [d] <<e>> // f \\ g: h"), options);
    expect(yarn).toContain("a \\#b \\{c\\} \\[d\\] \\<\\<e\\>\\> \\/\\/ f \\\\ g\\: h #line:abcd_0001");
    // With a speaker, only the speaker's colons are escaped.
    expect(toYarn(oneLine("a: b", "Dr: Who"), options)).toContain("Dr\\: Who: a: b #line:");
  });

  test("a line can't start an option, a line group or the end of a node", () => {
    expect(toYarn(oneLine("-> no"), options)).toContain("\n-\\> no #line:");
    expect(toYarn(oneLine("=> no"), options)).toContain("\n=\\> no #line:");
    expect(toYarn(oneLine("=== no"), options)).toContain('\n{"="}== no #line:');
    expect(toYarn(oneChoice("-> no: really"), options)).toContain("-> -\\> no\\: really #line:abcd_0002");
  });

  test("a choice offered from two places is tagged once", () => {
    const g = graph(
      {
        start: { type: "start" },
        a: { type: "line", sid: "abcd_0001", text: "One" },
        b: { type: "line", sid: "abcd_0002", text: "Two" },
        ch: { type: "choice", sid: "abcd_0003", text: "Same" },
      },
      [
        ["start", "a"],
        ["a", "b"],
        ["a", "ch"],
        ["b", "ch"],
      ],
    );
    const yarn = toYarn(g, options);
    expect(yarn.match(/#line:abcd_0003/g)).toHaveLength(1);
    expect(yarn).toContain("// the same string as abcd_0003");
  });

  test("text values escape quotes and backslashes", () => {
    const g = graph({ start: { type: "start" } }, [], { name: 'say "hi" \\' });
    expect(toYarn(g, options)).toContain('<<declare $name = "say \\"hi\\" \\\\">>');
  });

  test("when every option is unavailable, the group is followed by a jump", () => {
    expect(toYarn(guarded(), options)).toContain("-> Rich <<if $gold > 1>> #line:abcd_0002\n    <<stop>>\n<<jump condition_c>>");
  });
});

describe("Twine (SugarCube)", () => {
  test("the gate", () => {
    const twee = toTwee(gate(), { ...options, ifid: "0f8e2c1a-1111-4222-8333-444455556666" });
    expect(twee).toContain('"ifid": "0F8E2C1A-1111-4222-8333-444455556666"');
    expect(twee).toContain('"format": "SugarCube"');
    expect(twee).toContain(":: StoryInit\n<<set $gold to 10>>\n<<set $paid to false>>");
    expect(twee).toContain(':: Start\n<<goto "line_abcd_0001">>');
    expect(twee).toContain("<<if $gold >= 5>>[[Pay her.->set_s1]] /* id:abcd_0002 */<</if>>");
    expect(twee).toContain("[[Continue->end_end]]");
    // An End reached before anything is shown moves straight on to the closing passage.
    expect(twee).toContain(':: end_end {"position":"170,800"}\n<<goto "TheEnd">>');
    expect(twee).toContain(":: TheEnd\nThe end.");
  });

  test("a line followed by an End leads to the closing passage", () => {
    expect(toTwee(oneLine("Bye."), options)).toContain("Bye. /* id:abcd_0001 */\n[[Continue->TheEnd]]\n\n:: TheEnd\nThe end.");
  });

  test("an empty dialogue still starts somewhere", () => {
    const twee = toTwee(graph({ start: { type: "start" } }, []), options);
    expect(twee).toContain(':: Start\n<<goto "TheEnd">>');
    expect(twee).toContain(":: TheEnd");
  });

  test("equality is strict, as in the play-through", () => {
    const g = graph(
      { start: { type: "start" }, c: { type: "condition", expr: 'gold == "5" || gold != 5' }, a: { type: "end" } },
      [
        ["start", "c"],
        ["c", "a", "true"],
      ],
      { gold: 5 },
    );
    expect(toTwee(g, options)).toContain('<<if $gold === "5" || $gold !== 5>>');
  });

  test("markup is wrapped so it shows as written", () => {
    expect(toTwee(oneLine("Costs $gold //now//"), options)).toContain("<nowiki>Costs $gold //now//</nowiki> /* id:abcd_0001 */");
    expect(toTwee(oneLine("a </nowiki> $b"), options)).toContain("<nowiki>a <​/nowiki> $b</nowiki>");
    expect(toTwee(oneLine("Plain words."), options)).toContain("\nPlain words. /* id:abcd_0001 */");
  });

  test("a choice that link markup can't hold becomes a link macro", () => {
    expect(toTwee(oneChoice("Left -> or right?"), options)).toContain('<<link "<nowiki>Left -> or right?</nowiki>" "TheEnd">><</link>> /* id:abcd_0002 */');
    expect(toTwee(oneChoice("Pay $5"), options)).toContain('<<link "<nowiki>Pay $5</nowiki>" "TheEnd">><</link>>');
  });

  test("when every choice is guarded, the passage moves on if none holds", () => {
    expect(toTwee(guarded(), options)).toContain("<<if !($gold > 1)>>[[Continue->condition_c]]<</if>>");
  });

  test("a made-up IFID is a stable version-4 UUID", () => {
    const a = toTwee(gate(), options).match(/"ifid": "([^"]+)"/)![1];
    expect(a).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-8[0-9A-F]{3}-[0-9A-F]{12}$/);
    expect(toTwee(gate(), options)).toContain(a);
  });
});

describe("JSON and CSV", () => {
  test("JSON holds the whole dialogue in reading order", () => {
    const data = JSON.parse(toJson(gate(), { ...options, speakerName: () => undefined }));
    expect(data).toMatchObject({ format: "plotra-dialogue", version: 1, title: "The Gate", start: "start" });
    expect(data.nodes.map((n: { id: string }) => n.id)).toEqual(["start", "l1", "c1", "ch1", "s1", "l2", "end", "ch2"]);
    expect(data.edges.find((e: { from: string }) => e.from === "c1")).toMatchObject({ to: "ch1", branch: "true" });
    expect(data.variables).toEqual([
      { name: "gold", value: 10 },
      { name: "paid", value: false },
    ]);
  });

  test("speakers that are character notes export by their name", () => {
    const g = graph({ start: { type: "start" }, l: { type: "line", sid: "abcd_0001", speakerId: "anna", text: "Hi" } }, [["start", "l"]]);
    const name = (id: string) => (id === "anna" ? "Anna Grey" : undefined);
    expect(toInk(g, { ...options, speakerName: name })).toContain("Anna Grey: Hi");
    expect(JSON.parse(toJson(g, { ...options, speakerName: name })).nodes[1]).toMatchObject({ speaker: "Anna Grey", speakerId: "anna" });
  });

  test("the CSV quotes what needs it and gives choices a context", () => {
    const csv = stringsToCsv(graphStrings(gate()));
    const rows = csv.split("\r\n");
    expect(rows[0]).toBe("id,speaker,text,kind,context");
    expect(rows[1]).toBe("abcd_0001,Anna,The toll is five gold.,line,");
    expect(rows[2]).toBe("abcd_0002,,Pay her.,choice,Reply to: The toll is five gold.");
    expect(stringsToCsv([{ id: "x", speaker: "", text: 'He said "no", then\nleft', kind: "line", context: "" }])).toContain('"He said ""no"", then\nleft"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  test("every format comes out of the one entry point", () => {
    for (const format of ["json", "csv", "ink", "yarn", "twee"] as const) expect(exportDialogue(gate(), format, options).length).toBeGreaterThan(0);
  });

  test("file names come from the title", () => {
    expect(exportFileName("The Gate", "ink")).toBe("the-gate.ink");
    expect(exportFileName("Café: Night!", "yarn")).toBe("cafe-night.yarn");
    expect(exportFileName("???", "twee")).toBe("dialogue.twee");
  });
});
