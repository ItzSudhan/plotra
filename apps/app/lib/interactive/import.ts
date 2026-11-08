import { evaluate, formatExpr, parseAssignments, parseExpression, ExprError, VARIABLE_NAME, type Expr, type ExprStyle } from "./expr";
import { hasStringId, orderedNodes, type DialogueEdge, type DialogueGraph, type DialogueNode, type DialogueValue, type DialogueVariable } from "./model";
import { MAX_STRING_KEY, STRING_KEY } from "./strings";

// Imports of a branching dialogue (plan.md 2.8): Ink, Yarn Spinner and Twine
// (Twee 3, and Twine 2 archives or published stories in HTML) read into the
// cards and jumps of a dialogue. The inverse of ./export.ts, and pure, so it
// runs on the server for an import and in tests.
//
// Each format is first read into one outline (`Story`): passages of lines,
// assignments, choices, branches and jumps, much like the outline the
// exporters write from. `buildGraph` turns that into cards, joins them and
// lays them out. What a format can say that a dialogue can't is skipped with
// a warning naming the line, never with an error: an import brings in what it
// can.
//
// Ink's shuffles, Yarn's line groups and the dice tests Plotra writes become
// Random cards; Ink's tunnels and Yarn's detours become Call and Return cards.

export const importFormats = [
  { id: "ink", label: "Ink", extensions: ["ink"] },
  { id: "yarn", label: "Yarn Spinner", extensions: ["yarn", "yarnproject"] },
  { id: "twee", label: "Twine (Twee)", extensions: ["twee", "tw", "tw2", "tw3"] },
  { id: "twine-html", label: "Twine 2 (HTML)", extensions: ["html", "htm"] },
] as const;

export type ImportFormat = (typeof importFormats)[number]["id"];

/** What the file picker offers. */
export const IMPORT_ACCEPT = ".ink,.yarn,.twee,.tw,.tw2,.tw3,.html,.htm,.txt";

/** The most text an import reads (a server action's body is capped at 1 MB). A Twine HTML file is cut down to its story first. */
export const MAX_IMPORT_SOURCE = 900_000;
/** Cards one import may create. */
export const MAX_IMPORT_CARDS = 5000;
/** Warnings listed; past that they're counted. */
const MAX_WARNINGS = 200;
/** As long as a card's text may be in the editor (`MAX_LINE`). */
const MAX_TEXT = 2000;
/** As long as a card's note may be in the editor. */
const MAX_NOTE = 500;

export type ImportWarning = { line: number | null; text: string };

export type ImportOptions = {
  /** The dialogue's String ID prefix (`stringIdPrefix`). */
  prefix: string;
  /** String IDs used elsewhere in the project, which the file's own ids mustn't take. */
  taken?: ReadonlySet<string>;
  /** The highest string number the dialogue has handed out already (`meta.counter`). */
  counter?: number;
};

export type ImportResult = {
  format: ImportFormat;
  graph: DialogueGraph;
  warnings: ImportWarning[];
  /** The story's own title, when the file has one (Twine). */
  title: string | null;
  /** The highest string number now handed out, for `meta.counter`. */
  counter: number;
};

// ---- The outline every format is read into -------------------------------------------------

type Step =
  | { k: "line"; speaker: string; text: string; sid?: string; note?: string; line: number }
  /** `expr`: assignments in Plotra's spelling (`gold += 5; met = true`). */
  | { k: "set"; expr: string; line: number }
  /**
   * After an option's body, the dialogue goes on with what follows the choices. `fallback`: where it goes when none is
   * on offer. `fallsThrough`: with none on offer it goes on with what follows them (Yarn).
   */
  | { k: "choices"; options: Option[]; fallback?: Step[]; fallsThrough?: boolean; line: number }
  /** `cond: null` is the else branch. */
  | { k: "if"; branches: Array<{ cond: string | null; body: Step[]; line: number }>; line: number }
  /** A jump to a passage or label: the first of the names that exists. */
  | { k: "goto"; to: string[]; label: string; line: number }
  | { k: "end"; line: number }
  /** One of the branches, picked at random; after it, the dialogue goes on with what follows. */
  | { k: "random"; branches: Array<{ body: Step[]; line: number }>; line: number }
  /** A call of a passage or label (the first of the names that exists); back from it, on with what follows. */
  | { k: "call"; to: string[]; label: string; line: number }
  /** Back to where the passage was called from. */
  | { k: "return"; line: number }
  /** A place inside a passage that jumps can lead to (an Ink gather or choice label). */
  | { k: "label"; name: string }
  /** Something a dialogue can't do (a Yarn `<<wait>>`), kept as the note of the line next to it. */
  | { k: "note"; text: string; line: number };

/** `once`: offered only until it's been picked. */
type Option = { text: string; sid?: string; guard: string | null; once?: boolean; body: Step[]; line: number };

type Passage = { name: string; steps: Step[]; line: number };

type Story = {
  passages: Passage[];
  /** The passage to begin with; the first one when null. */
  start: string | null;
  variables: Array<{ name: string; value: DialogueValue; line: number }>;
  title: string | null;
};

class Warnings {
  list: ImportWarning[] = [];
  private seen = new Set<string>();
  private extra = 0;

  /** `once`: a key so a construct that repeats is reported at its first line only. */
  add(line: number | null, text: string, once?: string) {
    if (once) {
      if (this.seen.has(once)) return;
      this.seen.add(once);
    }
    if (this.list.length < MAX_WARNINGS) this.list.push({ line, text });
    else this.extra++;
  }

  done(): ImportWarning[] {
    const sorted = [...this.list].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
    if (this.extra) sorted.push({ line: null, text: `And ${this.extra.toLocaleString("en")} more like these.` });
    return sorted;
  }
}

// ---- Shared helpers -------------------------------------------------------------------------

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

/** `Anna: Hello.` → speaker and text. Only a short name of a few words counts, so “Note: this” in prose mostly stays prose. */
function splitSpeaker(text: string): { speaker: string; text: string } {
  const match = /^([^:"[\]{}<>$]{1,40}?)\s*:\s+(\S[\s\S]*)$/.exec(text);
  if (match && match[1].trim() && match[1].trim().split(/\s+/).length <= 4) return { speaker: match[1].trim(), text: match[2].trim() };
  return { speaker: "", text };
}

/** Applies `fn` to the parts of an expression outside quoted strings. */
function mapCode(source: string, fn: (code: string) => string): string {
  let out = "";
  let code = "";
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      out += fn(code);
      code = "";
      let j = i + 1;
      while (j < source.length && source[j] !== ch) j += source[j] === "\\" ? 2 : 1;
      out += source.slice(i, j + 1);
      i = j;
    } else code += ch;
  }
  return out + fn(code);
}

/** Word operators (`is`, `gt`…) to symbols, outside strings and not as part of a `$variable`. */
const wordOps = (map: Record<string, string>) => (source: string) =>
  mapCode(source, (code) => code.replace(/(?<![\w$.])([A-Za-z]+(?:\s+not)?)\b/g, (word) => map[word.replace(/\s+/g, " ")] ?? word));

const ourStyle: ExprStyle = { variable: (name) => name, string: (value) => `"${value.replace(/[\\"]/g, "\\$&")}"` };

function tryParse<T>(parse: () => T): T | null {
  try {
    return parse();
  } catch (error) {
    if (error instanceof ExprError) return null;
    throw error;
  }
}

/** A condition in Plotra's spelling, tidied; or the text as it came, with a warning, when it can't be read. */
function condition(source: string, line: number, warnings: Warnings): string {
  const parsed = tryParse(() => parseExpression(source));
  if (parsed) return formatExpr(parsed, ourStyle);
  warnings.add(line, `Couldn't read the condition “${clean(source)}”. It's kept as written; fix it on the card.`);
  return clean(source);
}

/** One assignment, `x += e` where the source said `x = x + e`. */
function assignment(name: string, op: string, value: string, line: number, warnings: Warnings): string | null {
  if (!VARIABLE_NAME.test(name)) {
    warnings.add(line, `“${name}” can't be a variable name here, so this assignment is left out.`);
    return null;
  }
  const parsed = tryParse(() => parseExpression(value));
  if (!parsed) {
    warnings.add(line, `Couldn't read “${clean(value)}”. The assignment is kept as written; fix it on the card.`);
    return `${name} ${op} ${clean(value)}`;
  }
  if (op === "=" && parsed.kind === "binary" && (parsed.op === "+" || parsed.op === "-") && parsed.left.kind === "variable" && parsed.left.name === name) {
    return `${name} ${parsed.op}= ${formatExpr(parsed.right, ourStyle)}`;
  }
  return `${name} ${op} ${formatExpr(parsed, ourStyle)}`;
}

/** A starting value: a literal, or an expression of literals. */
function literal(source: string): DialogueValue | undefined {
  const parsed = tryParse(() => parseExpression(source));
  if (!parsed) return undefined;
  return tryParse(() => evaluate(parsed, {})) ?? undefined;
}

const and = (a: string | null, b: string) => (a ? `(${a}) && (${b})` : b);
const not = (a: string) => `!(${a})`;

/** Lines of a file with their numbers, any line ending. */
const linesOf = (source: string) => source.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);

/** Index of the `close` matching the `open` at `from`, skipping quoted strings and backslash escapes; -1 if none. */
function matching(text: string, from: number, open: string, close: string): number {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") i++;
    else if (ch === '"') {
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
    } else if (text.startsWith(open, i)) {
      depth++;
      i += open.length - 1;
    } else if (text.startsWith(close, i)) {
      depth--;
      if (depth === 0) return i;
      i += close.length - 1;
    }
  }
  return -1;
}

// ---- Ink ---------------------------------------------------------------------------------------

const ROOT = "(root)";

/** Ink's expressions are already close to Plotra's (`and`, `or`, `not` included); what isn't (`mod`, lists) fails to read and is reported. */
const inkOps = (source: string) => source;

/** Comments out, keeping line breaks so line numbers still match. */
function stripInkComments(source: string): string {
  let out = "";
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\" && i + 1 < source.length) {
      out += source.slice(i, i + 2);
      i++;
    } else if (source.startsWith("//", i)) {
      while (i + 1 < source.length && source[i + 1] !== "\n" && source[i + 1] !== "\r") i++;
    } else if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      const stop = end < 0 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\r\n]/g, "");
      i = stop - 1;
    } else out += ch;
  }
  return out;
}

type InkScan = { before: string; inside: string; after: string; brackets: boolean; tags: string[]; divert: string | null; logic: boolean };

/** Reads a line of Ink content: its text (in a choice, the parts around the brackets), tags, divert, and whether it has inline logic. */
function scanInk(raw: string, choice: boolean): InkScan {
  const scan: InkScan = { before: "", inside: "", after: "", brackets: false, tags: [], divert: null, logic: false };
  let zone: "before" | "inside" | "after" = "before";
  const put = (text: string) => (scan[zone] += text);
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "\\" && i + 1 < raw.length) {
      put(raw[++i]);
    } else if (ch === "#") {
      // A tag runs to the next tag, the end of the line, or (in a choice's brackets) the closing bracket.
      let j = i + 1;
      let tag = "";
      for (; j < raw.length && raw[j] !== "#" && !(zone === "inside" && raw[j] === "]"); j++) {
        if (raw[j] === "\\" && j + 1 < raw.length) j++;
        tag += raw[j];
      }
      if (tag.trim()) scan.tags.push(tag.trim());
      i = j - 1;
    } else if (choice && zone === "before" && ch === "[") {
      zone = "inside";
      scan.brackets = true;
    } else if (choice && zone === "inside" && ch === "]") {
      zone = "after";
    } else if (raw.startsWith("->", i)) {
      const rest = raw.slice(i + 2);
      const hash = rest.search(/(?<!\\)#/);
      scan.divert = (hash < 0 ? rest : rest.slice(0, hash)).trim();
      if (hash >= 0) scan.tags.push(...rest.slice(hash + 1).split("#").map((t) => t.trim()).filter(Boolean));
      break;
    } else if (raw.startsWith("<>", i)) {
      i++;
    } else if (ch === "{") {
      const end = matching(raw, i, "{", "}");
      const stop = end < 0 ? raw.length - 1 : end;
      put(raw.slice(i, stop + 1));
      scan.logic = true;
      i = stop;
    } else put(ch);
  }
  return scan;
}

