import { APICallError } from "ai";

// What a model's failure is called when it is shown to the writer. Shared by
// the server's runs (lib/agent/providers.ts) and the browser's, for a local
// model it calls itself (lib/agent/browser-model.ts): nothing here imports
// server code.

/**
 * A provider's error in plain words. Their own messages are kept where they
 * say something useful ("model not found"), but never the request, which
 * holds the prompt and the key.
 */
export function describeModelError(error: unknown): string {
  // No status means no answer at all: the request never got through. What went wrong is in the cause.
  if (APICallError.isInstance(error) && error.statusCode === undefined) return describeConnection(error.cause ?? error);
  if (APICallError.isInstance(error)) {
    const said = providerMessage(error);
    switch (error.statusCode) {
      case 400:
        return said ? `The AI company turned the request down: ${said}` : "The AI company turned the request down.";
      case 401:
      case 403:
        return "Your AI key was rejected. Check it in Settings → AI.";
      case 404:
        return said ? `The AI company couldn't find that model: ${said}` : "The AI company couldn't find that model. Check its name in Settings → AI.";
      case 402:
        return "Your account with the AI company is out of credit.";
      case 408:
      case 504:
        return "The AI took too long to answer. Try again.";
      case 413:
        return "That was too much text for the model at once.";
      case 429:
        return "The AI company is limiting how often this key can be used, or the account is out of credit. Try again in a moment.";
      default:
        if (error.statusCode && error.statusCode >= 500) return "The provider had an error on its side. Try again in a moment.";
        return said ? `The provider answered with an error: ${said}` : "The provider answered with an error.";
    }
  }
  // The SDK wraps the last failure when it gave up retrying.
  const last = (error as { lastError?: unknown } | null)?.lastError;
  if (last) return describeModelError(last);
  return describeConnection(error);
}

/**
 * What a run's stream tells the reader when a step fails: the provider's
 * error in plain words, or a tool's own message ("No note with id…"). Anything
 * else (a database error inside a tool) is not described: its text isn't
 * written for people.
 */
export function describeStepError(error: unknown): string {
  if (APICallError.isInstance(error) || (error as { lastError?: unknown } | null)?.lastError) return describeModelError(error);
  if (error instanceof Error && error.constructor === Error && error.message && !error.cause) return error.message;
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) return "The model took too long to answer.";
  return "That step didn't work.";
}

/** A failure to reach the provider at all, or one of our own messages. */
function describeConnection(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
    if (error.name === "AbortError" || error.name === "TimeoutError") return "The model took too long to answer.";
    if (code === "ECONNREFUSED") return "Nothing is answering at that URL. Is the model server running?";
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "That address couldn't be found. Check the URL.";
    if (code) return "The connection to the provider failed. Try again.";
    if (/tool|function call/i.test(error.message) && /support/i.test(error.message)) return "This model doesn't support tool calling, which the agent needs. Choose another model.";
    // Messages we wrote ourselves (lib/agent/base-url.ts, modelFor) are already plain.
    if (error.constructor === Error && error.message && !error.cause) return error.message;
  }
  return "The model couldn't be reached.";
}

/** The human-readable part of a provider's error body, when there is one. */
function providerMessage(error: APICallError): string | null {
  const data = error.data as { error?: { message?: unknown } | string; message?: unknown } | undefined;
  const found = typeof data?.error === "string" ? data.error : (data?.error?.message ?? data?.message);
  const text = typeof found === "string" ? found : null;
  if (!text) return null;
  return text.replace(/\s+/g, " ").trim().slice(0, 300) || null;
}
