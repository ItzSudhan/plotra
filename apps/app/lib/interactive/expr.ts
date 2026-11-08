import type { DialogueValue } from "./model";

// The small expression language of dialogue conditions and assignments
// (plan.md 2.8): parsed by hand and walked as a tree, never handed to `eval`,
// so a shared dialogue can't run code in a collaborator's browser.
//
//   condition    gold >= 5 && !met_anna || name == "Anna"
//   assignments  gold += 5; met_anna = true

export type Expr =
  | { kind: "literal"; value: DialogueValue }
  | { kind: "variable"; name: string }
  | { kind: "unary"; op: "!" | "-"; arg: Expr }
  | { kind: "binary"; op: BinaryOp; left: Expr; right: Expr };

export type BinaryOp = "||" | "&&" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "+" | "-" | "*" | "/";
export type AssignOp = "=" | "+=" | "-=";
export type Assignment = { name: string; op: AssignOp; value: Expr };

export type Variables = Record<string, DialogueValue>;

/** A mistake in an expression, worded for the writer. */
export class ExprError extends Error {}

export const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

type Token =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "name"; value: string }
  | { kind: "op"; value: string }
  | { kind: "end" };

const OPERATORS = ["&&", "||", "==", "!=", "<=", ">=", "+=", "-=", "<", ">", "!", "=", "+", "-", "*", "/", "(", ")", ";"];

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\n") {
      // A line break ends an assignment, like a semicolon.
      tokens.push({ kind: "op", value: ";" });
      i++;
    } else if (/\s/.test(ch)) i++;
    else if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1] ?? ""))) {
      const match = /^(\d+(\.\d+)?|\.\d+)/.exec(source.slice(i))!;
      tokens.push({ kind: "number", value: Number(match[0]) });
      i += match[0].length;
    } else if (ch === '"' || ch === "'") {
      let value = "";
      let j = i + 1;
      for (; j < source.length && source[j] !== ch; j++) {
        if (source[j] === "\\" && j + 1 < source.length) j++;
        value += source[j];
      }
      if (j >= source.length) throw new ExprError("A text value is missing its closing quote.");
      tokens.push({ kind: "string", value });
      i = j + 1;
    } else if (/[A-Za-z_$]/.test(ch)) {
      // `$gold` is read as `gold`, for writers used to Yarn or Twine.
      const match = /^\$?([A-Za-z_][A-Za-z0-9_]*)/.exec(source.slice(i));
      if (!match) throw new ExprError("“$” must be followed by a variable name.");
      tokens.push({ kind: "name", value: match[1] });
      i += match[0].length;
    } else {
      const op = OPERATORS.find((o) => source.startsWith(o, i));
      if (!op) throw new ExprError(`“${ch}” isn't something an expression can contain.`);
      tokens.push({ kind: "op", value: op });
      i += op.length;
    }
  }
  tokens.push({ kind: "end" });
  return tokens;
}

// Lowest to highest. Everything on one level groups left to right.
const LEVELS: BinaryOp[][] = [["||"], ["&&"], ["==", "!="], ["<", "<=", ">", ">="], ["+", "-"], ["*", "/"]];
const WORD_OPERATORS = new Map([
  ["and", "&&"],
  ["or", "||"],
  ["not", "!"],
]);

class Parser {
  private at = 0;
  constructor(private tokens: Token[]) {}

  peek = () => this.tokens[this.at];
  next = () => this.tokens[this.at++];
  done = () => this.peek().kind === "end";

  /** The operator next in line, with `and`, `or`, `not` read as their symbols. */
  op() {
    const token = this.peek();
    if (token.kind === "op") return token.value;
    if (token.kind === "name") return WORD_OPERATORS.get(token.value) ?? null;
    return null;
  }

  expression(level = 0): Expr {
    if (level === LEVELS.length) return this.unary();
    let left = this.expression(level + 1);
    for (let op = this.op(); op && (LEVELS[level] as string[]).includes(op); op = this.op()) {
      this.next();
      left = { kind: "binary", op: op as BinaryOp, left, right: this.expression(level + 1) };
    }
    return left;
  }

