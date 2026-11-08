import { describe, expect, test } from "bun:test";
import { viewMeta } from "@/components/workspace/view-meta";
import { moved, ribbonLayout } from "@/lib/ribbon";
import { cleanShell, editorDefaults, editorLook, editorStyle, homeBlocks, homeLayout, inspectorPanels, inspectorTabs, type InspectorPanel } from "@/lib/shell-prefs";

// What a person can change about the shell for themselves (onboarding-plan.md 4.2).

const every = new Set<InspectorPanel>(inspectorPanels);
const tabIds = (tabs: ReturnType<typeof inspectorTabs>) => tabs.map((tab) => tab.id);

describe("inspectorTabs", () => {
  test("by default the panels share six tabs", () => {
    const tabs = inspectorTabs({}, every);
    expect(tabIds(tabs)).toEqual(["note", "links", "story", "review", "chat", "agent"]);
    expect(tabs[0].panels.map((panel) => panel.id)).toEqual(["properties", "outline"]);
  });

  test("a project without story tools or AI has neither tab", () => {
    expect(tabIds(inspectorTabs({}, new Set<InspectorPanel>(["properties", "outline", "links", "comments", "history"])))).toEqual(["note", "links", "review"]);
  });

  test("split gives each panel its own tab", () => {
    expect(tabIds(inspectorTabs({ inspector: { split: true } }, every))).toEqual([...inspectorPanels]);
  });

  test("hidden panels go, and a tab with nothing left goes with them", () => {
    const tabs = inspectorTabs({ inspector: { hidden: ["comments", "history", "outline"] } }, every);
    expect(tabIds(tabs)).toEqual(["note", "links", "story", "chat", "agent"]);
    expect(tabs[0].panels.map((panel) => panel.id)).toEqual(["properties"]);
    // Never empty.
    expect(tabIds(inspectorTabs({ inspector: { hidden: [...inspectorPanels] } }, every))).toEqual(["links"]);
  });

  test("the order is the person's", () => {
    expect(tabIds(inspectorTabs({ inspector: { order: ["comments", "links"] } }, every))).toEqual(["review", "links", "note", "story", "chat", "agent"]);
    expect(tabIds(inspectorTabs({ inspector: { split: true, order: ["history", "outline"] } }, every)).slice(0, 3)).toEqual(["history", "outline", "properties"]);
  });
});

describe("the look of the page", () => {
  test("defaults to today's page, and an unknown choice is ignored", () => {
    expect(editorLook({})).toEqual(editorDefaults);
    expect(editorLook({ editor: { font: "comic", size: "xl" } })).toEqual({ ...editorDefaults, size: "xl" });
    expect(editorStyle({}).text).toEqual({ fontFamily: "var(--font-prose)", fontSize: "1.0625rem", lineHeight: "1.75" });
    expect(editorStyle({ editor: { width: "wide", paragraphs: "indent" } })).toMatchObject({ column: { maxWidth: "56rem" }, paragraphs: "indent" });
  });
});

describe("cleanShell", () => {
  test("keeps known panels and choices, a page choice even when it's the app's own (it wins over a default)", () => {
    expect(cleanShell({ inspector: { split: 1, hidden: ["history", "nonsense"], order: "x" }, editor: { font: "mono", size: "m", width: 9 }, prompts: false })).toEqual({
      inspector: { split: false, hidden: ["history"], order: [] },
      editor: { font: "mono", size: "m" },
      home: { hidden: [], order: [] },
      prompts: false,
    });
    expect(cleanShell(null)).toEqual({ inspector: { split: false, hidden: [], order: [] }, editor: {}, home: { hidden: [], order: [] } });
    expect(cleanShell({ home: { hidden: ["goal", "weather"], order: ["shortcuts"] } }).home).toEqual({ hidden: ["goal"], order: ["shortcuts"] });
  });

  test("animations are stored only when switched off", () => {
    expect(cleanShell({ motion: false }).motion).toBe(false);
    expect(cleanShell({ motion: true })).not.toHaveProperty("motion");
    expect(cleanShell({ motion: "off" })).not.toHaveProperty("motion");
  });
});

describe("the ribbon's order", () => {
  const views = viewMeta.filter((view) => "ribbon" in view && view.ribbon);
  test("moving a view changes its place among the ones shown", () => {
    const shown = ribbonLayout(views, "novel", {}).shown.map((view) => view.id);
    const order = moved(shown, shown[2], -1);
    expect(ribbonLayout(views, "novel", { order }).shown.map((view) => view.id)).toEqual(order);
    // The ends don't move past themselves.
    expect(moved(shown, shown[0], -1)).toEqual(shown);
    expect(moved(shown, shown.at(-1)!, 1)).toEqual(shown);
  });

  test("a view pinned later goes after the ones that were placed", () => {
    const shown = ribbonLayout(views, "novel", {}).shown.map((view) => view.id);
    const order = [...shown].reverse();
    expect(ribbonLayout(views, "novel", { order, pinned: ["stats"] }).shown.map((view) => view.id)).toEqual([...order, "stats"]);
  });
});

describe("the project home", () => {
  test("shows every block until some are taken off, in the person's order", () => {
    expect(homeLayout({})).toEqual([...homeBlocks]);
    expect(homeLayout({ home: { hidden: ["goal"] } })).toEqual(["recent", "next", "shortcuts"]);
    expect(homeLayout({ home: { order: ["shortcuts", "recent"] } })).toEqual(["shortcuts", "recent", "goal", "next"]);
  });
});
