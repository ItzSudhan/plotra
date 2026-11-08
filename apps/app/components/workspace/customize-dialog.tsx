"use client";

import { Icon } from "@plotra/icons";
import { setProjectDefaults, setWorkspaceDefaults } from "@/lib/defaults-actions";
import { defaultsFrom } from "@/lib/shell-defaults";
import { errorText } from "@/lib/errors";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { viewLabel } from "@/lib/vocabulary";
import { Button } from "@plotra/ui/components/button";
import { confirm } from "@plotra/ui/components/dialogs";
import { IconButton } from "@plotra/ui/components/icon-button";
import { undoToast } from "@plotra/ui/components/sonner";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@plotra/ui/components/dialog";
import { cn } from "@plotra/ui/lib/utils";
import Link from "next/link";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { useGettingStarted } from "@/components/onboarding/getting-started";
import { formatShortcuts } from "@/lib/editor-shortcuts";
import { applyPreset, getPreset, missingViews, presets, type Preset } from "@/lib/presets";
import {
  accents,
  addOwnTheme,
  baseColours,
  cleanColour,
  cleanCss,
  cleanTheme,
  contrast,
  defaultBase,
  expandColours,
  MAX_CSS,
  MAX_OWN_THEMES,
  ownPalette,
  paletteOf,
  palettes,
  removeOwnTheme,
  themeCss,
  themePlugin,
  updateOwnTheme,
  type BaseColour,
  type Mode,
  type OwnTheme,
  chooseTheme,
  type Theme,
  type ThemeChoice,
} from "@/lib/themes";
import { useTheme } from "next-themes";
import { addPlugin } from "@/lib/plugin-actions";
import { savePluginFile } from "@/components/plugins/plugin-registry";
import { usePluginThemes, useThemes } from "./use-themes";
import { moved } from "@/lib/ribbon";
import {
  arranged,
  hideable,
  isOrderGroup,
  isShown,
  orderable,
  uiSizeOf,
  withDefaultsFor,
  withShown,
  withUiSize,
  orderLabel,
  placed,
  typingOn,
  typingOptions,
  paletteId,
  type HideGroup,
  type TypingOption,
  editorLook,
  editorOptions,
  homeBlockLabels,
  homeBlocks,
  homeLayout,
  inspectorPanels,
  panelLabels,
  type EditorOption,
  type InspectorPanel,
} from "@/lib/shell-prefs";
import { Segmented } from "@/components/views/view-ui";
import { formatHotkey } from "./hotkeys";
import { useRibbon } from "./ribbon";
import { applyThemeCss, useEffectiveShell, useHotkeys, useShell } from "./shell-prefs";
import { useUi, useWorkspace } from "./workspace-provider";
import { SelectField } from "@plotra/ui/components/select-field";
import { uiSizes, type UiSize } from "@/lib/ui-size";

// The sections, with the words a search finds them by: their own, and those of what's in them.
const hideHints: Record<HideGroup, string> = {
  status: "What the bar along the bottom shows.",
  toolbar: "The buttons over selected text. Their shortcuts work either way.",
  binder: "The buttons along the top of the binder. What they do stays in All commands.",
  menu: "What right-clicking a note (or its ⋯ button) offers. Rename and Move to Trash always stay, and so do their keys (F2, Delete).",
};

// The tabs the sections are grouped under.
const tabs = [
  { id: "look", label: "Look" },
  { id: "layout", label: "Layout" },
  { id: "keys", label: "Keys and typing" },
  { id: "advanced", label: "Advanced" },
] as const;
type TabId = (typeof tabs)[number]["id"];

const hideTabs: Record<HideGroup, TabId> = { status: "layout", toolbar: "layout", binder: "layout", menu: "layout" };

const sections: Array<{ id: string; tab: TabId; title: string; hint: string; words: string; Body: () => React.ReactNode }> = [
  {
    id: "presets",
    tab: "look",
    title: "Work like…",
    hint: "Start from the layout of an app you know. Everything it sets stays yours to change.",
    words: `preset current layout ${presets.map((preset) => `${preset.title} ${preset.description}`).join(" ")}`,
    Body: PresetsSection,
  },
  {
    id: "size",
    tab: "look",
    title: "Interface size",
    hint: "How big the buttons, menus and labels are drawn, on every page. The text you write has its own size, under The page.",
    words: `interface size zoom bigger smaller larger text scale accessibility ${Object.values(uiSizes).join(" ")}`,
    Body: SizeSection,
  },
  {
    id: "page",
    tab: "look",
    title: "The page",
    hint: "How the text you write looks. Printed and exported pages have their own formats.",
    words: `editor font typeface size width spacing paragraphs indent ${Object.values(editorOptions).map((option) => option.label).join(" ")}`,
    Body: EditorSection,
  },
  {
    id: "theme",
    tab: "look",
    title: "Colours",
    hint: "The app's colours, in light and dark: one of Plotra's themes, one from a plugin, or one you make.",
    words: `theme themes colour color palette accent dark light custom make own new plugin share ${Object.values(palettes).map((p) => p.label).join(" ")} ${Object.values(accents).map((a) => a.label).join(" ")}`,
    Body: ThemeSection,
  },
  {
    id: "opening",
    tab: "look",
    title: "Opening and printing",
    hint: "How a project opens for you, and the paper the Read view lays out and prints on.",
    words: "focus mode typewriter scrolling start open paper a4 letter print page size read view",
    Body: OpeningSection,
  },
  { id: "ribbon", tab: "layout", title: "Ribbon", hint: "The views kept one click away on the left. The others are under More.", words: "views sidebar pin order left", Body: RibbonSection },
  {
    id: "inspector",
    tab: "layout",
    title: "Inspector",
    hint: "The panels about the open note, on the right.",
    words: "panels tabs right properties outline links story comments history ai details",
    Body: InspectorSection,
  },
  ...(Object.keys(hideable) as HideGroup[]).map((group) => ({
    id: group,
    tab: hideTabs[group],
    title: hideable[group].label,
    hint: hideHints[group],
    words: `hide show ${isOrderGroup(group) ? "move order reorder drag " : ""}${Object.values(hideable[group].items).join(" ")}`,
    Body: () => <HideSection group={group} />,
  })),
  { id: "home", tab: "layout", title: "Project home", hint: "What a project shows when no note is open.", words: Object.values(homeBlockLabels).join(" "), Body: HomeSection },
  { id: "guidance", tab: "layout", title: "Guidance", hint: "Help for getting going. Switch it off once you don't need it.", words: "prompts empty note getting started checklist", Body: GuidanceSection },
  {
    id: "shortcuts",
    tab: "keys",
    title: "Keyboard shortcuts",
    hint: "Every command's keys, and the editor's formatting keys, are yours to change.",
    words: `keys hotkeys keymap rebind ${formatShortcuts.map((shortcut) => shortcut.title).join(" ")}`,
    Body: ShortcutsSection,
  },
  {
    id: "typing",
    tab: "keys",
    title: "Typing",
    hint: "What the editor does for you as you type.",
    words: `${Object.values(typingOptions).map((option) => `${option.label} ${option.hint}`).join(" ")}`,
    Body: TypingSection,
  },
  {
    id: "palette",
    tab: "keys",
    title: "All commands",
    hint: "Commands to take out of the All commands list (⌘P) when you never use them. Their shortcuts still work.",
    words: "command palette commands hide show list all",
    Body: PaletteSection,
  },
  {
    id: "css",
    tab: "advanced",
    title: "Your own CSS",
    hint: "For people who know CSS: style rules of your own, applied to every page, for you only.",
    words: "css snippet style custom code stylesheet",
    Body: CssSection,
  },
  {
    id: "defaults",
    tab: "advanced",
    title: "Defaults for others",
    hint: "Make your page, inspector, project home and ribbon what everyone in this project, or the workspace, starts from. Anyone's own choices still win.",
    words: "default team project workspace everyone share setup layout",
    Body: DefaultsSection,
  },
  {
    id: "file",
    tab: "advanced",
    title: "Your setup as a file",
    hint: "Save all of this to a file, to keep or to give to someone, and load one back.",
    words: "export import backup share download upload json",
    Body: FileSection,
  },
  {
    id: "start-over",
    tab: "advanced",
    title: "Start over",
    hint: "Put everything on this screen back to how a new project starts. Your interface size, animations and the themes you made stay as they are.",
    words: "reset everything start over defaults clear restore",
    Body: StartOverSection,
  },
];