  unary(): Expr {
    const op = this.op();
    if (op === "!" || op === "-") {
      this.next();
      return { kind: "unary", op, arg: this.unary() };
    }
    return this.primary();
  }

  primary(): Expr {
    const token = this.next();
    if (token.kind === "number" || token.kind === "string") return { kind: "literal", value: token.value };
    if (token.kind === "name") {
      if (token.value === "true" || token.value === "false") return { kind: "literal", value: token.value === "true" };
      if (WORD_OPERATORS.has(token.value)) throw new ExprError(`“${token.value}” needs a value before it.`);
      return { kind: "variable", name: token.value };
    }
    if (token.kind === "op" && token.value === "(") {
      const inner = this.expression();
      const close = this.next();
      if (close.kind !== "op" || close.value !== ")") throw new ExprError("A bracket is never closed.");
      return inner;
    }
    if (token.kind === "end") throw new ExprError("The expression stops short.");
    throw new ExprError(token.value === "=" ? "Use == to compare; = sets a variable." : `“${token.value}” is out of place.`);
  }

  assignment(): Assignment {
    const name = this.next();
    if (name.kind !== "name" || name.value === "true" || name.value === "false" || WORD_OPERATORS.has(name.value)) {
      throw new ExprError("An assignment starts with a variable name, like gold += 5.");
    }
    const op = this.next();
    if (op.kind !== "op" || !["=", "+=", "-="].includes(op.value)) {
      throw new ExprError(`After “${name.value}” comes =, += or -=.`);
    }
    return { name: name.value, op: op.value as AssignOp, value: this.expression() };
  }
}

/** Parses a condition. Throws an `ExprError` that says what's wrong. */
export function parseExpression(source: string): Expr {
  if (!source.trim()) throw new ExprError("Write a condition, like gold >= 5.");
  const parser = new Parser(tokenize(source).filter((t) => !(t.kind === "op" && t.value === ";")));
  const expr = parser.expression();
  if (!parser.done()) {
    const extra = parser.peek();
    throw new ExprError(
      extra.kind === "op" && extra.value === "=" ? "Use == to compare; = sets a variable." : "There's something left over after the condition.",
    );
  }
  return expr;
}

/** Parses one or more assignments, separated by semicolons or line breaks. */
export function parseAssignments(source: string): Assignment[] {
  const parser = new Parser(tokenize(source));
  const list: Assignment[] = [];
  const separator = () => {
    const token = parser.peek();
    return token.kind === "op" && token.value === ";";
  };
  while (!parser.done()) {
    if (separator()) {
      parser.next();
      continue;
    }
    list.push(parser.assignment());
    if (!parser.done() && !separator()) throw new ExprError("Put a semicolon or a new line between assignments.");
  }
  if (!list.length) throw new ExprError("Write an assignment, like gold += 5.");
  return list;
}

/** What's wrong with a condition or a set of assignments, or null when it parses. */
export function expressionProblem(source: string, as: "condition" | "assignments"): string | null {
  try {
    if (as === "condition") parseExpression(source);
    else parseAssignments(source);
    return null;
  } catch (error) {
    if (error instanceof ExprError) return error.message;
    throw error;
  }
}

/** Empty text, zero and false count as false; everything else as true. */
export const truthy = (value: DialogueValue) => Boolean(value);

const describe = (value: DialogueValue) => (typeof value === "string" ? "text" : typeof value === "number" ? "a number" : "true/false");

function numbers(op: string, left: DialogueValue, right: DialogueValue): [number, number] {
  if (typeof left !== "number" || typeof right !== "number") {
    throw new ExprError(`${op} needs two numbers, not ${describe(left)} and ${describe(right)}.`);
  }
  return [left, right];
}

