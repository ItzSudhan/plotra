import { assign, evaluate, ExprError, parseAssignments, parseExpression, truthy, type Variables } from "./expr";
import { callTarget, MAX_CALL_DEPTH, startOf, successors, type DialogueGraph, type DialogueValue } from "./model";
import { interpolate } from "./text";

// The play-through preview's runtime (plan.md 2.8): walks a dialogue from Start
// the way a game would. Pure: every step takes a state and returns a new one,
// so stepping back is just keeping the earlier states.
//
// How a dialogue plays:
// - A line is shown, then the player continues to whatever it jumps to.
// - When a node jumps to choices, they're offered as options. A condition in
//   between decides which are offered (line → condition → choice).
// - A set node changes variables; a condition follows its true or false side.
// - It ends at an End node, or wherever nothing follows.
// - A choice marked "once" isn't offered again after it's been picked. With
//   nothing left on offer the dialogue moves on to the topmost jump that isn't
//   a choice, as it does when conditions hide every choice.
// - `{$name}` in a line or a choice shows the variable's value.
// - A Random card goes on along one of its jumps, picked at random, each as
//   likely as the others. The pick comes from a seeded generator kept in the
//   state, so stepping back and going on again picks the same.
// - A Call card goes to the card it calls; at a Return card play comes back and
//   follows the Call's own jump. Calls can be inside calls, up to
//   MAX_CALL_DEPTH. An End card ends the whole dialogue, inside a call or not; a
//   Return with no call to go back to ends it too.
// - Random and Call land on a card the way a jump would; landing on a choice
//   offers that choice.

export { assign, evaluate, ExprError, expressionProblem, parseAssignments, parseExpression, truthy } from "./expr";
export type { Assignment, Expr, Variables } from "./expr";

export type PlayEntry =
  | { kind: "line"; nodeId: string; sid?: string; speakerId?: string; speaker?: string; text: string }
  | { kind: "choice"; nodeId: string; sid?: string; text: string }
  /** Variables a set node changed, as `gold = 15`. */
  | { kind: "set"; nodeId: string; text: string }
  | { kind: "condition"; nodeId: string; text: string; result: boolean }
  /** Which way a Random card went, or a call made or returned from. */
  | { kind: "flow"; nodeId: string; text: string }
  /** Something the writer should fix: a broken expression, a loop with no line in it. */
  | { kind: "problem"; nodeId: string | null; text: string };

export type PlayOption = { nodeId: string; sid?: string; text: string };

export type PlayState = {
  variables: Variables;
  /** Everything shown so far, oldest first. */
  transcript: PlayEntry[];
  /** The node the play-through stands on. */
  at: string | null;
  /** `line`: waiting for "continue". `choices`: waiting for a pick. */
  status: "line" | "choices" | "ended";
  options: PlayOption[];
  /** Once-only choices already picked. */
  picked: string[];
  /** The Call cards being played inside, the innermost last. */
  calls: string[];
  /** The random generator's state, for Random cards. */
  seed: number;
  /** How it ended: at an End node, or because nothing followed. */
  ending?: "end" | "open" | "stuck";
};

/** Nodes passed without anything to show before we call it an endless loop. */
const MAX_SILENT_STEPS = 500;

/** The next number from a seeded generator (mulberry32): a value in [0, 1) and the new seed. */
export function nextRandom(seed: number): { value: number; seed: number } {
  const next = (seed + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: next };
}

/** The declared variables at their starting values. */
export function initialVariables(graph: DialogueGraph): Variables {
  const variables: Variables = {};
  for (const variable of Object.values(graph.variables).sort((a, b) => a.order - b.order)) {
    if (variable.name && !Object.hasOwn(variables, variable.name)) variables[variable.name] = variable.value;
  }
  return variables;
}

export const formatValue = (value: DialogueValue) => (typeof value === "string" ? JSON.stringify(value) : String(value));