type InkToken =
  | { t: "text"; raw: string; line: number }
  | { t: "choice"; level: number; sticky: boolean; raw: string; line: number }
  | { t: "gather"; level: number; raw: string; line: number }
  | { t: "logic"; code: string; line: number }
  /** `seq`: a sequence block (`{ shuffle:` and the like), whose `- ` lines are its alternatives. */
  | { t: "open"; expr: string | null; seq?: string; line: number }
  | { t: "case"; expr: string; line: number }
  /** An alternative of a sequence block. */
  | { t: "alt"; line: number }
  | { t: "close"; line: number };

/** Unescaped braces on a line, as opened minus closed. */
function braceBalance(text: string) {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === "{") n++;
    else if (text[i] === "}") n--;
  }
  return n;
}

/** Splits `cond: rest` at the first colon outside strings and brackets. */
function splitColon(text: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") i++;
    else if (ch === '"') {
      for (i++; i < text.length && text[i] !== '"'; i++);
    } else if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (ch === ":" && depth === 0) return [text.slice(0, i).trim(), text.slice(i + 1)];
  }
  return null;
}

/** Splits at `|` outside braces. */
function splitBar(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") i++;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === "|" && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  return [...parts, text.slice(start)];
}

/** `{name}` printing a variable (one of `names`) to a placeholder that `scanInk` passes through as text; see `inkShown`. */
const inkVariables = (raw: string, names: ReadonlySet<string>) =>
  raw.replace(/(?<!\\)\{\s*([A-Za-z_]\w*)\s*\}/g, (whole, name: string) => (names.has(name) ? `\u0001${name}\u0002` : whole));

/** Placeholders back as Plotra's `{$name}`. */
const inkShown = (text: string) => text.replace(/\u0001(\w+)\u0002/g, "{$$$1}");

/** Glue (`<>`) at the end of a line or the start of the next: the two are one line. */
function glueInk(tokens: InkToken[], warnings: Warnings): InkToken[] {
  const out: InkToken[] = [];
  const glued = (raw: string, end: boolean) => (end ? /(?<!\\)<>\s*$/ : /^<>/).test(raw);
  for (const token of tokens) {
    const prev = out.at(-1);
    if (token.t === "text" && prev?.t === "text" && (glued(prev.raw, true) || glued(token.raw, false)) && !/->/.test(prev.raw)) {
      out[out.length - 1] = { ...prev, raw: prev.raw.replace(/<>\s*$/, "") + token.raw.replace(/^<>/, "") };
      continue;
    }
    const loose = (prev && "raw" in prev && glued(prev.raw, true)) || (token.t === "text" && glued(token.raw, false));
    if (loose) warnings.add(token.line, "Glue (<>) only joins two lines of text that follow each other; here the lines stay apart.", "ink-glue");
    out.push(token);
  }
  return out;
}

function readInk(source: string, warnings: Warnings): Story {
  const lines = linesOf(stripInkComments(source));
  const story: Story = { passages: [], start: ROOT, variables: [], title: null };
  /** Variables, so `{name}` in text can be told from other inline logic. */
  const declared = new Set<string>();
  for (const text of lines) {
    const m = /^\s*(?:(?:VAR|CONST)\s+|~\s*temp\s+)([A-Za-z_]\w*)\s*=/.exec(text);
    if (m) declared.add(m[1]);
  }
  type Section = { name: string; knot: string; stitch: string | null; tokens: InkToken[]; line: number };
  const sections: Section[] = [{ name: ROOT, knot: ROOT, stitch: null, tokens: [], line: 1 }];
  let current: Section | null = sections[0];
  let knot = ROOT;
  /** Stitches of each knot, in order, for a knot with nothing before its first stitch. */
  const stitches = new Map<string, string[]>();
  /** Open `{` blocks: cases go to the innermost one. */
  let depth = 0;
  /** For each open block, whether it's a sequence (`{ shuffle:`), whose `- ` lines are alternatives, not cases. */
  let blocks: boolean[] = [];

  lines.forEach((text, index) => {
    const line = index + 1;
    const trimmed = text.trim();
    if (!trimmed) return;
    if (/^TODO\s*:/.test(trimmed)) return;

    const knotHeader = /^={2,}\s*(function\s+)?([A-Za-z_][\w]*)\s*(\([^)]*\))?\s*=*\s*$/.exec(trimmed);
    if (knotHeader) {
      depth = 0;
      blocks = [];
      knot = knotHeader[2];
      if (knotHeader[1]) {
        warnings.add(line, `Ink functions aren't something a dialogue has: “${knot}” is left out.`);
        current = null;
        return;
      }
      if (knotHeader[3] && knotHeader[3].replace(/[()\s]/g, "")) warnings.add(line, `Knot parameters aren't supported: “${knot}” is imported without them.`);
      current = { name: knot, knot, stitch: null, tokens: [], line };
      sections.push(current);
      return;
    }
    const stitchHeader = /^=\s*([A-Za-z_][\w]*)\s*(\([^)]*\))?\s*$/.exec(trimmed);
    if (stitchHeader) {
      depth = 0;
      blocks = [];
      const name = `${knot}.${stitchHeader[1]}`;
      stitches.set(knot, [...(stitches.get(knot) ?? []), name]);
      current = { name, knot, stitch: stitchHeader[1], tokens: [], line };
      sections.push(current);
      return;
    }
    const declaration = /^(VAR|CONST)\s+([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(trimmed);
    if (declaration) {
      const value = literal(declaration[3].trim());
      if (value === undefined) warnings.add(line, `The starting value of “${declaration[2]}” can't be read, so it starts at 0.`);
      story.variables.push({ name: declaration[2], value: value ?? 0, line });
      return;
    }
    if (/^(LIST|INCLUDE|EXTERNAL)\b/.test(trimmed)) {
      const word = trimmed.split(/\s/)[0];
      warnings.add(line, word === "INCLUDE" ? "INCLUDE isn't followed: import each file on its own." : `${word} isn't supported, so this line is left out.`);
      return;
    }
    if (!current) return;
    const push = (token: InkToken) => current!.tokens.push(token);

    if (trimmed.startsWith("~")) return push({ t: "logic", code: trimmed.slice(1).trim(), line });
    if (depth > 0 && /^-(?!>)/.test(trimmed)) {
      const body = trimmed.replace(/^-\s*/, "");
      if (blocks.at(-1)) {
        push({ t: "alt", line });
        if (body) push({ t: "text", raw: body, line });
        return;
      }
      const parts = splitColon(body);
      if (parts) {
        push({ t: "case", expr: parts[0], line });
        if (parts[1].trim()) push({ t: "text", raw: parts[1].trim(), line });
        return;
      }
    }
    if (trimmed === "}" || (depth > 0 && braceBalance(trimmed) < 0 && trimmed.endsWith("}"))) {
      const before = trimmed.slice(0, -1).trim();
      if (before) push({ t: "text", raw: before, line });
      depth = Math.max(0, depth - 1);
      blocks.pop();
      return push({ t: "close", line });
    }
    if (trimmed.startsWith("{") && braceBalance(trimmed) > 0) {
      depth++;
      const inner = trimmed.slice(1);
      const parts = splitColon(inner);
      const seq = parts && /^(?:(?:shuffle|stopping|cycle|once)\s*)+$/.test(parts[0]) ? parts[0].replace(/\s+/g, " ") : undefined;
      blocks.push(Boolean(seq));
      if (parts) {
        push({ t: "open", expr: parts[0], ...(seq && { seq }), line });
        if (parts[1].trim()) push({ t: "text", raw: parts[1].trim(), line });
      } else {
        push({ t: "open", expr: null, line });
        if (inner.trim()) warnings.add(line, "This multi-line block isn't a condition Plotra can read; its lines are imported without it.");
      }
      return;
    }
    const choice = /^((?:[*+]\s*)+)/.exec(trimmed);
    if (choice) {
      const marks = choice[1].replace(/\s/g, "");
      return push({ t: "choice", level: marks.length, sticky: marks[0] === "+", raw: trimmed.slice(choice[1].length), line });
    }
    const gather = /^((?:-(?!>)\s*)+)/.exec(trimmed);
    if (gather) return push({ t: "gather", level: gather[1].replace(/\s/g, "").length, raw: trimmed.slice(gather[1].length), line });
    if (trimmed.startsWith("<-")) {
      warnings.add(line, "Threads (<-) aren't supported, so this line is left out.");
      return;
    }
    push({ t: "text", raw: trimmed, line });
  });

  // ---- Weave: tokens of a section into steps ----
  for (const section of sections) {
    section.tokens = glueInk(section.tokens, warnings);
    const scope = section.stitch ? [`${section.knot}.${section.stitch}`, section.knot] : [section.knot];
    /** Candidate names for a divert, nearest scope first. */
    const targets = (name: string) => {
      if (name.includes(".")) return [name, ...scope.map((s) => `${s.split(".")[0]}.${name}`)];
      return [...scope.map((s) => `${s}.${name}`), name];
    };
    const labelName = (name: string) => `${scope[0]}.${name}`;

    /**
     * What follows `->`: a divert, a tunnel (`knot ->`, `a -> b ->`), a tunnel then a divert (`a -> b`), or a return
     * from one (`->`, written `->->`).
     */
    const divert = (raw: string, line: number): Step[] => {
      const parts = raw.trim().split("->").map((part) => part.trim());
      if (!parts[0] && parts.length === 1) return [];
      if (!parts[0]) {
        if (parts.slice(1).some(Boolean)) warnings.add(line, "A divert after ->-> isn't supported; this returns from the tunnel.", "ink-onwards");
        return [{ k: "return", line }];
      }
      const steps: Step[] = [];
      for (const name of parts.slice(0, -1)) {
        const step = divertTo(name, line);
        if (step.k === "goto") steps.push({ k: "call", to: step.to, label: step.label, line });
        else {
          warnings.add(line, `Couldn't read the tunnel “-> ${name} ->”, so it's left out.`);
        }
      }
      const last = parts.at(-1)!;
      if (last) steps.push(divertTo(last, line));
      return steps;
    };

    const divertTo = (raw: string, line: number): Step => {
      let target = raw.trim();
      if (/\(/.test(target)) {
        warnings.add(line, "Divert arguments aren't supported; this is imported as a plain divert.", "ink-args");
        target = target.replace(/\s*\(.*$/, "");
      }
      if (target === "END" || target === "DONE") return { k: "end", line };
      if (!/^[\w.]+$/.test(target)) {
        warnings.add(line, `Couldn't read the divert “-> ${target}”, so the dialogue ends there.`);
        return { k: "end", line };
      }
      return { k: "goto", to: targets(target), label: target, line };
    };

    /** A line of text (with a divert at its end) as steps. */
    const content = (source: string, line: number): Step[] => {
      const raw = inkVariables(source, declared);
      const whole = raw.trim();
      // One shuffle in the line, `{~a|b|c}`: a Random card between the line's versions, with whatever is around it.
      const groups = braceGroups(whole);
      if (groups.length === 1 && whole[groups[0][0] + 1] === "~") {
        const [open, close] = groups[0];
        const before = whole.slice(0, open);
        const after = whole.slice(close + 1);
        return [
          {
            k: "random",
            line,
            branches: splitBar(whole.slice(open + 2, close)).map((way) => ({ body: content(`${before}${way}${after}`, line), line })),
          },
        ];
      }
      // A line that's all one inline conditional, `{cond: this|that}`, becomes a branch.
      if (whole.startsWith("{") && matching(whole, 0, "{", "}") === whole.length - 1) {
        const inner = whole.slice(1, -1);
        const parts = splitColon(inner);
        if (parts && !/^[&~!]/.test(inner)) {
          const [yes, no] = splitBar(parts[1]);
          return [
            {
              k: "if",
              line,
              branches: [
                { cond: condition(inkOps(parts[0]), line, warnings), body: content(yes, line), line },
                ...(no !== undefined ? [{ cond: null, body: content(no, line), line }] : []),
              ],
            },
          ];
        }
      }
      const scan = scanInk(raw, false);
      const steps: Step[] = [];
      const text = inkShown(clean(scan.before));
      if (scan.logic) warnings.add(line, "Inline logic ({…}) in text isn't supported; it's kept as written.", "ink-inline");
      if (text) steps.push(lineStep(text, scan.tags, line));
      if (scan.divert !== null) steps.push(...divert(scan.divert, line));
      return steps;
    };

    const lineStep = (text: string, tags: string[], line: number): Step => {
      const said = splitSpeaker(text);
      return { k: "line", ...said, sid: idTag(tags, line), line };
    };

    const idTag = (tags: string[], line: number): string | undefined => {
      let sid: string | undefined;
      for (const tag of tags) {
        const id = /^id\s*:\s*(\S+)$/.exec(tag);
        if (id) sid = id[1];
        else warnings.add(line, "Tags other than “id:” aren't kept.", "ink-tags");
      }
      return sid;
    };

    const logic = (code: string, line: number): Step | null => {
      const body = code.replace(/^temp\s+/, "");
      const step = /^([A-Za-z_]\w*)\s*(\+\+|--)$/.exec(body);
      if (step) {
        const expr = assignment(step[1], `${step[2][0]}=`, "1", line, warnings);
        return expr ? { k: "set", expr, line } : null;
      }
      const assign = /^([A-Za-z_]\w*)\s*(=|\+=|-=)(?!=)\s*(.+)$/.exec(body);
      if (assign) {
        const expr = assignment(assign[1], assign[2], inkOps(assign[3]), line, warnings);
        return expr ? { k: "set", expr, line } : null;
      }
      warnings.add(line, `“~ ${clean(code)}” isn't an assignment Plotra can import, so it's left out.`);
      return null;
    };

    const tokens = section.tokens;
    let at = 0;

    /** Content until a choice or gather shallower than `level`, a case or a block's end. */
    const block = (level: number): Step[] => {
      const steps: Step[] = [];
      while (at < tokens.length) {
        const token = tokens[at];
        if (token.t === "case" || token.t === "close" || token.t === "alt") return steps;
        if ((token.t === "choice" || token.t === "gather") && token.level < level) return steps;
        if (token.t === "choice") {
          steps.push(...group(token.level));
          continue;
        }
        at++;
        if (token.t === "gather") {
          steps.push(...gatherSteps(token));
        } else if (token.t === "text") {
          steps.push(...content(token.raw, token.line));
        } else if (token.t === "logic") {
          const step = logic(token.code, token.line);
          if (step) steps.push(step);
        } else if (token.t === "open") {
          steps.push(...conditional(token));
        }
      }
      return steps;
    };

    const gatherSteps = (token: Extract<InkToken, { t: "gather" }>): Step[] => {
      let raw = token.raw.trim();
      const steps: Step[] = [];
      const label = /^\(\s*(\w+)\s*\)\s*/.exec(raw);
      if (label) {
        steps.push({ k: "label", name: labelName(label[1]) });
        raw = raw.slice(label[0].length);
      }
      if (raw) steps.push(...content(raw, token.line));
      return steps;
    };

    /** Choices of one level, then the gather that joins them. */
    const group = (level: number): Step[] => {
      const options: Option[] = [];
      let fallback: Step[] | undefined;
      const first = tokens[at].line;
      while (at < tokens.length) {
        const token = tokens[at];
        if (token.t !== "choice" || token.level !== level) break;
        at++;
        let raw = token.raw.trim();
        const pre: Step[] = [];
        const label = /^\(\s*(\w+)\s*\)\s*/.exec(raw);
        if (label) {
          pre.push({ k: "label", name: labelName(label[1]) });
          raw = raw.slice(label[0].length);
        }
        let guard: string | null = null;
        while (raw.startsWith("{")) {
          const end = matching(raw, 0, "{", "}");
          if (end < 0) break;
          guard = and(guard, inkOps(raw.slice(1, end)));
          raw = raw.slice(end + 1).trim();
        }
        raw = inkVariables(raw, declared);
        const scan = scanInk(raw, true);
        const shown = inkShown(clean(scan.before + scan.inside));
        const said = inkShown(clean(scan.before + scan.after));
        const body: Step[] = [...pre];
        // The id tag inside the brackets (as Plotra writes it) is the choice's; one outside, on the line printed after it.
        if (scan.logic) warnings.add(token.line, "Inline logic ({…}) in a choice isn't supported; it's kept as written.", "ink-inline");
        const insideTags = raw.includes("[") ? tagsInBrackets(raw) : [];
        const outsideTags = scan.tags.filter((t) => !insideTags.includes(t));
        let sid = idTag(insideTags, token.line);
        if (said && scan.brackets) body.push(lineStep(said, outsideTags, token.line));
        else sid ??= idTag(outsideTags, token.line);
        if (scan.divert !== null) body.push(...divert(scan.divert, token.line));
        body.push(...block(level + 1));
        if (!shown && !said) {
          // A choice with no text is the fallback, taken when no other is on offer.
          fallback = body;
          continue;
        }
        options.push({ text: shown, sid, guard: guard && condition(guard, token.line, warnings), ...(!token.sticky && { once: true }), body, line: token.line });
      }
      const steps: Step[] = [{ k: "choices", options, ...(fallback && { fallback }), line: first }];
      if (!options.length && fallback) return fallback;
      const next = tokens[at];
      if (next?.t === "gather" && next.level === level) {
        at++;
        steps.push(...gatherSteps(next));
      }
      return steps;
    };

    const conditional = (open: Extract<InkToken, { t: "open" }>): Step[] => {
      if (open.seq) return sequenceBlock(open);
      const branches: Array<{ cond: string | null; body: Step[]; line: number }> = [];
      const switchOn = open.expr && tokens[at]?.t === "case" ? open.expr : null;
      if (open.expr && !switchOn) branches.push({ cond: condition(inkOps(open.expr), open.line, warnings), body: block(1), line: open.line });
      else block(1);
      while (at < tokens.length && tokens[at].t === "case") {
        const token = tokens[at] as Extract<InkToken, { t: "case" }>;
        at++;
        const isElse = token.expr === "else";
        const cond = isElse ? null : condition(inkOps(switchOn ? `(${switchOn}) == (${token.expr})` : token.expr), token.line, warnings);
        branches.push({ cond, body: block(1), line: token.line });
      }
      if (tokens[at]?.t === "close") at++;
      else warnings.add(open.line, "This block is never closed with }.");
      return branches.length ? [{ k: "if", branches, line: open.line }] : [];
    };

    /** `{ shuffle:` and its `- ` alternatives: a Random card. Other sequences play their first alternative. */
    const sequenceBlock = (open: Extract<InkToken, { t: "open" }>): Step[] => {
      const before = block(1);
      const branches: Array<{ body: Step[]; line: number }> = [];
      while (at < tokens.length && tokens[at].t === "alt") {
        const line = tokens[at].line;
        at++;
        branches.push({ body: block(1), line });
      }
      if (tokens[at]?.t === "close") at++;
      else warnings.add(open.line, "This block is never closed with }.");
      if (open.seq === "shuffle") return [...before, { k: "random", branches, line: open.line }];
      warnings.add(open.line, `Only a plain {shuffle:} becomes a Random card; this {${open.seq}:} block is imported as its first alternative.`, "ink-sequence");
      return [...before, ...(branches[0]?.body ?? [])];
    };

    const steps = block(1);
    while (at < tokens.length) {
      // A stray case or } outside a block.
      warnings.add(tokens[at].line, "This line doesn't belong to any block, so it's left out.");
      at++;
      steps.push(...block(1));
    }
    // A knot with nothing before its first stitch goes straight into it.
    const own = stitches.get(section.knot);
    if (!section.stitch && !steps.length && own?.length) steps.push({ k: "goto", to: [own[0]], label: own[0], line: section.line });
    story.passages.push({ name: section.name, steps, line: section.line });
  }

  const root = story.passages[0];
  if (!root.steps.length && story.passages.length > 1) {
    // Without anything at the top an Ink story stops at once; start where the writing is.
    story.start = story.passages[1].name;
    warnings.add(null, `Nothing at the top of the story diverts anywhere, so it starts at “${story.start}”.`);
  }
  return story;
}

/** Where each top-level `{…}` of a line opens and closes, skipping escapes. */
function braceGroups(text: string): Array<[number, number]> {
  const groups: Array<[number, number]> = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === "{") {
      const end = matching(text, i, "{", "}");
      if (end < 0) break;
      groups.push([i, end]);
      i = end;
    }
  }
  return groups;
}

