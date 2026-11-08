import type { ShellPrefs } from "@plotra/db/schema";
import { cleanOwnSheets } from "./beat-sheets";
import { cleanCompile, cleanOwnPresets } from "./io/compile";
import { cleanTheme } from "./themes";
import { ids } from "./ribbon";
import { DEFAULT_UI_SIZE, isUiSize, type UiSize } from "./ui-size";

// What someone can change about the shell for themselves, beyond the ribbon
// (onboarding-plan.md 4.2): the inspector's tabs and the look of the page they
// write on. These belong to the person, not the project, so co-writers don't
// rearrange each other's screens. Pure: the shell, the server and the tests
// read the same definitions.

// ---- The page -----------------------------------------------------------------

export const editorOptions = {
  font: {
    label: "Typeface",
    choices: { serif: "Serif", sans: "Sans-serif", mono: "Typewriter" },
    css: { serif: "var(--font-prose)", sans: "var(--font-sans)", mono: "var(--font-mono)" },
  },
  size: {
    label: "Text size",
    choices: { s: "Small", m: "Medium", l: "Large", xl: "Extra large" },
    css: { s: "0.9375rem", m: "1.0625rem", l: "1.1875rem", xl: "1.3125rem" },
  },
  width: {
    label: "Line width",
    choices: { narrow: "Narrow", normal: "Normal", wide: "Wide" },
    css: { narrow: "36rem", normal: "44rem", wide: "56rem" },
  },
  spacing: {
    label: "Line spacing",
    choices: { tight: "Tight", normal: "Normal", relaxed: "Relaxed" },
    css: { tight: "1.5", normal: "1.75", relaxed: "2" },
  },
  paragraphs: {
    label: "Paragraphs",
    choices: { spaced: "Space between", indent: "First line indented" },
    css: { spaced: "spaced", indent: "indent" },
  },
} as const;

export type EditorOption = keyof typeof editorOptions;
export const editorDefaults: Record<EditorOption, string> = { font: "serif", size: "m", width: "normal", spacing: "normal", paragraphs: "spaced" };

/** The look in force: what the person chose, where they chose something valid. */
export function editorLook(prefs: ShellPrefs): Record<EditorOption, string> {
  const look = { ...editorDefaults };
  for (const key of Object.keys(editorOptions) as EditorOption[]) {
    const chosen = prefs.editor?.[key];
    if (chosen && chosen in editorOptions[key].choices) look[key] = chosen;
  }
  return look;
}

/** The look as the styles of the page: the text's own, and the width of the column it sits in. */
export function editorStyle(prefs: ShellPrefs) {
  const look = editorLook(prefs);
  const css = <K extends EditorOption>(key: K) => (editorOptions[key].css as Record<string, string>)[look[key]];
  return {
    text: { fontFamily: css("font"), fontSize: css("size"), lineHeight: css("spacing") },
    column: { maxWidth: css("width") },
    paragraphs: css("paragraphs"),
  };
}

// ---- The inspector ----------------------------------------------------------------

export const inspectorPanels = ["properties", "outline", "links", "story", "comments", "history", "chat", "agent"] as const;
export type InspectorPanel = (typeof inspectorPanels)[number];
export const panelLabels: Record<InspectorPanel, string> = {
  properties: "Properties",
  outline: "Outline",
  links: "Links",
  story: "Story",
  comments: "Comments",
  history: "History",
  chat: "Chat",
  agent: "AI",
};

/** The tabs panels share unless the person asked for one tab each. */
const merged: Array<{ id: string; label: string; panels: InspectorPanel[] }> = [
  { id: "note", label: "Note", panels: ["properties", "outline"] },
  { id: "links", label: "Links", panels: ["links"] },
  { id: "story", label: "Story", panels: ["story"] },
  { id: "review", label: "Review", panels: ["comments", "history"] },
  { id: "chat", label: "Chat", panels: ["chat"] },
  { id: "agent", label: "AI", panels: ["agent"] },
];

export type InspectorTab = { id: string; label: string; panels: Array<{ id: InspectorPanel; label: string }> };

/**
 * The inspector's tabs: the panels this project has (`available`), minus the
 * ones the person hid, in their order, sharing tabs or with one each. Never
 * empty: with everything hidden, Links stays.
 */
