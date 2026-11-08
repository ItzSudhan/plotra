import { describe, expect, test } from "bun:test";
import { moduleIds, projectTypes, type ModuleId } from "@plotra/db/schema";
import { allSuggested, enabledModules, suggestedModules, typeFormat, typeModules } from "@/lib/modules";
import { checklistFor, isStepId, isTryout, sampleTrack, stepIds, stepsFor } from "@/lib/onboarding/steps";
import { sampleCatalog } from "@/lib/samples/catalog";
import { trackIds, trackOf } from "@/lib/onboarding/tracks";

// The "Getting started" checklist (onboarding-plan.md 2.3): which steps a
// project shows, by its track and the modules it has on.

const all = new Set<ModuleId>(moduleIds);

describe("stepsFor", () => {
  test("a project without a track has no checklist", () => {
    expect(stepsFor(undefined, all)).toBeNull();
    expect(stepsFor("fantasy-novel", all)).toBeNull();
  });

  test("every track has five steps, starting with writing and linking", () => {
    for (const track of trackIds) {
      const steps = stepsFor(track, all)!;
      expect(steps.map((s) => s.id).slice(0, 2)).toEqual(["write", "link"]);
      expect(steps).toHaveLength(5);
      expect(new Set(steps.map((s) => s.id)).size).toBe(5);
      for (const step of steps) expect(isStepId(step.id)).toBe(true);
    }
  });

  test("every step id belongs to some checklist", () => {
    const used = new Set([...trackIds, sampleTrack(sampleCatalog[0].id)].flatMap((track) => stepsFor(track, all)!.map((s) => s.id)));
    expect([...used].sort()).toEqual([...stepIds].sort());
  });

  test("a step whose module is off is left out", () => {
    expect(stepsFor("novel", new Set()).map((s) => s.id)).toEqual(["write", "link", "graph"]);
    expect(stepsFor("ttrpg", new Set<ModuleId>(["releases"]))!.map((s) => s.id)).toEqual(["write", "link", "gm-note", "horizon"]);
  });

  test("each type's own modules leave it at least the three steps every project has", () => {
    for (const type of projectTypes) {
      const steps = stepsFor(trackOf(type), new Set(typeModules[type]))!;
      expect(steps.length).toBeGreaterThanOrEqual(3);
    }
    // Someone who manages the project is offered the modules that are off, so they see all five.
    for (const type of ["novel", "ttrpg", "screenplay"] as const) expect(stepsFor(type, all)).toHaveLength(5);
  });
});

describe("a sample's try-out", () => {
  test("each sample has one, about its own mistake, ending on the horizon", () => {
    for (const sample of sampleCatalog) {
      const track = sampleTrack(sample.id);
      const checklist = checklistFor(track, enabledModules(sample.type, { modules: allSuggested(sample.type) }))!;
      expect(isTryout(track)).toBe(true);
      expect(checklist.title).not.toBe("Getting started");
      expect(checklist.steps.map((s) => s.id)).toEqual(["try-report", "try-scene", "try-fix", "try-clear", "horizon"]);
      expect(checklist.steps[0].how).toContain(sample.tryout.problem);
      expect(checklist.steps[2].how).toBe(sample.tryout.fix);
    }
  });

  test("a track from the Cold Open is not a try-out", () => {
    expect(isTryout("novel")).toBe(false);
    expect(checklistFor("novel", all)!.title).toBe("Getting started");
  });
});

describe("the modules a project starts with", () => {
  test("are a few of the ones its type is for", () => {
    for (const type of projectTypes) {
      for (const id of typeModules[type]) expect(suggestedModules[type]).toContain(id);
      expect(typeModules[type].length).toBeLessThanOrEqual(2);
    }
  });

  test("always include the script formats for a type written in one", () => {
    for (const type of projectTypes) if (typeFormat[type] !== "prose") expect(typeModules[type]).toContain("screenplay");
  });

  test("a sample has everything its type is for", () => {
    expect([...enabledModules("novel", { modules: allSuggested("novel") })].sort()).toEqual([...suggestedModules.novel].sort());
    expect(enabledModules("novel", {}).size).toBe(0);
  });
});