/** Tags inside a choice's `[…]`. */
function tagsInBrackets(raw: string): string[] {
  const open = raw.search(/(?<!\\)\[/);
  if (open < 0) return [];
  const close = raw.slice(open).search(/(?<!\\)\]/);
  const inner = close < 0 ? raw.slice(open + 1) : raw.slice(open + 1, open + close);
  return scanInk(inner, false).tags;
}

// ---- Yarn Spinner ------------------------------------------------------------------------------

const yarnOps = wordOps({ is: "==", eq: "==", neq: "!=", gt: ">", lt: "<", gte: ">=", lte: "<=" });

/** Removes a `//` comment that isn't escaped or in a string. */
function stripYarnComment(text: string) {
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === '"') quoted = !quoted;
    else if (!quoted && text.startsWith("//", i)) return text.slice(0, i);
  }
  return text;
}

const unescapeYarn = (text: string) => text.replace(/\\(.)/g, "$1");

/** Text, its tags and an inline `<<if>>`, `<<once>>` or `<<once if>>` from a line or option. `inline`: braces other than `{$name}`. */
function scanYarn(raw: string): { text: string; tags: string[]; guard: string | null; once: boolean; inline: boolean } {
  let text = raw;
  let guard: string | null = null;
  let once = false;
  const tags: string[] = [];
  const hash = text.search(/(?<!\\)#/);
  if (hash >= 0) {
    tags.push(...text.slice(hash + 1).split(/\s+#?/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean));
    text = text.slice(0, hash);
  }
  const cond = /(?<!\\)<<\s*(?:(once)\b\s*(?:if\s+([\s\S]*?))?|if\s+([\s\S]*?))\s*>>\s*$/.exec(text.trimEnd());
  if (cond) {
    once = Boolean(cond[1]);
    guard = (cond[2] ?? cond[3])?.trim() || null;
    text = text.trimEnd().slice(0, cond.index);
  }
  return { text, tags, guard, once, inline: /(?<!\\)\{(?!\$[A-Za-z_]\w*\})/.test(text) };
}

function readYarn(source: string, warnings: Warnings): Story {
  const lines = linesOf(source);
  const story: Story = { passages: [], start: null, variables: [], title: null };
  type Body = { indent: number; text: string; line: number };
  let i = 0;
  while (i < lines.length) {
    // Headers until ---.
    const headers = new Map<string, string>();
    const startLine = i + 1;
    while (i < lines.length && lines[i].trim() !== "---") {
      const header = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(lines[i]);
      if (header) headers.set(header[1].toLowerCase(), header[2].trim());
      else if (lines[i].trim() && !lines[i].trim().startsWith("//")) warnings.add(i + 1, "This line isn't a node header, so it's left out.");
      i++;
    }
    if (i >= lines.length) break;
    i++;
    const body: Body[] = [];
    while (i < lines.length && lines[i].trim() !== "===") {
      const raw = stripYarnComment(lines[i]).replace(/\s+$/, "");
      if (raw.trim()) body.push({ indent: raw.replace(/\t/g, "    ").search(/\S/), text: raw.trim(), line: i + 1 });
      i++;
    }
    i++;
    const title = headers.get("title");
    if (!title) {
      warnings.add(startLine, "A node without a title can't be jumped to, so it's left out.");
      continue;
    }
    if (headers.has("when")) warnings.add(startLine, "Node groups (when:) aren't supported; each node is imported on its own.", "yarn-when");
    story.passages.push({ name: title, steps: yarnBlock(body, warnings, story), line: startLine });
  }
  story.start = story.passages.find((p) => p.name === "Start")?.name ?? story.passages[0]?.name ?? null;
  return story;
}

function yarnBlock(lines: Array<{ indent: number; text: string; line: number }>, warnings: Warnings, story: Story): Step[] {
  let at = 0;
  const command = (text: string) => /^<<\s*([\s\S]*?)\s*>>$/.exec(text)?.[1] ?? null;
  const marker = (text: string) => {
    const c = command(text);
    return c ? /^(elseif|else|endif|endonce)\b/.exec(c)?.[1] ?? null : null;
  };

  /**
   * Content that runs only the first time (`<<once>>`): behind a variable of its own, false until then. `cond`: a
   * condition it also needs. As a branch for an `if` step, so an `<<else>>` can follow it.
   */
  const onceBranch = (cond: string | null, body: Step[], line: number) => {
    let name = `once_${line}`;
    for (let n = 2; story.variables.some((v) => v.name === name); n++) name = `once_${line}_${n}`;
    story.variables.push({ name, value: false, line });
    const test = cond ? `!${name} && (${yarnOps(cond)})` : `!${name}`;
    return { cond: condition(test, line, warnings), body: [{ k: "set", expr: `${name} = true`, line } as Step, ...body], line };
  };

  const lineStep = (raw: string, line: number): Step[] => {
    const scan = scanYarn(raw);
    if (scan.inline) warnings.add(line, "Inline expressions other than {$name} in text aren't supported; they're kept as written.", "yarn-inline");
    // The speaker is everything before the first colon that isn't escaped.
    const colon = scan.text.search(/(?<!\\):/);
    const speaker = colon > 0 && colon <= 60 ? unescapeYarn(scan.text.slice(0, colon)).trim() : "";
    const text = clean(unescapeYarn(speaker ? scan.text.slice(colon + 1) : scan.text));
    if (!text) return [];
    let sid: string | undefined;
    for (const tag of scan.tags) {
      if (tag.startsWith("line:")) sid = tag.slice(5);
      else warnings.add(line, "Hashtags other than #line: aren't kept.", "yarn-tags");
    }
    const step: Step = { k: "line", speaker, text, sid, line };
    if (scan.once) return [{ k: "if", line, branches: [onceBranch(scan.guard, [step], line)] }];
    return scan.guard ? [{ k: "if", line, branches: [{ cond: condition(yarnOps(scan.guard), line, warnings), body: [step], line }] }] : [step];
  };

  const run = (cmd: string, line: number): Step[] => {
    const word = /^(\w+)/.exec(cmd)?.[1] ?? "";
    const rest = cmd.slice(word.length).trim();
    switch (word) {
      case "jump":
      case "detour": {
        if (rest.startsWith("{")) {
          warnings.add(line, `A ${word} to a node named by an expression isn't supported, so the dialogue ends there.`);
          return [{ k: "end", line }];
        }
        return [word === "detour" ? { k: "call", to: [rest], label: rest, line } : { k: "goto", to: [rest], label: rest, line }];
      }
      case "stop":
        return [{ k: "end", line }];
      case "return":
        return [{ k: "return", line }];
      case "set": {
        const set = /^\$?([A-Za-z_]\w*)\s*(to|=|\+=|-=)\s*([\s\S]+)$/.exec(rest);
        if (!set) {
          warnings.add(line, `Couldn't read “<<set ${clean(rest)}>>”, so it's left out.`);
          return [];
        }
        const expr = assignment(set[1], set[2] === "to" ? "=" : set[2], yarnOps(set[3]), line, warnings);
        return expr ? [{ k: "set", expr, line }] : [];
      }
      case "declare": {
        const declare = /^\$?([A-Za-z_]\w*)\s*(?:to|=)\s*([\s\S]+?)(?:\s+as\s+\w+)?$/.exec(rest);
        const value = declare ? literal(yarnOps(declare[2])) : undefined;
        if (!declare) warnings.add(line, `Couldn't read “<<declare ${clean(rest)}>>”, so it's left out.`);
        else {
          if (value === undefined) warnings.add(line, `The starting value of “${declare[1]}” can't be read, so it starts at 0.`);
          story.variables.push({ name: declare[1], value: value ?? 0, line });
        }
        return [];
      }
      default:
        // Kept for whoever wires the dialogue into the game.
        warnings.add(line, `<<${word || clean(cmd)}>> isn't something a dialogue can do; it's kept in the note of the line next to it.`);
        return [{ k: "note", text: `<<${clean(cmd)}>>`, line }];
    }
  };

  /** Lines until one at or left of `stop`, or an elseif/else/endif. */
  const block = (stop: number): Step[] => {
    const steps: Step[] = [];
    while (at < lines.length) {
      const { indent, text, line } = lines[at];
      if (indent <= stop || marker(text)) return steps;
      if (text.startsWith("->")) {
        steps.push(options(indent));
        continue;
      }
      if (text.startsWith("=>")) {
        steps.push(lineGroup(indent));
        continue;
      }
      at++;
      const cmd = command(text);
      // A detour straight back out (as Plotra writes a jump inside a call) goes there without forgetting where to return to: a jump.
      const detour = cmd !== null ? /^detour\s+([^\s{][\s\S]*)$/.exec(cmd) : null;
      if (detour && lines[at]?.indent === indent && command(lines[at].text) === "return") {
        at++;
        steps.push({ k: "goto", to: [detour[1].trim()], label: detour[1].trim(), line });
        continue;
      }
      if (cmd !== null && /^if\b/.test(cmd)) {
        steps.push(ifBlock(cmd.slice(2).trim(), line, stop));
        continue;
      }
      if (cmd !== null && /^once\b/.test(cmd)) {
        steps.push(onceBlock(/^once\s+if\s+([\s\S]+)$/.exec(cmd)?.[1] ?? null, line, stop));
        continue;
      }
      if (cmd !== null) {
        steps.push(...run(cmd, line));
        continue;
      }
      steps.push(...lineStep(text, line));
    }
    return steps;
  };

  const ifBlock = (cond: string, line: number, stop: number): Step => {
    const branches: Array<{ cond: string | null; body: Step[]; line: number }> = [{ cond, body: block(stop), line }];
    for (;;) {
      const next = lines[at];
      const kind = next ? marker(next.text) : null;
      if (!next || !kind || kind === "endonce" || next.indent <= stop) {
        warnings.add(line, "This <<if>> is never closed with <<endif>>.");
        break;
      }
      at++;
      if (kind === "endif") break;
      const rest = command(next.text)!.slice(kind.length).trim();
      branches.push({ cond: kind === "else" ? null : rest, body: block(stop), line: next.line });
    }
    // `<<if dice(3) == 1>>` … `<<elseif dice(2) == 1>>` … `<<else>>`: each branch as likely, as Plotra writes a Random card.
    const dice = branches.length > 1 && branches.every((b, i) => {
      if (i === branches.length - 1) return b.cond === null;
      const m = b.cond !== null ? /^dice\(\s*(\d+)\s*\)\s*(?:==|is|eq)\s*1$/.exec(b.cond.trim()) : null;
      return m !== null && Number(m[1]) === branches.length - i;
    });
    if (dice) return { k: "random", branches: branches.map((b) => ({ body: b.body, line: b.line })), line };
    return { k: "if", branches: branches.map((b) => ({ ...b, cond: b.cond === null ? null : condition(yarnOps(b.cond), b.line, warnings) })), line };
  };

  /** A line group (`=>`): one of its lines, picked at random, with what's indented under it. */
  const lineGroup = (indent: number): Step => {
    const branches: Array<{ body: Step[]; line: number }> = [];
    const first = lines[at].line;
    while (at < lines.length && lines[at].indent === indent && lines[at].text.startsWith("=>")) {
      const { text, line } = lines[at];
      at++;
      const said = lineStep(text.slice(2).trim(), line);
      if (said[0]?.k === "if") warnings.add(line, "A condition on a line in a line group is kept on that line: when the line picked doesn't pass it, nothing is said.", "yarn-group-if");
      branches.push({ body: [...said, ...block(indent)], line });
    }
    return { k: "random", branches, line: first };
  };

  const onceBlock = (cond: string | null, line: number, stop: number): Step => {
    const branches: Array<{ cond: string | null; body: Step[]; line: number }> = [onceBranch(cond, block(stop), line)];
    for (;;) {
      const next = lines[at];
      const kind = next ? marker(next.text) : null;
      if (!next || (kind !== "else" && kind !== "endonce") || next.indent <= stop) {
        warnings.add(line, "This <<once>> is never closed with <<endonce>>.");
        break;
      }
      at++;
      if (kind === "endonce") break;
      branches.push({ cond: null, body: block(stop), line: next.line });
    }
    return { k: "if", branches, line };
  };

  const options = (indent: number): Step => {
    const list: Option[] = [];
    const first = lines[at].line;
    while (at < lines.length && lines[at].indent === indent && lines[at].text.startsWith("->")) {
      const { text, line } = lines[at];
      at++;
      const scan = scanYarn(text.slice(2).trim());
      if (scan.inline) warnings.add(line, "Inline expressions other than {$name} in text aren't supported; they're kept as written.", "yarn-inline");
      let sid: string | undefined;
      for (const tag of scan.tags) {
        if (tag.startsWith("line:")) sid = tag.slice(5);
        else warnings.add(line, "Hashtags other than #line: aren't kept.", "yarn-tags");
      }
      list.push({
        text: clean(unescapeYarn(scan.text)),
        sid,
        guard: scan.guard ? condition(yarnOps(scan.guard), line, warnings) : null,
        ...(scan.once && { once: true }),
        body: block(indent),
        line,
      });
    }
    // With no option on offer, Yarn goes on below them.
    return { k: "choices", options: list, fallsThrough: true, line: first };
  };

  const steps = block(-1);
  while (at < lines.length) {
    warnings.add(lines[at].line, "This line doesn't belong to any <<if>>, so it's left out.");
    at++;
    steps.push(...block(-1));
  }
  return steps;
}

// ---- Twine -------------------------------------------------------------------------------------

type TwineFormat = "sugarcube" | "harlowe" | "other";

type TwNode =
  | { t: "text"; text: string; line: number }
  | { t: "link"; text: string; to: string; sets: string[]; line: number; sid?: string }
  | { t: "set"; expr: string; line: number }
  | { t: "goto"; to: string; line: number }
  | { t: "if"; branches: Array<{ cond: string | null; body: TwNode[]; line: number }>; line: number }
  | { t: "sid"; id: string; line: number }
  /** Plotra's Random card: `<<set _pick to either("a", "b")>><<goto _pick>>`. */
  | { t: "random"; to: string[]; line: number }
  /** Plotra's Call card, with the `<<goto>>` after it: `<<run $plotra_calls.push("then")>>`. */
  | { t: "push"; to: string; line: number }
  /** Plotra's Return card: `<<set _back to $plotra_calls.length ? $plotra_calls.pop() : "TheEnd">><<goto _back>>`. */
  | { t: "return"; line: number };

type RawPassage = { name: string; tags: string[]; text: string; line: number };

const sugarOps = wordOps({ is: "==", isnot: "!=", eq: "==", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=" });
const harloweOps = wordOps({ is: "==", "is not": "!=" });
/** JavaScript's strict operators and `$` sigils to Plotra's. */
const tidyJs = (source: string) => mapCode(source, (code) => code.replace(/===/g, "==").replace(/!==/g, "!="));

const decodeEntities = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|#39);/gi, (_, code: string) => {
    const lower = code.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(Number(lower.slice(1)));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[lower] ?? "";
  });

/** A `[[link]]`'s inner text in any of its forms. */
function parseLink(inner: string): { text: string; to: string; setter: string | null } {
  let body = inner;
  let setter: string | null = null;
  // SugarCube's setter: [[text|target][$x to 1]]
  const split = body.indexOf("][");
  if (split >= 0) {
    setter = body.slice(split + 2);
    body = body.slice(0, split);
  }
  const bar = body.lastIndexOf("|");
  if (bar >= 0) return { text: body.slice(0, bar), to: body.slice(bar + 1), setter };
  const right = body.lastIndexOf("->");
  if (right >= 0) return { text: body.slice(0, right), to: body.slice(right + 2), setter };
  const left = body.indexOf("<-");
  if (left >= 0) return { text: body.slice(left + 2), to: body.slice(0, left), setter };
  return { text: body, to: body, setter };
}

/** Text with Twine's simplest markup taken off: wrappers, bold and italics, HTML tags. */
function plainTwine(text: string) {
  return text
    .replace(/<nowiki>([\s\S]*?)<\/nowiki>/gi, "$1")
    .replace(/"""([\s\S]*?)"""/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/''/g, "")
    .replace(/\/\/(.+?)\/\//g, "$1")
    .replace(/\u200B/g, "");
}

/**
 * Variables printed in Twine text, as Plotra's `{$name}`: SugarCube's and Harlowe's naked `$name`, `<<print $name>>`,
 * `<<= $name>>` and `(print: $name)`. Not inside `<nowiki>`; `$name.property` and the like are left as written.
 */
function twineVariables(text: string): string {
  return text
    .split(/(<nowiki>[\s\S]*?<\/nowiki>)/i)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(/<<\s*(?:print|=|-)\s*\$([A-Za-z_]\w*)\s*>>/g, "{$$$1}")
            .replace(/\(print:\s*\$([A-Za-z_]\w*)\s*\)/gi, "{$$$1}")
            .replace(/(?<![\w\\{])\$([A-Za-z_]\w*)(?![\w.[(}])/g, "{$$$1}"),
    )
    .join("");
}

/** A link's or a line's text: printed variables in Plotra's spelling, simple markup off. */
const twineText = (text: string) => plainTwine(twineVariables(text));

/** Splits `a, b` at commas outside strings and brackets. */
function splitComma(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") i++;
    else if (ch === '"' || ch === "'") {
      for (i++; i < text.length && text[i] !== ch; i++) if (text[i] === "\\") i++;
    } else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  return [...parts, text.slice(start)].map((p) => p.trim()).filter(Boolean);
}

/** A string argument (`"Room"`, `'Room'`, `[[Room]]` or a bare word). */
function stringArg(arg: string): string | null {
  const text = arg.trim();
  const quoted = /^(["'`])([\s\S]*)\1$/.exec(text);
  if (quoted) return quoted[2].replace(/\\(.)/g, "$1");
  const link = /^\[\[([\s\S]*)\]\]$/.exec(text);
  if (link) return parseLink(link[1]).to;
  if (/^[\w.-]+$/.test(text) && !text.startsWith("$")) return text;
  return null;
}

/** Arguments of a SugarCube macro: quoted strings, [[links]] and bare words. */
function macroArgs(text: string): string[] {
  const args: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|\[\[([\s\S]*?)\]\]|(\S+)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[1] !== undefined || m[2] !== undefined) args.push((m[1] ?? m[2]).replace(/\\(.)/g, "$1"));
    else if (m[3] !== undefined) args.push(`[[${m[3]}]]`);
    else args.push(m[4]);
  }
  return args;
}

/** Twine assignments (`$x to 5`, `$x += 1`, `$x++`) in Plotra's spelling. */
function twineAssignments(source: string, ops: (s: string) => string, line: number, warnings: Warnings): string[] {
  const out: string[] = [];
  for (const part of splitComma(source)) {
    const inc = /^[$_]?([A-Za-z_]\w*)\s*(\+\+|--)$/.exec(part);
    const set = /^[$_]?([A-Za-z_]\w*)\s*(to|=|\+=|-=)(?!=)\s*([\s\S]+)$/.exec(part);
    const expr = inc
      ? assignment(inc[1], `${inc[2][0]}=`, "1", line, warnings)
      : set
        ? // Harlowe's `it` is the variable being set.
          assignment(set[1], set[2] === "to" ? "=" : set[2], tidyJs(ops(ops === harloweOps ? mapCode(set[3], (code) => code.replace(/(?<![\w$.])it\b/g, set[1])) : set[3])), line, warnings)
        : (warnings.add(line, `Couldn't read the assignment “${clean(part)}”, so it's left out.`), null);
    if (expr) out.push(expr);
  }
  return out;
}

/** A SugarCube passage body as a tree. */
function parseSugarCube(text: string, firstLine: number, warnings: Warnings): TwNode[] {
  let at = 0;
  let line = firstLine;
  const advance = (to: number) => {
    for (let i = at; i < to; i++) if (text[i] === "\n") line++;
    at = to;
  };

  /** Nodes until one of the closing tags in `stops` (not consumed); returns which one. */
  const nodes = (stops: RegExp | null): { list: TwNode[]; stop: string | null } => {
    const list: TwNode[] = [];
    let buffer = "";
    let bufferLine = line;
    const flush = () => {
      if (buffer) list.push({ t: "text", text: buffer, line: bufferLine });
      buffer = "";
      bufferLine = line;
    };
    while (at < text.length) {
      const rest = text.slice(at, at + 12);
      if (text.startsWith("/*", at) || text.startsWith("/%", at) || text.startsWith("<!--", at)) {
        const close = text.startsWith("/*", at) ? "*/" : text.startsWith("/%", at) ? "%/" : "-->";
        const end = text.indexOf(close, at + 2);
        const stop = end < 0 ? text.length : end + close.length;
        const id = /^\/\*\s*id:(\S+)\s*\*\/$/.exec(text.slice(at, stop));
        const commentLine = line;
        flush();
        advance(stop);
        if (id) list.push({ t: "sid", id: id[1], line: commentLine });
        bufferLine = line;
        continue;
      }
      if (/^<nowiki>/i.test(rest)) {
        const end = text.toLowerCase().indexOf("</nowiki>", at);
        const stop = end < 0 ? text.length : end + 9;
        buffer += text.slice(at, stop);
        advance(stop);
        continue;
      }
      if (text.startsWith("[[", at)) {
        const end = text.indexOf("]]", at);
        if (end >= 0) {
          // A setter link has a second pair of brackets.
          const stop = text.startsWith("][", end) ? text.indexOf("]]", end + 2) : end;
          const close = stop < 0 ? end : stop;
          const link = parseLink(text.slice(at + 2, close));
          flush();
          const linkLine = line;
          advance(close + 2);
          list.push({
            t: "link",
            text: twineText(link.text).trim(),
            to: link.to.trim(),
            sets: link.setter ? twineAssignments(link.setter, sugarOps, linkLine, warnings) : [],
            line: linkLine,
          });
          bufferLine = line;
          continue;
        }
      }
      if (text.startsWith("<<", at)) {
        const end = matching(text, at, "<<", ">>");
        if (end >= 0) {
          const inner = text.slice(at + 2, end).trim();
          // A printed variable stays part of the text around it.
          const printed = /^(?:print|=|-)\s*\$([A-Za-z_]\w*)\s*$/.exec(inner);
          if (printed) {
            if (!buffer) bufferLine = line;
            buffer += `{$${printed[1]}}`;
            advance(end + 2);
            continue;
          }
          const closing = /^\/\s*(\w+)|^end(\w+)/.exec(inner);
          const name = closing ? `/${closing[1] ?? closing[2]}` : (/^([\w=-]+)/.exec(inner)?.[1] ?? "");
          if (stops && stops.test(name)) {
            flush();
            return { list, stop: name };
          }
          flush();
          const macroLine = line;
          advance(end + 2);
          const args = inner.slice(name.length).trim();
          list.push(...macro(name, args, macroLine));
          bufferLine = line;
          continue;
        }
      }
      if (!buffer) bufferLine = line;
      buffer += text[at];
      advance(at + 1);
    }
    flush();
    return { list, stop: null };
  };

  /** Temporary variables Plotra's Random and Return cards go to (`<<goto _pick>>`), already read with them. */
  const temps = new Set<string>();

  const macro = (name: string, args: string, macroLine: number): TwNode[] => {
    switch (name) {
      case "set": {
        const random = /^(_\w+)\s+to\s+either\(([\s\S]*)\)$/.exec(args);
        const ways = random ? splitComma(random[2]).map(stringArg) : [];
        if (random && ways.length && ways.every((w) => w !== null)) {
          temps.add(random[1]);
          return [{ t: "random", to: ways as string[], line: macroLine }];
        }
        const back = /^(_\w+)\s+to\s+\$(\w+)\.length\s*\?\s*\$(\w+)\.pop\(\)\s*:[\s\S]*$/.exec(args);
        if (back && back[2] === back[3]) {
          temps.add(back[1]);
          return [{ t: "return", line: macroLine }];
        }
        // Plotra's call stack starts empty; it's not a variable of the dialogue.
        if (/^\$plotra_calls(_\d+)?\s+to\s+\[\s*\]$/.test(args)) return [];
        return twineAssignments(args, sugarOps, macroLine, warnings).map((expr) => ({ t: "set", expr, line: macroLine }));
      }
      case "run": {
        const push = /^\$\w+\.push\(([\s\S]+)\)$/.exec(args);
        const to = push ? stringArg(push[1]) : null;
        if (to !== null) return [{ t: "push", to, line: macroLine }];
        warnings.add(macroLine, "<<run>> isn't something a dialogue can do, so it's left out.", "sugar-run");
        return [];
      }
      case "goto": {
        if (temps.has(args.trim())) return [];
        const to = stringArg(args);
        if (to === null) {
          warnings.add(macroLine, "A <<goto>> to a passage named by an expression isn't supported, so it's left out.");
          return [];
        }
        return [{ t: "goto", to, line: macroLine }];
      }
      case "if": {
        const branches: Array<{ cond: string | null; body: TwNode[]; line: number }> = [];
        let cond: string | null = tidyJs(sugarOps(args));
        let branchLine = macroLine;
        for (;;) {
          const { list, stop } = nodes(/^(elseif|else|\/if)$/);
          branches.push({ cond: cond === null ? null : condition(cond, branchLine, warnings), body: list, line: branchLine });
          if (!stop) {
            warnings.add(macroLine, "This <<if>> is never closed with <</if>>.");
            break;
          }
          const end = matching(text, at, "<<", ">>");
          const inner = text.slice(at + 2, end).trim();
          branchLine = line;
          advance(end + 2);
          if (stop === "/if") break;
          cond = stop === "else" ? null : tidyJs(sugarOps(inner.replace(/^elseif\s*/, "")));
        }
        return [{ t: "if", branches, line: macroLine }];
      }
      case "link":
      case "button": {
        const [label, target] = macroArgs(args);
        const { list, stop } = nodes(new RegExp(`^/${name}$`));
        if (stop) advance(matching(text, at, "<<", ">>") + 2);
        const inner = list.filter((n) => n.t === "set" || n.t === "goto");
        const link = label !== undefined ? /^\[\[([\s\S]*)\]\]$/.exec(label) : null;
        const innerGoto = (inner.find((n) => n.t === "goto") as { to: string } | undefined)?.to;
        const to = target !== undefined ? (stringArg(target) ?? target) : link ? parseLink(link[1]).to : innerGoto;
        if (label === undefined || !to) {
          warnings.add(macroLine, `A <<${name}>> that doesn't go to another passage isn't supported, so it's left out.`);
          return [];
        }
        return [
          {
            t: "link",
            text: twineText(link ? parseLink(link[1]).text : label).trim(),
            to,
            sets: inner.filter((n) => n.t === "set").map((n) => (n as { expr: string }).expr),
            line: macroLine,
          },
        ];
      }
      case "silently":
      case "nobr": {
        const { list, stop } = nodes(new RegExp(`^/${name}$`));
        if (stop) advance(matching(text, at, "<<", ">>") + 2);
        return list;
      }
      case "else":
      case "elseif":
      case "/if":
        warnings.add(macroLine, `<<${name}>> without an <<if>> is left out.`);
        return [];
      default:
        if (name.startsWith("/")) return [];
        warnings.add(macroLine, `<<${name}>> isn't something a dialogue can do, so it's left out.`, `sugar-${name}`);
        return [];
    }
  };

  return nodes(null).list;
}

/** A Harlowe passage body as a tree. */
function parseHarlowe(text: string, firstLine: number, warnings: Warnings): TwNode[] {
  const lineAt = (index: number) => firstLine + (text.slice(0, index).match(/\n/g)?.length ?? 0);

  const nodes = (from: number, to: number): TwNode[] => {
    const list: TwNode[] = [];
    let buffer = "";
    let bufferStart = from;
    const flush = () => {
      if (buffer) list.push({ t: "text", text: buffer, line: lineAt(bufferStart) });
      buffer = "";
    };
    let i = from;
    /** The hook right after a macro, if there is one: its inner range. */
    const hookAfter = (index: number): [number, number] | null => {
      let j = index;
      while (j < to && /[ \t]/.test(text[j])) j++;
      if (text[j] !== "[" || text[j + 1] === "[") return null;
      const end = matching(text, j, "[", "]");
      return end < 0 ? null : [j + 1, end];
    };
    while (i < to) {
      if (text.startsWith("<!--", i)) {
        const end = text.indexOf("-->", i);
        flush();
        i = end < 0 ? to : end + 3;
        bufferStart = i;
        continue;
      }
      if (text.startsWith("[[", i)) {
        const end = text.indexOf("]]", i);
        if (end >= 0 && end < to) {
          flush();
          const link = parseLink(text.slice(i + 2, end));
          list.push({ t: "link", text: twineText(link.text).trim(), to: link.to.trim(), sets: [], line: lineAt(i) });
          i = end + 2;
          bufferStart = i;
          continue;
        }
      }
      const head = /^\(([\w-]+):/.exec(text.slice(i, i + 40));
      if (head) {
        const end = matching(text, i, "(", ")");
        const printed = end >= 0 && end < to && head[1].toLowerCase() === "print" ? /^\$([A-Za-z_]\w*)$/.exec(text.slice(i + head[0].length, end).trim()) : null;
        if (printed) {
          // A printed variable stays part of the text around it.
          if (!buffer) bufferStart = i;
          buffer += `{$${printed[1]}}`;
          i = end + 1;
          continue;
        }
        if (end >= 0 && end < to) {
          flush();
          const name = head[1].toLowerCase().replace(/-/g, "");
          const args = text.slice(i + head[0].length, end).trim();
          const line = lineAt(i);
          let next = end + 1;
          const hook = hookAfter(next);
          if (name === "if" || name === "unless") {
            const branches: Array<{ cond: string | null; body: TwNode[]; line: number }> = [];
            const first = condition(tidyJs(harloweOps(args)), line, warnings);
            branches.push({ cond: name === "unless" ? `!(${first})` : first, body: hook ? nodes(hook[0], hook[1]) : [], line });
            if (hook) next = hook[1] + 1;
            // Else-ifs and elses follow, with only whitespace between.
            for (;;) {
              let j = next;
              while (j < to && /\s/.test(text[j])) j++;
              const more = /^\((else-?if|else):/i.exec(text.slice(j, j + 12));
              if (!more) break;
              const close = matching(text, j, "(", ")");
              if (close < 0) break;
              const moreHook = hookAfter(close + 1);
              const moreArgs = text.slice(j + more[0].length, close).trim();
              const isElse = more[1].toLowerCase() === "else";
              branches.push({ cond: isElse ? null : condition(tidyJs(harloweOps(moreArgs)), lineAt(j), warnings), body: moreHook ? nodes(moreHook[0], moreHook[1]) : [], line: lineAt(j) });
              next = moreHook ? moreHook[1] + 1 : close + 1;
              if (isElse) break;
            }
            list.push({ t: "if", branches, line });
          } else if (name === "set") {
            for (const expr of twineAssignments(args, harloweOps, line, warnings)) list.push({ t: "set", expr, line });
          } else if (name === "put") {
            for (const part of splitComma(args)) {
              const put = /^([\s\S]+?)\s+into\s+[$_]?([A-Za-z_]\w*)$/.exec(part);
              const expr = put ? assignment(put[2], "=", tidyJs(harloweOps(put[1])), line, warnings) : null;
              if (!put) warnings.add(line, `Couldn't read “(put: ${clean(part)})”, so it's left out.`);
              if (expr) list.push({ t: "set", expr, line });
            }
          } else if (name === "goto") {
            const to = stringArg(args);
            if (to !== null) list.push({ t: "goto", to, line });
            else warnings.add(line, "A (goto:) to a passage named by an expression isn't supported, so it's left out.");
          } else if (name === "linkgoto" || name === "clickgoto") {
            const parts = splitComma(args).map(stringArg);
            const [label, target] = parts.length > 1 ? parts : [parts[0], parts[0]];
            if (label && target) list.push({ t: "link", text: twineText(label).trim(), to: target, sets: [], line });
            else warnings.add(line, `A (${head[1]}:) that can't be read is left out.`);
          } else if ((name === "link" || name === "linkreveal") && hook) {
            const label = stringArg(splitComma(args)[0] ?? "");
            const inner = nodes(hook[0], hook[1]);
            const goto = inner.find((n) => n.t === "goto") as { to: string } | undefined;
            if (label && goto) {
              list.push({ t: "link", text: twineText(label).trim(), to: goto.to, sets: inner.filter((n) => n.t === "set").map((n) => (n as { expr: string }).expr), line });
            } else {
              warnings.add(line, `A (${head[1]}:) that doesn't go to another passage isn't supported; its hook is imported in its place.`);
              list.push(...inner);
            }
            next = hook[1] + 1;
          } else {
            warnings.add(line, `(${head[1]}:) isn't something a dialogue can do, so it's left out.`, `harlowe-${name}`);
            if (hook) {
              // A hook a changer applies to is still text to show.
              list.push(...nodes(hook[0], hook[1]));
              next = hook[1] + 1;
            }
          }
          i = next;
          bufferStart = i;
          continue;
        }
      }
      buffer += text[i];
      i++;
    }
    flush();
    return list;
  };
  return nodes(0, text.length);
}

const CONTINUE = /^(continue|next|more|\.\.\.|…)[\s.!»→>-]*$/i;

/** Plotra's own closing passage (see `toTwee`), which is an End card, not a line. */
const isPlotraEnd = (passage: RawPassage) => passage.name === "TheEnd" && passage.text.trim() === "The end.";

/** A passage tree as steps: text lines in place, links gathered into the choices offered at its end. */
function twineSteps(tree: TwNode[], warnings: Warnings): Step[] {
  type Found = { link: Extract<TwNode, { t: "link" }>; guard: string | null };
  const links: Found[] = [];
  const gather = (list: TwNode[], guard: string | null) => {
    for (const node of list) {
      if (node.t === "link") links.push({ link: node, guard });
      else if (node.t === "if") {
        let before: string | null = null;
        for (const branch of node.branches) {
          const own = branch.cond === null ? before : and(before, branch.cond);
          gather(branch.body, own === null ? guard : and(guard, own));
          if (branch.cond !== null) before = and(before, not(branch.cond));
        }
      }
    }
  };
  gather(tree, null);
  // “Continue” is how a passage moves on, not a choice: unless there are other choices that are always on offer.
  const choiceLinks = links.filter((f) => !CONTINUE.test(f.link.text));
  const continueIsJump = !choiceLinks.length || choiceLinks.every((f) => f.guard);
  const isChoice = (link: Extract<TwNode, { t: "link" }>) => !(continueIsJump && CONTINUE.test(link.text));

  let last: { sid?: string } | null = null;
  /** A call waiting for the <<goto>> that makes it. */
  let push: Extract<TwNode, { t: "push" }> | null = null;
  const convert = (list: TwNode[]): Step[] => {
    const steps: Step[] = [];
    for (const node of list) {
      if (push && node.t !== "goto") {
        warnings.add(push.line, "A <<run>> that pushes onto the call stack without a <<goto>> after it is left out.");
        push = null;
      }
      switch (node.t) {
        case "push":
          push = node;
          break;
        case "random":
          steps.push({ k: "random", line: node.line, branches: node.to.map((to) => ({ body: [{ k: "goto", to: [to], label: to, line: node.line }], line: node.line })) });
          break;
        case "return":
          steps.push({ k: "return", line: node.line });
          break;
        case "text": {
          const lines = node.text.split("\n");
          lines.forEach((raw, i) => {
            const text = clean(twineText(raw));
            if (!text) return;
            if (/(?<![\w\\])[$_][A-Za-z]\w*/.test(text.replace(/\{\$\w+\}/g, "")) && !/^<nowiki>/i.test(raw.trim())) {
              warnings.add(node.line + i, "Only plain variables ($name) printed in text are read; this one is kept as written.", "twine-print");
            }
            const step: Step = { k: "line", ...splitSpeaker(text), line: node.line + i };
            steps.push(step);
            last = step;
          });
          break;
        }
        case "sid":
          if (last && !last.sid) last.sid = node.id;
          break;
        case "set":
          steps.push({ k: "set", expr: node.expr, line: node.line });
          break;
        case "goto":
          // After a push: a call of this passage, then on to the one pushed.
          if (push) steps.push({ k: "call", to: [node.to], label: node.to, line: node.line }, { k: "goto", to: [push.to], label: push.to, line: push.line });
          else steps.push({ k: "goto", to: [node.to], label: node.to, line: node.line });
          push = null;
          break;
        case "link":
          if (!isChoice(node)) {
            steps.push(...node.sets.map((expr): Step => ({ k: "set", expr, line: node.line })), { k: "goto", to: [node.to], label: node.to, line: node.line });
          }
          // A choice's id comment follows it.
          last = node;
          break;
        case "if": {
          const branches = node.branches.map((b) => ({ cond: b.cond, body: convert(b.body), line: b.line }));
          if (branches.some((b) => b.body.length)) steps.push({ k: "if", branches, line: node.line });
          break;
        }
      }
    }
    return steps;
  };
  const steps = convert(tree);
  const options: Option[] = links
    .filter((f) => isChoice(f.link))
    .map((f) => ({
      text: f.link.text,
      sid: f.link.sid,
      guard: f.guard && condition(f.guard, f.link.line, warnings),
      body: [...f.link.sets.map((expr): Step => ({ k: "set", expr, line: f.link.line })), { k: "goto", to: [f.link.to], label: f.link.to, line: f.link.line }],
      line: f.link.line,
    }));
  if (options.length) steps.push({ k: "choices", options, line: options[0].line });
  return steps;
}

/** Passages of a Twee file. */
function tweePassages(source: string, warnings: Warnings): RawPassage[] {
  const lines = linesOf(source);
  const passages: RawPassage[] = [];
  let current: RawPassage | null = null;
  let body: string[] = [];
  const close = () => {
    if (current) passages.push({ ...current, text: body.join("\n").replace(/\s+$/, "") });
    body = [];
  };
  lines.forEach((text, i) => {
    if (text.startsWith("::")) {
      close();
      const header = text.slice(2).trim();
      // The name runs to an unescaped [ or {; escapes in it are taken off.
      const end = header.search(/(?<!\\)[[{]/);
      const name = (end < 0 ? header : header.slice(0, end)).trim().replace(/\\(.)/g, "$1");
      const tags = /(?<!\\)\[([^\]]*)\]/.exec(header.slice(end < 0 ? header.length : end))?.[1].split(/\s+/).filter(Boolean) ?? [];
      current = { name, tags, text: "", line: i + 2 };
    } else if (current) body.push(text);
    else if (text.trim()) warnings.add(i + 1, "Text before the first passage is left out.", "twee-preamble");
  });
  close();
  return passages;
}

/** Passages of a Twine 2 archive or published story, with its title, start and format. */
function htmlStory(source: string, warnings: Warnings): { passages: RawPassage[]; title: string | null; start: string | null; format: string | null } {
  const data = /<tw-storydata\b([^>]*)>([\s\S]*?)<\/tw-storydata>/i.exec(source);
  if (!data) throw new Error("That HTML file isn't a Twine 2 story: it has no <tw-storydata>.");
  const attributes = (raw: string) => {
    const out = new Map<string, string>();
    for (const m of raw.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out.set(m[1].toLowerCase(), decodeEntities(m[2] ?? m[3] ?? ""));
    return out;
  };
  const story = attributes(data[1]);
  const offset = data.index + data[0].indexOf(">") + 1;
  const lineAt = (index: number) => (source.slice(0, index).match(/\n/g)?.length ?? 0) + 1;
  const passages: RawPassage[] = [];
  let startName: string | null = null;
  for (const m of data[2].matchAll(/<tw-passagedata\b([^>]*)>([\s\S]*?)<\/tw-passagedata>/gi)) {
    const attrs = attributes(m[1]);
    const name = attrs.get("name") ?? "";
    const opening = m[0].indexOf(">") + 1;
    passages.push({ name, tags: (attrs.get("tags") ?? "").split(/\s+/).filter(Boolean), text: decodeEntities(m[2]), line: lineAt(offset + m.index + opening) });
    if (attrs.get("pid") === story.get("startnode")) startName = name;
  }
  if (/<script\b[^>]*role=["']script["'][^>]*>\s*\S/i.test(data[2])) warnings.add(null, "The story's JavaScript is left out.");
  return { passages, title: story.get("name") || null, start: startName, format: story.get("format") || null };
}

const SPECIAL_PASSAGES = new Set([
  "StoryCaption",
  "StoryMenu",
  "StoryBanner",
  "StorySubtitle",
  "StoryAuthor",
  "StoryInterface",
  "StoryShare",
  "PassageReady",
  "PassageDone",
  "PassageHeader",
  "PassageFooter",
]);

function readTwine(passages: RawPassage[], meta: { title: string | null; start: string | null; format: string | null }, warnings: Warnings): Story {
  const story: Story = { passages: [], start: meta.start, variables: [], title: meta.title };
  let formatName = meta.format;
  for (const p of passages) {
    if (p.name === "StoryTitle") story.title = clean(p.text) || story.title;
    if (p.name === "StoryData") {
      try {
        const data = JSON.parse(p.text) as { start?: unknown; format?: unknown };
        if (typeof data.start === "string") story.start = data.start;
        if (typeof data.format === "string") formatName = data.format;
      } catch {
        warnings.add(p.line, "StoryData isn't JSON Plotra can read, so it's left out.");
      }
    }
  }
  const all = passages.map((p) => p.text).join("\n");
  const format: TwineFormat = /harlowe/i.test(formatName ?? "")
    ? "harlowe"
    : /sugarcube/i.test(formatName ?? "")
      ? "sugarcube"
      : formatName
        ? "other"
        : /\((set|if|link-goto|goto|put):/i.test(all) && !/<<\w/.test(all)
          ? "harlowe"
          : "sugarcube";
  if (format === "other") warnings.add(null, `Only links are read from ${formatName} stories; its macros and code are imported as text.`);
  const parse = (text: string, line: number) => (format === "harlowe" ? parseHarlowe(text, line, warnings) : parseSugarCube(text, line, warnings));

  for (const p of passages) {
    if (p.name === "StoryTitle" || p.name === "StoryData") continue;
    if (p.tags.some((t) => t === "script" || t === "stylesheet" || t === "Twine.private" || t === "Twine.image")) {
      if (p.tags.includes("script")) warnings.add(p.line, `The script passage “${p.name}” is left out.`);
      continue;
    }
    if (p.tags.includes("widget") || SPECIAL_PASSAGES.has(p.name)) {
      warnings.add(p.line, `The special passage “${p.name}” is left out.`);
      continue;
    }
    if (p.name === "StoryInit" || p.tags.includes("startup")) {
      // Starting values of variables; anything else there is left out.
      for (const node of parse(p.text, p.line)) {
        if (node.t === "set") {
          const m = /^([A-Za-z_]\w*) = ([\s\S]+)$/.exec(node.expr);
          const value = m ? literal(m[2]) : undefined;
          if (m && value !== undefined) story.variables.push({ name: m[1], value, line: node.line });
          else warnings.add(node.line, `Only plain starting values are read from ${p.name}: “${node.expr}” is left out.`);
        } else if (node.t !== "text" || node.text.trim()) warnings.add(node.line, `Only <<set>> is read from ${p.name}; the rest is left out.`, `init-${p.name}`);
      }
      continue;
    }
    if (isPlotraEnd(p)) {
      story.passages.push({ name: p.name, steps: [{ k: "end", line: p.line }], line: p.line });
      continue;
    }
    story.passages.push({ name: p.name, steps: twineSteps(parse(p.text, p.line), warnings), line: p.line });
  }
  if (!story.start || !story.passages.some((p) => p.name === story.start)) {
    story.start = story.passages.find((p) => p.name === "Start")?.name ?? story.passages[0]?.name ?? null;
  }
  return story;
}

/** The `<tw-storydata>` of a Twine HTML file, with line breaks in front so line numbers still match. Null when there's none. */
export function extractTwineStory(html: string): string | null {
  const match = /<tw-storydata\b[\s\S]*?<\/tw-storydata>/i.exec(html);
  if (!match) return null;
  return "\n".repeat(html.slice(0, match.index).match(/\n/g)?.length ?? 0) + match[0];
}

// ---- From the outline to cards -----------------------------------------------------------------

/** Cards to join to; a passage or label to look up once every passage is made; or several of these, in order. */
type Target = { ids: string[] } | { to: string[]; label: string; line: number } | { all: Target[] };
type Lazy = () => Target;

const COLUMN = 320;
const GAP = 40;

/** Roughly how tall a card is drawn, so a laid-out column doesn't overlap. */
function cardHeight(node: DialogueNode) {
  if (node.type === "start" || node.type === "end" || node.type === "return") return 36;
  if (node.type === "random" || node.type === "call") return 64;
  const text = (node.type === "line" || node.type === "choice" ? node.text : node.expr) ?? "";
  const rows = Math.max(1, Math.ceil(text.length / 32)) + (text.match(/\n/g)?.length ?? 0);
  return 44 + rows * 18 + (node.type === "condition" ? 52 : 0);
}

function buildGraph(story: Story, options: ImportOptions, warnings: Warnings): Omit<ImportResult, "format" | "title"> {
  const nodes: Record<string, DialogueNode> = {};
  /** Joins in the order made, which is the order a card's choices are offered. */
  /** `single`: the join must arrive at one card (a Random card's way), however many its target resolves to. */
  const joins: Array<{ source: string; target: Target; handle?: "true" | "false"; single?: boolean }> = [];
  /** Call cards and what they call, resolved once every passage is made. */
  const calls: Array<{ id: string; target: Target }> = [];
  /** Passages and labels by name. A passage with nothing in it only gets its End card when something jumps there. */
  const names = new Map<string, Lazy>();
  let count = 0;

  const card = (node: Omit<DialogueNode, "x" | "y">) => {
    if (++count > MAX_IMPORT_CARDS) throw new Error(`That file would make more than ${MAX_IMPORT_CARDS.toLocaleString("en")} cards. Split it into several dialogues.`);
    const id = crypto.randomUUID();
    nodes[id] = { ...node, x: 0, y: 0 };
    return id;
  };
  const join = (source: string, target: Target, handle?: "true" | "false", single?: boolean) => joins.push({ source, target, ...(handle && { handle }), ...(single && { single }) });
  const memo = (make: () => Target): Lazy => {
    let value: Target | undefined;
    return () => (value ??= make());
  };
  const fixed = (target: Target): Lazy => () => target;
  const fit = (text: string, line: number) => {
    if (text.length <= MAX_TEXT) return text;
    warnings.add(line, `This text is longer than ${MAX_TEXT.toLocaleString("en")} characters, the most a card holds, so it's cut there.`);
    return text.slice(0, MAX_TEXT);
  };

  /** Steps after a jump or an end can't be reached, until the next label. */
  const reachable = (steps: Step[]) => {
    const out: Step[] = [];
    let dead = false;
    for (const step of steps) {
      if (step.k === "label") dead = false;
      if (!dead) out.push(step);
      if (step.k === "goto" || step.k === "end" || step.k === "return") dead = true;
    }
    // Assignments one after another are one Set card. A note goes on the next line, or the last one when none follows.
    const merged: Step[] = [];
    const notes: Extract<Step, { k: "note" }>[] = [];
    const noted = (step: Extract<Step, { k: "line" }>, add: string[]) => ({ ...step, note: [step.note, ...add].filter(Boolean).join(" ").slice(0, MAX_NOTE) });
    for (const step of out) {
      const prev = merged.at(-1);
      if (step.k === "note") notes.push(step);
      else if (step.k === "set" && prev?.k === "set") merged[merged.length - 1] = { ...prev, expr: `${prev.expr}; ${step.expr}` };
      else if (step.k === "line" && notes.length) merged.push(noted(step, notes.splice(0).map((n) => `Before this line: ${n.text}`)));
      // Before a Random card: on whichever line it picks.
      else if (step.k === "random" && notes.length) {
        const before = notes.splice(0);
        merged.push({ ...step, branches: step.branches.map((b) => ({ ...b, body: [...before, ...b.body] })) });
      }
      else merged.push(step);
    }
    if (notes.length) {
      const last = merged.findLastIndex((step) => step.k === "line");
      if (last >= 0) merged[last] = noted(merged[last] as Extract<Step, { k: "line" }>, notes.map((n) => `After this line: ${n.text}`));
      else for (const n of notes) warnings.add(n.line, `There's no line near ${n.text} to keep it with, so it's left out.`);
    }
    return merged;
  };

  const sequence = (steps: Step[], tail: Lazy): Target => {
    let next = tail;
    const list = reachable(steps);
    for (let i = list.length - 1; i >= 0; i--) {
      const step = list[i];
      switch (step.k) {
        case "label": {
          const target = next();
          names.set(step.name, fixed(target));
          next = fixed(target);
          break;
        }
        case "line": {
          const id = card({
            type: "line",
            speaker: step.speaker.slice(0, 100) || undefined,
            text: fit(step.text, step.line),
            ...(step.sid && { sid: step.sid }),
            ...(step.note && { note: step.note }),
          });
          join(id, next());
          next = fixed({ ids: [id] });
          break;
        }
        case "set": {
          const id = card({ type: "set", expr: step.expr });
          join(id, next());
          next = fixed({ ids: [id] });
          break;
        }
        case "end":
          next = fixed({ ids: [card({ type: "end" })] });
          break;
        case "goto":
          next = fixed({ to: step.to, label: step.label, line: step.line });
          break;
        case "return":
          next = fixed({ ids: [card({ type: "return" })] });
          break;
        case "call": {
          const id = card({ type: "call" });
          join(id, next());
          calls.push({ id, target: { to: step.to, label: step.label, line: step.line } });
          next = fixed({ ids: [id] });
          break;
        }
        case "random": {
          const after = next;
          const id = card({ type: "random" });
          for (const branch of step.branches) join(id, sequence(branch.body, after), undefined, true);
          next = fixed({ ids: [id] });
          break;
        }
        case "if": {
          const after = next;
          const last = step.branches.at(-1)!;
          let otherwise: Lazy = last.cond === null ? memo(() => sequence(last.body, after)) : after;
          const conditional = last.cond === null ? step.branches.slice(0, -1) : step.branches;
          for (let b = conditional.length - 1; b >= 0; b--) {
            const branch = conditional[b];
            const id = card({ type: "condition", expr: branch.cond ?? "true" });
            join(id, sequence(branch.body, after), "true");
            join(id, otherwise(), "false");
            otherwise = fixed({ ids: [id] });
          }
          next = otherwise;
          break;
        }
        case "choices": {
          const after = next;
          const entries: string[] = [];
          const guards: string[] = [];
          for (const option of step.options) {
            const choice = card({ type: "choice", text: fit(option.text, option.line), ...(option.sid && { sid: option.sid }), ...(option.once && { once: true }) });
            join(choice, sequence(option.body, after));
            if (option.guard) {
              const guard = card({ type: "condition", expr: option.guard });
              join(guard, { ids: [choice] }, "true");
              guards.push(guard);
              entries.push(guard);
            } else entries.push(choice);
          }
          // Where the dialogue goes when no choice is on offer. The play-through then takes the topmost jump that isn't
          // a choice: a condition's false side, or (with once-only choices used up) a jump beside the choices.
          const allGuarded = step.options.every((o) => o.guard);
          const anyOnce = step.options.some((o) => o.once);
          const none = step.fallback ? memo(() => sequence(step.fallback!, after)) : allGuarded || (anyOnce && step.fallsThrough) ? after : null;
          if (none && (allGuarded || anyOnce)) {
            for (const guard of guards) join(guard, none(), "false");
          }
          // Beside the choices, below them, so it's never mistaken for one.
          next = fixed(none && anyOnce && !allGuarded ? { all: [{ ids: entries }, none()] } : { ids: entries });
          break;
        }
      }
    }
    return next();
  };

  // Each passage, ending where it runs out (as Ink, Yarn and Twine all do).
  for (const passage of story.passages) {
    if (names.has(passage.name)) {
      warnings.add(passage.line, `There are two passages called “${passage.name}”; only the first is imported.`);
      continue;
    }
    const end = memo(() => ({ ids: [card({ type: "end" })] }));
    names.set(passage.name, passage.steps.length ? fixed(sequence(passage.steps, end)) : end);
  }

  const resolve = (target: Target, seen = new Set<string>()): string[] | null => {
    if ("ids" in target) return target.ids;
    if ("all" in target) {
      const ids: string[] = [];
      for (const part of target.all) {
        const found = resolve(part, new Set(seen));
        if (!found) return null;
        ids.push(...found);
      }
      return [...new Set(ids)];
    }
    const name = target.to.find((n) => names.has(n));
    if (name === undefined || seen.has(name)) return null;
    seen.add(name);
    return resolve(names.get(name)!(), seen);
  };
  const ends = new Map<string, string>();
  const resolved = (target: Target): string[] => {
    if ("all" in target) return [...new Set(target.all.flatMap(resolved))];
    const ids = resolve(target);
    if (ids) return ids;
    const t = target as Extract<Target, { to: string[] }>;
    const known = t.to.some((n) => names.has(n));
    warnings.add(t.line, known ? `“${t.label}” only ever jumps back to itself, so the dialogue ends there.` : `There's nothing called “${t.label}” to jump to, so the dialogue ends there.`);
    let end = ends.get(t.label);
    if (!end) ends.set(t.label, (end = card({ type: "end" })));
    return [end];
  };

  nodes.start = { type: "start", x: 0, y: 0 };
  const edges: Record<string, DialogueEdge> = {};
  const out = new Map<string, string[]>();
  const add = (source: string, target: string, handle?: "true" | "false") => {
    const key = `${source}>${target}>${handle ?? ""}`;
    if (edges[key]) return;
    edges[key] = { source, target, ...(handle && { sourceHandle: handle }) };
    out.set(source, [...(out.get(source) ?? []), target]);
  };
  const first = story.start !== null ? names.get(story.start) : undefined;
  if (first) for (const id of resolved(first())) add("start", id);
  /**
   * One card standing for several: a Condition that's always true, leading to them all. A Random card's way or a
   * call that leads to a group of choices goes to it, and play offers them all, as the file does.
   */
  const hub = (ids: string[]) => {
    const id = card({ type: "condition", expr: "true" });
    for (const target of ids) add(id, target, "true");
    return id;
  };
  for (const j of joins) {
    const ids = resolved(j.target);
    // Two ways to the same card would be one jump, and the pick no longer even.
    if (j.single && (ids.length > 1 || edges[`${j.source}>${ids[0]}>`])) add(j.source, hub(ids));
    else for (const id of ids) add(j.source, id, j.handle);
  }
  for (const c of calls) {
    const ids = resolved(c.target);
    const target = ids.length === 1 ? ids[0] : hub(ids);
    nodes[c.id].target = target;
    // Laid out next to the call.
    out.set(c.id, [target, ...(out.get(c.id) ?? [])]);
  }

  // Edge ids: fresh ones, like the editor's.
  const finalEdges: Record<string, DialogueEdge> = {};
  for (const edge of Object.values(edges)) finalEdges[crypto.randomUUID()] = edge;

  layout(nodes, out);

  // Variables: the file's own, then any it uses without declaring.
  const variables: Record<string, DialogueVariable> = {};
  const declared = new Set<string>();
  let order = 0;
  for (const v of story.variables) {
    if (!VARIABLE_NAME.test(v.name)) warnings.add(v.line, `“${v.name}” can't be a variable name here, so it's left out.`);
    else if (declared.has(v.name)) warnings.add(v.line, `“${v.name}” is declared twice; the first value is kept.`);
    else {
      declared.add(v.name);
      variables[crypto.randomUUID()] = { name: v.name, value: v.value, order: order++ };
    }
  }
  const implicit = implicitVariables(nodes, declared);
  if (implicit.length) {
    warnings.add(null, `The file uses ${implicit.map((v) => `“${v.name}”`).join(", ")} without declaring ${implicit.length === 1 ? "it" : "them"}, so ${implicit.length === 1 ? "it starts" : "they start"} empty (0, false or "").`);
    for (const v of implicit) variables[crypto.randomUUID()] = { name: v.name, value: v.value, order: order++ };
  }

  const counter = assignStringIds({ nodes, edges: finalEdges, variables }, options, warnings);
  return { graph: { nodes, edges: finalEdges, variables }, warnings: [], counter };
}

/** Columns by distance from Start; in a column, cards in the order they're reached, each near the card that leads to it. */
function layout(nodes: Record<string, DialogueNode>, out: Map<string, string[]>) {
  const placed = new Set<string>();
  let bottom = 0;
  const band = (root: string, top: number) => {
    let layer = [root];
    let depth = 0;
    placed.add(root);
    Object.assign(nodes[root], { x: 0, y: top });
    while (layer.length) {
      const next: string[] = [];
      let floor = -Infinity;
      for (const parent of layer) {
        const children = (out.get(parent) ?? []).filter((id) => !placed.has(id));
        children.forEach((id, i) => {
          placed.add(id);
          next.push(id);
          const wanted = i === 0 ? nodes[parent].y : -Infinity;
          const y = Math.max(wanted, floor);
          Object.assign(nodes[id], { x: (depth + 1) * COLUMN, y: Math.round(y) });
          floor = y + cardHeight(nodes[id]) + GAP;
        });
      }
      for (const id of layer) bottom = Math.max(bottom, nodes[id].y + cardHeight(nodes[id]));
      layer = next;
      depth++;
    }
  };
  band("start", 0);
  // Whatever Start doesn't reach goes below, a band per loose end.
  const incoming = new Set([...out.values()].flat());
  for (const loose of [true, false]) {
    for (const id of Object.keys(nodes)) {
      if (placed.has(id) || (loose && incoming.has(id))) continue;
      band(id, bottom + GAP * 3);
    }
  }
}

/** Names an expression reads. */
function readsOf(expr: Expr, into: Set<string>) {
  if (expr.kind === "variable") into.add(expr.name);
  else if (expr.kind === "unary") readsOf(expr.arg, into);
  else if (expr.kind === "binary") {
    readsOf(expr.left, into);
    readsOf(expr.right, into);
  }
}

function implicitVariables(nodes: Record<string, DialogueNode>, declared: Set<string>): Array<{ name: string; value: DialogueValue }> {
  const found = new Map<string, DialogueValue>();
  const want = (name: string, value: DialogueValue) => {
    if (!declared.has(name) && !found.has(name)) found.set(name, value);
  };
  for (const node of Object.values(nodes)) {
    if (node.type === "condition") {
      const parsed = tryParse(() => parseExpression(node.expr ?? ""));
      const reads = new Set<string>();
      if (parsed) readsOf(parsed, reads);
      for (const name of reads) want(name, false);
    } else if (node.type === "set") {
      for (const a of tryParse(() => parseAssignments(node.expr ?? "")) ?? []) {
        const reads = new Set<string>();
        readsOf(a.value, reads);
        for (const name of reads) want(name, 0);
        if (a.op !== "=") want(a.name, 0);
        else if (!declared.has(a.name)) {
          const v = a.value.kind === "literal" ? a.value.value : null;
          // Made by this assignment: declared with an empty value of its kind, so a condition before it can be read.
          const empty = typeof v === "string" ? "" : typeof v === "boolean" ? false : 0;
          if (!found.has(a.name)) found.set(a.name, empty);
          else if (found.get(a.name) === false && typeof empty !== "boolean") found.set(a.name, empty);
        }
      }
    }
  }
  return [...found].map(([name, value]) => ({ name, value }));
}

const numberOf = (sid: string) => {
  const match = /_(\d+)$/.exec(sid);
  return match ? Number(match[1]) : 0;
};

/** Keeps a file's String IDs where they're usable and unique; the rest get new ones, in reading order. */
function assignStringIds(graph: DialogueGraph, options: ImportOptions, warnings: Warnings): number {
  const used = new Set<string>();
  const order = orderedNodes(graph).filter((id) => hasStringId(graph.nodes[id].type));
  let highest = options.counter ?? 0;
  let dropped = 0;
  for (const id of order) {
    const node = graph.nodes[id];
    const sid = node.sid;
    if (!sid) continue;
    if (sid.length > MAX_STRING_KEY || !STRING_KEY.test(sid) || used.has(sid) || options.taken?.has(sid)) {
      delete node.sid;
      dropped++;
      continue;
    }
    used.add(sid);
    highest = Math.max(highest, numberOf(sid));
  }
  if (dropped) warnings.add(null, `${dropped.toLocaleString("en")} String ID${dropped === 1 ? " was" : "s were"} already taken in this project, repeated, or not usable as an ID, so ${dropped === 1 ? "it was" : "they were"} given a new one.`);
  for (const id of order) {
    const node = graph.nodes[id];
    if (node.sid) continue;
    let sid: string;
    do sid = `${options.prefix}_${String(++highest).padStart(4, "0")}`;
    while (used.has(sid) || options.taken?.has(sid));
    used.add(sid);
    node.sid = sid;
  }
  return highest;
}

// ---- Speakers to character notes ---------------------------------------------------------------

/** A character note an imported speaker may be linked to. */
export type SpeakerCandidate = { id: string; title: string; aliases: readonly string[] };

const nameKey = (name: string) => name.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Links each imported line's typed speaker to the character note it names: one
 * whose title or an alias is the name, ignoring case, when exactly one note
 * does. Otherwise the typed name stays. Changes `graph` in place and returns
 * warnings naming the speakers left unlinked and why. `characters`: the notes
 * the importing user can see, so nothing is linked to a note they can't.
 */
export function linkSpeakers(graph: DialogueGraph, characters: readonly SpeakerCandidate[]): ImportWarning[] {
  const byName = new Map<string, Set<string>>();
  for (const character of characters) {
    for (const name of [character.title, ...character.aliases]) {
      const key = nameKey(name);
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, new Set());
      byName.get(key)!.add(character.id);
    }
  }
  const missing = new Map<string, string>();
  const ambiguous = new Map<string, string>();
  for (const node of Object.values(graph.nodes)) {
    if (node.type !== "line" || node.speakerId || !node.speaker?.trim()) continue;
    const key = nameKey(node.speaker);
    const ids = byName.get(key);
    if (ids?.size === 1) {
      node.speakerId = [...ids][0];
      delete node.speaker;
    } else if (ids) ambiguous.set(key, node.speaker.trim());
    else missing.set(key, node.speaker.trim());
  }
  const list = (names: Map<string, string>) => {
    const all = [...names.values()].sort((a, b) => a.localeCompare(b));
    const shown = all.slice(0, 12).map((n) => `“${n}”`);
    return all.length > shown.length ? `${shown.join(", ")} and ${all.length - shown.length} more` : shown.join(", ");
  };
  const warnings: ImportWarning[] = [];
  if (ambiguous.size) {
    warnings.push({
      line: null,
      text: `${list(ambiguous)} ${ambiguous.size === 1 ? "matches" : "each match"} more than one character note, so ${ambiguous.size === 1 ? "it stays a typed name" : "they stay typed names"}. Pick the right character on the line.`,
    });
  }
  if (missing.size) {
    warnings.push({
      line: null,
      text: `No character note is called ${list(missing)} (by title or alias), so ${missing.size === 1 ? "that speaker stays a typed name" : "those speakers stay typed names"}.`,
    });
  }
  return warnings;
}

// ---- Entry points ------------------------------------------------------------------------------

const extensionOf = (name: string) => name.split(".").at(-1)?.toLowerCase() ?? "";

/** The format of a file, from its name and, for a .txt, its text. */
export function detectImportFormat(fileName: string, source: string): ImportFormat | null {
  const ext = extensionOf(fileName);
  const known = importFormats.find((f) => (f.extensions as readonly string[]).includes(ext));
  if (known) return known.id;
  if (/<tw-storydata\b/i.test(source)) return "twine-html";
  if (/^\s*title\s*:.*\n(?:.*\n)*?\s*---\s*$/m.test(source) && /^\s*===\s*$/m.test(source)) return "yarn";
  if (/^::\s*\S/m.test(source)) return "twee";
  if (/^\s*(={2,}\s*\w|->\s*\w|[*+]\s)/m.test(source)) return "ink";
  return null;
}

/** Reads a file into a dialogue. Throws only when it can't be read at all; everything skipped is in `warnings`. */
export function importDialogue(source: string, format: ImportFormat, options: ImportOptions): ImportResult {
  if (source.length > MAX_IMPORT_SOURCE) throw new Error("That file is too large to import. Split it into several files.");
  const warnings = new Warnings();
  let story: Story;
  switch (format) {
    case "ink":
      story = readInk(source, warnings);
      break;
    case "yarn":
      story = readYarn(source, warnings);
      break;
    case "twee":
      story = readTwine(tweePassages(source, warnings), { title: null, start: null, format: null }, warnings);
      break;
    case "twine-html": {
      const html = htmlStory(source, warnings);
      story = readTwine(html.passages, html, warnings);
      break;
    }
  }
  if (!story.passages.some((p) => p.steps.length)) throw new Error("There's nothing in that file Plotra can import.");
  const built = buildGraph(story, options, warnings);
  return { format, graph: built.graph, warnings: warnings.done(), title: story.title, counter: built.counter };
}
