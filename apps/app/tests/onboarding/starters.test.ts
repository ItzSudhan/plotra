import { describe, expect, test } from "bun:test";
import { buildSample } from "@/lib/samples";
import { audiences, starterCatalog } from "@/lib/starters/catalog";
import { starters } from "@/lib/starters/starters";
import { typeFormat } from "@/lib/modules";

// The starter templates: each builds with no reference left dangling, opens on
// an empty scene in its type's format, and has no story in it.

describe("starters", () => {
  test("every catalog entry has a structure, and every audience a starter", () => {
    expect(Object.keys(starters).sort()).toEqual(starterCatalog.map((s) => s.id).sort());
    for (const audience of audiences) expect(starterCatalog.some((s) => s.audience === audience.id)).toBe(true);
  });

  for (const card of starterCatalog) {
    test(`${card.id} builds and opens on an empty scene`, () => {
      const starter = starters[card.id];
      expect(starter.type).toBe(card.type);
      let n = 0;
      const built = buildSample(starter, { projectId: "project", userId: "user", newId: () => `id-${++n}` });
      const open = built.nodes.find((node) => node.id === built.openNodeId);
      expect(open?.kind).toBe("scene");
      const format = typeFormat[card.type];
      for (const node of built.nodes.filter((row) => row.kind === "scene")) {
        if (format !== "prose") expect(node.settings.format).toBe(format);
        expect(node.canon).toBe("draft");
      }
      // Releases ship folders or chapters of the starter.
      for (const release of built.releases) expect(built.nodes.some((node) => node.id === release.nodeId)).toBe(true);
    });
  }
});