export function inspectorTabs(prefs: ShellPrefs, available: ReadonlySet<InspectorPanel>): InspectorTab[] {
  const { split = false, hidden = [], order = [] } = prefs.inspector ?? {};
  const place = (panel: InspectorPanel) => (order.includes(panel) ? order.indexOf(panel) : order.length + inspectorPanels.indexOf(panel));
  let panels = inspectorPanels.filter((panel) => available.has(panel) && !hidden.includes(panel));
  if (!panels.length) panels = ["links"];
  const sorted = [...panels].sort((a, b) => place(a) - place(b));
  if (split) return sorted.map((panel) => ({ id: panel, label: panelLabels[panel], panels: [{ id: panel, label: panelLabels[panel] }] }));
  return merged
    .map((tab) => ({ id: tab.id, label: tab.label, panels: sorted.filter((panel) => tab.panels.includes(panel)).map((panel) => ({ id: panel, label: panelLabels[panel] })) }))
    .filter((tab) => tab.panels.length > 0)
    // A tab sits where the first of its panels does.
    .sort((a, b) => place(a.panels[0].id) - place(b.panels[0].id));
}

// ---- The project home -----------------------------------------------------------------

/** The blocks of the project home (components/onboarding/project-home.tsx), in the order they start in. */
export const homeBlocks = ["recent", "goal", "next", "shortcuts"] as const;
export type HomeBlock = (typeof homeBlocks)[number];
export const homeBlockLabels: Record<HomeBlock, string> = {
  recent: "Carry on: the notes last worked on",
  goal: "This session's words against your goal",
  next: "The next step of the checklist",
  shortcuts: "Shortcuts",
};

/** The blocks to show, in the person's order. */
export function homeLayout(prefs: ShellPrefs): HomeBlock[] {
  const { hidden = [], order = [] } = prefs.home ?? {};
  const place = (block: HomeBlock) => (order.includes(block) ? order.indexOf(block) : order.length + homeBlocks.indexOf(block));
  return homeBlocks.filter((block) => !hidden.includes(block)).sort((a, b) => place(a) - place(b));
}

// ---- What can be taken away -------------------------------------------------------

/**
 * Pieces of the interface someone can hide, by where they sit. Nothing here is
 * the only way to something: what a button does stays in the command palette
 * and its shortcut, and the status bar only reports.
 */
export const hideable = {
  status: {
    label: "Status bar",
    items: {
      "status.path": "Workspace and project name",
      "status.horizon": "Spoiler horizon",
      "status.project-words": "Words in the project",
      "status.note-words": "Words in this note",
      "status.chars": "Characters in this note (with spaces)",
      "status.session": "Words this session",
      "status.sync": "Saved or saving (going offline always shows)",
      "status.presence": "Who else is here",
      "status.bell": "Notifications bell",
    },
  },
  toolbar: {
    label: "Formatting toolbar",
    items: {
      "toolbar.ai": "AI (also in the / menu)",
      "toolbar.turn-into": "Turn into (paragraph, heading…)",
      "toolbar.bold": "Bold",
      "toolbar.italic": "Italic",
      "toolbar.underline": "Underline",
      "toolbar.strikethrough": "Strikethrough",
      "toolbar.highlight": "Highlight",
      "toolbar.code": "Inline code",
      "toolbar.link": "Link",
      "toolbar.breakdown": "Breakdown tag",
      "toolbar.comment": "Comment",
    },
  },
  binder: {
    label: "Binder header",
    items: {
      "binder.new": "New (scenes, chapters, folders and every other type)",
      "binder.more": "More: import, export and beat sheets",
      "binder.collapse": "Collapse all",
      "binder.share": "Share project",
    },
  },
  menu: {
    label: "Note menu (right-click or ⋯)",
    items: {
      "menu.open": "Open in new tab, Open to the right",
      "menu.graph": "Local graph",
      "menu.views": "Views of a folder (outline, corkboard…)",
      "menu.new-inside": "New inside",
      "menu.beat-sheet": "Save as a beat sheet",
      "menu.duplicate": "Duplicate",
      "menu.kind": "Change type",
      "menu.status": "Status",
      "menu.io": "Import and Export",
    },
  },
} as const;

export type HideGroup = keyof typeof hideable;
export const hideableIds = Object.values(hideable).flatMap((group) => Object.keys(group.items));

