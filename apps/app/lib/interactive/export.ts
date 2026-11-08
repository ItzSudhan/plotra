import { formatExpr, not, parseAssignments, parseExpression, ExprError, VARIABLE_NAME, type Assignment, type Expr, type ExprStyle } from "./expr";
import { callTarget, graphStrings, orderedNodes, startOf, successors, type DialogueGraph, type DialogueString, type DialogueValue } from "./model";
import { textParts } from "./text";

// Exports of a branching dialogue (plan.md 2.8): JSON and a CSV of its strings,
// and scripts for Ink, Yarn Spinner and Twine (Twee 3, SugarCube). Pure, so it
// runs in the browser for a download and in tests.
//
// The three script formats are written from one outline of the dialogue
// (`buildScript`): passages of lines, assignments, choices and branches. A
// passage starts wherever jumps meet; a run of lines that only follow each
// other stays in one passage, so the output reads like a script, not a graph.
//
// A once-only choice is Ink's `*` and Yarn's `<<once>>`; Twine has no such
// thing, so it gets a variable set when the choice is picked. `{$name}` in a
// text is Ink's `{name}`, Yarn's `{$name}` and SugarCube's `<<print $name>>`.
//
// A Random card is Ink's shuffle (`{~-> a|-> b}`), a chain of Yarn `<<if
// dice(n) == 1>>` tests (each way as likely as the others) and SugarCube's
// `either()`. A Call card is an Ink tunnel (`-> a ->`, back with `->->`), a
// Yarn `<<detour>>` (back with `<<return>>`) and, in SugarCube, a stack of
// passages to go back to in a story variable. In Yarn a `<<jump>>` inside a
// detour forgets where to return to, so in passages a call can reach, a jump is
// written `<<detour passage>>` then `<<return>>`, which goes there and keeps it.

export const exportFormats = [
  { id: "json", label: "JSON", extension: "json", mime: "application/json" },
  { id: "csv", label: "CSV of strings", extension: "csv", mime: "text/csv" },
  { id: "ink", label: "Ink", extension: "ink", mime: "text/plain" },
  { id: "yarn", label: "Yarn Spinner", extension: "yarn", mime: "text/plain" },
  { id: "twee", label: "Twine (Twee 3)", extension: "twee", mime: "text/plain" },
] as const;

export type ExportFormat = (typeof exportFormats)[number]["id"];

export type ExportOptions = {
  title: string;
  /** Turns a character note's id into its name. */
  speakerName?: (nodeId: string) => string | undefined;
  /** Twine's story id (an upper-case UUID). The dialogue's own id is a good one. */
  ifid?: string;
};

// ---- CSV -----------------------------------------------------------------------------------

