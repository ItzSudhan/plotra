"use server";

import { requireSession } from "./data";
import { isLocalMode } from "./local-mode";
import { modelNames, OLLAMA_TAGS_URL, rankOllamaModels, type OllamaFound } from "./onboarding/ollama";

/**
 * Looks for Ollama on this computer, for a new library's AI step.
 * Only in local mode, where the server
 * is this computer: a hosted server never calls anyone's machine.
 */
export async function findOllama(): Promise<OllamaFound> {
  await requireSession();
  const none: OllamaFound = { running: false, models: [], suggested: null };
  if (!isLocalMode) return none;
  try {
    const response = await fetch(OLLAMA_TAGS_URL, { signal: AbortSignal.timeout(1500), cache: "no-store" });
    if (!response.ok) return none;
    return { running: true, ...rankOllamaModels(modelNames(await response.json())) };
  } catch {
    return none;
  }
}