// Settings that live elsewhere, so a search here finds them too.
const elsewhere: Array<{ title: string; words: string; where: "project" | "you" }> = [
  { title: "Tools (world bible, releases, scripts, research…)", words: "tools modules features switch on off enable disable", where: "project" },
  { title: "Project type and script format", words: "type novel screenplay ttrpg format", where: "project" },
  { title: "Names of things (call a scene an episode)", words: "vocabulary rename words scene chapter episode", where: "project" },
  { title: "Workflow stages and colour labels", words: "status workflow stages labels colours colors", where: "project" },
  { title: "Animations", words: "motion animation reduce", where: "you" },
  { title: "Notification emails", words: "notifications email digest", where: "you" },
  { title: "AI model and key", words: "ai model key provider", where: "you" },
  { title: "Light and dark", words: "theme dark light", where: "you" },
];

const Query = createContext("");
const matches = (query: string, text: string) => !query || query.split(/\s+/).every((word) => text.toLowerCase().includes(word));

/**
 * Customize (onboarding-plan.md 4.3, beat-the-competitors.md part 2): one
 * place for everything a person can change about the shell for themselves,
 * from a preset that makes it work like another app down to each button.
 * All of it is theirs alone and follows them to every project; what belongs
 * to the project (modules, workflow) is in project settings. Type to search.
 */
