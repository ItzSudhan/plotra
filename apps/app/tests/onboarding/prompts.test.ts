import { describe, expect, test } from "bun:test";
import { nodeKinds } from "@plotra/db/schema";
import { starterPrompt } from "@/lib/onboarding/prompts";

// The placeholder of an empty note (onboarding-plan.md 3).

describe("starterPrompt", () => {
  test("every kind gets a prompt that names the two keys", () => {
    for (const kind of nodeKinds) expect(starterPrompt(kind, "a")).toContain("[[");
  });

  test("a note keeps its prompt, and scenes don't all share one", () => {
    expect(starterPrompt("scene", "node-1")).toBe(starterPrompt("scene", "node-1"));
    const seen = new Set(Array.from({ length: 40 }, (_, i) => starterPrompt("scene", `node-${i}`)));
    expect(seen.size).toBeGreaterThan(1);
  });
});
