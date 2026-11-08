import { ExprError, parseAssignments, parseExpression, VARIABLE_NAME, type Expr } from "./expr";
import { callTarget, linksOf, MAX_CALL_DEPTH, orderedNodes, startOf, successors, type DialogueGraph } from "./model";
import { textVariables } from "./text";

// A dialogue's problems found without playing it (plan.md 2.8): cards a player
// can't reach, paths that stop without an End card, expressions that can't be
// read and variables that don't exist, and calls that can't come back. Pure,
// for the Check menu and tests.

export type DialogueProblem = {
  /** The card to show, or null for the dialogue as a whole. */
  nodeId: string | null;
  /** `error`: the play-through or an export will go wrong. `warning`: probably not what was meant. */
  severity: "error" | "warning";
  text: string;
};

function variablesIn(expr: Expr, into: Set<string>) {
  if (expr.kind === "variable") into.add(expr.name);
  else if (expr.kind === "unary") variablesIn(expr.arg, into);
  else if (expr.kind === "binary") {
    variablesIn(expr.left, into);
    variablesIn(expr.right, into);
  }
}

const problemOf = (parse: () => unknown) => {
  try {
    parse();
    return null;
  } catch (error) {
    if (error instanceof ExprError) return error.message;
    throw error;
  }
};

export function checkDialogue(graph: DialogueGraph): DialogueProblem[] {
  const problems: DialogueProblem[] = [];
  const start = startOf(graph);
  if (!start) problems.push({ nodeId: null, severity: "error", text: "There's no Start card to begin from." });

  // Variables: declared ones, and ones a Set card makes with `=`.
  const declared = new Set<string>();
  for (const variable of Object.values(graph.variables).sort((a, b) => a.order - b.order)) {
    if (!VARIABLE_NAME.test(variable.name)) {
      problems.push({ nodeId: null, severity: "error", text: `“${variable.name}” isn't a usable variable name.` });
    } else if (declared.has(variable.name)) {
      problems.push({ nodeId: null, severity: "error", text: `Two variables are called “${variable.name}”. Only the first is used.` });
    } else declared.add(variable.name);
  }
  const made = new Set(declared);
  for (const node of Object.values(graph.nodes)) {
    if (node.type !== "set") continue;
    try {
      for (const a of parseAssignments(node.expr ?? "")) if (a.op === "=") made.add(a.name);
    } catch (error) {
      if (!(error instanceof ExprError)) throw error;
    }
  }

  const reached = new Set<string>();
  if (start) {
    const stack = [start];
    while (stack.length) {
      const id = stack.pop()!;
      if (reached.has(id)) continue;
      reached.add(id);
      stack.push(...linksOf(graph, id));
    }
  }

  /**
   * The cards a branch plays through from `from`, as a call would: a Call inside
   * it is taken to come back, so the walk goes on along its jump, not into it.
   */
  const branch = (from: string) => {
    const seen = new Set<string>();
    const stack = [from];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      if (graph.nodes[id].type !== "return") stack.push(...successors(graph, id));
    }
    return [...seen];
  };
  const calls = Object.keys(graph.nodes).filter((id) => graph.nodes[id].type === "call");
  const branches = new Map(calls.map((id) => [id, callTarget(graph, id)]).filter((e): e is [string, string] => e[1] !== null).map(([id, target]) => [id, branch(target)]));
  // Returns Start gets to without a call to go back to.
  const loose = new Set(start ? branch(start).filter((id) => graph.nodes[id].type === "return") : []);
  // Calls that can end up calling themselves: a cycle among "this call's branch makes that call".
  const recursive = new Set<string>();
  for (const id of branches.keys()) {
    const seen = new Set<string>();
    const stack = (branches.get(id) ?? []).filter((n) => graph.nodes[n].type === "call");
    while (stack.length) {
      const call = stack.pop()!;
      if (call === id) {
        recursive.add(id);
        break;
      }
      if (seen.has(call)) continue;
      seen.add(call);
      stack.push(...(branches.get(call) ?? []).filter((n) => graph.nodes[n].type === "call"));
    }
  }

  for (const id of orderedNodes(graph)) {
    const node = graph.nodes[id];
    const add = (severity: DialogueProblem["severity"], text: string) => problems.push({ nodeId: id, severity, text });
    if (start && !reached.has(id)) add("warning", "Start never leads here, so a player can't reach this card.");

    if ((node.type === "line" || node.type === "choice") && !node.text?.trim()) {
      add("warning", node.type === "line" ? "This line has no text yet." : "This choice has no text yet.");
    }

    const used = new Set<string>();
    if (node.type === "condition") {
      const problem = problemOf(() => variablesIn(parseExpression(node.expr ?? ""), used));
      if (problem) add("error", `The condition can't be read: ${problem}`);
    } else if (node.type === "set") {
      const problem = problemOf(() => {
        for (const a of parseAssignments(node.expr ?? "")) {
          variablesIn(a.value, used);
          if (a.op !== "=") used.add(a.name);
        }
      });
      if (problem) add("error", `The assignments can't be read: ${problem}`);
    } else if (node.type === "line" || node.type === "choice") {
      // `{$name}` shows a variable's value.
      for (const name of textVariables(node.text)) used.add(name);
    }
    for (const name of used) if (!made.has(name)) add("error", `There's no variable called “${name}”.`);

    if (node.type === "random") {
      const ways = successors(graph, id).length;
      if (!ways) add("error", "A Random card needs jumps to pick from; this one has none.");
      else if (ways === 1) add("warning", "A Random card with only one jump always takes it. Add another for it to pick from.");
    } else if (node.type === "call") {
      if (!node.target) add("error", "This Call card doesn't call any card yet. Pick one in its panel.");
      else if (!graph.nodes[node.target]) add("error", "The card this calls has been deleted. Pick another in its panel.");
      else {
        if (!branches.get(id)?.some((n) => graph.nodes[n].type === "return")) {
          add("warning", "The branch this calls never reaches a Return card, so play never comes back here.");
        }
        if (recursive.has(id)) add("warning", `This call can end up calling itself. A play-through stops after ${MAX_CALL_DEPTH} calls inside one another.`);
      }
    } else if (node.type === "return" && loose.has(id)) {
      add("warning", "Start reaches this Return without going through a Call, and there it ends the dialogue.");
    }

    // Where a path stops without an End card.
    if (node.type === "random") {
      // Reported above.
    } else if (node.type === "condition") {
      for (const side of ["true", "false"] as const) {
        if (!successors(graph, id, side).length) add("warning", `Nothing follows the ${side} side, so the dialogue stops there.`);
      }
    } else if (node.type !== "end" && node.type !== "return" && !successors(graph, id).length) {
      add("warning", node.type === "start" ? "Start leads nowhere yet." : "Nothing follows this card. Add an End card if the dialogue should stop here.");
    }
  }
  return problems;
}
