import { describe, expect, test } from "bun:test";
import {
  cleanDone,
  countStates,
  doneObjectives,
  questReady,
  questState,
  renameDone,
  storedQuestState,
  toggleDone,
  type QuestState,
} from "@/lib/interactive/quests";
import { questEntityType } from "@/lib/world";

describe("quest states", () => {
  test("reading and storing", () => {
    expect(questState(undefined)).toBe("not-started");
    expect(questState("Active")).toBe("active");
    expect(questState(" done ")).toBe("done");
    expect(questState("failed")).toBe("failed");
    expect(questState("Not started")).toBe("not-started");
    expect(questState("Something else")).toBe("not-started");
    expect(questState(3)).toBe("not-started");
    expect(storedQuestState("not-started")).toBeNull();
    expect(storedQuestState("done")).toBe("Done");
    // What's stored is one of the Quest type's State choices, so the inspector's select shows it.
    const field = questEntityType.schema.find((f) => f.key === "state");
    expect(field?.type).toBe("select");
    for (const state of ["active", "done", "failed"] as const) expect(field?.options?.choices).toContain(storedQuestState(state)!);
  });

  test("counts", () => {
    expect(countStates(["done", "done", "active"])).toEqual({ "not-started": 0, active: 1, done: 2, failed: 0 });
  });

  test("ready to start", () => {
    const links = [
      { id: "a", prerequisites: [] },
      { id: "b", prerequisites: ["a"] },
      { id: "c", prerequisites: ["a", "b", "hidden"] },
    ];
    const states = new Map<string, QuestState>([["a", "done"]]);
    expect(questReady(links, states, "a")).toBe(false); // already done
    expect(questReady(links, states, "b")).toBe(true);
    expect(questReady(links, states, "c")).toBe(false);
    // A prerequisite the map doesn't know about (hidden by the horizon) doesn't block it.
    states.set("b", "done");
    expect(questReady(links, states, "c")).toBe(true);
    states.set("b", "failed");
    expect(questReady(links, states, "c")).toBe(false);
  });
});

describe("objective ticks", () => {
  const objectives = ["Find the map", "Cross the river", "Open the gate"];

  test("cleaning", () => {
    expect(cleanDone(["  a ", "a", 3, "", "b"])).toEqual(["a", "b"]);
    expect(cleanDone("nope")).toEqual([]);
    expect(cleanDone(Array.from({ length: 80 }, (_, i) => `o${i}`))).toHaveLength(50);
    expect(cleanDone(["x".repeat(100)])[0]).toHaveLength(80);
  });

  test("ticking keeps the objectives' order and drops stale ticks", () => {
    expect(doneObjectives(objectives, ["Open the gate", "Gone", "Find the map"])).toEqual(["Find the map", "Open the gate"]);
    expect(toggleDone(objectives, ["Open the gate", "Gone"], "Find the map", true)).toEqual(["Find the map", "Open the gate"]);
    expect(toggleDone(objectives, ["Find the map"], "Find the map", false)).toEqual([]);
    expect(toggleDone(objectives, [], "Not an objective", true)).toEqual([]);
  });

  test("renaming and removing carry the tick", () => {
    expect(renameDone(["Find the map"], "Find the map", "Steal the map")).toEqual(["Steal the map"]);
    expect(renameDone(["Find the map", "Open the gate"], "Find the map", null)).toEqual(["Open the gate"]);
    expect(renameDone(["Open the gate"], "Find the map", "x")).toEqual(["Open the gate"]);
  });
});
