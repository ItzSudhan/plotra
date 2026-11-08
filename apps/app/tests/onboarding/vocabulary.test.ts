import { describe, expect, test } from "bun:test";
import { trackIds } from "@/lib/onboarding/tracks";
import { cleanLabels, cleanVocabulary, kindLabel, kindPlural, labelColors, labelOf, moduleLabel, renameableKinds, renameableViews, trackVocabulary, viewLabel, viewShort } from "@/lib/vocabulary";

// A project's own words for kinds of note, and its colour labels (onboarding-plan.md 4.2).

describe("vocabulary", () => {
  test("a kind is called the app's word until the project has its own", () => {
    expect(kindLabel("chapter", {})).toBe("Chapter");
    expect(kindLabel("chapter", { vocabulary: { chapter: "Session" } })).toBe("Session");
    expect(kindLabel("scene", { vocabulary: { chapter: "Session" } })).toBe("Scene");
  });

  test("plurals follow the word", () => {
    expect(kindPlural("scene", {})).toBe("Scenes");
    expect(kindPlural("chapter", { vocabulary: { chapter: "Story" } })).toBe("Stories");
    expect(kindPlural("chapter", { vocabulary: { chapter: "Class" } })).toBe("Classes");
    expect(kindPlural("chapter", { vocabulary: { chapter: "Day" } })).toBe("Days");
  });

  test("cleaning keeps renameable kinds, trims, and drops a word left as the app's", () => {
    expect(cleanVocabulary({ chapter: "  Episode  ", scene: "Scene", canvas: "Board", note: 4, folder: "" })).toEqual({ chapter: "Episode" });
    expect(cleanVocabulary({ chapter: "x".repeat(80) }).chapter).toHaveLength(30);
    expect(cleanVocabulary(null)).toEqual({});
  });

  test("views and modules are renamed the same way, under view: and module:", () => {
    const codex = renameableViews.find((v) => v.id === "codex")!;
    const roadmap = renameableViews.find((v) => v.id === "roadmap")!;
    const settings = { vocabulary: { "view:codex": "Wiki", "module:releases": "Campaign arcs" } };
    expect(viewLabel(codex, settings)).toBe("Wiki");
    expect(viewShort(codex, settings)).toBe("Wiki");
    expect(viewLabel(roadmap, settings)).toBe("Release roadmap");
    expect(viewShort(roadmap, settings)).toBe("Releases");
    expect(moduleLabel("releases", settings)).toBe("Campaign arcs");
    expect(moduleLabel("world", settings)).toBe("World bible");
    expect(cleanVocabulary({ "view:codex": " Wiki ", "view:editor": "Page", "view:graph": "Graph", "module:world": "Lore", "module:nope": "x" })).toEqual({ "view:codex": "Wiki", "module:world": "Lore" });
    // A note's own editor is named by the note, not renamed.
    expect(renameableViews.some((v) => v.id === "editor")).toBe(false);
  });

  test("each track's words are for kinds that can be renamed", () => {
    for (const track of trackIds) for (const kind of Object.keys(trackVocabulary[track])) expect(renameableKinds as string[]).toContain(kind);
  });
});

describe("labels", () => {
  let n = 0;
  const newId = () => `new-${++n}`;

  test("cleaning keeps ids, names new ones, and colours from the palette", () => {
    const labels = cleanLabels([{ id: "a", name: " Subplot ", color: labelColors[3] }, { name: "Cut?", color: "red" }, { name: "  " }, { id: "a", name: "Twin", color: labelColors[0] }], newId);
    expect(labels.map((l) => l.name)).toEqual(["Subplot", "Cut?", "Twin"]);
    expect(labels[0]).toEqual({ id: "a", name: "Subplot", color: labelColors[3] });
    expect(labelColors as readonly string[]).toContain(labels[1].color);
    // Two labels never share an id.
    expect(new Set(labels.map((l) => l.id)).size).toBe(3);
    expect(cleanLabels("nonsense", newId)).toEqual([]);
  });

  test("a note's label is found while the project still has it", () => {
    const settings = { labels: [{ id: "a", name: "Subplot", color: labelColors[0] }] };
    expect(labelOf({ settings: { label: "a" } }, settings)?.name).toBe("Subplot");
    expect(labelOf({ settings: { label: "gone" } }, settings)).toBeUndefined();
    expect(labelOf({ settings: {} }, settings)).toBeUndefined();
  });
});
