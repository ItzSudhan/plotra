// Finding a model on this computer for a new library's AI.
// Plain data: the server action that asks Ollama is lib/local-setup-actions.ts.

/** Where Ollama listens unless told otherwise. Asked by the server, which in local mode is this computer. */
export const OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags";

/** What the AI step is told: whether Ollama answered, its models, and the one to offer first. */
export type OllamaFound = { running: boolean; models: string[]; suggested: string | null };

/**
 * Families that call tools, which Plotra's agent needs, best first. A model
 * whose name starts with one of these is offered before anything else.
 */
const TOOL_FAMILIES = ["qwen3", "gpt-oss", "llama3.3", "llama3.1", "qwen2.5", "mistral-small", "mistral-nemo", "llama3.2", "command-r", "granite3", "mistral"];

/** Models that only make embeddings, or only see pictures: no use for the agent. */
const notForChat = (name: string) => /embed|minilm|bge-|nomic|clip|llava|moondream/i.test(name);

/** The models worth offering, best first, and the one to pick by default. */
export function rankOllamaModels(names: string[]): { models: string[]; suggested: string | null } {
  const chat = [...new Set(names.map((name) => name.trim()).filter(Boolean))].filter((name) => !notForChat(name));
  const rank = (name: string) => {
    const at = TOOL_FAMILIES.findIndex((family) => name.toLowerCase().startsWith(family));
    return at === -1 ? TOOL_FAMILIES.length : at;
  };
  // Stable: models of the same family keep Ollama's order (most recently used first).
  const models = chat.map((name, i) => ({ name, i })).sort((a, b) => rank(a.name) - rank(b.name) || a.i - b.i).map(({ name }) => name);
  return { models, suggested: models[0] ?? null };
}

/** Reads Ollama's answer to /api/tags: `{ models: [{ name }] }`. Anything else is no models. */
export function modelNames(body: unknown): string[] {
  if (typeof body !== "object" || body === null || !Array.isArray((body as { models?: unknown }).models)) return [];
  return (body as { models: unknown[] }).models
    .map((model) => (typeof model === "object" && model !== null ? (model as { name?: unknown }).name : null))
    .filter((name): name is string => typeof name === "string");
}
