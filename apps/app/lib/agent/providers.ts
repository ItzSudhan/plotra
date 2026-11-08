import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { aiProviders, type AiProvider } from "@plotra/db/schema";
import { generateText, type LanguageModel } from "ai";
import { guardedFetch, looksPrivate, parseBaseUrl, privateUrlsAllowed } from "./base-url";
import { describeModelError } from "./model-errors";
import { OLLAMA_URL, providerMeta, type BrowserModel, type ModelRole, type TestResult } from "./types";

// The wording of a provider's errors is shared with the browser, which calls a local model itself.
export { describeModelError, describeStepError } from "./model-errors";
export type { TestResult };

// Turns someone's settings into an AI SDK model (plan.md 2.11 "Whose model").
// A new provider is a new entry here and in `providerMeta`, nothing else.
//
// The Vercel AI Gateway is deliberately not used: a bare "provider/model"
// string would route through it, on a key the project would have to pay for.
// Every model here is built from an explicit provider instance and the
// person's own key.

/** Everything needed to call a model for one person. The key is plain here: server only. */
export type ModelSettings = {
  provider: AiProvider;
  /** Null for the hosted providers, which have a fixed URL. */
  baseUrl: string | null;
  apiKey: string | null;
  agentModel: string;
  fastModel: string;
  /** The person's own settings, the instance-wide ones from env (self-hosting), or the model Plotra provides to Pro workspaces. */
  source: "user" | "instance" | "hosted";
};

export const isProvider = (value: unknown): value is AiProvider => (aiProviders as readonly unknown[]).includes(value);

const OPENROUTER_URL = "https://openrouter.ai/api/v1";
export { OLLAMA_URL };

/** The URL a provider is called at: the person's own for an endpoint or local model, fixed otherwise. */
export function baseUrlFor(settings: Pick<ModelSettings, "provider" | "baseUrl">): string | null {
  if (settings.provider === "openrouter") return OPENROUTER_URL;
  if (settings.provider === "ollama") return settings.baseUrl || OLLAMA_URL;
  if (settings.provider === "compatible") return settings.baseUrl;
  return null;
}

/**
 * Whether a model is one the person's browser has to call (plan.md 2.11 "Local
 * model"): its URL is on their own machine or network, and this server may
 * not, or cannot, call addresses there. Decided from the settings alone, so
 * nothing extra is stored: the same row is a server-called model on a
 * self-hosted instance that allows private addresses.
 */
export function isBrowserLocal(settings: Pick<ModelSettings, "provider" | "baseUrl">, allowPrivate = privateUrlsAllowed()): boolean {
  if (allowPrivate || !providerMeta[settings.provider].baseUrl) return false;
  const url = baseUrlFor(settings);
  if (!url) return false;
  try {
    return looksPrivate(new URL(url));
  } catch {
    return false;
  }
}

/** What the browser needs to call such a model: where it is and what it is called. Never a key: that stays in the browser. */
export function browserModelOf(settings: Pick<ModelSettings, "provider" | "baseUrl" | "agentModel" | "fastModel">): BrowserModel {
  return { provider: settings.provider, baseUrl: (baseUrlFor(settings) ?? "").replace(/\/$/, ""), agentModel: settings.agentModel, fastModel: settings.fastModel || settings.agentModel };
}

type Fetch = typeof fetch;

/**
 * The model for agent runs or for inline actions. `fetch` is for tests; left
 * out, a URL the person typed is only called through `guardedFetch` unless
 * this server allows private addresses.
 */
export function modelFor(settings: ModelSettings, role: ModelRole, options: { fetch?: Fetch } = {}): LanguageModel {
  const modelId = role === "agent" ? settings.agentModel : settings.fastModel;
  if (!modelId) throw new Error("Choose a model in Settings → AI first.");
  const apiKey = settings.apiKey ?? undefined;

  switch (settings.provider) {
    case "anthropic": {
      if (!apiKey) throw new Error("Add your Anthropic key in Settings → AI first.");
      return createAnthropic({ apiKey, fetch: options.fetch })(modelId);
    }
    case "openai": {
      if (!apiKey) throw new Error("Add your OpenAI key in Settings → AI first.");
      // Chat Completions rather than the Responses API: it keeps nothing on OpenAI's side between
      // calls, so a run's conversation lives only in the request (the Responses API stores it by default).
      return createOpenAI({ apiKey, fetch: options.fetch }).chat(modelId);
    }
    case "openrouter": {
      if (!apiKey) throw new Error("Add your OpenRouter key in Settings → AI first.");
      return createOpenAICompatible({
        name: "openrouter",
        baseURL: OPENROUTER_URL,
        apiKey,
        fetch: options.fetch,
        includeUsage: true,
        // OpenRouter shows this on its dashboard; it names the app, not the person.
        headers: { "X-Title": "Plotra" },
      })(modelId);
    }
    case "compatible":
    case "ollama": {
      const raw = baseUrlFor(settings);
      if (!raw) throw new Error("Add the endpoint's URL in Settings → AI first.");
      // A URL from env was set by whoever runs the server: trusted. A
      // person's URL is checked here and again each time its host is resolved.
      const trusted = settings.source !== "user" || privateUrlsAllowed();
      const url = parseBaseUrl(raw, { allowPrivate: trusted });
      return createOpenAICompatible({
        name: settings.provider,
        baseURL: url.toString().replace(/\/$/, ""),
        apiKey,
        fetch: options.fetch ?? (trusted ? undefined : guardedFetch),
        includeUsage: true,
      })(modelId);
    }
  }
}

/** The model's id as recorded with a run: "anthropic:claude-…". Never contains the key. */
export const modelLabel = (settings: ModelSettings, role: ModelRole) =>
  `${settings.provider}:${role === "agent" ? settings.agentModel : settings.fastModel}`.slice(0, 200);

/**
 * The "Test" button: one tiny real call with someone's settings, on both of
 * their models, reporting what the provider said.
 */
export async function testModels(settings: ModelSettings, options: { fetch?: Fetch } = {}): Promise<TestResult> {
  const roles: ModelRole[] = settings.agentModel === settings.fastModel ? ["agent"] : ["agent", "fast"];
  for (const role of roles) {
    const name = role === "agent" ? settings.agentModel : settings.fastModel;
    try {
      await generateText({
        model: modelFor(settings, role, options),
        prompt: "Reply with the single word: ready",
        maxOutputTokens: 16,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      return { ok: false, message: `${name}: ${describeModelError(error)}` };
    }
  }
  return { ok: true, message: `${providerMeta[settings.provider].label} answered${roles.length > 1 ? " on both models" : ""}.` };
}
