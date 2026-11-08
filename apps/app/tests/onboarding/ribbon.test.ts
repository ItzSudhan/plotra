import { describe, expect, test } from "bun:test";
import { viewMeta } from "@/components/workspace/view-meta";
import { trackIds } from "@/lib/onboarding/tracks";
import { cleanRibbon, coreViews, ribbonLayout, setInRibbon } from "@/lib/ribbon";

// What the ribbon shows (onboarding-plan.md 3): a track's five views, plus
// what the person pinned, minus what they took off.

const views = viewMeta.filter((view) => "ribbon" in view && view.ribbon);
const ids = (list: Array<{ id: string }>) => list.map((view) => view.id);

describe("ribbonLayout", () => {
  test("every track starts with five views that exist and can be in the ribbon", () => {
    for (const track of trackIds) {
      expect(coreViews[track]).toHaveLength(5);
      for (const id of coreViews[track]) expect(ids(views)).toContain(id);
    }
  });

  test("a new person sees the track's views and finds the rest under More", () => {
    const { shown, more } = ribbonLayout(views, "novel", {});
    expect(ids(shown).sort()).toEqual([...coreViews.novel].sort());
    expect(shown.length + more.length).toBe(views.length);
    // A project with no track (a sample) gets the novel's.
    expect(ids(ribbonLayout(views, undefined, {}).shown)).toEqual(ids(shown));
  });

  test("pinning adds a view and taking a core one off hides it", () => {
    let prefs = setInRibbon({}, "novel", "stats", true);
    prefs = setInRibbon(prefs, "novel", "graph", false);
    const shown = ids(ribbonLayout(views, "novel", prefs).shown);
    expect(shown).toContain("stats");
    expect(shown).not.toContain("graph");
    // And back again.
    prefs = setInRibbon(setInRibbon(prefs, "novel", "stats", false), "novel", "graph", true);
    expect(prefs).toEqual({ pinned: [], hidden: [] });
  });

  test("a view pinned on one track is still pinned on another, where it may be a core view", () => {
    const prefs = setInRibbon({}, "novel", "corkboard", true);
    expect(ids(ribbonLayout(views, "screenplay", prefs).shown)).toContain("corkboard");
  });

  test("showing every view ignores the rest", () => {
    const { shown, more } = ribbonLayout(views, "ttrpg", { all: true, hidden: ["codex"] });
    expect(shown).toHaveLength(views.length);
    expect(more).toHaveLength(0);
  });
});

describe("cleanRibbon", () => {
  test("keeps only lists of ids and a flag", () => {
    expect(cleanRibbon({ pinned: ["stats", "stats", 4, ""], hidden: "graph", all: "yes" })).toEqual({ pinned: ["stats"], hidden: [], all: false, order: [] });
    expect(cleanRibbon(null)).toEqual({ pinned: [], hidden: [], all: false, order: [] });
  });
});