export function CustomizeDialog() {
  const { setUi } = useWorkspace();
  const { customize } = useUi();
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<TabId>("look");
  const tabIds = useId();
  if (!customize) return null;
  const query = filter.trim().toLowerCase();
  // A search looks through every tab; otherwise the chosen tab's sections show.
  const shown = sections.filter((section) => (query ? matches(query, `${section.title} ${section.hint} ${section.words}`) : section.tab === tab));
  const onTabKey = (event: React.KeyboardEvent) => {
    const at = tabs.findIndex((t) => t.id === tab);
    const to = event.key === "ArrowRight" ? at + 1 : event.key === "ArrowLeft" ? at - 1 : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
    if (to === null) return;
    event.preventDefault();
    const next = tabs[(to + tabs.length) % tabs.length].id;
    setTab(next);
    document.getElementById(`${tabIds}-${next}`)?.focus();
  };
  const other = query ? elsewhere.filter((item) => matches(query, `${item.title} ${item.words}`)) : [];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          setFilter("");
          setUi({ customize: false });
        }
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="gap-3 border-b px-6 py-4">
          <div>
            <DialogTitle>Customize</DialogTitle>
            <DialogDescription>These are yours alone: nobody else&apos;s screen changes, and they follow you to every project.</DialogDescription>
          </div>
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search settings…"
            aria-label="Search settings"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          {!query && (
            <div role="tablist" aria-label="Customize sections" onKeyDown={onTabKey} className="-mb-4 flex gap-1 overflow-x-auto">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  id={`${tabIds}-${t.id}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  aria-controls={`${tabIds}-panel`}
                  tabIndex={tab === t.id ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "-mb-px h-9 shrink-0 border-b-2 border-transparent px-3 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    tab === t.id && "border-ember text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </DialogHeader>
        <Query.Provider value={query}>
          <div
            id={`${tabIds}-panel`}
            role={query ? undefined : "tabpanel"}
            aria-labelledby={query ? undefined : `${tabIds}-${tab}`}
            className="grid min-h-0 gap-8 overflow-y-auto px-6 py-5"
          >
            {shown.map(({ id, Body }) => (
              <Body key={id} />
            ))}
            {other.length > 0 && <Elsewhere items={other} />}
            {shown.length === 0 && other.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing matches “{filter.trim()}”.</p>}
          </div>
        </Query.Provider>
      </DialogContent>
    </Dialog>
  );
}

function Elsewhere({ items }: { items: typeof elsewhere }) {
  const { setUi, workspace } = useWorkspace();
  return (
    <section aria-label="Elsewhere">
      <h3 className="text-sm font-medium">Elsewhere</h3>
      <p className="mt-0.5 mb-3 text-xs text-muted-foreground">Settings for the whole project, and your account&apos;s own.</p>
      <ul className="rounded-md border">
        {items.map((item) => (
          <li key={item.title} className="flex min-h-9 items-center gap-2 border-b px-2.5 text-sm last:border-b-0">
            <span className="flex-1">{item.title}</span>
            {item.where === "project" ? (
              <button
                type="button"
                disabled={!workspace.role}
                onClick={() => setUi({ customize: false, projectSettings: true })}
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
              >
                Project settings
              </button>
            ) : (
              <Link href="/settings" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Your settings
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Section({ title, hint, onReset, children }: { title: string; hint: string; onReset?: () => void; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">{title}</h3>
        {onReset && (
          <button type="button" onClick={onReset} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Reset to default
          </button>
        )}
      </div>
      <p className="mt-0.5 mb-3 text-xs text-muted-foreground">{hint}</p>
      {children}
    </section>
  );
}

function Check({ checked, onChange, disabled, children }: { checked: boolean; onChange: (on: boolean) => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <label className={cn("flex min-h-8 items-center gap-2.5 text-sm", disabled && "opacity-50")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-[var(--ember)]" />
      {children}
    </label>
  );
}

/**
 * A list of things that can each be switched on, and moved up and down while they are.
 * With `onPlace`, rows can be dragged too, and hidden ones keep their place and move like the rest;
 * one that is `on: null` can't be switched off.
 */
function OrderedList({
  items,
  disabled,
  onToggle,
  onMove,
  onPlace,
}: {
  items: Array<{ id: string; label: string; on: boolean | null; first: boolean; last: boolean }>;
  disabled?: boolean;
  onToggle: (id: string, on: boolean) => void;
  onMove: (id: string, by: -1 | 1) => void;
  onPlace?: (id: string, at: string) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const still = (on: boolean | null) => disabled || (!onPlace && !on);
  return (
    <ul className="rounded-md border">
      {items.map((item) => (
        <li
          key={item.id}
          draggable={Boolean(onPlace) && !disabled}
          onDragStart={(event) => {
            setDragging(item.id);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", item.label);
          }}
          onDragOver={(event) => {
            if (!dragging) return;
            event.preventDefault();
            setOver(item.id);
          }}
          onDragLeave={() => setOver((current) => (current === item.id ? null : current))}
          onDrop={(event) => {
            event.preventDefault();
            if (dragging && dragging !== item.id) onPlace?.(dragging, item.id);
            setDragging(null);
            setOver(null);
          }}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
          }}
          className={cn(
            "flex items-center gap-1 border-b px-2.5 last:border-b-0",
            onPlace && !disabled && "cursor-grab",
            dragging === item.id && "opacity-50",
            over === item.id && dragging !== item.id && "bg-accent",
          )}
        >
          {onPlace && <Icon name="hamburger-menu-linear" aria-hidden className="size-3.5 shrink-0 text-faint" />}
          <div className="min-w-0 flex-1">
            {item.on === null ? (
              <span className="flex min-h-8 items-center truncate text-sm text-muted-foreground">{item.label}</span>
            ) : (
              <Check checked={item.on} disabled={disabled} onChange={(on) => onToggle(item.id, on)}>
                <span className="truncate">{item.label}</span>
              </Check>
            )}
          </div>
          <IconButton icon="alt-arrow-up-linear" size="xs" label={`Move ${item.label} up`} disabled={still(item.on) || item.first} onClick={() => onMove(item.id, -1)} />
          <IconButton icon="alt-arrow-down-linear" size="xs" label={`Move ${item.label} down`} disabled={still(item.on) || item.last} onClick={() => onMove(item.id, 1)} />
        </li>
      ))}
    </ul>
  );
}

function RibbonSection() {
  const ribbon = useRibbon();
  const { project } = useWorkspace();
  // The views in the ribbon first, in their order, then the rest.
  const items = [
    ...ribbon.shown.map((view, i) => ({ id: view.id, label: viewLabel(view, project.settings), on: true, first: i === 0, last: i === ribbon.shown.length - 1 })),
    ...ribbon.more.map((view) => ({ id: view.id, label: viewLabel(view, project.settings), on: false, first: true, last: true })),
  ];
  return (
    <Section title="Ribbon" hint="The views kept one click away on the left. The others are under More." onReset={ribbon.changed ? ribbon.reset : undefined}>
      <Check checked={ribbon.all} onChange={ribbon.setAll}>
        Show every view
      </Check>
      <div className="mt-2">
        <OrderedList items={items} disabled={ribbon.all} onToggle={ribbon.setShown} onMove={ribbon.move} />
      </div>
    </Section>
  );
}

function InspectorSection() {
  const { modules } = useWorkspace();
  const { shell, save } = useShell();
  // What's in force, with any default under the person's own; a change makes it theirs.
  const effective = useEffectiveShell();
  const prefs = effective.inspector ?? {};
  const hidden = new Set(prefs.hidden ?? []);
  // Panels this project doesn't have (Story, AI) aren't offered.
  const available = inspectorPanels.filter(
    (panel) => (panel !== "story" || modules.has("world") || modules.has("releases") || modules.has("research")) && (panel !== "agent" || modules.has("ai")),
  );
  const place = (panel: InspectorPanel) => ((prefs.order ?? []).includes(panel) ? (prefs.order ?? []).indexOf(panel) : inspectorPanels.length + inspectorPanels.indexOf(panel));
  const ordered = [...available].sort((a, b) => place(a) - place(b));
  const shown = ordered.filter((panel) => !hidden.has(panel));
  const items = [
    ...shown.map((panel, i) => ({ id: panel, label: panelLabels[panel], on: true, first: i === 0, last: i === shown.length - 1 })),
    ...ordered.filter((panel) => hidden.has(panel)).map((panel) => ({ id: panel, label: panelLabels[panel], on: false, first: true, last: true })),
  ];
  const set = (inspector: NonNullable<typeof shell.inspector>) => save({ ...shell, inspector });
  const own = shell.inspector ?? {};
  const changed = Boolean(own.split || own.hidden?.length || own.order?.length);

  return (
    <Section title="Inspector" hint="The panels about the open note, on the right." onReset={changed ? () => set({}) : undefined}>
      <Check checked={prefs.split === true} onChange={(split) => set({ ...prefs, split })}>
        One tab for each panel, instead of Note and Review
      </Check>
      <div className="mt-2">
        <OrderedList
          items={items}
          onToggle={(id, on) => set({ ...prefs, hidden: on ? [...hidden].filter((panel) => panel !== id) : [...hidden, id] })}
          // The order is of the panels shown; hidden ones keep their place after them.
          onMove={(id, by) => set({ ...prefs, order: [...moved(shown, id, by), ...ordered.filter((panel) => hidden.has(panel))] })}
        />
      </div>
    </Section>
  );
}

function EditorSection() {
  const { shell, save } = useShell();
  // What's in force, with any default under the person's own; a choice made here is theirs.
  const look = editorLook(useEffectiveShell());
  const changed = Object.keys(shell.editor ?? {}).length > 0;
  return (
    <Section title="The page" hint="How the text you write looks. Printed and exported pages have their own formats." onReset={changed ? () => save({ ...shell, editor: {} }) : undefined}>
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(editorOptions) as EditorOption[]).map((key) => (
          <label key={key} className="grid gap-1.5 text-xs text-muted-foreground">
            {editorOptions[key].label}
            <SelectField
              value={look[key]}
              onValueChange={(v) => save({ ...shell, editor: { ...shell.editor, [key]: v } })}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {Object.entries(editorOptions[key].choices).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
          </label>
        ))}
      </div>
    </Section>
  );
}

function HomeSection() {
  const { shell, save } = useShell();
  const effective = useEffectiveShell();
  const prefs = effective.home ?? {};
  const shown = homeLayout(effective);
  const hidden = homeBlocks.filter((block) => !shown.includes(block));
  const items = [
    ...shown.map((block, i) => ({ id: block, label: homeBlockLabels[block], on: true, first: i === 0, last: i === shown.length - 1 })),
    ...hidden.map((block) => ({ id: block, label: homeBlockLabels[block], on: false, first: true, last: true })),
  ];
  const set = (home: NonNullable<typeof shell.home>) => save({ ...shell, home });
  return (
    <Section
      title="Project home"
      hint="What a project shows when no note is open."
      onReset={shell.home?.hidden?.length || shell.home?.order?.length ? () => set({}) : undefined}
    >
      <OrderedList
        items={items}
        onToggle={(id, on) => set({ ...prefs, hidden: on ? (prefs.hidden ?? []).filter((block) => block !== id) : [...(prefs.hidden ?? []), id] })}
        onMove={(id, by) => set({ ...prefs, order: moved(shown, id, by) })}
      />
    </Section>
  );
}

function GuidanceSection() {
  const { shell, save } = useShell();
  const started = useGettingStarted();
  return (
    <Section title="Guidance" hint="Help for getting going. Switch it off once you don't need it.">
      <Check checked={shell.prompts !== false} onChange={(on) => save({ ...shell, prompts: on ? undefined : false })}>
        Suggest a way in when a note is empty
      </Check>
      {started && (
        <Check checked={!started.dismissed} onChange={(on) => started.setDismissed(!on)}>
          Show “{started.title}” in this project
        </Check>
      )}
    </Section>
  );
}

/** "Reset everything", asked first and undoable straight after. */
function StartOverSection() {
  const ribbon = useRibbon();
  const { shell, save } = useShell();
  const { title, hint } = sectionInfo("start-over");
  const resetAll = async () => {
    const ok = await confirm({
      title: "Reset everything?",
      description: "Your ribbon, theme, custom CSS, shortcuts, toolbar and the look of the page go back to how they start. You can undo this straight after.",
      confirmLabel: "Reset everything",
    });
    if (!ok) return;
    const before = { shell, ribbon: ribbon.prefs, ownRibbon: ribbon.changed };
    ribbon.reset();
    // Animations and interface size aren't part of how a project starts: they're about the person, not the layout.
    // Neither are the themes they made: only which theme is in use goes back.
    save(withUiSize({ ...(shell.motion === false && { motion: false }), ...(shell.theme?.own && { theme: { own: shell.theme.own } }) }, uiSizeOf(shell)));
    undoToast("Customize is back to how it starts", () => {
      if (before.ownRibbon) ribbon.replace(before.ribbon);
      save(before.shell);
    });
  };
  return (
    <Section title={title} hint={hint}>
      <Button type="button" variant="outline" size="sm" onClick={() => void resetAll()} className="text-destructive hover:text-destructive">
        Reset everything…
      </Button>
    </Section>
  );
}

function SizeSection() {
  const { shell, save } = useShell();
  const { title, hint } = sectionInfo("size");
  const size = uiSizeOf(shell);
  const name = useId();
  return (
    <Section title={title} hint={hint} onReset={size !== "comfortable" ? () => save(withUiSize(shell, "comfortable")) : undefined}>
      <div role="radiogroup" aria-label="Interface size" className="flex flex-wrap gap-2">
        {(Object.keys(uiSizes) as UiSize[]).map((value) => (
          <label
            key={value}
            className={cn(
              "flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
              size === value && "border-ember bg-accent/40",
            )}
          >
            <input type="radio" name={name} value={value} checked={size === value} onChange={() => save(withUiSize(shell, value))} className="size-4 accent-[var(--ember)]" />
            {uiSizes[value]}
          </label>
        ))}
      </div>
    </Section>
  );
}

const sectionInfo = (id: string) => sections.find((section) => section.id === id) ?? { title: id, hint: "" };

function PresetsSection() {
  const ribbon = useRibbon();
  const { shell, save } = useShell();
  const [pending, setPending] = useState<Preset | null>(null);
  const current = getPreset(shell.preset);
  const available = new Set(ribbon.views.map((view) => view.id));
  const missing = pending ? missingViews(pending, available) : [];
  const { title, hint } = sectionInfo("presets");
  return (
    <Section title={title} hint={hint}>
      <p className="mb-2 text-ui-sm text-muted-foreground">
        Current preset: <span className="text-foreground">{current ? current.title : "None, your own setup"}</span>
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={pending?.id === preset.id}
            onClick={() => setPending(preset)}
            className={cn(
              "grid content-start gap-0.5 rounded-md border px-3 py-2 text-left hover:bg-accent/60 aria-pressed:border-ember",
              current?.id === preset.id && "bg-accent/40",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {preset.title}
              {current?.id === preset.id && <span className="text-meta font-normal text-muted-foreground">Current preset</span>}
            </span>
            <span className="text-xs text-muted-foreground">{preset.description}</span>
          </button>
        ))}
      </div>
      {pending && (
        <div role="group" aria-label={`Apply ${pending.title}`} className="mt-3 grid gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          <p>
            {pending.title} replaces your ribbon, inspector, page, typing, status bar, toolbar, project home and shortcuts. Your animations and prompts stay as they are.
          </p>
          {missing.length > 0 && (
            <p>
              Not in this project until their module is switched on in Project settings: {missing.map((view) => view.title).join(", ")}.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const next = applyPreset(pending, shell);
                ribbon.replace(next.ribbon);
                save(next.shell);
                setPending(null);
              }}
            >
              Apply {pending.title}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

function TypingSection() {
  const { shell, save } = useShell();
  const { title, hint } = sectionInfo("typing");
  const changed = Object.keys(typingOptions).some((option) => !typingOn(shell, option as TypingOption));
  return (
    <Section title={title} hint={hint} onReset={changed ? () => save({ ...shell, typing: {} }) : undefined}>
      {(Object.keys(typingOptions) as TypingOption[]).map((option) => (
        <Check
          key={option}
          checked={typingOn(shell, option)}
          onChange={(on) => save({ ...shell, typing: { ...shell.typing, [option]: on ? undefined : false } })}
        >
          <span>
            {typingOptions[option].label}
            <span className="ml-1.5 text-xs text-muted-foreground">{typingOptions[option].hint}</span>
          </span>
        </Check>
      ))}
    </Section>
  );
}

function OpeningSection() {
  const { shell, save } = useShell();
  const { title, hint } = sectionInfo("opening");
  const start = shell.start ?? {};
  const set = (key: "focus" | "typewriter", on: boolean) => {
    const next = { ...start, [key]: on || undefined };
    save({ ...shell, start: next.focus || next.typewriter ? next : undefined });
  };
  const changed = Boolean(start.focus || start.typewriter || shell.paper);
  return (
    <Section title={title} hint={hint} onReset={changed ? () => save({ ...shell, start: undefined, paper: undefined }) : undefined}>
      <Check checked={Boolean(start.focus)} onChange={(on) => set("focus", on)}>
        Open projects in focus mode
        <span className="ml-1.5 text-xs text-muted-foreground">Just the page; {formatHotkey("mod+shift+f")} brings the rest back</span>
      </Check>
      <Check checked={Boolean(start.typewriter)} onChange={(on) => set("typewriter", on)}>
        Typewriter scrolling from the start
        <span className="ml-1.5 text-xs text-muted-foreground">The line you write on stays in the middle of the screen</span>
      </Check>
      <div className="mt-2 flex items-center gap-3 text-sm">
        <span>Paper</span>
        <Segmented
          value={shell.paper ?? "letter"}
          onChange={(paper) => save({ ...shell, paper: paper === "a4" ? "a4" : undefined })}
          options={[
            { value: "letter", label: "US Letter" },
            { value: "a4", label: "A4" },
          ]}
        />
        <span className="text-xs text-muted-foreground">For the Read view and printing. Word and RTF exports choose theirs in the layout.</span>
      </div>
    </Section>
  );
}

function ShortcutsSection() {
  const { setUi } = useWorkspace();
  const { overrides, reset } = useHotkeys();
  const { title, hint } = sectionInfo("shortcuts");
  const count = Object.keys(overrides).length;
  return (
    <Section title={title} hint={hint} onReset={count ? reset : undefined}>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => setUi({ customize: false, hotkeys: true })}>
          <Icon name="keyboard-linear" className="size-4" />
          Change shortcuts…
        </Button>
        <span className="text-xs text-muted-foreground">{count ? `${count} changed from the default` : "All at their defaults"}</span>
      </div>
    </Section>
  );
}

function HideSection({ group }: { group: HideGroup }) {
  const { shell, save } = useShell();
  const query = useContext(Query);
  const { title, hint } = sectionInfo(group);
  const items = Object.entries(hideable[group].items) as Array<[string, string]>;
  // A search for one item shows that item; a search for the section shows them all.
  const listed = matches(query, `${title} ${hint}`) ? items : items.filter(([, label]) => matches(query, `${label} hide show`));
  const ids = new Set(items.map(([id]) => id));
  const toggle = (id: string, on: boolean) => save({ ...shell, hide: withShown(shell, id, on) });
  // Changed: anything here not as it starts (shown that starts hidden, or hidden that starts shown).
  const touched = (shell.hide ?? []).length !== withDefaultsFor(shell, ids).length;

  if (isOrderGroup(group)) {
    const order = arranged(shell, group);
    const searched = new Set(matches(query, `${title} ${hint}`) ? order : order.filter((id) => matches(query, `${orderLabel(id)} hide show move order`)));
    // Only an order that differs from the one it starts in is kept, so Reset shows only when there's something to reset.
    const setOrder = (next: string[]) => {
      const rest = { ...shell.order };
      delete rest[group];
      const same = next.every((id, i) => id === orderable[group][i]);
      save({ ...shell, order: same ? rest : { ...rest, [group]: next } });
    };
    const changed = touched || Boolean(shell.order?.[group]);
    const reset = () => {
      const rest = { ...shell.order };
      delete rest[group];
      save({ ...shell, hide: withDefaultsFor(shell, ids), order: rest });
    };
    return (
      <Section title={title} hint={`${hint} Drag to reorder, or use the arrows.`} onReset={changed ? reset : undefined}>
        <OrderedList
          items={order
            .filter((id) => searched.has(id))
            .map((id) => ({ id, label: orderLabel(id), on: ids.has(id) ? isShown(shell, id) : null, first: id === order[0], last: id === order.at(-1) }))}
          onToggle={toggle}
          onMove={(id, by) => setOrder(moved(order, id, by))}
          onPlace={(id, at) => setOrder(placed(order, id, at))}
        />
      </Section>
    );
  }

  return (
    <Section title={title} hint={hint} onReset={touched ? () => save({ ...shell, hide: withDefaultsFor(shell, ids) }) : undefined}>
      <div className="grid sm:grid-cols-2">
        {listed.map(([id, label]) => (
          <Check key={id} checked={isShown(shell, id)} onChange={(on) => toggle(id, on)}>
            {label}
          </Check>
        ))}
      </div>
    </Section>
  );
}

function PaletteSection() {
  const { shell, save } = useShell();
  const { commands } = useWorkspace();
  const query = useContext(Query);
  const { title, hint } = sectionInfo("palette");
  const hidden = shell.hide ?? [];
  const listed = matches(query, `${title} ${hint}`) ? commands : commands.filter((c) => matches(query, `${c.title} ${c.group} hide show`));
  const groups = [...new Set(listed.map((c) => c.group))];
  const changed = hidden.some((id) => id.startsWith("palette."));
  return (
    <Section title={title} hint={hint} onReset={changed ? () => save({ ...shell, hide: hidden.filter((id) => !id.startsWith("palette.")) }) : undefined}>
      <div className="grid max-h-72 gap-3 overflow-y-auto rounded-md border p-2">
        {groups.map((group) => (
          <div key={group}>
            <p className="px-1 text-meta font-medium text-muted-foreground">{group}</p>
            <div className="grid sm:grid-cols-2">
              {listed
                .filter((c) => c.group === group)
                .map((c) => {
                  const id = paletteId(c.id);
                  return (
                    <Check key={c.id} checked={isShown(shell, id)} onChange={(on) => save({ ...shell, hide: withShown(shell, id, on) })}>
                      <span className="truncate">{c.title}</span>
                    </Check>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function DefaultsSection() {
  const { project, workspace, projectChanged } = useWorkspace();
  const effective = useEffectiveShell();
  const ribbon = useRibbon();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { title, hint } = sectionInfo("defaults");
  const canProject = project.actions.includes("manage");
  const canWorkspace = workspace.role === "owner" || workspace.role === "admin";
  const mine = () => defaultsFrom(effective, ribbon.prefs);
  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(done);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  const button = "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-ui-sm hover:bg-accent disabled:opacity-50";
  return (
    <Section title={title} hint={hint}>
      {!canProject && !canWorkspace ? (
        <p className="text-xs text-muted-foreground">Only people who manage this project can set its default, and only the workspace&apos;s owners and admins the workspace&apos;s.</p>
      ) : (
        <div className="grid gap-3 text-ui-sm">
          {canProject && (
            <div className="grid gap-1.5">
              <p className="text-muted-foreground">
                {project.settings.shellDefaults ? "This project has a default setup." : "This project has no default setup of its own."}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} className={button} onClick={() => void run(async () => (await setProjectDefaults(project.id, mine()), projectChanged()), "Your setup is this project's default.")}>
                  Make mine this project&apos;s default
                </button>
                {project.settings.shellDefaults && (
                  <button type="button" disabled={busy} className={button} onClick={() => void run(async () => (await setProjectDefaults(project.id, null), projectChanged()), "The project's default is gone.")}>
                    Take it away
                  </button>
                )}
              </div>
            </div>
          )}
          {canWorkspace && (
            <div className="grid gap-1.5">
              <p className="text-muted-foreground">{workspace.defaults ? `${workspace.name} has a default setup.` : `${workspace.name} has no default setup.`}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} className={button} onClick={() => void run(async () => (await setWorkspaceDefaults(workspace.slug, mine()), router.refresh()), "Your setup is the workspace's default.")}>
                  Make mine the workspace&apos;s default
                </button>
                {workspace.defaults && (
                  <button type="button" disabled={busy} className={button} onClick={() => void run(async () => (await setWorkspaceDefaults(workspace.slug, null), router.refresh()), "The workspace's default is gone.")}>
                    Take it away
                  </button>
                )}
              </div>
            </div>
          )}
          <p className="text-xs text-faint">
            A default holds your page (typeface, size, width, spacing, paragraphs), your inspector&apos;s panels, your project home and your ribbon. Someone who chose their own keeps theirs; Reset to default in
            any section here goes back to the project&apos;s, then the workspace&apos;s, then Plotra&apos;s.
          </p>
        </div>
      )}
    </Section>
  );
}

const FILE_KIND = "plotra-setup";

function FileSection() {
  const ribbon = useRibbon();
  const { shell, save } = useShell();
  const ribbonPrefs = ribbon.prefs;
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { title, hint } = sectionInfo("file");

  const download = () => {
    const blob = new Blob([JSON.stringify({ kind: FILE_KIND, version: 1, ribbon: ribbonPrefs, shell }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "plotra-setup.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const load = async (file: File) => {
    setProblem(null);
    try {
      const data = JSON.parse(await file.text()) as { kind?: unknown; ribbon?: unknown; shell?: unknown };
      if (data.kind !== FILE_KIND || !data.shell || typeof data.shell !== "object") throw new Error("not a setup");
      // The server cleans both before keeping them, so a hand-edited file can't store anything odd.
      ribbon.replace((data.ribbon && typeof data.ribbon === "object" ? data.ribbon : {}) as typeof ribbonPrefs);
      save(data.shell as typeof shell);
    } catch {
      setProblem("That file isn't a Plotra setup. Choose one saved from here.");
    }
  };

  return (
    <Section title={title} hint={hint}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={download}>
          <Icon name="download-linear" className="size-4" />
          Save to a file
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
          <Icon name="upload-linear" className="size-4" />
          Load from a file…
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void load(file);
          }}
        />
      </div>
      {problem && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {problem}
        </p>
      )}
    </Section>
  );
}

function ThemeSection() {
  const { plugins } = useWorkspace();
  const parts = usePluginThemes(plugins.parts);
  const { theme: savedTheme, choices, chosen, setTheme: saveTheme } = useThemes(parts);
  // Colour changes in the editor show at once and are saved once they settle
  // (a colour picker sends one with every move). Until then, whatever else is
  // changed here is changed on top of them.
  const latest = useRef({ theme: savedTheme, saveTheme });
  useEffect(() => {
    latest.current = { theme: savedTheme, saveTheme };
  });
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; own: OwnTheme } | null>(null);
  const current = () => (pending.current ? updateOwnTheme(latest.current.theme, pending.current.own.id, pending.current.own) : latest.current.theme);
  // The edit waiting to be saved, for drawing: the tiles show it at once too.
  const [unsaved, setUnsaved] = useState<OwnTheme | null>(null);
  const setTheme = (next: Theme | undefined) => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
    setUnsaved(null);
    latest.current.saveTheme(next);
  };
  const flush = () => {
    if (pending.current) setTheme(current());
  };
  // Whatever's still waiting is saved when Customize closes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => flush, []);
  const editOwn = (own: OwnTheme) => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { own, timer: setTimeout(flush, THEME_SAVE_MS) };
    setUnsaved(own);
    applyThemeCss(themeCss(current()));
  };
  const theme = unsaved ? updateOwnTheme(savedTheme, unsaved.id, unsaved) : savedTheme;
  const choose = (key: string) => setTheme(chooseTheme(current(), key, parts));
  const { resolvedTheme } = useTheme();
  const mode: Mode = resolvedTheme === "dark" ? "dark" : "light";
  const { title, hint } = sectionInfo("theme");
  const palette = paletteOf(theme);
  // Some themes bring their own accent; the choices below still change it.
  const ownAccent = palette[mode].ember;
  const accent = theme?.accent ?? (ownAccent ? "" : "ember");
  const editing = theme?.own?.find((t) => ownPalette(t.id) === chosen);
  const full = (theme?.own?.length ?? 0) >= MAX_OWN_THEMES;
  const changed = Boolean(theme?.palette || theme?.accent);
  const groups = [
    { source: "app", label: "Plotra's" },
    { source: "plugin", label: "From your plugins" },
    { source: "own", label: "Yours" },
  ] as const;
  const make = () => setTheme(addOwnTheme(current()).theme);
  // Your own CSS is reset under Advanced, on its own; themes you made stay.
  return (
    <Section title={title} hint={hint} onReset={changed ? () => setTheme(cleanTheme({ css: current()?.css, own: current()?.own })) : undefined}>
      <div className="grid gap-3">
        {groups.map((group) => {
          const shown = choices.filter((choice) => choice.source === group.source);
          return (
            <div key={group.source}>
              <p className="mb-1.5 text-xs text-muted-foreground">{group.label}</p>
              {shown.length > 0 && (
                <div role="group" aria-label={`${group.label} themes`} className="grid grid-cols-3 gap-2">
                  {shown.map((choice) => (
                    <ThemeTile key={choice.key} choice={choice} mode={mode} selected={chosen === choice.key} onSelect={() => choose(choice.key)} />
                  ))}
                </div>
              )}
              {group.source === "plugin" && !shown.length && (
                <p className="text-xs text-faint">
                  Plugins can add themes, and any theme you make can become a plugin to share.{" "}
                  <Link href="/plugins?category=themes" className="text-ember-ink underline-offset-4 hover:underline">
                    Find themes in the store
                  </Link>
                </p>
              )}
              {group.source === "own" && (
                <Button type="button" size="sm" variant="outline" className={cn(shown.length > 0 && "mt-2")} disabled={full} onClick={make}>
                  <Icon name="add-linear" />
                  {theme?.palette ? `New theme from ${palette.label}` : "New theme"}
                </Button>
              )}
              {group.source === "own" && full && <p className="mt-1 text-xs text-faint">That&apos;s {MAX_OWN_THEMES} themes. Delete one to make another.</p>}
            </div>
          );
        })}
      </div>
      {editing && (
        <ThemeEditor
          key={editing.id}
          own={editing}
          mode={mode}
          onChange={editOwn}
          onRemove={() => {
            const before = current();
            setTheme(removeOwnTheme(before, editing.id));
            undoToast(`${editing.label} deleted`, () => latest.current.saveTheme(before));
          }}
        />
      )}
      <p className="mt-4 mb-1.5 text-xs text-muted-foreground">Accent</p>
      <div role="group" aria-label="Accent colour" className="flex flex-wrap gap-1.5">
        {ownAccent && (
          <AccentButton label={`${palette.label}'s own`} colour={ownAccent} selected={accent === ""} onSelect={() => setTheme(cleanTheme({ ...current(), accent: undefined }))} />
        )}
        {Object.entries(accents).map(([id, a]) => (
          <AccentButton
            key={id}
            label={a.label}
            colour={a[mode]}
            selected={accent === id}
            onSelect={() => setTheme(cleanTheme({ ...current(), accent: id === "ember" && !ownAccent ? undefined : id }))}
          />
        ))}
      </div>
    </Section>
  );
}

