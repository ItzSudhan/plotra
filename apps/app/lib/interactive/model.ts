import * as Y from "yjs";
import { countWords, extractTags, type DocIndex, type ExtractedLink } from "../doc-index";

// A branching dialogue (plan.md 2.8 "Interactive & branching narrative") is a
// Yjs doc, edited live by everyone who has it open, like a storyboard canvas
// (lib/canvas.ts): maps of plain objects keyed by id. Each node, edge or
// variable is replaced whole when it changes, so edits to different nodes merge
// and edits to the same node resolve last-writer-wins.

export const DIALOGUE_NODES = "nodes";
export const DIALOGUE_EDGES = "edges";
export const DIALOGUE_VARIABLES = "variables";
export const DIALOGUE_META = "meta";

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

/** One translatable string of a dialogue: a line or a choice. */
export type DialogueString = {
  /** The stable String ID. */
  id: string;
  /** Who says it; empty for choices and unattributed lines. */
  speaker: string;
  text: string;
  kind: "line" | "choice";
  /** The writer's note, or what a choice replies to. */
  context: string;
};

export const dialogueMaps = (doc: Y.Doc) => ({
  nodes: doc.getMap<DialogueNode>(DIALOGUE_NODES),
  edges: doc.getMap<DialogueEdge>(DIALOGUE_EDGES),
  variables: doc.getMap<DialogueVariable>(DIALOGUE_VARIABLES),
  /** `counter`: the highest string number handed out, so a deleted line's id is never reused. */
  meta: doc.getMap<number>(DIALOGUE_META),
});

export type DialogueMaps = ReturnType<typeof dialogueMaps>;

export function dialogueGraph(doc: Y.Doc): DialogueGraph {
  const { nodes, edges, variables } = dialogueMaps(doc);
  return {
    nodes: nodes.toJSON() as Record<string, DialogueNode>,
    edges: edges.toJSON() as Record<string, DialogueEdge>,
    variables: variables.toJSON() as Record<string, DialogueVariable>,
  };
}

/** A dialogue read from a stored snapshot (`node.ydoc`). */
export function dialogueGraphFromUpdate(update: Uint8Array): DialogueGraph {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  const graph = dialogueGraph(doc);
  doc.destroy();
  return graph;
}

export const hasStringId = (type: DialogueNodeType) => type === "line" || type === "choice";

// ---- String IDs --------------------------------------------------------------------------

/** The prefix of a dialogue's string ids: the first hex digits of its binder node's id. */
export function stringIdPrefix(nodeId: string) {
  return nodeId.replace(/[^0-9a-f]/gi, "").slice(0, 4).toLowerCase() || "dlg";
}

const numberOf = (sid: string | undefined) => {
  const match = /_(\d+)$/.exec(sid ?? "");
  return match ? Number(match[1]) : 0;
};

/**
 * The next String ID (`d3f9_0007`): one past the highest number ever used in
 * this dialogue. Call inside the transaction that adds the node.
 */
export function nextStringId(maps: Pick<DialogueMaps, "nodes" | "meta">, prefix: string) {
  let highest = maps.meta.get("counter") ?? 0;
  maps.nodes.forEach((node) => {
    highest = Math.max(highest, numberOf(node.sid));
  });
  const next = highest + 1;
  maps.meta.set("counter", next);
  return `${prefix}_${String(next).padStart(4, "0")}`;
}

/**
 * Two people adding lines at the same moment can be handed the same number.
 * This gives the later node (by id, so every client picks the same one) a new
 * id, and fills in ids that are missing. Returns how many it changed.
 */
export function repairStringIds(maps: Pick<DialogueMaps, "nodes" | "meta">, prefix: string) {
  const owner = new Map<string, string>();
  const fix: string[] = [];
  for (const id of [...maps.nodes.keys()].sort()) {
    const node = maps.nodes.get(id)!;
    if (!hasStringId(node.type)) continue;
    if (!node.sid || owner.has(node.sid)) fix.push(id);
    else owner.set(node.sid, id);
  }
  for (const id of fix) maps.nodes.set(id, { ...maps.nodes.get(id)!, sid: nextStringId(maps, prefix) });
  return fix.length;
}

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

const oneLine = (text: string | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

function stringsOf(graph: DialogueGraph, speakerName?: (nodeId: string) => string | undefined): DialogueString[] {
  // What each choice answers: the first line, in reading order, that offers it (through any conditions in between).
  const askedBy = new Map<string, string>();
  const order = orderedNodes(graph);
  for (const id of order) {
    const line = graph.nodes[id];
    if (line.type !== "line") continue;
    const seen = new Set<string>();
    const look = (from: string) => {
      for (const target of successors(graph, from)) {
        const node = graph.nodes[target];
        if (node.type === "choice" && !askedBy.has(target)) askedBy.set(target, oneLine(line.text));
        else if (node.type === "condition" && !seen.has(target)) {
          seen.add(target);
          look(target);
        }
      }
    };
    look(id);
  }
  const strings: DialogueString[] = [];
  for (const id of order) {
    const node = graph.nodes[id];
    if (!hasStringId(node.type) || !node.sid) continue;
    const asked = askedBy.get(id);
    strings.push({
      id: node.sid,
      speaker: node.type === "line" ? (node.speakerId && speakerName?.(node.speakerId)) || node.speaker?.trim() || "" : "",
      text: node.text ?? "",
      kind: node.type as "line" | "choice",
      context: oneLine(node.note) || (asked ? `Reply to: ${asked.length > 120 ? `${asked.slice(0, 119)}…` : asked}` : ""),
    });
  }
  return strings;
}

/** A graph's lines and choices, in reading order. */
export const graphStrings = stringsOf;

/**
 * Every line and choice of a dialogue with its String ID, in reading order: for
 * localization and the CSV export. `speakerName` turns a character note's id
 * into its title; without it only typed-in speaker names are filled in.
 */
export function dialogueStrings(doc: Y.Doc, speakerName?: (nodeId: string) => string | undefined): DialogueString[] {
  return stringsOf(dialogueGraph(doc), speakerName);
}

/** Text, words and links of a dialogue, for search, word counts and the graph. */
export function indexDialogue(doc: Y.Doc): DocIndex {
  const graph = dialogueGraph(doc);
  // Searchable text names the speaker; the word count is of what's said only.
  const lines: string[] = [];
  const said: string[] = [];
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();
  for (const id of orderedNodes(graph)) {
    const node = graph.nodes[id];
    if (!hasStringId(node.type)) continue;
    const text = node.text?.trim();
    if (text) {
      said.push(text);
      lines.push(node.type === "line" && node.speaker?.trim() && !node.speakerId ? `${node.speaker.trim()}: ${text}` : text);
    }
    if (node.type === "line" && node.speakerId && !seen.has(node.speakerId)) {
      seen.add(node.speakerId);
      links.push({ targetNodeId: node.speakerId, targetHeading: null, kind: "wiki", context: "Speaks in the dialogue" });
    }
  }
  const text = lines.join("\n");
  const spoken = said.join("\n");
  return {
    text,
    words: countWords(spoken),
    characters: spoken.replace(/\n/g, "").length,
    headings: [],
    tags: extractTags(spoken),
    links: links.slice(0, 500),
    facts: [],
  };
}