const message = (error: unknown) => {
  if (error instanceof ExprError) return error.message;
  throw error;
};

/**
 * What a node leads to: the choices to offer (looking through conditions), or,
 * when there are none, the one node to go to next.
 */
function ahead(graph: DialogueGraph, state: Pick<PlayState, "variables" | "picked">, id: string, outcome?: "true" | "false") {
  const { variables, picked } = state;
  const options: string[] = [];
  const seen = new Set<string>();
  const look = (from: string, side?: "true" | "false") => {
    for (const target of successors(graph, from, side)) {
      const node = graph.nodes[target];
      if (node.type === "choice") {
        if (!options.includes(target) && !(node.once && picked.includes(target))) options.push(target);
      } else if (node.type === "condition" && !seen.has(target)) {
        seen.add(target);
        try {
          look(target, truthy(evaluate(parseExpression(node.expr ?? ""), variables)) ? "true" : "false");
        } catch (error) {
          // A broken condition offers nothing; it's reported when the walk reaches it.
          message(error);
        }
      }
    }
  };
  look(id, outcome);
  // Nothing on offer: on to the topmost jump that isn't a choice (one that's been used up, say).
  const next = options.length ? null : (successors(graph, id, outcome).find((target) => graph.nodes[target].type !== "choice") ?? null);
  return { options, next };
}

const offering = (graph: DialogueGraph, state: PlayState, ids: string[]): PlayState => ({
  ...state,
  status: "choices",
  options: ids.map((nodeId) => ({ nodeId, sid: graph.nodes[nodeId].sid, text: interpolate(graph.nodes[nodeId].text ?? "", state.variables) })),
});

const ended = (state: PlayState, ending: PlayState["ending"]): PlayState => ({ ...state, status: "ended", options: [], ending });