/**
 * Pieces that start hidden, to keep a first open calm (ux-audit.md #9): the
 * status bar starts with this note's words, the session, saving and the
 * account; the formatting toolbar without inline code. Someone who turns one on is remembered as "show:<id>" in `hide`.
 */
// Inline code too: it's for programmers, and stays a ⌘E away.
export const hiddenByDefault: ReadonlySet<string> = new Set(["status.path", "status.project-words", "status.chars", "toolbar.code"]);
const SHOW = "show:";

/** Whether the person kept this piece of the interface. */
export const isShown = (prefs: ShellPrefs, id: string) => (hiddenByDefault.has(id) ? Boolean(prefs.hide?.includes(SHOW + id)) : !prefs.hide?.includes(id));

/** The `hide` list after showing or hiding one piece. Pure. */
export function withShown(prefs: ShellPrefs, id: string, on: boolean): string[] {
  const rest = (prefs.hide ?? []).filter((other) => other !== id && other !== SHOW + id);
  if (hiddenByDefault.has(id)) return on ? [...rest, SHOW + id] : rest;
  return on ? rest : [...rest, id];
}

/** The `hide` list with these pieces back as they start. Pure. */
export const withDefaultsFor = (prefs: ShellPrefs, ids: ReadonlySet<string>) => (prefs.hide ?? []).filter((id) => !ids.has(id.startsWith(SHOW) ? id.slice(SHOW.length) : id));

// ---- What can be moved ---------------------------------------------------------------

/**
 * The surfaces whose pieces someone can put in their own order, each in the
 * order it starts in. The status bar also has a space, which can't be hidden:
 * what's before it sits on the left, what's after it on the right.
 */
export const STATUS_GAP = "status.gap";
const statusItems = Object.keys(hideable.status.items);
const afterHorizon = statusItems.indexOf("status.horizon") + 1;
export const orderable = {
  status: [...statusItems.slice(0, afterHorizon), STATUS_GAP, ...statusItems.slice(afterHorizon)],
  toolbar: Object.keys(hideable.toolbar.items),
  binder: Object.keys(hideable.binder.items),
} satisfies Partial<Record<HideGroup, string[]>>;

export type OrderGroup = keyof typeof orderable;
export const isOrderGroup = (group: string): group is OrderGroup => group in orderable;

/** What a movable piece is called in Customize. */
export function orderLabel(id: string): string {
  if (id === STATUS_GAP) return "Space (what's below it sits on the right)";
  for (const group of Object.values(hideable)) if (id in group.items) return (group.items as Record<string, string>)[id];
  return id;
}

/**
 * Pieces in a saved order. Ones the order doesn't know (added since it was
 * saved) go back where they start: just after the piece they start after.
 * Ones the order names that no longer exist are left out. Pure.
 */
export function inOrder(defaults: readonly string[], saved: readonly string[] | undefined): string[] {
  const known = new Set(defaults);
  const out = [...new Set((saved ?? []).filter((id) => known.has(id)))];
  defaults.forEach((id, i) => {
    if (out.includes(id)) return;
    const before = defaults.slice(0, i).findLast((other) => out.includes(other));
    out.splice(before === undefined ? 0 : out.indexOf(before) + 1, 0, id);
  });
  return out;
}

/** The list with one piece dragged to where another is: before it when moving up, after it when moving down. Pure. */
export function placed(list: readonly string[], id: string, at: string): string[] {
  const from = list.indexOf(id);
  const to = list.indexOf(at);
  if (from < 0 || to < 0 || from === to) return [...list];
  const next = list.filter((other) => other !== id);
  next.splice(to, 0, id);
  return next;
}

/** This surface's pieces in the person's order, hidden ones included. */
export const arranged = (prefs: ShellPrefs, group: OrderGroup) => inOrder(orderable[group], prefs.order?.[group]);

/** A command taken out of the command palette is kept as "palette.<command id>"; its shortcut still works. */
export const paletteId = (commandId: string) => `palette.${commandId}`;
const PALETTE_ID = /^palette\.[a-z0-9][a-z0-9.:_-]{0,79}$/i;

// ---- Interface size ------------------------------------------------------------------

