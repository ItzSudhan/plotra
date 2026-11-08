import { describe, expect, test } from "bun:test";
import { checkDialogue } from "@/lib/interactive/check";
import { gate, graph } from "./fixtures";

const texts = (g: ReturnType<typeof graph>) => checkDialogue(g).map((p) => `${p.nodeId ?? "-"}: ${p.text}`);

describe("checking a dialogue", () => {
  test("a finished dialogue has only its open condition side to report", () => {
    expect(texts(gate())).toEqual(["c1: Nothing follows the false side, so the dialogue stops there."]);
  });

  test("no Start", () => {
    expect(checkDialogue(graph({}, []))).toEqual([{ nodeId: null, severity: "error", text: "There's no Start card to begin from." }]);
  });

  test("cards nothing reaches, empty text and dead ends", () => {
    const g = graph(
      { start: { type: "start" }, l: { type: "line", sid: "a_0001", text: " " }, lost: { type: "choice", sid: "a_0002", text: "Hello?" }, e: { type: "end" } },
      [
        ["start", "l"],
        ["lost", "e"],
      ],
    );
    expect(texts(g)).toEqual([
      "l: This line has no text yet.",
      "l: Nothing follows this card. Add an End card if the dialogue should stop here.",
      "lost: Start never leads here, so a player can't reach this card.",
      "e: Start never leads here, so a player can't reach this card.",
    ]);
  });

  test("expressions that can't be read, and variables that don't exist", () => {
    const g = graph(
      {
        start: { type: "start" },
        s: { type: "set", expr: "made = 1; gold += bonus" },
        c: { type: "condition", expr: "made > 0 && gold = 1" },
        c2: { type: "condition", expr: "made > 0 && silver > 0" },
        e: { type: "end" },
      },
      [
        ["start", "s"],
        ["s", "c"],
        ["c", "c2", "true"],
        ["c", "e", "false"],
        ["c2", "e", "true"],
        ["c2", "e", "false"],
      ],
      { gold: 0 },
    );
    const problems = checkDialogue(g);
    expect(problems.filter((p) => p.severity === "error").map((p) => `${p.nodeId}: ${p.text}`)).toEqual([
      "s: There's no variable called “bonus”.",
      "c: The condition can't be read: Use == to compare; = sets a variable.",
      "c2: There's no variable called “silver”.",
    ]);
  });

  test("bad and repeated variable names", () => {
    const g = graph({ start: { type: "start" }, e: { type: "end" } }, [["start", "e"]], { gold: 0, "2x": 0 });
    g.variables.dup = { name: "gold", value: 1, order: 5 };
    expect(texts(g)).toEqual(["-: “2x” isn't a usable variable name.", "-: Two variables are called “gold”. Only the first is used."]);
  });
});
