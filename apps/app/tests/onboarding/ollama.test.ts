import { describe, expect, test } from "bun:test";
import { modelNames, rankOllamaModels } from "@/lib/onboarding/ollama";

describe("a model from Ollama for a new library", () => {
  test("models that call tools come first, in Ollama's order within a family", () => {
    const { models, suggested } = rankOllamaModels(["gemma3:4b", "llama3.1:8b", "qwen3:8b", "qwen3:14b"]);
    expect(models).toEqual(["qwen3:8b", "qwen3:14b", "llama3.1:8b", "gemma3:4b"]);
    expect(suggested).toBe("qwen3:8b");
  });

  test("embedding and picture models aren't offered", () => {
    expect(rankOllamaModels(["nomic-embed-text:latest", "llava:7b", "phi4:14b"]).models).toEqual(["phi4:14b"]);
    expect(rankOllamaModels(["mxbai-embed-large"]).suggested).toBeNull();
  });

  test("nothing at all is no suggestion", () => {
    expect(rankOllamaModels([])).toEqual({ models: [], suggested: null });
  });

  test("Ollama's answer is read carefully", () => {
    expect(modelNames({ models: [{ name: "qwen3:8b" }, { name: 3 }, null] })).toEqual(["qwen3:8b"]);
    expect(modelNames("nope")).toEqual([]);
    expect(modelNames({})).toEqual([]);
  });
});
