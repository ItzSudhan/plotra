import { describe, expect, test } from "bun:test";
import { assign, evaluate, expressionProblem, parseAssignments, parseExpression } from "@/lib/interactive/expr";
import { choose, continuePlay, startPlay } from "@/lib/interactive/play";
import { gate, graph } from "./fixtures";

describe("the expression language", () => {
  const run = (source: string, vars = {}) => evaluate(parseExpression(source), vars);

  test("precedence, words and short-circuiting", () => {
    expect(run("1 + 2 * 3")).toBe(7);
    expect(run("(1 + 2) * 3")).toBe(9);
    expect(run("not false and true or false")).toBe(true);
    // The right side isn't worked out, so the missing variable isn't an error.
    expect(run("false && nope")).toBe(false);
    expect(run('$name + "!"', { name: "Anna" })).toBe("Anna!");
    expect(run('5 == "5"')).toBe(false);
  });

  test("mistakes are worded for the writer", () => {
    expect(expressionProblem("gold = 5", "condition")).toBe("Use == to compare; = sets a variable.");
    expect(expressionProblem("gold >=", "condition")).toBe("The expression stops short.");
    expect(expressionProblem("(gold > 5", "condition")).toBe("A bracket is never closed.");
    expect(expressionProblem('name == "Anna', "condition")).toBe("A text value is missing its closing quote.");
    expect(expressionProblem("gold 5", "assignments")).toBe("After “gold” comes =, += or -=.");
    expect(expressionProblem("gold += 5 silver = 1", "assignments")).toBe("Put a semicolon or a new line between assignments.");
    expect(() => run("1 / 0")).toThrow("That divides by zero.");
    expect(() => run("gold > 1")).toThrow("There's no variable called “gold”.");
  });

  test("assignments", () => {
    expect(assign(parseAssignments("gold += 5\nmet = true; name += \"!\""), { gold: 1, name: "A" })).toEqual({ gold: 6, met: true, name: "A!" });
    expect(() => assign(parseAssignments("gold -= 1"), {})).toThrow("There's no variable called “gold” to change.");
  });
});

describe("the play-through", () => {
  test("the gate, paying", () => {
    let state = startPlay(gate());
    expect(state.status).toBe("choices");
    expect(state.options.map((o) => o.text)).toEqual(["Pay her.", "Walk away."]);
    state = choose(gate(), state, "ch1");
    expect(state.variables).toEqual({ gold: 5, paid: true });
    expect(state.transcript.map((e) => e.kind)).toEqual(["line", "choice", "set", "line"]);
    state = continuePlay(gate(), state);
    expect(state).toMatchObject({ status: "ended", ending: "end" });
  });

  test("a guarded choice is not offered when its condition is false", () => {
    const g = gate();
    g.variables.v0.value = 2;
    expect(startPlay(g).options.map((o) => o.text)).toEqual(["Walk away."]);
  });

  test("a loop with no line in it is stopped", () => {
    const g = graph({ start: { type: "start" }, a: { type: "set", expr: "n += 1" }, b: { type: "set", expr: "n += 1" } }, [
      ["start", "a"],
      ["a", "b"],
      ["b", "a"],
    ], { n: 0 });
    const state = startPlay(g);
    expect(state.ending).toBe("stuck");
    expect(state.transcript.at(-1)).toMatchObject({ kind: "problem", text: "This goes round in a loop without ever showing a line." });
  });

  test("no Start", () => {
    expect(startPlay(graph({}, [])).transcript).toEqual([{ kind: "problem", nodeId: null, text: "There's no Start node to begin from." }]);
  });
});