function AccentButton({ label, colour, selected, onSelect }: { label: string; colour: string; selected: boolean; onSelect: () => void }) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={selected}
        onClick={onSelect}
        className={cn("size-8 rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", selected && "ring-2 ring-foreground/60")}
        style={{ backgroundColor: colour }}
      />
    </Tooltip>
  );
}

function ThemeTile({ choice, mode, selected, onSelect }: { choice: ThemeChoice; mode: Mode; selected: boolean; onSelect: () => void }) {
  const [background, card, text, accent] = choice.swatch[mode];
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      title={choice.from ? `${choice.label}, from ${choice.from}` : choice.label}
      className={cn("grid min-w-0 gap-1.5 rounded-md border p-2 text-left text-xs hover:bg-accent/60", selected && "border-ember")}
    >
      <span aria-hidden className="flex h-7 overflow-hidden rounded border" style={{ backgroundColor: background }}>
        <span className="m-1 flex-1 rounded-sm" style={{ backgroundColor: card }} />
        <span className="my-2 mr-1 w-5 rounded-sm" style={{ backgroundColor: text }} />
        <span className="my-2 mr-2 w-2 rounded-sm" style={{ backgroundColor: accent }} />
      </span>
      <span className="truncate">{choice.label}</span>
      {choice.from && <span className="-mt-1 truncate text-faint">{choice.from}</span>}
    </button>
  );
}

