import "./harness/stubs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { generateText } from "ai";
import { describeModelError, isProvider, modelFor, OLLAMA_URL, type ModelSettings } from "@/lib/agent/providers";
import { headline, markdown, summarize, table, type Report, type RunInfo } from "./report";
import { runTask, type TaskResult } from "./runner";
import { tasks } from "./tasks";

// The eval runner (plan.md Phase 9e). Runs the task set against one model and
// writes a table, a JSON file and a Markdown file under evals/results/.

const USAGE = `Usage: bun run eval -- --provider <name> --model <id> [options]

  --provider   anthropic | openai | openrouter | compatible | ollama
  --model      the model's id as the provider names it
  --base-url   for compatible and ollama (ollama defaults to ${OLLAMA_URL})
  --filter     only tasks whose id contains this text
  --mode       only tasks in this mode: ask | suggest | auto
  --group      only tasks in this group: ask | edit | continuity | injection
  --runs       run each task this many times (default 1)
  --timeout    seconds one task may take (default 300)
  --num-ctx    ollama only: run the model with this context size (see README)
  --price-in   dollars per million input tokens, for a cost column
  --price-out  dollars per million output tokens
  --chapter-words  the length of a chapter when working out its cost (default 3000)
  --judge      also grade answers with a model (the same one unless --judge-model)
  --judge-model
  --out        where to write the report (default evals/results)
  --list       list the tasks and stop

The key is read from EVAL_API_KEY (or ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY for those providers). It is never printed or written to a report.`;

