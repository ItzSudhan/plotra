// A branching dialogue as plain data, and how to read it: a copy of the parts of the
// web's apps/app/lib/interactive/model.ts that the play-through needs (without
// Yjs: the server sends the graph as JSON), so the phone plays a dialogue
// exactly as the web's preview does. Keep it in step with the web.

export const dialogueNodeTypes = ["start", "line", "choice", "condition", "set", "random", "call", "return", "end"] as const;
export type DialogueNodeType = (typeof dialogueNodeTypes)[number];

export type DialogueNode = {
  type: DialogueNodeType;
  x: number;
  y: number;
  /**
   * Lines and choices: the stable String ID, given once when the node is made
   * and never changed by editing the text. Translations and voice files hang on it.
   */
  sid?: string;
  /** Lines: the character note who speaks… */
  speakerId?: string;
  /** …or a name typed in, for speakers without a note. */
  speaker?: string;
  /** Lines: what's said. Choices: the option the player picks. */
  text?: string;
  /** Conditions: the expression tested. Sets: the assignments (`gold += 5; met_anna = true`). */
  expr?: string;
  /** Lines and choices: a note for translators and actors, exported as the string's context. */
  note?: string;
  /** Choices: offered only until the player has picked it once (Ink's `*`). */
  once?: boolean;
  /**
   * Calls: the card the called branch begins at. Play goes there, and when the
   * branch reaches a Return card it comes back and follows the Call's own jump.
   */
  target?: string;
};

/** A jump. Out of a condition, `sourceHandle` says which outcome takes it. */
export type DialogueEdge = { source: string; target: string; sourceHandle?: "true" | "false" };

export type DialogueValue = string | number | boolean;

/** A variable and the value it starts a play-through with. */
export type DialogueVariable = { name: string; value: DialogueValue; order: number };

/** A dialogue as plain data: what the play-through, the exporters and version history work on. */
export type DialogueGraph = {
  nodes: Record<string, DialogueNode>;
  edges: Record<string, DialogueEdge>;
  variables: Record<string, DialogueVariable>;
};

export const hasStringId = (type: DialogueNodeType) => type === "line" || type === "choice";

// ---- Reading the graph -----------------------------------------------------------------------

const byPlace = (nodes: Record<string, DialogueNode>) => (a: string, b: string) => {
  const na = nodes[a];
  const nb = nodes[b];
  return na.y - nb.y || na.x - nb.x || (a < b ? -1 : a > b ? 1 : 0);
};

/** The Start node: the topmost one, should a merge ever leave two. */
export function startOf(graph: DialogueGraph): string | null {
  return (
    Object.keys(graph.nodes)
      .filter((id) => graph.nodes[id].type === "start")
      .sort(byPlace(graph.nodes))[0] ?? null
  );
}

/**
 * Where a node's jumps lead, top to bottom as drawn (which is the order choices
 * are offered in). For a condition, pass the outcome to follow.
 */
export function successors(graph: DialogueGraph, id: string, outcome?: "true" | "false"): string[] {
  const from = graph.nodes[id];
  if (!from) return [];
  const targets = new Set<string>();
  for (const edge of Object.values(graph.edges)) {
    if (edge.source !== id || !graph.nodes[edge.target]) continue;
    // An edge out of a condition without a handle counts as its "true" side.
    if (from.type === "condition" && outcome && (edge.sourceHandle ?? "true") !== outcome) continue;
    targets.add(edge.target);
  }
  return [...targets].sort(byPlace(graph.nodes));
}

/** Calls inside calls a play-through follows before it stops (the call stack's depth). */
export const MAX_CALL_DEPTH = 32;

/** The card a Call card calls, when there is one and it still exists. */
export function callTarget(graph: DialogueGraph, id: string): string | null {
  const node = graph.nodes[id];
  return node?.type === "call" && node.target && graph.nodes[node.target] ? node.target : null;
}

/** Where a node leads in any way: its jumps and, for a Call, the card it calls. For walks over the whole graph. */
export function linksOf(graph: DialogueGraph, id: string): string[] {
  const next = successors(graph, id);
  const called = callTarget(graph, id);
  return called && !next.includes(called) ? [called, ...next] : next;
}

/**
 * Every node in reading order: following the jumps from Start, each branch to
 * its end before the next one, then whatever isn't reachable.
 */
export function orderedNodes(graph: DialogueGraph): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const walk = (first: string) => {
    const stack = [first];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id);
      stack.push(...linksOf(graph, id).reverse());
    }
  };
  const start = startOf(graph);
  if (start) walk(start);
  for (const id of Object.keys(graph.nodes).sort(byPlace(graph.nodes))) walk(id);
  return order;
}
