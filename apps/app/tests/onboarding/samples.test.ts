import { describe, expect, test } from "bun:test";
import { buildSample, samples } from "@/lib/samples";
import { flattenNotes } from "@/lib/samples/build";

// The samples after their "Start here" notes were replaced by a try-out
// (onboarding-plan.md 2.4): they still build, with no reference left dangling,
// and open on a scene.

describe("samples", () => {
  for (const sample of Object.values(samples)) {
    test(`${sample.id} builds and opens on a scene`, () => {
      let n = 0;
      const built = buildSample(sample, { projectId: "project", userId: "user", newId: () => `id-${++n}` });
      expect(built.nodes.find((node) => node.id === built.openNodeId)?.kind).toBe("scene");
      expect(flattenNotes(sample.notes).some(({ note }) => note.title === "Start here")).toBe(false);
      // The mistake the try-out is about is still described by the sample.
      expect(sample.continuity.length).toBeGreaterThan(0);
    });
  }
});