const { values: flags } = parseArgs({
  args: process.argv.slice(2),
  options: {
    provider: { type: "string" },
    model: { type: "string" },
    "base-url": { type: "string" },
    filter: { type: "string" },
    mode: { type: "string" },
    group: { type: "string" },
    runs: { type: "string" },
    timeout: { type: "string" },
    "num-ctx": { type: "string" },
    "price-in": { type: "string" },
    "price-out": { type: "string" },
    "chapter-words": { type: "string" },
    judge: { type: "boolean" },
    "judge-model": { type: "string" },
    out: { type: "string" },
    list: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const number = (value: string | undefined, name: string): number | null => {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) fail(`--${name} needs a number.`);
  return parsed;
};

const chosen = tasks.filter((task) => (!flags.filter || task.id.includes(flags.filter)) && (!flags.mode || task.mode === flags.mode) && (!flags.group || task.group === flags.group));

if (flags.help) {
  console.log(USAGE);
  process.exit(0);
}
if (flags.list) {
  for (const task of chosen) console.log(`${task.id.padEnd(32)} ${task.mode.padEnd(8)} ${task.about}`);
  process.exit(0);
}
if (!flags.provider || !flags.model) fail(USAGE);
if (!isProvider(flags.provider)) fail(`Unknown provider "${flags.provider}".\n\n${USAGE}`);
if (!chosen.length) fail("No task matches those filters. Use --list to see them.");

const provider = flags.provider;
const envKeys: Record<string, string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", openrouter: "OPENROUTER_API_KEY" };
const apiKey = process.env.EVAL_API_KEY || process.env[envKeys[provider] ?? ""] || null;
const baseUrl = flags["base-url"] ?? (provider === "ollama" ? OLLAMA_URL : null);
const numCtx = number(flags["num-ctx"], "num-ctx");
if (numCtx && provider !== "ollama") fail("--num-ctx only applies to --provider ollama.");

// ---- Ollama's context size -------------------------------------------------------------------------
//
// The agent's prompt and tool definitions are about 7,500 tokens in Suggest
// and Auto. Ollama loads a model with 4,096 unless told otherwise, cuts the
// prompt to fit without saying so, and its OpenAI-compatible endpoint (the one
// Plotra calls) has no setting for it. With --num-ctx the runner makes a
// temporary copy of the model that has the context size built in, runs on
// that, and removes it afterwards. Only the small manifest is copied.

const ollamaOrigin = baseUrl ? baseUrl.replace(/\/v1\/?$/, "") : "";
let temporaryModel: string | null = null;

async function ollama(path: string, method: string, body: unknown): Promise<Response> {
  return fetch(`${ollamaOrigin}${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

async function withContext(model: string, context: number): Promise<string> {
  const name = `plotra-eval-${model.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-ctx${context}`;
  const response = await ollama("/api/create", "POST", { model: name, from: model, parameters: { num_ctx: context }, stream: false });
  if (!response.ok) fail(`Ollama couldn't make a copy of ${model} with a ${context}-token context: ${(await response.text()).slice(0, 200)}`);
  temporaryModel = name;
  return name;
}

async function cleanUp(): Promise<void> {
  if (!temporaryModel) return;
  const name = temporaryModel;
  temporaryModel = null;
  await ollama("/api/delete", "DELETE", { model: name }).catch(() => {});
}

process.on("SIGINT", () => void cleanUp().finally(() => process.exit(130)));

// ---- The run -----------------------------------------------------------------------------------------

const settingsFor = (model: string): ModelSettings => ({
  provider,
  baseUrl,
  apiKey,
  agentModel: model,
  fastModel: model,
  // As on a self-hosted instance with the model set in env: a local address is allowed (lib/agent/providers.ts).
  source: "instance",
});

try {
  const called = numCtx ? await withContext(flags.model, numCtx) : flags.model;
  const model = modelFor(settingsFor(called), "agent");
  const judge = flags.judge || flags["judge-model"] ? modelFor(settingsFor(flags["judge-model"] ?? called), "agent") : null;

  // One small call first: a wrong key or model name should fail here, not twenty-eight times.
  try {
    await generateText({ model, prompt: "Reply with the single word: ready", maxOutputTokens: 64, maxRetries: 0, abortSignal: AbortSignal.timeout(120_000) });
  } catch (error) {
    await cleanUp();
    fail(`${flags.model}: ${describeModelError(error)}`);
  }

  const info: RunInfo = {
    provider,
    model: flags.model,
    baseUrl,
    startedAt: new Date().toISOString(),
    runs: Math.max(1, Math.floor(number(flags.runs, "runs") ?? 1)),
    priceIn: number(flags["price-in"], "price-in"),
    priceOut: number(flags["price-out"], "price-out"),
    chapterWords: number(flags["chapter-words"], "chapter-words") ?? 3000,
    numCtx,
    judge: judge ? (flags["judge-model"] ?? flags.model) : null,
  };
  const timeoutMs = (number(flags.timeout, "timeout") ?? 300) * 1000;

  console.log(`Running ${chosen.length} task${chosen.length === 1 ? "" : "s"}${info.runs > 1 ? `, ${info.runs} times each,` : ""} on ${provider}:${flags.model}${numCtx ? ` (context ${numCtx})` : ""}…`);
  const results: TaskResult[] = [];
  for (const task of chosen) {
    for (let attempt = 1; attempt <= info.runs; attempt++) {
      const result = await runTask(task, { model, timeoutMs, judge });
      if (info.runs > 1) result.id = `${task.id} #${attempt}`;
      results.push(result);
      console.log(`  ${result.status.toUpperCase().padEnd(5)} ${result.id.padEnd(34)} ${String(result.seconds).padStart(6)}s  ${result.inputTokens} in / ${result.outputTokens} out`);
    }
  }

  const report: Report = { ...info, results, summary: summarize(info, results) };
  console.log(`\n${table(report)}\n`);
  for (const line of headline(report)) console.log(line);

  const directory = flags.out ?? join(import.meta.dir, "results");
  mkdirSync(directory, { recursive: true });
  const name = `${info.startedAt.replace(/[:.]/g, "-")}-${provider}-${flags.model.replace(/[^a-z0-9.]+/gi, "-")}${numCtx ? `-ctx${numCtx}` : ""}`;
  writeFileSync(join(directory, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(directory, `${name}.md`), markdown(report));
  console.log(`\nReport: ${join(directory, name)}.md (and .json)`);
} finally {
  await cleanUp();
}
// The app's modules leave handles open (the database pool is made, never used).
process.exit(0);
