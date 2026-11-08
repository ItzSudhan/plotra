import type { DialogueEdge, DialogueGraph, DialogueNode, DialogueVariable } from "@/lib/interactive/model";

// Small dialogues for the interactive-narrative tests, built by hand.

type Card = Partial<DialogueNode> & Pick<DialogueNode, "type">;

/**
 * A graph from cards laid out top to bottom in the order given (so choices are
 * offered in that order), jumps as `[from, to, side?]`, and variables.
 */
export function graph(cards: Record<string, Card>, jumps: Array<[string, string, ("true" | "false")?]>, variables: Record<string, DialogueVariable["value"]> = {}): DialogueGraph {
  const nodes: Record<string, DialogueNode> = {};
  Object.entries(cards).forEach(([id, card], i) => {
    nodes[id] = { x: i * 10, y: i * 100, ...card };
  });
  const edges: Record<string, DialogueEdge> = {};
  jumps.forEach(([source, target, side], i) => {
    edges[`e${String(i).padStart(2, "0")}`] = { source, target, ...(side && { sourceHandle: side }) };
  });
  const vars: Record<string, DialogueVariable> = {};
  Object.entries(variables).forEach(([name, value], order) => {
    vars[`v${order}`] = { name, value, order };
  });
  return { nodes, edges, variables: vars };
}

/** Anna asks for gold; one reply needs 5 gold, and paying takes it. */
export const gate = () =>
  graph(
    {
      start: { type: "start" },
      l1: { type: "line", sid: "abcd_0001", speaker: "Anna", text: "The toll is five gold." },
      c1: { type: "condition", expr: "gold >= 5" },
      ch1: { type: "choice", sid: "abcd_0002", text: "Pay her." },
      ch2: { type: "choice", sid: "abcd_0003", text: "Walk away." },
      s1: { type: "set", expr: "gold -= 5; paid = true" },
      l2: { type: "line", sid: "abcd_0004", speaker: "Anna", text: "Go on through." },
      end: { type: "end" },
    },
    [
      ["start", "l1"],
      ["l1", "c1"],
      ["c1", "ch1", "true"],
      ["l1", "ch2"],
      ["ch1", "s1"],
      ["s1", "l2"],
      ["l2", "end"],
      ["ch2", "end"],
    ],
    { gold: 10, paid: false },
  );

/** A guard's bark, picked at random, then the line every bark leads to. */
export const barks = () =>
  graph(
    {
      start: { type: "start" },
      r: { type: "random" },
      a: { type: "line", sid: "abcd_0001", speaker: "Guard", text: "Halt!" },
      b: { type: "line", sid: "abcd_0002", speaker: "Guard", text: "Who goes there?" },
      c: { type: "line", sid: "abcd_0003", speaker: "Guard", text: "Stop right there." },
      l: { type: "line", sid: "abcd_0004", speaker: "Guard", text: "Papers, please." },
      end: { type: "end" },
    },
    [
      ["start", "r"],
      ["r", "a"],
      ["r", "b"],
      ["r", "c"],
      ["a", "l"],
      ["b", "l"],
      ["c", "l"],
      ["l", "end"],
    ],
  );

/**
 * A greeting played as a call, with a call to the weather inside it: the
 * greeting's choices either ask the news (a second call) or nod, both returning;
 * leaving for good ends the whole dialogue from inside the call.
 */
export const errands = () =>
  graph(
    {
      start: { type: "start" },
      l1: { type: "line", sid: "abcd_0001", speaker: "Mae", text: "Morning." },
      call1: { type: "call", target: "g0" },
      l2: { type: "line", sid: "abcd_0002", speaker: "Mae", text: "Off you go, then." },
      end: { type: "end" },
      g0: { type: "set", expr: "met += 1" },
      g1: { type: "line", sid: "abcd_0003", speaker: "Bo", text: "Greetings. You've met me {$met} times." },
      ch1: { type: "choice", sid: "abcd_0004", text: "Any news?" },
      ch2: { type: "choice", sid: "abcd_0005", text: "Nod." },
      ch3: { type: "choice", sid: "abcd_0006", text: "Leave for good." },
      call2: { type: "call", target: "w1" },
      ret1: { type: "return" },
      gone: { type: "end" },
      w1: { type: "line", sid: "abcd_0007", speaker: "Bo", text: "Rain again." },
      ret2: { type: "return" },
    },
    [
      ["start", "l1"],
      ["l1", "call1"],
      ["call1", "l2"],
      ["l2", "end"],
      ["g0", "g1"],
      ["g1", "ch1"],
      ["g1", "ch2"],
      ["g1", "ch3"],
      ["ch1", "call2"],
      ["call2", "ret1"],
      ["ch2", "ret1"],
      ["ch3", "gone"],
      ["w1", "ret2"],
    ],
    { met: 0 },
  );