/** How big the interface is drawn for this person (lib/ui-size.ts). Read loosely: older saved prefs have none. */
export function uiSizeOf(prefs: ShellPrefs): UiSize {
  const size = (prefs as { uiSize?: unknown }).uiSize;
  return isUiSize(size) ? size : DEFAULT_UI_SIZE;
}

/** The prefs with a new interface size; the default is stored as nothing. Pure. */
export function withUiSize(prefs: ShellPrefs, size: UiSize): ShellPrefs {
  const next = { ...prefs } as ShellPrefs & { uiSize?: UiSize };
  if (size === DEFAULT_UI_SIZE) delete next.uiSize;
  else next.uiSize = size;
  return next;
}

// ---- Typing -----------------------------------------------------------------------------

export const typingOptions = {
  markdown: { label: "Markdown as you type", hint: "# for a heading, - for a list, **bold**, > for a quote" },
  quotes: { label: "Smart quotes and dashes", hint: "Curly quotes, -- to an em dash, ... to an ellipsis" },
  autolink: { label: "Turn web addresses into links", hint: "When you paste or type one" },
  wikilinks: { label: "A list of notes on [[", hint: "Typing [[ opens a list of notes to link; switched off, [[ is just brackets" },
  spellcheck: { label: "Check spelling", hint: "Your browser underlines misspelt words, in the project's language (Project settings → Reveals & languages)" },
} as const;

export type TypingOption = keyof typeof typingOptions;

/** Whether something happens as this person types; everything is on until they switch it off. */
export const typingOn = (prefs: ShellPrefs, option: TypingOption) => prefs.typing?.[option] !== false;

// ---- Shortcuts --------------------------------------------------------------------------

const MAX_HOTKEYS = 200;
const commandId = /^[a-z0-9][a-z0-9.:_-]{0,79}$/i;
// "mod+shift+p", "alt+w", "f2", "mod+alt+\\": modifiers, then one key.
const hotkey = /^(?:(?:mod|ctrl|alt|shift)\+){0,4}[^+\s]{1,12}$/;

/** Shortcut overrides made safe to store: known shapes only, and not too many. */
export function cleanHotkeys(input: unknown): Record<string, string | null> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, string | null> = {};
  for (const [id, keys] of Object.entries(input).slice(0, MAX_HOTKEYS)) {
    if (!commandId.test(id)) continue;
    if (keys === null) out[id] = null;
    else if (typeof keys === "string" && keys.length <= 40 && hotkey.test(keys)) out[id] = keys;
  }
  return out;
}

// ---- Presets ----------------------------------------------------------------------------

/** The "Work like…" presets (lib/presets.ts), by id. Here so cleaning needn't load them. */
export const presetIds = ["plotra", "scrivener", "plottr", "docs", "obsidian", "worldbuilder", "minimal"] as const;
export type PresetId = (typeof presetIds)[number];
const isPresetId = (id: string): id is PresetId => (presetIds as readonly string[]).includes(id);

// ---- What each view remembers -------------------------------------------------------------

const VIEW_KEY = /^[a-z][a-z-]{0,30}\.[a-zA-Z][a-zA-Z-]{0,40}$/;
const MAX_VIEW_SETTINGS = 80;
const MAX_VIEW_BYTES = 8000;

/** A remembered view setting: a short string, a number, a yes or no, or a short list of strings. */
function viewValue(value: unknown): unknown {
  if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
  if (typeof value === "string") return value.slice(0, 200);
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string").map((v) => v.slice(0, 120)).slice(0, 50);
  return undefined;
}

/** View settings as they arrive from the browser, by "view.setting"; undefined when there are none. */
export function cleanViews(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input).slice(0, MAX_VIEW_SETTINGS)) {
    const clean = VIEW_KEY.test(key) ? viewValue(value) : undefined;
    if (clean !== undefined) out[key] = clean;
  }
  if (!Object.keys(out).length || JSON.stringify(out).length > MAX_VIEW_BYTES) return undefined;
  return out;
}

// ---- Cleaning ----------------------------------------------------------------------