/** How long colour changes wait before they're saved: a colour picker sends one with every move. */
const THEME_SAVE_MS = 500;

/** Changing a theme of the person's own: its name and base colours, light and dark. */
function ThemeEditor({ own, mode: shownMode, onChange, onRemove }: { own: OwnTheme; mode: Mode; onChange: (own: OwnTheme) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState(own);
  const [mode, setMode] = useState<Mode>(shownMode);
  const nameId = useId();
  const change = (patch: Partial<Omit<OwnTheme, "id">>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onChange(next);
  };
  const colours = { ...defaultBase[mode], ...draft[mode] };
  const setColour = (id: BaseColour, value: string) => {
    const colour = cleanColour(value);
    if (colour) change({ [mode]: { ...draft[mode], [id]: colour } });
  };

  const full = expandColours(colours, mode);
  const low = (a: string | undefined, b: string | undefined, min: number) => {
    const ratio = contrast(a, b);
    return ratio !== null && ratio < min;
  };
  const warnings = [
    low(full.foreground, full.background, 4.5) && "Text is hard to read on the background.",
    (low(full["muted-foreground"], full.background, 4.5) || low(full["muted-foreground"], full.card, 4.5)) && "Quieter text is hard to read.",
    low(full.ember, full.background, 3) && "The accent is hard to see on the background: focus rings and the active tab will be too.",
  ].filter(Boolean) as string[];

  const remove = async () => {
    const ok = await confirm({ title: `Delete ${draft.label}?`, description: "The theme goes from every device. You can undo this straight after.", confirmLabel: "Delete theme" });
    if (ok) onRemove();
  };
  const asPlugin = () => themePlugin(draft);
  const addAsPlugin = async () => {
    try {
      await addPlugin({ code: asPlugin() });
      toast.success(`${draft.label} is one of your plugins now`, {
        description: "Share it as a file, or publish it to the store from Your settings → Plugins.",
      });
    } catch (error) {
      toast.error(errorText(error, "That theme couldn't be added as a plugin."));
    }
  };
  const slug = draft.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "theme";

  return (
    <div className="mt-3 grid gap-3 rounded-md border bg-card p-3">
      <div className="flex items-end gap-2">
        <div className="grid min-w-0 flex-1 gap-1">
          <label htmlFor={nameId} className="text-xs text-muted-foreground">
            Name
          </label>
          <input
            id={nameId}
            value={draft.label}
            maxLength={40}
            onChange={(event) => change({ label: event.target.value })}
            onBlur={() => !draft.label.trim() && change({ label: "My theme" })}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </div>
      {mode !== shownMode && <p className="-mt-1 text-xs text-faint">The app is in {shownMode} right now: switch it to {mode} to see these colours.</p>}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {baseColours.map(({ id, label }) => (
          <ColourField key={`${mode}-${id}`} label={label} value={colours[id]} onChange={(value) => setColour(id, value)} />
        ))}
      </div>
      {warnings.length > 0 && (
        <ul className="grid gap-0.5 text-xs text-destructive">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void addAsPlugin()}>
          <Icon name="plug-circle-linear" />
          Add as a plugin
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => savePluginFile(`${slug}-theme.js`, asPlugin(), "text/javascript;charset=utf-8")}>
          <Icon name="download-linear" />
          Save as a plugin file
        </Button>
        <Button type="button" size="sm" variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={() => void remove()}>
          Delete
        </Button>
      </div>
    </div>
  );
}

/** One colour: the browser's picker, and the same colour as text to type or paste. */
function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value);
  const [was, setWas] = useState(value);
  if (was !== value) {
    setWas(value);
    setText(value);
  }
  const id = useId();
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return (
    <div className="grid min-w-0 gap-1">
      <label htmlFor={id} className="truncate text-xs text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input type="color" aria-label={`${label}: pick`} value={hex} onChange={(event) => onChange(event.target.value)} className="size-8 shrink-0 cursor-pointer rounded border border-input bg-transparent p-0.5" />
        <input
          id={id}
          value={text}
          spellCheck={false}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => (cleanColour(text) ? onChange(text) : setText(value))}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2 font-mono text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
      </div>
    </div>
  );
}