/** Moves on from a node until there's something for the player to do. */
function run(graph: DialogueGraph, from: PlayState, id: string): PlayState {
  let state: PlayState = { ...from, options: [] };
  let current = id;
  let outcome: "true" | "false" | undefined;
  /** Where a Random or a Call card sends play: gone to as it is, without looking for choices ahead of it. */
  let landing: string | null = null;
  const say = (entry: PlayEntry) => {
    state = { ...state, transcript: [...state.transcript, entry] };
  };
  for (let steps = 0; steps < MAX_SILENT_STEPS; steps++) {
    let next: string | null;
    if (landing) {
      next = landing;
      landing = null;
      const choice = graph.nodes[next];
      if (choice.type === "choice") {
        state = { ...state, at: current };
        return choice.once && state.picked.includes(next) ? ended(state, "open") : offering(graph, state, [next]);
      }
    } else {
      const found = ahead(graph, state, current, outcome);
      if (found.options.length) return offering(graph, state, found.options);
      if (!found.next) return ended(state, graph.nodes[current]?.type === "end" ? "end" : "open");
      next = found.next;
    }
    const node = graph.nodes[next];
    current = next;
    outcome = undefined;
    state = { ...state, at: next };
    if (node.type === "line") {
      say({ kind: "line", nodeId: next, sid: node.sid, speakerId: node.speakerId, speaker: node.speaker, text: interpolate(node.text ?? "", state.variables) });
      // Choices show together with the line they answer.
      const after = ahead(graph, state, next);
      if (after.options.length) return offering(graph, state, after.options);
      return after.next ? { ...state, status: "line" } : ended(state, "open");
    }
    if (node.type === "end") return ended(state, "end");
    if (node.type === "random") {
      const ways = successors(graph, next);
      if (!ways.length) return ended(state, "open");
      const roll = nextRandom(state.seed);
      const pick = Math.min(ways.length - 1, Math.floor(roll.value * ways.length));
      state = { ...state, seed: roll.seed };
      say({ kind: "flow", nodeId: next, text: `Random: took way ${pick + 1} of ${ways.length}` });
      landing = ways[pick];
      continue;
    }
    if (node.type === "call") {
      const target = callTarget(graph, next);
      if (!target) {
        say({ kind: "problem", nodeId: next, text: "This Call card doesn't call any card, so it's passed by." });
        continue;
      }
      if (state.calls.length >= MAX_CALL_DEPTH) {
        say({ kind: "problem", nodeId: next, text: `More than ${MAX_CALL_DEPTH} calls inside one another, so the play-through stops. Does a called branch call itself?` });
        return ended(state, "stuck");
      }
      state = { ...state, calls: [...state.calls, next] };
      say({ kind: "flow", nodeId: next, text: "Call" });
      landing = target;
      continue;
    }
    if (node.type === "return") {
      const back = state.calls.at(-1);
      if (!back || !graph.nodes[back]) {
        say({ kind: "problem", nodeId: next, text: "A Return with no Call to go back to, so the dialogue ends here." });
        return ended({ ...state, calls: [] }, "end");
      }
      state = { ...state, calls: state.calls.slice(0, -1), at: back };
      say({ kind: "flow", nodeId: next, text: "Return" });
      // On from the Call card's own jump.
      current = back;
      continue;
    }
    if (node.type === "set") {
      try {
        const before = state.variables;
        const variables = assign(parseAssignments(node.expr ?? ""), before);
        const changed = Object.keys(variables).filter((name) => variables[name] !== before[name] || !Object.hasOwn(before, name));
        state = { ...state, variables };
        say({ kind: "set", nodeId: next, text: changed.map((name) => `${name} = ${formatValue(variables[name])}`).join(", ") || "Nothing changed" });
      } catch (error) {
        say({ kind: "problem", nodeId: next, text: `Skipped “${node.expr ?? ""}”. ${message(error)}` });
      }
    } else if (node.type === "condition") {
      try {
        const result = truthy(evaluate(parseExpression(node.expr ?? ""), state.variables));
        outcome = result ? "true" : "false";
        say({ kind: "condition", nodeId: next, text: node.expr ?? "", result });
      } catch (error) {
        outcome = "false";
        say({ kind: "problem", nodeId: next, text: `Took “${node.expr ?? ""}” as false. ${message(error)}` });
      }
    }
    // Start and choice nodes reached by a plain jump are passed through.
  }
  say({ kind: "problem", nodeId: current, text: "This goes round in a loop without ever showing a line." });
  return ended(state, "stuck");
}

/** A new play-through, run up to its first line or choice. `seed`: for Random cards; a random one when left out. */
export function startPlay(graph: DialogueGraph, options: { seed?: number } = {}): PlayState {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 32);
  const state: PlayState = { variables: initialVariables(graph), transcript: [], at: null, status: "ended", options: [], picked: [], calls: [], seed };
  const start = startOf(graph);
  if (!start) {
    return { ...ended(state, "stuck"), transcript: [{ kind: "problem", nodeId: null, text: "There's no Start node to begin from." }] };
  }
  return run(graph, { ...state, at: start }, start);
}

/** After a line: on to whatever it jumps to. */
export function continuePlay(graph: DialogueGraph, state: PlayState): PlayState {
  if (state.status !== "line" || !state.at || !graph.nodes[state.at]) return state;
  return run(graph, state, state.at);
}

/** Picks one of the offered choices. */
export function choose(graph: DialogueGraph, state: PlayState, choiceId: string): PlayState {
  const option = state.options.find((o) => o.nodeId === choiceId);
  if (state.status !== "choices" || !option || !graph.nodes[choiceId]) return state;
  const picked: PlayState = {
    ...state,
    at: choiceId,
    picked: graph.nodes[choiceId].once && !state.picked.includes(choiceId) ? [...state.picked, choiceId] : state.picked,
    transcript: [...state.transcript, { kind: "choice", nodeId: choiceId, sid: option.sid, text: option.text }],
  };
  return run(graph, picked, choiceId);
}