export function evaluate(expr: Expr, variables: Variables): DialogueValue {
  switch (expr.kind) {
    case "literal":
      return expr.value;
    case "variable":
      if (!Object.hasOwn(variables, expr.name)) throw new ExprError(`There's no variable called “${expr.name}”.`);
      return variables[expr.name];
    case "unary": {
      const value = evaluate(expr.arg, variables);
      if (expr.op === "!") return !truthy(value);
      if (typeof value !== "number") throw new ExprError(`Only a number can be negated, not ${describe(value)}.`);
      return -value;
    }
    case "binary": {
      // Like most languages, the right side is skipped when the left decides it.
      if (expr.op === "&&") return truthy(evaluate(expr.left, variables)) && truthy(evaluate(expr.right, variables));
      if (expr.op === "||") return truthy(evaluate(expr.left, variables)) || truthy(evaluate(expr.right, variables));
      const left = evaluate(expr.left, variables);
      const right = evaluate(expr.right, variables);
      switch (expr.op) {
        case "==":
          return left === right;
        case "!=":
          return left !== right;
        case "+":
          // Text joins; numbers add.
          if (typeof left === "string" || typeof right === "string") return `${left}${right}`;
          return numbers("+", left, right)[0] + (right as number);
        case "<":
        case "<=":
        case ">":
        case ">=": {
          if (typeof left === "string" && typeof right === "string") {
            return expr.op === "<" ? left < right : expr.op === "<=" ? left <= right : expr.op === ">" ? left > right : left >= right;
          }
          const [a, b] = numbers(expr.op, left, right);
          return expr.op === "<" ? a < b : expr.op === "<=" ? a <= b : expr.op === ">" ? a > b : a >= b;
        }
        default: {
          const [a, b] = numbers(expr.op, left, right);
          if (expr.op === "-") return a - b;
          if (expr.op === "*") return a * b;
          if (b === 0) throw new ExprError("That divides by zero.");
          return a / b;
        }
      }
    }
  }
}

/** The variables after the assignments, as a new object. A variable that didn't exist is made. */
export function assign(assignments: Assignment[], variables: Variables): Variables {
  const next = { ...variables };
  for (const { name, op, value } of assignments) {
    const result = evaluate(value, next);
    if (op === "=") next[name] = result;
    else {
      if (!Object.hasOwn(next, name)) throw new ExprError(`There's no variable called “${name}” to change.`);
      next[name] = evaluate({ kind: "binary", op: op === "+=" ? "+" : "-", left: { kind: "literal", value: next[name] }, right: { kind: "literal", value: result } }, next);
    }
  }
  return next;
}

// ---- Writing an expression back out, for the exporters ------------------------------------

export type ExprStyle = {
  variable: (name: string) => string;
  string: (value: string) => string;
  /** Operators spelled differently from ours (Ink's `not`, say). */
  operators?: Partial<Record<BinaryOp | "!", string>>;
};

const LEVEL_OF = new Map<BinaryOp, number>(LEVELS.flatMap((ops, level) => ops.map((op) => [op, level] as const)));

/** Prints an expression in another language's spelling, with only the brackets it needs. */
export function formatExpr(expr: Expr, style: ExprStyle, parentLevel = -1): string {
  switch (expr.kind) {
    case "literal":
      return typeof expr.value === "string" ? style.string(expr.value) : String(expr.value);
    case "variable":
      return style.variable(expr.name);
    case "unary": {
      const op = (expr.op === "!" && style.operators?.["!"]) || expr.op;
      const arg = formatExpr(expr.arg, style, LEVELS.length);
      // A space after a word operator, and between two minus signs.
      return `${op}${/[a-z]$/.test(op) || (op === "-" && arg.startsWith("-")) ? " " : ""}${arg}`;
    }
    case "binary": {
      const level = LEVEL_OF.get(expr.op)!;
      // The right side sits one level tighter, so a - (b - c) keeps its brackets.
      const text = `${formatExpr(expr.left, style, level)} ${style.operators?.[expr.op] ?? expr.op} ${formatExpr(expr.right, style, level + 1)}`;
      return level < parentLevel ? `(${text})` : text;
    }
  }
}

export const not = (expr: Expr): Expr => ({ kind: "unary", op: "!", arg: expr });