function CssSection() {
  const { shell, save } = useShell();
  const { title, hint } = sectionInfo("css");
  const theme = shell.theme ?? {};
  const [css, setCss] = useState(theme.css ?? "");
  const id = useId();
  const blocked = css !== cleanCss(css);
  const set = (next: string | undefined) => save({ ...shell, theme: { ...theme, css: next } });
  return (
    <Section title={title} hint={hint} onReset={theme.css ? () => (setCss(""), set(undefined)) : undefined}>
      <label htmlFor={id} className="mb-1.5 block text-xs text-muted-foreground">
        CSS rules
      </label>
      <textarea
        id={id}
        value={css}
        onChange={(event) => setCss(event.target.value.slice(0, MAX_CSS))}
        spellCheck={false}
        rows={5}
        placeholder={"[data-slate-editor] { letter-spacing: 0.01em; }\nhtml.dark { --background: #101010; }"}
        className="w-full rounded-md border border-input bg-transparent p-2 font-mono text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <div className="mt-1.5 flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={css === (theme.css ?? "")} onClick={() => set(css.trim() || undefined)}>
          Apply
        </Button>
        <span className="text-xs text-faint">
          {blocked ? "Web addresses (url), @import and backslashes are taken out: CSS can't load anything from elsewhere." : "Applies to every page, for you only. The app's colours are CSS variables such as --background and --ember."}
        </span>
      </div>
    </Section>
  );
}
