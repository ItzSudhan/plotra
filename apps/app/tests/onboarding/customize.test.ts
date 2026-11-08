import { describe, expect, test } from "bun:test";
import { viewMeta } from "@/components/workspace/view-meta";
import { formatFor, formatKeys, formatShortcuts } from "@/lib/editor-shortcuts";
import { applyPreset, getPreset, missingViews, presets, ribbonOf } from "@/lib/presets";
import { ribbonLayout } from "@/lib/ribbon";
import { arranged, cleanHotkeys, cleanShell, hiddenByDefault, hideableIds, inOrder, isShown, orderable, placed, presetIds, STATUS_GAP, typingOn, uiSizeOf, withDefaultsFor, withShown, withUiSize } from "@/lib/shell-prefs";

// Customizing everything (beat-the-competitors.md, part 2): presets, shortcuts,
// hidden pieces and typing switches.

const ribbonViews = viewMeta.filter((view) => "ribbon" in view && view.ribbon);

describe("cleanShell, for the new settings", () => {
  test("keeps shortcut changes of the right shape, and drops the rest", () => {
    expect(cleanHotkeys({ "palette.search": "mod+shift+f", "view.focus": null, "format.bold": "mod+alt+\\" })).toEqual({
      "palette.search": "mod+shift+f",
      "view.focus": null,
      "format.bold": "mod+alt+\\",
    });
    expect(cleanHotkeys({ "bad id!": "mod+b", "view.x": "mod + b", "view.y": 3, "view.z": "x".repeat(50) })).toEqual({});
    expect(cleanHotkeys(["mod+b"])).toEqual({});
  });

  test("keeps only known pieces to hide, and commands taken out of the palette", () => {
    expect(cleanShell({ hide: ["status.bell", "toolbar.ai", "everything", 4] }).hide).toEqual(["status.bell", "toolbar.ai"]);
    expect(cleanShell({ hide: ["binder.share", "menu.duplicate", "palette.view.graph", "palette.bad id!"] }).hide).toEqual(["binder.share", "menu.duplicate", "palette.view.graph"]);
    expect(cleanShell({ hide: [] }).hide).toBeUndefined();
  });

  test("how a project opens and the paper: only what differs from the start is stored", () => {
    expect(cleanShell({ start: { focus: true, typewriter: false }, paper: "a4" })).toMatchObject({ start: { focus: true }, paper: "a4" });
    expect(cleanShell({ start: { focus: "yes" }, paper: "legal" })).not.toHaveProperty("start");
    expect(cleanShell({ paper: "letter" })).not.toHaveProperty("paper");
  });

  test("stores a typing switch only when it is off", () => {
    expect(cleanShell({ typing: { markdown: false, quotes: true, autolink: "no" } }).typing).toEqual({ markdown: false });
    expect(cleanShell({ typing: { quotes: true } }).typing).toBeUndefined();
  });

  test("keeps a known preset id only", () => {
    expect(cleanShell({ preset: "obsidian" }).preset).toBe("obsidian");
    expect(cleanShell({ preset: "notion" }).preset).toBeUndefined();
  });
});

