import type { ModuleId, NodeKind } from "@plotra/db/schema";
import type { IconName } from "@plotra/icons";
import { documentKinds } from "@/lib/story";

/**
 * What the shell needs to know about a view without loading it: where it
 * appears and which module it belongs to. The components are attached in
 * view-registry.tsx; this file stays free of them so the workspace provider
 * can build commands from it without importing every view.
 */
export type ViewMeta = {
  id: string;
  title: string;
  icon: IconName;
  /** Binder kinds the view opens (a node view). Standalone views have none. */
  accepts?: NodeKind[];
  /** Can be in the ribbon, and given an "Open …" command (`view.<id>`). Which ones are there is the person's choice (lib/ribbon.ts). */
  ribbon?: boolean;
  /** The label under the ribbon button, when the title is too long for it. */
  short?: string;
  /** Where the view is listed in the ribbon's "More" menu. */
  group?: ViewGroup;
  /** Opens on a folder or chapter (binder context menu). */
  container?: boolean;
  /** Only available while this module is on (plan.md 2.8). */
  module?: ModuleId;
  /** Default hotkey of the view's command. */
  hotkey?: string;
  /** The command's title, when "Open <title>" doesn't read well. */
  commandTitle?: string;
  /** What the view is for, in a plain line: the second line in the "More" and mobile menus. */
  description: string;
};

export const viewGroups = { plan: "Plan", world: "World", read: "Read and publish", team: "Team and progress", tools: "Tools" } as const;
export type ViewGroup = keyof typeof viewGroups;

export const viewMeta = [
  { id: "editor", title: "Editor", icon: "pen-new-square-linear", accepts: documentKinds, description: "Write and edit a note" },
  { id: "storyboard", title: "Canvas", icon: "widget-4-linear", accepts: ["canvas"], description: "A board of cards, pictures and arrows" },
  { id: "timeline", title: "Timeline", icon: "calendar-mark-linear", accepts: ["timeline"], description: "Events laid out in story time" },
  { id: "dialogue", title: "Dialogue", icon: "dialog-2-linear", accepts: ["dialogue"], description: "A branching conversation for a game" },
  {
    id: "graph",
    title: "Graph",
    icon: "graph-new-linear",
    ribbon: true,
    group: "world",
    hotkey: "mod+g",
    commandTitle: "Open graph view",
    description: "A map of how your notes link to each other",
  },
  // ⌘⇧C opens the browser's element picker, so the Codex has ⌘⌥⇧C.
  { id: "codex", title: "Codex", icon: "library-linear", ribbon: true, group: "world", hotkey: "mod+alt+shift+c", description: "Your world bible: characters, places and things" },
  { id: "outline", title: "Outline", icon: "checklist-minimalistic-linear", ribbon: true, group: "plan", description: "Every scene in a table, with its synopsis and fields" },
  { id: "plot-grid", title: "Plot grid", icon: "widget-2-linear", ribbon: true, group: "plan", container: true, description: "Plot threads across your scenes, in a grid" },
  {
    id: "relationships",
    title: "Relationships",
    icon: "users-group-two-rounded-linear",
    ribbon: true,
    short: "Relations",
    group: "world",
    // ⌘⇧R reloads the page in every browser.
    hotkey: "mod+alt+shift+r",
    commandTitle: "Open relationship map",
    description: "Who is connected to whom, and how",
  },
  {
    id: "corkboard",
    title: "Corkboard",
    icon: "sticker-square-linear",
    ribbon: true,
    group: "plan",
    container: true,
    commandTitle: "Open corkboard of current folder",
    description: "Index cards for a folder's scenes, to shuffle round",
  },
  {
    id: "manuscript",
    title: "Manuscript",
    icon: "documents-linear",
    ribbon: true,
    group: "read",
    container: true,
    commandTitle: "Read the whole draft (manuscript of current folder)",
    description: "The whole draft as one long page, to read and edit",
  },
  {
    id: "read",
    title: "Read",
    icon: "book-linear",
    ribbon: true,
    group: "read",
    container: true,
    commandTitle: "Read and print preview of current folder",
    description: "Read it laid out like a book, then print or save a PDF",
  },
  {
    id: "roadmap",
    title: "Release roadmap",
    icon: "rocket-linear",
    ribbon: true,
    short: "Releases",
    group: "world",
    module: "releases",
    description: "Plan your releases and what each one reveals",
  },
  {
    id: "knowledge",
    title: "Secrets & setups",
    icon: "incognito-linear",
    ribbon: true,
    short: "Secrets",
    group: "world",
    module: "releases",
    description: "Track secrets, setups and payoffs, and who knows what",
  },
  { id: "continuity", title: "Continuity", icon: "shield-check-linear", ribbon: true, group: "world", module: "world", description: "Catch facts about your world that contradict each other" },
  {
    id: "production",
    title: "Production",
    icon: "video-frame-linear",
    ribbon: true,
    group: "tools",
    container: true,
    module: "production",
    description: "Breakdowns and schedules for a shoot or a recording",
  },
  {
    id: "translate",
    title: "Translate",
    icon: "translation-linear",
    ribbon: true,
    group: "read",
    container: true,
    module: "localization",
    description: "Translate notes side by side with the original",
  },
  {
    id: "publish",
    title: "Publish",
    icon: "export-linear",
    ribbon: true,
    group: "read",
    container: true,
    module: "publishing",
    description: "Turn your draft into a book, an ebook or a web page",
  },
  { id: "reviews", title: "Reviews", icon: "clipboard-check-linear", ribbon: true, group: "team", module: "editorial", description: "Beta readers, review rules and the changelog" },
  {
    id: "quests",
    title: "Quests",
    icon: "target-linear",
    ribbon: true,
    group: "tools",
    module: "interactive",
    commandTitle: "Open quest designer",
    description: "Design quests, their steps and what unlocks them",
  },
  {
    id: "strings",
    title: "Strings",
    icon: "text-field-focus-linear",
    ribbon: true,
    group: "tools",
    module: "interactive",
    commandTitle: "Open strings (short game text)",
    description: "Short game text in one table: names, items, menu lines",
  },
  { id: "sources", title: "Sources", icon: "square-academic-cap-linear", ribbon: true, group: "tools", module: "research", description: "Your research sources and citations" },
  // Polish (plan.md Phase 10): the project's feed, and words per day against the writer's goals.
  {
    id: "activity",
    title: "Activity",
    icon: "sort-by-time-linear",
    ribbon: true,
    group: "team",
    commandTitle: "Open activity feed",
    description: "What changed in the project lately, and who changed it",
  },
  {
    id: "stats",
    title: "Stats",
    icon: "chart-2-linear",
    ribbon: true,
    group: "team",
    commandTitle: "Open writing stats and goals",
    description: "Words written each day, against your goals",
  },
  // The agent's chat as a pane (plan.md 2.11). Offered only while AI is on for the workspace, the project and the person.
  { id: "agent", title: "AI", icon: "magic-stick-3-linear", ribbon: true, group: "tools", module: "ai", commandTitle: "Open AI chat", description: "Ask AI about your project, or have it help" },
  // A panel one of the person's plugins draws (components/plugins). Opened from its "Open …" command, never the ribbon.
  { id: "plugin", title: "Plugin", icon: "plug-circle-linear", description: "A panel from one of your plugins" },
] as const satisfies readonly ViewMeta[];

export type ViewId = (typeof viewMeta)[number]["id"];
