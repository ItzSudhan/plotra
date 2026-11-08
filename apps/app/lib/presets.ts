import type { RibbonPrefs, ShellPrefs } from "@plotra/db/schema";
import { viewMeta as allViews, type ViewMeta } from "@/components/workspace/view-meta";
import type { PresetId } from "./shell-prefs";

// "Work like…" presets (beat-the-competitors.md, part 2): one click sets the
// ribbon, the inspector, the look of the page, what's hidden and a few
// shortcuts, so someone coming from another app finds the layout they know.
// Everything a preset sets stays the person's to change afterwards. Pure: the
// Customize dialog and the tests read the same definitions.

export type Preset = {
  id: PresetId;
  title: string;
  /** What it gives, in a line. */
  description: string;
  /** The views in the ribbon, top to bottom. */
  views: string[];
  shell: Omit<ShellPrefs, "motion" | "prompts" | "preset">;
};

export const presets: Preset[] = [
  {
    id: "plotra",
    title: "Plotra",
    description: "How a new project starts: the views its type needs, everything else under More.",
    views: [],
    shell: {},
  },
  {
    id: "scrivener",
    title: "Like Scrivener",
    description: "Manuscript, corkboard and outline first, indented paragraphs, and ⌥⌘F / Ctrl+Alt+F for full-screen writing.",
    views: ["manuscript", "corkboard", "outline", "codex", "read", "stats"],
    shell: { editor: { font: "serif", paragraphs: "indent" }, hotkeys: { "view.focus": "mod+alt+f" } },
  },
  {
    id: "plottr",
    title: "Like Plottr",
    description: "Plan first: the plot grid, outline, corkboard and relationships up front, the draft after them.",
    views: ["plot-grid", "outline", "corkboard", "relationships", "codex", "manuscript"],
    shell: { editor: { font: "sans" } },
  },
  {
    id: "docs",
    title: "Like Google Docs",
    description: "One long document and little else: comments and history to hand, a quiet status bar.",
    views: ["manuscript", "outline"],
    shell: {
      editor: { font: "sans" },
      inspector: { hidden: ["story", "links", "outline"], order: ["comments", "history", "properties"] },
      hide: ["status.path", "status.horizon", "status.project-words", "status.chars", "status.session", "toolbar.breakdown"],
    },
  },
  {
    id: "obsidian",
    title: "Like Obsidian",
    description: "Links, the graph and the codex up front, a panel per tab, and ⌘⇧F / Ctrl+Shift+F to search the project.",
    views: ["graph", "codex", "outline", "manuscript", "read"],
    shell: {
      editor: { font: "sans" },
      inspector: { split: true, order: ["links", "outline", "properties"] },
      // Obsidian's search key; focus mode gives it up and stays in the command palette.
      hotkeys: { "palette.search": "mod+shift+f", "view.focus": null },
    },
  },
  {
    id: "worldbuilder",
    title: "Like World Anvil or LegendKeeper",
    description: "A wiki first: the codex, graph, relationships, secrets and continuity, with the draft one click away.",
    views: ["codex", "graph", "relationships", "roadmap", "knowledge", "continuity", "read"],
    shell: { editor: { font: "sans" }, inspector: { order: ["links", "story", "properties"] } },
  },
  {
    id: "minimal",
    title: "Distraction-free",
    description: "Like iA Writer: the page, a typewriter face and a narrow column, and almost nothing around them.",
    views: ["manuscript"],
    shell: {
      editor: { font: "mono", width: "narrow", spacing: "relaxed" },
      inspector: { hidden: ["story", "agent", "outline"] },
      home: { hidden: ["next", "shortcuts"] },
      hide: [
        "status.path",
        "status.horizon",
        "status.project-words",
        "status.chars",
        "status.session",
        "status.presence",
        "toolbar.ai",
        "toolbar.turn-into",
        "toolbar.underline",
        "toolbar.strikethrough",
        "toolbar.highlight",
        "toolbar.code",
        "toolbar.breakdown",
      ],
    },
  },
];

export const getPreset = (id: string | undefined) => presets.find((preset) => preset.id === id);

const viewMeta: readonly ViewMeta[] = allViews;
const ribbonIds = viewMeta.filter((view) => view.ribbon).map((view) => view.id);

/**
 * The ribbon that shows exactly these views, in this order, whatever the
 * project's track starts with: each is pinned, and every other is hidden.
 * No views means the track's own.
 */
export function ribbonOf(views: string[]): RibbonPrefs {
  if (!views.length) return {};
  return { pinned: [...views], hidden: ribbonIds.filter((id) => !views.includes(id)), order: [...views] };
}

/**
 * The setup after applying a preset. It replaces what presets cover (ribbon,
 * inspector, page, home, hidden pieces, shortcuts, typing) and keeps the
 * person's own switches for animations and empty-note prompts.
 */
export function applyPreset(preset: Preset, current: ShellPrefs): { ribbon: RibbonPrefs; shell: ShellPrefs } {
  return {
    ribbon: ribbonOf(preset.views),
    shell: {
      ...preset.shell,
      ...(current.motion === false && { motion: false }),
      ...(current.prompts === false && { prompts: false }),
      preset: preset.id,
    },
  };
}

/** The views a preset wants that this project can't show, because their module is off. */
export function missingViews(preset: Preset, available: ReadonlySet<string>) {
  return viewMeta.filter((view) => preset.views.includes(view.id) && !available.has(view.id));
}
