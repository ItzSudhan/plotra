import { describe, expect, test } from "bun:test";
import { cleanDefaults, defaultsFrom, effectiveRibbon, effectiveShell } from "@/lib/shell-defaults";
import { editorLook } from "@/lib/shell-prefs";

// Defaults at three levels (lib/shell-defaults.ts): the person's own, then
// their project's default, then their workspace's, then the app's.

const project = { editor: { font: "sans", size: "l" }, inspector: { split: true, hidden: ["chat"], order: [] }, ribbon: { pinned: ["stats"], hidden: [], all: false, order: [] } };
const workspace = { editor: { font: "mono", width: "wide" }, home: { hidden: ["goal"], order: [] }, ribbon: { pinned: [], hidden: [], all: true, order: [] } };

describe("defaults at three levels", () => {
  test("the page: each choice on its own, the person's first, then the project's, then the workspace's", () => {
    expect(editorLook(effectiveShell({ editor: { size: "s" } }, project, workspace))).toMatchObject({ font: "sans", size: "s", width: "wide", spacing: "normal" });
    // A person who chose the app's own typeface keeps it over a default.
    expect(editorLook(effectiveShell({ editor: { font: "serif" } }, project, workspace)).font).toBe("serif");
  });

  test("the inspector and the home come whole: the person's own once they've arranged it, else the nearest default", () => {
    expect(effectiveShell({ inspector: { split: false, hidden: [], order: [] } }, project, workspace).inspector).toEqual(project.inspector);
    expect(effectiveShell({ inspector: { hidden: ["links"] } }, project, workspace).inspector).toEqual({ hidden: ["links"] });
    expect(effectiveShell({}, project, workspace).home).toEqual(workspace.home);
    expect(effectiveShell({}, null, undefined)).toEqual({});
  });

  test("the ribbon: the person's if they arranged it, else the project's, else the workspace's", () => {
    expect(effectiveRibbon({}, project, workspace)).toEqual(project.ribbon);
    expect(effectiveRibbon({}, {}, workspace)).toEqual(workspace.ribbon);
    expect(effectiveRibbon({ hidden: ["graph"] }, project, workspace)).toEqual({ hidden: ["graph"] });
  });

  test("a default keeps only what it can hold, cleaned", () => {
    expect(defaultsFrom({ editor: { font: "sans" }, inspector: { split: false, hidden: [], order: [] }, prompts: false, hotkeys: { "view.graph": "mod+g" } }, { pinned: ["stats"] })).toEqual({
      editor: { font: "sans" },
      ribbon: { pinned: ["stats"], hidden: [], all: false, order: [] },
    });
    expect(cleanDefaults({ editor: { font: "comic" }, inspector: { hidden: ["nonsense"] } })).toEqual({});
  });
});