const csvCell = (value: string) => (/[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** RFC 4180 CSV: CRLF rows, cells quoted only when they need it. */
export const toCsv = (rows: string[][]) => rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";

export const stringsCsvHeader = ["id", "speaker", "text", "kind", "context"];

export function stringsToCsv(strings: DialogueString[]) {
  return toCsv([stringsCsvHeader, ...strings.map((s) => [s.id, s.speaker, s.text, s.kind, s.context])]);
}

// ---- JSON ----------------------------------------------------------------------------------

export function toJson(graph: DialogueGraph, options: ExportOptions) {
  const order = orderedNodes(graph);
  return (
    JSON.stringify(
      {
        format: "plotra-dialogue",
        version: 1,
        title: options.title,
        start: startOf(graph),
        variables: variablesOf(graph),
        nodes: order.map((id) => {
          const node = graph.nodes[id];
          const speaker = (node.speakerId && options.speakerName?.(node.speakerId)) || node.speaker;
          return {
            id,
            type: node.type,
            ...(node.sid && { stringId: node.sid }),
            ...(node.type === "line" && speaker && { speaker }),
            ...(node.type === "line" && node.speakerId && { speakerId: node.speakerId }),
            ...(node.text !== undefined && (node.type === "line" || node.type === "choice") && { text: node.text }),
            ...(node.expr !== undefined && (node.type === "condition" || node.type === "set") && { expression: node.expr }),
            ...(node.note && { note: node.note }),
            ...(node.type === "call" && node.target && { target: node.target }),
            x: node.x,
            y: node.y,
          };
        }),
        edges: Object.keys(graph.edges)
          .sort()
          .filter((id) => graph.nodes[graph.edges[id].source] && graph.nodes[graph.edges[id].target])
          .map((id) => {
            const edge = graph.edges[id];
            const branch = graph.nodes[edge.source].type === "condition" ? (edge.sourceHandle ?? "true") : undefined;
            return { id, from: edge.source, to: edge.target, ...(branch && { branch }) };
          }),
        strings: graphStrings(graph, options.speakerName),
      },
      null,
      2,
    ) + "\n"
  );
}

function variablesOf(graph: DialogueGraph): Array<{ name: string; value: DialogueValue }> {
  const seen = new Set<string>();
  return Object.values(graph.variables)
    .sort((a, b) => a.order - b.order)
    // A name the editor would refuse (from an old or hand-made doc) would break every script.
    .filter((v) => VARIABLE_NAME.test(v.name) && !seen.has(v.name) && seen.add(v.name))
    .map((v) => ({ name: v.name, value: v.value }));
}

// ---- The outline the script formats are written from -----------------------------------------

/** A passage to go to, or null for "the dialogue ends". */
type Jump = string | null;

type Step =
  | { kind: "line"; sid?: string; speaker: string; text: string }
  /** `assignments` is null when the text couldn't be read. */
  | { kind: "set"; source: string; assignments: Assignment[] | null }
  /**
   * `fallback`: when every option sits behind a condition, where the dialogue
   * goes if none of them holds (as in the play-through). Undefined otherwise.
   */
  | { kind: "choices"; options: ScriptOption[]; fallback?: Jump }
  | { kind: "branch"; source: string; condition: Expr | null; yes: Jump; no: Jump }
  | { kind: "jump"; to: string }
  /** A Random card: one of these, picked at random. */
  | { kind: "random"; to: Jump[] }
  /** A Call card: `to` (null when it calls nothing), then on to `then` once the call returns. */
  | { kind: "call"; to: string | null; then: Jump }
  | { kind: "return" }
  | { kind: "end" };

/** `once`: offered only until it's been picked. */
type ScriptOption = { sid?: string; text: string; guard: Expr | null; to: Jump; once?: boolean };

type Passage = { name: string; x: number; y: number; steps: Step[] };

export type Script = { first: Jump; passages: Passage[]; variables: Array<{ name: string; value: DialogueValue }> };

function tryParse<T>(parse: () => T): T | null {
  try {
    return parse();
  } catch (error) {
    if (error instanceof ExprError) return null;
    throw error;
  }
}

const both = (a: Expr | null, b: Expr): Expr => (a ? { kind: "binary", op: "&&", left: a, right: b } : b);

export function buildScript(graph: DialogueGraph, options: Pick<ExportOptions, "speakerName"> = {}): Script {
  const indegree = new Map<string, number>();
  for (const edge of Object.values(graph.edges)) {
    if (graph.nodes[edge.source] && graph.nodes[edge.target]) indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }
  // A card a Call card calls is always the head of a passage, never written inside another.
  for (const id of Object.keys(graph.nodes)) {
    const called = callTarget(graph, id);
    if (called) indegree.set(called, (indegree.get(called) ?? 0) + 2);
  }

  // Passage names: letters, digits and underscores, which all three formats accept.
  const taken = new Set<string>();
  const unique = (wanted: string) => {
    let name = wanted;
    for (let n = 2; taken.has(name); n++) name = `${wanted}_${n}`;
    taken.add(name);
    return name;
  };
  const names = new Map<string, string>();
  const nameOf = (id: string) => {
    let name = names.get(id);
    if (!name) {
      const node = graph.nodes[id];
      const tail = (node.sid ?? id.replace(/-/g, "").slice(0, 6)).replace(/[^A-Za-z0-9_]/g, "_");
      names.set(id, (name = unique(`${node.type}_${tail}`)));
    }
    return name;
  };

  const passages: Passage[] = [];
  /** Nodes already written, as the head of a passage or inside one. */
  const written = new Set<string>();
  const requested = new Set<string>();
  const queue: string[] = [];
  const passage = (id: string) => {
    if (!requested.has(id)) {
      requested.add(id);
      queue.push(id);
    }
    return nameOf(id);
  };

  /** The choices a node leads to, each with the conditions it sits behind (see `ahead` in play.ts). */
  const choicesAhead = (id: string, outcome?: "true" | "false") => {
    const found: Array<{ id: string; guard: Expr | null }> = [];
    const seen = new Set<string>();
    const look = (from: string, side: "true" | "false" | undefined, guard: Expr | null) => {
      for (const target of successors(graph, from, side)) {
        const node = graph.nodes[target];
        if (node.type === "choice") {
          if (!found.some((f) => f.id === target)) found.push({ id: target, guard });
        } else if (node.type === "condition" && !seen.has(target)) {
          seen.add(target);
          const condition = tryParse(() => parseExpression(node.expr ?? ""));
          // Like the play-through, a condition that can't be read offers nothing.
          if (!condition) continue;
          look(target, "true", both(guard, condition));
          look(target, "false", both(guard, not(condition)));
        }
      }
    };
    look(id, outcome, null);
    // Conditions that only decide which choices show are part of the choices, not passages of their own.
    if (found.length) for (const condition of seen) written.add(condition);
    return found;
  };

  /** Tails worked out so far. One still without a `jump` is being worked out further up the call stack. */
  const tails = new Map<string, { name?: string; jump?: Jump }>();

  /** Where a choice or one side of a condition leads, as a single jump. */
  const tail = (id: string, outcome?: "true" | "false"): Jump => {
    const key = `${id}/${outcome ?? ""}`;
    const known = tails.get(key);
    const ownName = () => unique(`${nameOf(id)}_${outcome ?? "then"}`);
    if (known) {
      if (known.jump !== undefined) return known.jump;
      // Asked for again while it's being worked out (choices in a loop): it needs a passage of its own.
      return (known.name ??= ownName());
    }
    const entry: { name?: string; jump?: Jump } = {};
    tails.set(key, entry);
    const steps = after(id, outcome, false);
    const only = steps.length === 1 ? steps[0] : null;
    if (!entry.name && only?.kind === "jump") entry.jump = only.to;
    else if (!entry.name && only?.kind === "end") entry.jump = null;
    else {
      // More choices straight after: they get a passage to themselves.
      const node = graph.nodes[id];
      entry.name ??= ownName();
      passages.push({ name: entry.name, x: node.x + 140, y: node.y + (outcome === "false" ? 80 : 0), steps });
      entry.jump = entry.name;
    }
    return entry.jump;
  };

  /** What comes after a node: choices, the next node's steps (when only this node leads to it), or a jump. */
  const after = (id: string, outcome: "true" | "false" | undefined, inline: boolean): Step[] => {
    const choices = choicesAhead(id, outcome);
    // The topmost jump that isn't a choice: where the play-through goes with nothing on offer.
    const next = successors(graph, id, outcome).find((target) => graph.nodes[target].type !== "choice");
    if (choices.length) {
      const options = choices.map((choice): ScriptOption => {
        written.add(choice.id);
        const node = graph.nodes[choice.id];
        return { sid: node.sid, text: node.text ?? "", guard: choice.guard, to: tail(choice.id), ...(node.once && { once: true }) };
      });
      // With no choice on offer the play-through moves on to the topmost jump, so the script does too.
      const guarded = options.every((option) => option.guard || option.once);
      return [{ kind: "choices", options, ...(guarded && { fallback: next ? passage(next) : null }) }];
    }
    if (!next) return [{ kind: "end" }];
    const alone = indegree.get(next) === 1 && !requested.has(next) && !written.has(next) && graph.nodes[next].type !== "start";
    return inline && alone ? stepsOf(next) : [{ kind: "jump", to: passage(next) }];
  };

  const stepsOf = (id: string): Step[] => {
    written.add(id);
    const node = graph.nodes[id];
    switch (node.type) {
      case "line":
        return [
          {
            kind: "line",
            sid: node.sid,
            speaker: (node.speakerId && options.speakerName?.(node.speakerId)) || node.speaker?.trim() || "",
            text: node.text ?? "",
          },
          ...after(id, undefined, true),
        ];
      case "set":
        return [{ kind: "set", source: node.expr ?? "", assignments: tryParse(() => parseAssignments(node.expr ?? "")) }, ...after(id, undefined, true)];
      case "condition":
        return [
          {
            kind: "branch",
            source: node.expr ?? "",
            condition: tryParse(() => parseExpression(node.expr ?? "")),
            yes: tail(id, "true"),
            no: tail(id, "false"),
          },
        ];
      case "end":
        return [{ kind: "end" }];
      case "return":
        return [{ kind: "return" }];
      case "random": {
        const ways = successors(graph, id);
        if (ways.length < 2) return ways.length ? [{ kind: "jump", to: passage(ways[0]) }] : [{ kind: "end" }];
        return [{ kind: "random", to: ways.map((way) => passage(way)) }];
      }
      case "call": {
        const called = callTarget(graph, id);
        return [{ kind: "call", to: called && passage(called), then: tail(id) }];
      }
      case "choice":
        // A choice nothing leads to: offered on its own.
        return [{ kind: "choices", options: [{ sid: node.sid, text: node.text ?? "", guard: null, to: tail(id), ...(node.once && { once: true }) }] }];
      case "start":
        return after(id, undefined, true);
    }
  };

  const drain = () => {
    while (queue.length) {
      const id = queue.shift()!;
      const node = graph.nodes[id];
      const name = nameOf(id);
      const at = passages.length;
      const steps = stepsOf(id);
      // Before any passages made for its choices, so the script reads top to bottom.
      passages.splice(at, 0, { name, x: node.x, y: node.y, steps });
    }
  };

  const start = startOf(graph);
  let first: Jump = null;
  if (start) {
    written.add(start);
    first = tail(start);
    drain();
  }
  // Whatever Start doesn't reach is still written out, so an export never drops text.
  const rest = orderedNodes(graph).filter((id) => graph.nodes[id].type !== "start");
  for (const loose of [true, false]) {
    for (const id of rest) {
      if (written.has(id) || requested.has(id) || (loose && indegree.get(id))) continue;
      passage(id);
      drain();
    }
  }
  return { first, passages, variables: [...variablesOf(graph), ...implicitVariables(graph)] };
}

/** An empty value of the kind an expression gives, as far as can be told without running it. */
function emptyLike(expr: Expr): DialogueValue {
  if (expr.kind === "literal") return typeof expr.value === "string" ? "" : typeof expr.value === "boolean" ? false : 0;
  if (expr.kind === "unary") return expr.op === "!" ? false : 0;
  if (expr.kind === "binary") {
    if (["==", "!=", "<", "<=", ">", ">=", "&&", "||"].includes(expr.op)) return false;
    if (expr.op === "+") {
      const left = emptyLike(expr.left);
      return typeof left === "string" ? left : emptyLike(expr.right);
    }
  }
  return 0;
}

/**
 * Variables a Set card makes with `=` without them being declared. The
 * play-through makes them on the spot; Ink and Yarn want them declared, so
 * they're declared with an empty value of the kind first assigned.
 */
function implicitVariables(graph: DialogueGraph): Array<{ name: string; value: DialogueValue }> {
  const known = new Set(variablesOf(graph).map((v) => v.name));
  const found: Array<{ name: string; value: DialogueValue }> = [];
  for (const id of orderedNodes(graph)) {
    const node = graph.nodes[id];
    if (node.type !== "set") continue;
    for (const a of tryParse(() => parseAssignments(node.expr ?? "")) ?? []) {
      if (a.op !== "=" || known.has(a.name)) continue;
      known.add(a.name);
      const value = emptyLike(a.value);
      found.push({ name: a.name, value });
    }
  }
  return found;
}

/** Where a step can go next in the same call: every jump but a call's own (that one is a call further in). */
function jumpsOf(step: Step): Jump[] {
  switch (step.kind) {
    case "choices":
      return [...step.options.map((o) => o.to), ...(step.fallback !== undefined ? [step.fallback] : [])];
    case "branch":
      return [step.yes, step.no];
    case "jump":
      return [step.to];
    case "random":
      return step.to;
    case "call":
      return [step.then];
    default:
      return [];
  }
}

/** Passages that can be played inside a call: those a call goes to, and every passage they lead on to. */
function calledPassages(script: Script): Set<string> {
  const byName = new Map(script.passages.map((p) => [p.name, p]));
  const called = new Set<string>();
  const stack = script.passages.flatMap((p) => p.steps.flatMap((step) => (step.kind === "call" && step.to ? [step.to] : [])));
  while (stack.length) {
    const name = stack.pop()!;
    if (called.has(name)) continue;
    called.add(name);
    for (const step of byName.get(name)?.steps ?? []) for (const to of jumpsOf(step)) if (to) stack.push(to);
  }
  return called;
}

// ---- Ink -------------------------------------------------------------------------------------

const oneLine = (text: string) => text.replace(/\s*\n\s*/g, " ").trim();

/** A choice with no text yet still has to be something to click. */
const EMPTY_CHOICE = "…";

/** Words Ink keeps for itself; a variable with one of these names gets a `_var` ending. */
const INK_RESERVED = new Set(["VAR", "CONST", "LIST", "INCLUDE", "EXTERNAL", "function", "return", "else", "temp", "ref", "DONE", "END", "not", "and", "or", "mod", "has", "hasnt", "true", "false"]);
const inkName = (name: string) => (INK_RESERVED.has(name) ? `${name}_var` : name);

const inkStyle: ExprStyle = {
  variable: inkName,
  // Ink has no way to put a double quote inside a string.
  string: (value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, "'")}"`,
  operators: { "!": "not" },
};

/** Text with everything Ink would read as markup escaped: tags, logic, comments, diverts and glue. `{$name}` is Ink's `{name}`. */
const inkText = (text: string) =>
  textParts(oneLine(text))
    .map((part) =>
      "variable" in part
        ? `{${inkName(part.variable)}}`
        : part.text
            .replace(/[\\#{}|[\]]/g, "\\$&")
            .replace(/\/(?=[/*])/g, "\\/")
            .replace(/->/g, "-\\>")
            .replace(/<(?=[->])/g, "\\<"),
    )
    .join("");

/** Text at the start of an Ink line mustn't look like a choice, gather, knot, divert, logic or a TODO note. */
const inkLineStart = (text: string) => (/^([*+\-=~<]|TODO\s*:)/.test(text) ? `\\${text}` : text);

const inkValue = (value: DialogueValue) => (typeof value === "string" ? inkStyle.string(value) : String(value));

export function toInk(graph: DialogueGraph, options: ExportOptions) {
  const script = buildScript(graph, options);
  const divert = (to: Jump) => `-> ${to ?? "END"}`;
  const out: string[] = [`// ${oneLine(options.title)}`, "// Exported from Plotra. Each line and choice carries its String ID as an “id:” tag.", ""];
  for (const v of script.variables) out.push(`VAR ${inkName(v.name)} = ${inkValue(v.value)}`);
  if (script.variables.length) out.push("");
  out.push(divert(script.first));

  for (const p of script.passages) {
    out.push("", `=== ${p.name} ===`);
    for (const step of p.steps) {
      switch (step.kind) {
        case "line": {
          const text = inkText(step.text);
          const said = inkLineStart(step.speaker ? `${inkText(step.speaker)}: ${text}` : text);
          // A line nobody has written yet is left as a note: a tag by itself would stick to the next line.
          out.push(said ? `${said}${step.sid ? ` # id:${step.sid}` : ""}` : `// An empty line${step.sid ? ` (id:${step.sid})` : ""}`);
          break;
        }
        case "set":
          if (!step.assignments) out.push(`// TODO: couldn't read this assignment: ${oneLine(step.source)}`);
          else for (const a of step.assignments) out.push(`~ ${inkName(a.name)} ${a.op} ${formatExpr(a.value, inkStyle)}`);
          break;
        case "choices":
          // Sticky (+), so a choice can be offered again when the dialogue loops back, as in the preview; a once-only one is *.
          for (const option of step.options) {
            const guard = option.guard ? `{${formatExpr(option.guard, inkStyle)}} ` : "";
            // The tag sits inside the brackets so it belongs to the choice, not to what's printed after it.
            out.push(`${option.once ? "*" : "+"} ${guard}[${inkText(option.text) || EMPTY_CHOICE}${option.sid ? ` # id:${option.sid}` : ""}]`, `    ${divert(option.to)}`);
          }
          // A fallback choice: taken by itself when none of the others is offered.
          if (step.fallback !== undefined) out.push(`+ ${divert(step.fallback)}`);
          break;
        case "branch":
          if (!step.condition) out.push(`// TODO: couldn't read this condition, so it's taken as false: ${oneLine(step.source)}`, divert(step.no));
          else out.push(`{ ${formatExpr(step.condition, inkStyle)}:`, `    ${divert(step.yes)}`, "- else:", `    ${divert(step.no)}`, "}");
          break;
        case "jump":
          out.push(divert(step.to));
          break;
        case "random":
          // A shuffle whose ways are diverts.
          out.push(`{~${step.to.map(divert).join("|")}}`);
          break;
        case "call":
          // A tunnel: on to the next line once the called passage reaches ->->.
          if (step.to) out.push(`-> ${step.to} ->`);
          else out.push("// TODO: a Call card that calls nothing; it's passed by");
          out.push(divert(step.then));
          break;
        case "return":
          out.push("->->");
          break;
        case "end":
          out.push("-> END");
      }
    }
  }
  return out.join("\n") + "\n";
}

// ---- Yarn Spinner ----------------------------------------------------------------------------

const yarnStyle: ExprStyle = {
  variable: (name) => `$${name}`,
  string: (value) => `"${value.replace(/[\\"]/g, "\\$&")}"`,
};

/**
 * Text with everything Yarn would read as markup escaped. Yarn only lets a
 * backslash escape \ < > { } # / [ ] and :, so the shapes that start an
 * option, a line group or the end of a node are broken up another way.
 */
const yarnText = (text: string) =>
  textParts(oneLine(text))
    .map((part, i) => {
      if ("variable" in part) return `{$${part.variable}}`;
      const escaped = part.text
        .replace(/[\\#{}[\]]/g, "\\$&")
        .replace(/<</g, "\\<\\<")
        .replace(/>>/g, "\\>\\>")
        .replace(/\/\//g, "\\/\\/");
      // Only the start of the text can look like an option, a line group or a node's end.
      return i === 0 ? escaped.replace(/^([-=])>/, "$1\\>").replace(/^===/, '{"="}==') : escaped;
    })
    .join("");

const yarnValue = (value: DialogueValue) => (typeof value === "string" ? yarnStyle.string(value) : String(value));

export function toYarn(graph: DialogueGraph, options: ExportOptions) {
  const script = buildScript(graph, options);
  const called = calledPassages(script);
  /** In a passage a call can reach, a jump keeps where to return to (a plain <<jump>> would forget it). */
  let inCall = false;
  const jump = (to: Jump, indent = "") => (!to ? "<<stop>>" : inCall ? `<<detour ${to}>>\n${indent}<<return>>` : `<<jump ${to}>>`);
  const out: string[] = ["title: Start", "---", `// ${oneLine(options.title)}. Exported from Plotra.`];
  // Yarn wants every #line: tag to be unique; a choice offered from two places is tagged once.
  const tagged = new Set<string>();
  const tag = (sid: string | undefined) => {
    if (!sid) return "";
    if (tagged.has(sid)) return ` // the same string as ${sid}`;
    tagged.add(sid);
    return ` #line:${sid}`;
  };
  for (const v of script.variables) out.push(`<<declare $${v.name} = ${yarnValue(v.value)}>>`);
  out.push(jump(script.first), "===");

  for (const p of script.passages) {
    out.push(`title: ${p.name}`, `position: ${Math.round(p.x)},${Math.round(p.y)}`, "---");
    inCall = called.has(p.name);
    for (const step of p.steps) {
      switch (step.kind) {
        case "line": {
          // Without a speaker, a colon in the text would be read as naming one.
          const said = step.speaker ? `${yarnText(step.speaker).replace(/:/g, "\\:")}: ${yarnText(step.text)}` : yarnText(step.text).replace(/:/g, "\\:");
          out.push(said ? `${said}${tag(step.sid)}` : `// An empty line${step.sid ? ` (${step.sid})` : ""}`);
          break;
        }
        case "set":
          if (!step.assignments) out.push(`// TODO: couldn't read this assignment: ${oneLine(step.source)}`);
          else {
            for (const a of step.assignments) {
              const value = formatExpr(a.value, yarnStyle, a.op === "=" ? -1 : 5);
              out.push(`<<set $${a.name} to ${a.op === "=" ? value : `$${a.name} ${a.op[0]} ${value}`}>>`);
            }
          }
          break;
        case "choices":
          for (const option of step.options) {
            const test = option.guard ? `if ${formatExpr(option.guard, yarnStyle)}` : "";
            const guard = option.once ? ` <<once${test && ` ${test}`}>>` : test && ` <<${test}>>`;
            // A colon would be read as a speaker's name here too.
            out.push(`-> ${yarnText(option.text).replace(/:/g, "\\:") || EMPTY_CHOICE}${guard}${tag(option.sid)}`, `    ${jump(option.to, "    ")}`);
          }
          // When every option is unavailable Yarn skips the group and carries on below it.
          if (step.fallback !== undefined) out.push(jump(step.fallback));
          break;
        case "branch":
          if (!step.condition) out.push(`// TODO: couldn't read this condition, so it's taken as false: ${oneLine(step.source)}`, jump(step.no));
          else out.push(`<<if ${formatExpr(step.condition, yarnStyle)}>>`, `    ${jump(step.yes, "    ")}`, "<<else>>", `    ${jump(step.no, "    ")}`, "<<endif>>");
          break;
        case "jump":
          out.push(jump(step.to));
          break;
        case "random":
          // dice(n) is 1 one time in n: the first way 1 in n, the next 1 in n - 1 of the rest, and so on, so each is as likely.
          step.to.forEach((to, i) => {
            const left = step.to.length - i;
            out.push(i === 0 ? `<<if dice(${left}) == 1>>` : left === 1 ? "<<else>>" : `<<elseif dice(${left}) == 1>>`, `    ${jump(to, "    ")}`);
          });
          out.push("<<endif>>");
          break;
        case "call":
          if (step.to) out.push(`<<detour ${step.to}>>`);
          else out.push("// TODO: a Call card that calls nothing; it's passed by");
          out.push(jump(step.then));
          break;
        case "return":
          out.push("<<return>>");
          break;
        case "end":
          out.push("<<stop>>");
      }
    }
    out.push("===");
  }
  return out.join("\n") + "\n";
}

// ---- Twine (Twee 3, SugarCube) -------------------------------------------------------------

const sugarStyle: ExprStyle = {
  variable: (name) => `$${name}`,
  string: (value) => JSON.stringify(value),
  // SugarCube's == is JavaScript's loose one, where 5 == "5"; ours is strict.
  operators: { "==": "===", "!=": "!==" },
};

/** Text that SugarCube would read as markup is wrapped so it shows as written. */
const sugarText = (text: string) =>
  /[$<>[\]{}_\\]|''|\/\/|\/\*|==|~~|\^\^|@@|"""|^[!*#>;:]|\n[!*#>;:]/.test(text)
    ? // A closing tag inside would end the wrapping early.
      `<nowiki>${text.replace(/<\/nowiki>/gi, "<\u200B/nowiki>")}</nowiki>`
    : text;

/** Text as SugarCube markup: written text wrapped where it has to be, `{$name}` as `<<print $name>>`. */
const sugarMarkup = (text: string) =>
  textParts(text)
    .map((part) => ("variable" in part ? `<<print $${part.variable}>>` : sugarText(part.text)))
    .join("");

const END_PASSAGE = "TheEnd";

/** A made-up story id, the same every time for the same title. */
function ifidFrom(seed: string) {
  let hex = "";
  for (let round = 0; hex.length < 32; round++) {
    let hash = 2166136261 ^ round;
    for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
    hex += (hash >>> 0).toString(16).padStart(8, "0");
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`.toUpperCase();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toTwee(graph: DialogueGraph, options: ExportOptions) {
  const script = buildScript(graph, options);
  const title = oneLine(options.title) || "Untitled dialogue";
  const ifid = options.ifid && UUID.test(options.ifid) ? options.ifid.toUpperCase() : ifidFrom(title);
  let needsEnd = false;
  const target = (to: Jump) => {
    if (!to) needsEnd = true;
    return to ?? END_PASSAGE;
  };
  /** `setter`: an assignment made when the link is clicked. */
  const link = (text: string, to: Jump, setter?: string) => {
    const label = oneLine(text) || EMPTY_CHOICE;
    const markup = sugarMarkup(label);
    // Link markup can't hold brackets, pipes or arrows; the macro can hold anything. Its label is markup, so it's wrapped too.
    return /[[\]|]|->|<-/.test(label) || markup !== label
      ? `<<link ${JSON.stringify(markup)} ${JSON.stringify(target(to))}>>${setter ? `<<set ${setter}>>` : ""}<</link>>`
      : `[[${label}->${target(to)}${setter ? `][${setter}` : ""}]]`;
  };
  // A once-only choice: a variable, false until the choice is picked, hides it from then on.
  const pickedNames = new Map<ScriptOption, string>();
  const variableNames = new Set(script.variables.map((v) => v.name));
  for (const p of script.passages) {
    for (const step of p.steps) {
      if (step.kind !== "choices") continue;
      step.options.forEach((option, i) => {
        if (!option.once) return;
        const stem = `picked_${(option.sid ?? `${p.name}_${i + 1}`).replace(/[^A-Za-z0-9_]/g, "_")}`;
        let name = stem;
        for (let n = 2; variableNames.has(name); n++) name = `${stem}_${n}`;
        variableNames.add(name);
        pickedNames.set(option, name);
      });
    }
  }
  const picked = (name: string): Expr => ({ kind: "variable", name });
  // Calls: a story variable holds the passages to go back to, the innermost last.
  const usesCalls = script.passages.some((p) => p.steps.some((step) => step.kind === "call" || step.kind === "return"));
  let stack = "plotra_calls";
  for (let n = 2; variableNames.has(stack); n++) stack = `plotra_calls_${n}`;
  // Passages made here, for a Random, Call or Return card after a line: the line's Continue link leads to one.
  const passageNames = new Set([...script.passages.map((p) => p.name), END_PASSAGE, "Start", "StoryInit", "StoryTitle", "StoryData"]);
  const helpers: Array<{ name: string; x: number; y: number; body: string }> = [];
  const left = Math.min(0, ...script.passages.map((p) => p.x));
  const top = Math.min(0, ...script.passages.map((p) => p.y));

  const out: string[] = [
    ":: StoryTitle",
    title,
    "",
    ":: StoryData",
    JSON.stringify({ ifid, format: "SugarCube", "format-version": "2.37.3", start: "Start" }, null, 2),
    "",
    ":: StoryInit",
    ...script.variables.map((v) => `<<set $${v.name} to ${typeof v.value === "string" ? JSON.stringify(v.value) : String(v.value)}>>`),
    ...[...pickedNames.values()].map((name) => `<<set $${name} to false>>`),
    ...(usesCalls ? [`<<set $${stack} to []>>`] : []),
    "",
    ":: Start",
    `<<goto ${JSON.stringify(target(script.first))}>>`,
  ];

  for (const p of script.passages) {
    out.push("", `:: ${p.name} {"position":"${Math.round(p.x - left + 100)},${Math.round(p.y - top + 100)}"}`);
    // Once a line is on screen the player has to click on; before that a passage can move on by itself.
    let shown = false;
    const body: string[] = [];
    const go = (to: Jump) => (shown ? link("Continue", to) : `<<goto ${JSON.stringify(target(to))}>>`);
    /** Macros that move on by themselves: as they are before a line is shown, after one behind a Continue link to a passage of their own. */
    const auto = (macros: string) => {
      if (!shown) return macros;
      let name = `${p.name}_next`;
      for (let n = 2; passageNames.has(name); n++) name = `${p.name}_next_${n}`;
      passageNames.add(name);
      helpers.push({ name, x: p.x + 70, y: p.y + 60, body: macros });
      return link("Continue", name);
    };
    for (const step of p.steps) {
      switch (step.kind) {
        case "line":
          shown = true;
          body.push(`${step.speaker ? `${sugarText(step.speaker)}: ` : ""}${sugarMarkup(step.text)}${step.sid ? ` /* id:${step.sid} */` : ""}`.trimStart());
          break;
        case "set":
          if (!step.assignments) body.push(`/* TODO: couldn't read this assignment: ${oneLine(step.source).replace(/\*\//g, "* /")} */`);
          else body.push(step.assignments.map((a) => `<<set $${a.name} ${a.op} ${formatExpr(a.value, sugarStyle)}>>`).join(""));
          break;
        case "choices":
          for (const option of step.options) {
            const id = option.sid ? ` /* id:${option.sid} */` : "";
            const once = pickedNames.get(option);
            const guard = once ? both(option.guard, not(picked(once))) : option.guard;
            const choice = link(option.text, option.to, once && `$${once} to true`);
            body.push(guard ? `<<if ${formatExpr(guard, sugarStyle)}>>${choice}${id}<</if>>` : `${choice}${id}`);
          }
          if (step.fallback !== undefined) {
            // None of the choices is on offer (its condition doesn't hold, or it's been picked): move on as the play-through does.
            const unavailable = (o: ScriptOption): Expr => {
              const once = pickedNames.get(o);
              if (once && o.guard) return { kind: "binary", op: "||", left: not(o.guard), right: picked(once) };
              return once ? picked(once) : not(o.guard!);
            };
            const none = step.options.map(unavailable).reduce((a, b) => ({ kind: "binary", op: "&&", left: a, right: b }));
            body.push(`<<if ${formatExpr(none, sugarStyle)}>>${go(step.fallback)}<</if>>`);
          }
          break;
        case "branch":
          if (!step.condition) {
            body.push(`/* TODO: couldn't read this condition, so it's taken as false: ${oneLine(step.source).replace(/\*\//g, "* /")} */`, go(step.no));
          } else body.push(`<<if ${formatExpr(step.condition, sugarStyle)}>>${go(step.yes)}<<else>>${go(step.no)}<</if>>`);
          break;
        case "jump":
          body.push(go(step.to));
          break;
        case "random":
          body.push(auto(`<<set _pick to either(${step.to.map((to) => JSON.stringify(target(to))).join(", ")})>><<goto _pick>>`));
          break;
        case "call":
          if (!step.to) body.push("/* TODO: a Call card that calls nothing; it's passed by */", go(step.then));
          else body.push(auto(`<<run $${stack}.push(${JSON.stringify(target(step.then))})>><<goto ${JSON.stringify(step.to)}>>`));
          break;
        case "return":
          needsEnd = true;
          // With no call to go back to, the dialogue ends, as in the play-through.
          body.push(auto(`<<set _back to $${stack}.length ? $${stack}.pop() : ${JSON.stringify(END_PASSAGE)}>><<goto _back>>`));
          break;
        case "end":
          body.push(go(null));
          break;
      }
    }
    out.push(...body.filter(Boolean));
  }
  for (const h of helpers) out.push("", `:: ${h.name} {"position":"${Math.round(h.x - left + 100)},${Math.round(h.y - top + 100)}"}`, h.body);
  if (needsEnd) out.push("", `:: ${END_PASSAGE}`, "The end.");
  return out.join("\n") + "\n";
}

// ---- One entry point for the Export menu -----------------------------------------------------

export function exportDialogue(graph: DialogueGraph, format: ExportFormat, options: ExportOptions): string {
  switch (format) {
    case "json":
      return toJson(graph, options);
    case "csv":
      return stringsToCsv(graphStrings(graph, options.speakerName));
    case "ink":
      return toInk(graph, options);
    case "yarn":
      return toYarn(graph, options);
    case "twee":
      return toTwee(graph, options);
  }
}

/** A file name from a title: `The Gate.yarn` → `the-gate.yarn`. */
export function exportFileName(title: string, extension: string) {
  const base = title
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return `${base || "dialogue"}.${extension}`;
}