describe("moving pieces", () => {
  test("a saved order is followed", () => {
    expect(inOrder(["a", "b", "c"], ["c", "a", "b"])).toEqual(["c", "a", "b"]);
    expect(inOrder(["a", "b", "c"], undefined)).toEqual(["a", "b", "c"]);
    expect(inOrder(["a", "b", "c"], [])).toEqual(["a", "b", "c"]);
  });

  test("pieces the order doesn't know go back after the piece they start after", () => {
    // "d" is new, and starts after "c", which the person moved first.
    expect(inOrder(["a", "b", "c", "d"], ["c", "a", "b"])).toEqual(["c", "d", "a", "b"]);
    // "a" starts first, with nothing before it.
    expect(inOrder(["a", "b", "c"], ["c", "b"])).toEqual(["a", "c", "b"]);
    // Several new ones keep their own order.
    expect(inOrder(["a", "b", "c", "d"], ["d", "a"])).toEqual(["d", "a", "b", "c"]);
  });

  test("pieces the order names that no longer exist are left out, and repeats once", () => {
    expect(inOrder(["a", "b", "c"], ["gone", "c", "c", "a", "b"])).toEqual(["c", "a", "b"]);
  });

  test("dragging puts a piece before the one it's dropped on going up, after it going down", () => {
    expect(placed(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(placed(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(placed(["a", "b"], "a", "missing")).toEqual(["a", "b"]);
  });

  test("each surface starts in its own order, and the status bar's space can be moved", () => {
    expect(arranged({}, "toolbar")).toEqual(orderable.toolbar);
    expect(arranged({}, "status").indexOf(STATUS_GAP)).toBe(2);
    // Saved before "More" and "Collapse all" existed, with the old New note and New folder buttons: those go, the new ones come back after "New", as they start.
    expect(arranged({ order: { binder: ["binder.share", "binder.new", "binder.new-note", "binder.new-folder"] } }, "binder")).toEqual([
      "binder.share",
      "binder.new",
      "binder.more",
      "binder.collapse",
    ]);
  });

  test("cleanShell keeps only known pieces of each surface", () => {
    expect(cleanShell({ order: { toolbar: ["toolbar.comment", "status.bell", "toolbar.bold"], status: [STATUS_GAP, "status.path"], menu: ["menu.open"] } }).order).toEqual({
      toolbar: ["toolbar.comment", "toolbar.bold"],
      status: [STATUS_GAP, "status.path"],
    });
    expect(cleanShell({ order: { toolbar: [] } })).not.toHaveProperty("order");
    expect(cleanShell({ order: "nope" })).not.toHaveProperty("order");
  });
});

describe("what's shown and what's on", () => {
  test("everything is shown and on until the person changes it", () => {
    for (const id of hideableIds) expect(isShown({}, id)).toBe(!hiddenByDefault.has(id));
    expect(isShown({ hide: ["status.bell"] }, "status.bell")).toBe(false);
    expect(typingOn({}, "quotes")).toBe(true);
    expect(typingOn({}, "spellcheck")).toBe(true);
    expect(typingOn({ typing: { wikilinks: false } }, "wikilinks")).toBe(false);
    expect(typingOn({ typing: { quotes: false } }, "quotes")).toBe(false);
  });
});

describe("formatting shortcuts", () => {
  test("answer to their default keys, or to the person's", () => {
    expect(formatFor("mod+b", {})?.id).toBe("format.bold");
    expect(formatFor("mod+b", { "format.bold": "mod+alt+b" })).toBeUndefined();
    expect(formatFor("mod+alt+b", { "format.bold": "mod+alt+b" })?.id).toBe("format.bold");
    expect(formatFor("mod+i", { "format.italic": null })).toBeUndefined();
  });

  test("no two share keys by default", () => {
    const keys = formatShortcuts.map((shortcut) => formatKeys(shortcut, {}));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("presets", () => {
  test("every id has a preset, and every preset is cleanable", () => {
    expect(presets.map((preset) => preset.id).sort()).toEqual([...presetIds].sort());
    for (const preset of presets) {
      const { shell } = applyPreset(preset, {});
      // What a preset sets survives the server's cleaning unchanged.
      expect(cleanShell(shell)).toEqual(cleanShell(JSON.parse(JSON.stringify(shell))));
      expect(cleanShell(shell).preset).toBe(preset.id);
      for (const id of preset.shell.hide ?? []) expect(hideableIds).toContain(id);
      for (const id of preset.views) expect(ribbonViews.map((view) => view.id)).toContain(id);
    }
  });

  test("a preset's ribbon is exactly its views, in its order, on any track", () => {
    const views = getPreset("plottr")!.views;
    for (const track of ["novel", "ttrpg", "screenplay", "other", undefined]) {
      expect(ribbonLayout(ribbonViews, track, ribbonOf(views)).shown.map((view) => view.id)).toEqual(views);
    }
  });

  test("the Plotra preset is how a new project starts", () => {
    expect(applyPreset(getPreset("plotra")!, {}).ribbon).toEqual({});
  });

  test("keeps the person's animations and prompts, and replaces the rest", () => {
    const { shell } = applyPreset(getPreset("docs")!, { motion: false, prompts: false, hide: ["toolbar.ai"], hotkeys: { "pane.close": null } });
    expect(shell.motion).toBe(false);
    expect(shell.prompts).toBe(false);
    expect(shell.hide).not.toContain("toolbar.ai");
    expect(shell.hotkeys).toBeUndefined();
  });

  test("names the views a project can't show yet", () => {
    const worldbuilder = getPreset("worldbuilder")!;
    const available = new Set(["codex", "graph", "relationships", "read"]);
    expect(missingViews(worldbuilder, available).map((view) => view.id)).toEqual(["roadmap", "knowledge", "continuity"]);
  });
});

describe("a calm first open", () => {
  test("the status bar starts with this note's words, the session and saving", () => {
    for (const id of ["status.path", "status.project-words", "status.chars"]) expect(isShown({}, id)).toBe(false);
    for (const id of ["status.note-words", "status.session", "status.sync"]) expect(isShown({}, id)).toBe(true);
  });

  test("a piece hidden at first can be shown, and both kinds hidden again", () => {
    const shown = { hide: withShown({}, "status.chars", true) };
    expect(isShown(shown, "status.chars")).toBe(true);
    expect(cleanShell(shown).hide).toEqual(["show:status.chars"]);
    expect(isShown({ hide: withShown(shown, "status.chars", false) }, "status.chars")).toBe(false);
    const bell = { hide: withShown({}, "status.bell", false) };
    expect(isShown(bell, "status.bell")).toBe(false);
    expect(isShown({ hide: withShown(bell, "status.bell", true) }, "status.bell")).toBe(true);
    // Only pieces that start hidden can be shown this way.
    expect(cleanShell({ hide: ["show:status.bell", "show:nope"] }).hide).toBeUndefined();
  });

  test("putting a surface back as it starts forgets both kinds of choice", () => {
    const prefs = { hide: ["show:status.chars", "status.bell", "toolbar.ai"] };
    expect(withDefaultsFor(prefs, new Set(["status.chars", "status.bell"]))).toEqual(["toolbar.ai"]);
  });
});

describe("interface size", () => {
  test("comfortable unless chosen, and only a change is stored", () => {
    expect(uiSizeOf({})).toBe("comfortable");
    expect(uiSizeOf(withUiSize({}, "large"))).toBe("large");
    expect(cleanShell(withUiSize({}, "larger"))).toHaveProperty("uiSize", "larger");
    expect(cleanShell(withUiSize({}, "comfortable"))).not.toHaveProperty("uiSize");
    expect(cleanShell({ uiSize: "enormous" })).not.toHaveProperty("uiSize");
    expect(withUiSize(withUiSize({}, "compact"), "comfortable")).not.toHaveProperty("uiSize");
  });
});