/** Preferences as they arrive from the browser, made safe to store. */
export function cleanShell(input: unknown): ShellPrefs {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const inspector = (raw.inspector && typeof raw.inspector === "object" ? raw.inspector : {}) as Record<string, unknown>;
  const editor = (raw.editor && typeof raw.editor === "object" ? raw.editor : {}) as Record<string, unknown>;
  const isPanel = (id: string) => (inspectorPanels as readonly string[]).includes(id);
  const home = (raw.home && typeof raw.home === "object" ? raw.home : {}) as Record<string, unknown>;
  const isBlock = (id: string) => (homeBlocks as readonly string[]).includes(id);
  const look: Record<string, string> = {};
  for (const key of Object.keys(editorOptions) as EditorOption[]) {
    const chosen = editor[key];
    // Kept even when it's the app's own: a person who chose it means it over a project's or a workspace's default (lib/shell-defaults.ts).
    if (typeof chosen === "string" && chosen in editorOptions[key].choices) look[key] = chosen;
  }
  const typingRaw = (raw.typing && typeof raw.typing === "object" ? raw.typing : {}) as Record<string, unknown>;
  const typing: NonNullable<ShellPrefs["typing"]> = {};
  for (const option of Object.keys(typingOptions) as TypingOption[]) if (typingRaw[option] === false) typing[option] = false;
  const startRaw = (raw.start && typeof raw.start === "object" ? raw.start : {}) as Record<string, unknown>;
  const start: NonNullable<ShellPrefs["start"]> = { ...(startRaw.focus === true && { focus: true }), ...(startRaw.typewriter === true && { typewriter: true }) };
  const hotkeys = cleanHotkeys(raw.hotkeys);
  // More room than other lists: commands taken out of the palette count too.
  const hide = (Array.isArray(raw.hide) ? [...new Set(raw.hide.filter((id): id is string => typeof id === "string"))] : [])
    .filter((id) => hideableIds.includes(id) || PALETTE_ID.test(id) || (id.startsWith(SHOW) && hiddenByDefault.has(id.slice(SHOW.length))))
    .slice(0, 400);
  const orderRaw = (raw.order && typeof raw.order === "object" ? raw.order : {}) as Record<string, unknown>;
  const order: NonNullable<ShellPrefs["order"]> = {};
  for (const group of Object.keys(orderable) as OrderGroup[]) {
    const list = ids(orderRaw[group]).filter((id) => orderable[group].includes(id));
    if (list.length) order[group] = list;
  }
  const theme = cleanTheme(raw.theme);
  const views = cleanViews(raw.views);
  const compileRaw = (raw.compile && typeof raw.compile === "object" ? raw.compile : {}) as Record<string, unknown>;
  const compilePresets = cleanOwnPresets(compileRaw.presets).map(({ id, title, options }) => ({ id, title, options }));
  const compile =
    compileRaw.last || compilePresets.length
      ? { ...(compileRaw.last ? { last: cleanCompile(compileRaw.last) } : {}), ...(compilePresets.length ? { presets: compilePresets } : {}) }
      : null;
  // Stored without the group: every sheet kept here is the person's own.
  const beatSheets = cleanOwnSheets(raw.beatSheets).map((sheet) => ({ id: sheet.id, title: sheet.title, description: sheet.description, acts: sheet.acts }));
  return {
    inspector: { split: inspector.split === true, hidden: ids(inspector.hidden).filter(isPanel), order: ids(inspector.order).filter(isPanel) },
    editor: look,
    home: { hidden: ids(home.hidden).filter(isBlock), order: ids(home.order).filter(isBlock) },
    // Only "off" is stored: prompts and animations are on unless someone turned them off.
    ...(raw.prompts === false && { prompts: false }),
    ...(raw.motion === false && { motion: false }),
    ...(isUiSize(raw.uiSize) && raw.uiSize !== DEFAULT_UI_SIZE && { uiSize: raw.uiSize }),
    ...(Object.keys(hotkeys).length > 0 && { hotkeys }),
    ...(hide.length > 0 && { hide }),
    ...(Object.keys(order).length > 0 && { order }),
    ...(Object.keys(typing).length > 0 && { typing }),
    ...(Object.keys(start).length > 0 && { start }),
    ...(raw.paper === "a4" && { paper: "a4" as const }),
    ...(typeof raw.preset === "string" && isPresetId(raw.preset) && { preset: raw.preset }),
    ...(beatSheets.length > 0 && { beatSheets }),
    ...(compile && { compile }),
    ...(theme && { theme }),
    ...(views && { views }),
  };
}
