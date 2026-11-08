import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, generateText, type LanguageModel } from "ai";
import { describeModelError, describeStepError } from "./model-errors";
import { providerMeta, type BrowserModel, type ModelRole, type TestResult } from "./types";

// A model the browser calls itself (plan.md 2.11 "Local model"): Ollama, or
// another OpenAI-compatible server, on the writer's own machine or network.
// The hosted server can't reach it, so the request goes straight from this
// page to that address and never passes through Plotra. This file runs in the
// browser only; the server's counterpart is lib/agent/providers.ts.
//
// The model server has to allow this page's origin (CORS). Ollama does for
// pages on localhost; for any other address it needs OLLAMA_ORIGINS.

// Its key, if it has one, is kept by lib/agent/browser-key.ts.

type Fetch = typeof fetch;

/** The model for agent runs or for inline actions, called from this page. `fetch` is for tests. */
export function browserModel(model: BrowserModel, role: ModelRole, apiKey: string | null, options: { fetch?: Fetch } = {}): LanguageModel {
  const modelId = role === "agent" ? model.agentModel : model.fastModel || model.agentModel;
  if (!modelId) throw new Error("Choose a model in Settings → AI first.");
  if (!model.baseUrl) throw new Error("Add the endpoint's URL in Settings → AI first.");
  return createOpenAICompatible({
    name: model.provider,
    baseURL: model.baseUrl.replace(/\/+$/, ""),
    apiKey: apiKey ?? undefined,
    fetch: options.fetch,
    includeUsage: true,
  })(modelId);
}

/** The request never got an answer: nothing is listening there, or the model server turned this page away. */
const neverAnswered = (error: unknown): boolean => {
  if (APICallError.isInstance(error)) return error.statusCode === undefined;
  const last = (error as { lastError?: unknown } | null)?.lastError;
  if (last) return neverAnswered(last);
  return error instanceof TypeError;
};

/**
 * A failure of a call made from this page, in plain words. A browser doesn't
 * say why a request to another address failed, so the two usual reasons are
 * both named.
 */
export function describeBrowserError(error: unknown, model: Pick<BrowserModel, "provider" | "baseUrl">, origin: string): string {
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) return "The model took too long to answer.";
  // Ollama answers a page it doesn't know with 403 and no body.
  const turnedAway = APICallError.isInstance(error) && error.statusCode === 403;
  if (!neverAnswered(error) && !turnedAway) return describeStepError(error);
  const allow = model.provider === "ollama" ? `start Ollama with OLLAMA_ORIGINS=${origin}` : `it has to allow requests from ${origin} (CORS)`;
  return `Your browser couldn't reach the model at ${model.baseUrl}. Check that it is running, and that it accepts this site: ${allow}.`;
}

/** What the agent's instructions and tools come to before the conversation starts, with room to work in. */
const AGENT_CONTEXT = 16_000;

/**
 * Ollama runs a model with room for 4,096 tokens unless it is told otherwise,
 * and cuts a longer prompt without saying so. The agent's instructions and
 * tools alone are about 7,000, so on the default the model never sees its
 * tools and answers as if it had none. Asked after a call, Ollama says what
 * the model was loaded with. Null when it is enough, or can't be found out.
 */
async function ollamaContextProblem(model: BrowserModel, fetcher: Fetch): Promise<string | null> {
  try {
    const response = await fetcher(new URL("/api/ps", model.baseUrl).toString(), { signal: AbortSignal.timeout(5000) });
    const running = ((await response.json()) as { models?: { name?: string; context_length?: number }[] }).models ?? [];
    const loaded = running.find((m) => m.name === model.agentModel || m.name === `${model.agentModel}:latest`);
    if (typeof loaded?.context_length !== "number" || loaded.context_length >= AGENT_CONTEXT) return null;
    return `Ollama answered, but it is running ${model.agentModel} with room for only ${loaded.context_length.toLocaleString("en")} tokens. The agent's instructions and tools need about 7,000 before the conversation starts, and Ollama cuts what doesn't fit without saying so. Start Ollama with OLLAMA_CONTEXT_LENGTH=32768 or more.`;
  } catch {
    return null;
  }
}

/**
 * The "Test" button for a model the browser calls: one tiny real call on each
 * of the two models, made from this page, reporting what came back.
 */
export async function testBrowserModel(model: BrowserModel, apiKey: string | null, options: { fetch?: Fetch; origin?: string } = {}): Promise<TestResult> {
  const origin = options.origin ?? (typeof location === "undefined" ? "" : location.origin);
  const roles: ModelRole[] = model.agentModel === model.fastModel || !model.fastModel ? ["agent"] : ["agent", "fast"];
  for (const role of roles) {
    const name = role === "agent" ? model.agentModel : model.fastModel;
    try {
      await generateText({
        model: browserModel(model, role, apiKey, options),
        prompt: "Reply with the single word: ready",
        maxOutputTokens: 16,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      const said = neverAnswered(error) || (APICallError.isInstance(error) && error.statusCode === 403) ? describeBrowserError(error, model, origin) : describeModelError(error);
      return { ok: false, message: `${name}: ${said}` };
    }
  }
  const cramped = model.provider === "ollama" ? await ollamaContextProblem(model, options.fetch ?? fetch) : null;
  if (cramped) return { ok: false, message: cramped };
  return { ok: true, message: `${providerMeta[model.provider].label} answered${roles.length > 1 ? " on both models" : ""}, called from this browser.` };
}
