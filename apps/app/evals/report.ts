import type { TaskResult } from "./runner";

// What a run of the eval set prints and writes: a table of tasks, the tokens
// each used, what they would cost at a price the caller gives, and what
// drafting a chapter comes to.

export type RunInfo = {
  provider: string;
  model: string;
  baseUrl: string | null;
  startedAt: string;
  /** How many times each task was run. */
  runs: number;
  /** Dollars per million tokens, when given with --price-in and --price-out. */
  priceIn: number | null;
  priceOut: number | null;
  /** The length a chapter is taken to be when working out its cost. */
  chapterWords: number;
  /** The context size asked of Ollama (--num-ctx), when one was. */
  numCtx: number | null;
  judge: string | null;
};

export type Report = RunInfo & {
  results: TaskResult[];
  summary: ReturnType<typeof summarize>;
};

/** The fewest words a drafted scene must have for a chapter's cost to be worked out from it (the task asks for about 400). */
export const MIN_DRAFT = 200;

export const cost = (info: Pick<RunInfo, "priceIn" | "priceOut">, inputTokens: number, outputTokens: number): number | null =>
  info.priceIn === null || info.priceOut === null ? null : (inputTokens * info.priceIn + outputTokens * info.priceOut) / 1_000_000;

const money = (value: number | null) => (value === null ? "" : value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`);
const num = (value: number) => value.toLocaleString("en-US");

export function summarize(info: RunInfo, results: TaskResult[]) {
  const groups = ["ask", "edit", "continuity", "injection"] as const;
  const byGroup = Object.fromEntries(
    groups.map((group) => {
      const rows = results.filter((r) => r.group === group);
      return [group, { passed: rows.filter((r) => r.status === "pass").length, failed: rows.filter((r) => r.status === "fail").length, errors: rows.filter((r) => r.status === "error").length, total: rows.length }];
    }),
  ) as Record<(typeof groups)[number], { passed: number; failed: number; errors: number; total: number }>;
  const inputTokens = results.reduce((sum, r) => sum + r.inputTokens, 0);
  const outputTokens = results.reduce((sum, r) => sum + r.outputTokens, 0);

  // What a chapter costs: a chapter is drafted a scene at a time, each scene its own request
  // (a long job runs one request per step), so a chapter is the drafted scene scaled to its length.
  // A draft a fraction of the length asked for says nothing about what a full one costs.
  const drafts = results.filter((r) => r.wordsWritten !== null && r.wordsWritten >= MIN_DRAFT && r.status !== "error");
  const wordsWritten = drafts.reduce((sum, r) => sum + (r.wordsWritten ?? 0), 0);
  const draftIn = drafts.reduce((sum, r) => sum + r.inputTokens, 0);
  const draftOut = drafts.reduce((sum, r) => sum + r.outputTokens, 0);
  const scale = wordsWritten ? info.chapterWords / wordsWritten : 0;
  const chapter = wordsWritten
    ? { wordsWritten, runs: drafts.length, inputTokens: Math.round(draftIn * scale), outputTokens: Math.round(draftOut * scale), cost: cost(info, draftIn * scale, draftOut * scale) }
    : null;

  return {
    passed: results.filter((r) => r.status === "pass").length,
    failed: results.filter((r) => r.status === "fail").length,
    errors: results.filter((r) => r.status === "error").length,
    total: results.length,
    byGroup,
    inputTokens,
    outputTokens,
    cost: cost(info, inputTokens, outputTokens),
    seconds: Math.round(results.reduce((sum, r) => sum + r.seconds, 0)),
    chapter,
  };
}

const why = (result: TaskResult) =>
  result.error ?? result.checks.filter((check) => check.required && !check.pass).map((check) => `${check.name}${check.detail ? ` (${check.detail})` : ""}`).join("; ");

function rows(report: Report): string[][] {
  const priced = report.priceIn !== null && report.priceOut !== null;
  const judged = report.results.some((r) => r.judged);
  const head = ["task", "mode", "result", "checks", "in tok", "out tok", "calls", "sec", ...(priced ? ["cost"] : []), ...(judged ? ["judge"] : []), "why it failed"];
  const body = report.results.map((r) => {
    const required = r.checks.filter((check) => check.required);
    return [
      r.id,
      r.mode,
      r.status.toUpperCase(),
      `${required.filter((check) => check.pass).length}/${required.length}`,
      num(r.inputTokens),
      num(r.outputTokens),
      String(r.calls),
      String(r.seconds),
      ...(priced ? [money(cost(report, r.inputTokens, r.outputTokens))] : []),
      ...(judged ? [r.judged ? `${r.judged.score}/5` : ""] : []),
      why(r),
    ];
  });
  return [head, ...body];
}

/** The table for the terminal. */
export function table(report: Report): string {
  const all = rows(report).map((row) => row.map((cell, i) => (i === row.length - 1 && cell.length > 90 ? `${cell.slice(0, 89)}…` : cell)));
  const widths = all[0].map((_, i) => Math.max(...all.map((row) => row[i].length)));
  return all.map((row) => row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]))).join("  ").trimEnd()).join("\n");
}

export function headline(report: Report): string[] {
  const s = report.summary;
  const group = (name: keyof typeof s.byGroup) => `${name} ${s.byGroup[name].passed}/${s.byGroup[name].total}`;
  const lines = [
    `${report.provider}:${report.model} — ${s.passed} of ${s.total} passed${s.errors ? `, ${s.errors} didn't finish` : ""} (${group("ask")}, ${group("edit")}, ${group("continuity")}, ${group("injection")}).`,
    `Tokens: ${num(s.inputTokens)} in, ${num(s.outputTokens)} out${s.cost !== null ? `, ${money(s.cost)} at $${report.priceIn}/$${report.priceOut} per million` : ""}. Time: ${s.seconds}s.`,
  ];
  if (s.chapter) {
    lines.push(
      `Drafting: ${num(s.chapter.wordsWritten)} words written in ${s.chapter.runs} run${s.chapter.runs === 1 ? "" : "s"}. At that rate a ${num(report.chapterWords)}-word chapter is about ${num(s.chapter.inputTokens)} tokens in and ${num(s.chapter.outputTokens)} out${s.chapter.cost !== null ? `, ${money(s.chapter.cost)}` : ""}.`,
    );
  } else if (report.results.some((r) => r.wordsWritten !== null)) {
    const wrote = report.results.find((r) => r.wordsWritten !== null)?.wordsWritten ?? 0;
    lines.push(`Drafting: the scene wasn't written at length (${wrote} words of about 400 asked for), so there is nothing to work a chapter's cost out from.`);
  }
  return lines;
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n+/g, " ");

export function markdown(report: Report): string {
  const [head, ...body] = rows(report);
  const out = [
    `# Agent evals: ${report.provider}:${report.model}`,
    "",
    `Run on ${report.startedAt}${report.baseUrl ? ` against ${report.baseUrl}` : ""}${report.numCtx ? `, context ${num(report.numCtx)} tokens` : ""}${report.runs > 1 ? `, each task ${report.runs} times` : ""}. See evals/README.md for what the harness does and doesn't measure.`,
    "",
    ...headline(report).map((line) => `- ${line}`),
    "",
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.map(cell).join(" | ")} |`),
    "",
    "## Checks",
    "",
  ];
  for (const r of report.results) {
    out.push(`### ${r.id} — ${r.status}`, "", `${r.about}. Asked in ${r.mode}: “${r.prompt}”`, "");
    for (const check of r.checks) out.push(`- ${check.pass ? "✓" : check.required ? "✗" : "·"} ${check.name}${check.required ? "" : " (not required)"}${check.detail ? `: ${check.detail}` : ""}`);
    if (r.toolCalls.length) out.push("", `Tools: ${r.toolCalls.map((call) => `${call.name}${call.state === "output-available" ? "" : ` [${call.state}]`}`).join(", ")}`);
    if (r.judged) out.push("", `Model-graded (not part of the result): ${r.judged.score}/5. ${r.judged.why}`);
    if (r.error) out.push("", `Didn't finish: ${r.error}`);
    out.push("", "Answer:", "", ...(r.answer || "(none)").split("\n").map((line) => `> ${line}`), "");
  }
  return out.join("\n");
}
