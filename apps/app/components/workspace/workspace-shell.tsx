"use client";

import { Icon, type IconName } from "@plotra/icons";
import { viewLabel, viewShort } from "@/lib/vocabulary";
import { Pill } from "@plotra/ui/components/pill";
import { cn } from "@plotra/ui/lib/utils";
import { IconButton } from "@plotra/ui/components/icon-button";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { readableOn } from "@/lib/colors";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { GettingStarted, useGettingStarted } from "@/components/onboarding/getting-started";
import { ModulePrompt, offerModule } from "@/components/onboarding/module-prompt";
import { moduleMeta, optInModules } from "@/lib/modules";
import { arranged, isShown, STATUS_GAP } from "@/lib/shell-prefs";
import { refreshKept, setKept, useKept } from "@/components/offline/keep-offline";
import { moduleIds } from "@plotra/db/schema";
import { ShareDialog } from "./share-dialog";
import { UserMenu } from "./user-menu";
import { Binder } from "./binder";
import { CommandPalette } from "./command-palette";
import { formatHotkey } from "./hotkeys";
import { HotkeysDialog } from "./hotkeys-dialog";
import { Inspector } from "./inspector";
import { Panes } from "./panes";
import { emptyStats, useStore } from "./stores";
import { TagsPane } from "./tags-pane";
import { BeatSheetDialog } from "./beat-sheet-dialog";
import { BlockTagDialog } from "@/components/world/block-tag-dialog";
import { useWorld } from "@/components/world/data";
import { ProjectSettingsDialog } from "./project-settings-dialog";
import { IoDialogs } from "@/components/io/io-dialogs";
import { PluginHost } from "@/components/plugins/plugin-host";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@plotra/ui/components/context-menu";
import { CustomizeDialog } from "./customize-dialog";
import { usePluginThemeRefresh, usePluginThemes } from "./use-themes";
import { useLivePrefsSync, useMotionSync, useShell, useStartPrefs, useThemeSync, useUiSizeSync } from "./shell-prefs";
import { useRibbon } from "./ribbon";
import { viewGroups, type ViewMeta } from "./view-meta";
import { NotificationsBell } from "@/components/notify/notifications-bell";
import { usePrefs } from "@/components/notify/data";
import { nav } from "@/components/transitions";
import { useSession, useSessionCounter } from "@/components/stats/session";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@plotra/ui/components/dropdown-menu";
import { useMedia, WIDE_ENOUGH_FOR_BINDER, WIDE_ENOUGH_FOR_INSPECTOR } from "./use-media";
import { useUi, useWorkspace, WorkspaceProvider } from "./workspace-provider";
import { isLocalMode } from "@/lib/local-mode";
import { plural } from "@/lib/plural";

type ShellProps = React.ComponentProps<typeof WorkspaceProvider>;

/** The Obsidian-style project workspace (plan.md 2.4). */
export function WorkspaceShell(props: Omit<ShellProps, "children">) {
  return (
    <WorkspaceProvider {...props}>
      <Shell />
      <CommandPalette />
      <HotkeysDialog />
      <BeatSheetDialog />
      <BlockTagDialog />
      <ModulePrompt />
      <CustomizeDialog />
      <ProjectSettingsDialog />
      <Sharing />
      <IoDialogs />
      <PluginHost />
    </WorkspaceProvider>
  );
}

function Sharing() {
  const { setUi } = useWorkspace();
  const { sharing } = useUi();
  if (!sharing) return null;
  return <ShareDialog open onOpenChange={(open) => !open && setUi({ sharing: false })} />;
}

function Shell() {
  const { left, right, focus } = useUi();
  const { setUi, activeNodeId, project, binder, ui, plugins } = useWorkspace();
  usePluginThemeRefresh(usePluginThemes(plugins.parts));
  const leftWidth = useSidebarWidth("left", 280);
  const rightWidth = useSidebarWidth("right", 300);
  useSessionCounter();
  useMotionSync();
  useUiSizeSync();
  useLivePrefsSync();
  useStartPrefs(setUi);
  useThemeSync();
  // A project kept on this device is brought up to date when it opens, if it's been a while.
  useEffect(() => {
    refreshKept(project.id, binder.get().nodes);
  }, [binder, project.id]);

  // Phone and tablet widths (plan.md Phase 10): a sidebar that doesn't fit
  // beside the page opens over it as a drawer instead. Both start closed there,
  // and close again whenever the window gets too narrow for them.
  const roomForBinder = useMedia(WIDE_ENOUGH_FOR_BINDER);
  const roomForInspector = useMedia(WIDE_ENOUGH_FOR_INSPECTOR);
  // Drawers wait for that first closing, so a phone doesn't flash both open on load.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!roomForBinder) setUi({ left: false });
    if (!roomForInspector) setUi({ right: false });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- only known after the media queries have run in the browser
    setSettled(true);
  }, [roomForBinder, roomForInspector, setUi]);
  // A calm first open (ux-audit.md #9): the inspector stays shut until a note is open, then opens once, on its properties.
  // After that it's the person's to open and close; opening it themselves first counts too.
  const inspectorShown = useRef(false);
  useEffect(() => {
    const check = () => {
      if (inspectorShown.current) return;
      if (ui.get().right) inspectorShown.current = true;
      else if (activeNodeId.get() && window.matchMedia(WIDE_ENOUGH_FOR_INSPECTOR).matches) {
        inspectorShown.current = true;
        setUi({ right: true });
      }
    };
    const offUi = ui.subscribe(check);
    const offActive = activeNodeId.subscribe(check);
    check();
    return () => {
      offUi();
      offActive();
    };
  }, [activeNodeId, setUi, ui]);
  // Picking a note in the binder drawer is the cue to get out of the way.
  useEffect(() => activeNodeId.subscribe(() => !window.matchMedia(WIDE_ENOUGH_FOR_BINDER).matches && setUi({ left: false })), [activeNodeId, setUi]);

  // Focus mode (plan.md 2.5): the active pane fills the window (see Panes); Escape leaves.
  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setUi({ focus: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, setUi]);

  const binderDrawer = settled && left && !focus && !roomForBinder;
  const inspectorDrawer = settled && right && !focus && !roomForInspector && !binderDrawer;
  const covered = binderDrawer || inspectorDrawer;

  // Focus mode hides the chrome around the panes but keeps them mounted, so editors stay connected.
  return (
    <div className={cn("group/focus relative flex h-dvh flex-col overflow-hidden", focus && "focus-mode")}>
      <a
        href="#plotra-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-popover focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
      >
        Skip to content
      </a>
      {focus && (
        <button
          type="button"
          onClick={() => setUi({ focus: false })}
          className="absolute right-4 bottom-4 z-50 flex h-8 items-center gap-1.5 rounded-md bg-popover/90 px-2.5 text-xs text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover/focus:opacity-100 hover:text-foreground focus-visible:opacity-100 pointer-coarse:opacity-100"
        >
          <Icon name="quit-full-screen-linear" className="size-4" />
          Leave focus (Esc)
        </button>
      )}
      {!focus && <MobileBar inert={covered} />}
      <div className="flex min-h-0 flex-1">
        {!focus && <Ribbon inert={covered} />}
        {left && !focus && roomForBinder && (
          <aside aria-label="Binder" style={{ width: `${leftWidth.width / 16}rem` }} className="relative hidden shrink-0 border-r bg-sidebar md:block">
            <LeftSidebar />
            <ResizeHandle side="left" {...leftWidth} />
          </aside>
        )}
        <main id="plotra-main" tabIndex={-1} aria-label="Panes" inert={covered} className="relative flex min-w-0 flex-1 flex-col outline-none">
          <Panes />
          {!focus && <GettingStarted />}
        </main>
        {right && !focus && roomForInspector && (
          <aside aria-label="Inspector" style={{ width: `${rightWidth.width / 16}rem` }} className="relative hidden shrink-0 border-l bg-sidebar lg:block">
            <ResizeHandle side="right" {...rightWidth} />
            <Inspector />
          </aside>
        )}
      </div>
      {!focus && <StatusBar inert={covered} />}
      {binderDrawer && (
        <Drawer side="left" label="Binder" onClose={() => setUi({ left: false })}>
          <LeftSidebar />
        </Drawer>
      )}
      {inspectorDrawer && (
        <Drawer side="right" label="Details" onClose={() => setUi({ right: false })}>
          <Inspector />
        </Drawer>
      )}
    </div>
  );
}

/**
 * A sidebar shown over the page on a narrow screen. It behaves like a dialog:
 * the rest of the shell is inert while it's open, Escape and the backdrop
 * close it, and focus goes back to whatever opened it.
 */
function Drawer({ side, label, onClose, children }: { side: "left" | "right"; label: string; onClose: () => void; children: React.ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Only if focus was left behind in the drawer: opening a note has already moved it.
      if (!document.activeElement || document.activeElement === document.body) opener?.focus?.();
    };
    // onClose is recreated every render; the drawer only needs the one it opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label={`Close ${label.toLowerCase()}`} onClick={onClose} className="absolute inset-0 animate-fade-in cursor-default bg-black/40" />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "absolute inset-y-0 flex w-[min(22rem,88vw)] flex-col bg-sidebar shadow-xl outline-none",
          side === "left" ? "left-0 animate-sheet-left border-r" : "right-0 animate-sheet-right border-l",
        )}
      >
        <div className="min-h-0 flex-1">{children}</div>
        <button type="button" onClick={onClose} className="flex h-11 shrink-0 items-center justify-center gap-1.5 border-t border-sidebar-border text-ui-sm text-muted-foreground hover:text-foreground">
          <Icon name="close-linear" className="size-4" />
          Close
        </button>
      </aside>
    </div>
  );
}

/**
 * The ribbon's stand-in on a phone: a column of icons costs too much of a
 * narrow screen, so its buttons move into one bar across the top, with the
 * views behind a menu.
 */
function MobileBar({ inert }: { inert: boolean }) {
  const { project, commands, setUi, openView } = useWorkspace();
  // The views this person keeps in the ribbon come first; the rest wait under "More views…".
  const ribbon = useRibbon();
  const barButton = "grid size-10 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50";
  const run = (id: string, fallback?: () => void) => {
    const command = commands.find((c) => c.id === id);
    if (command) command.run();
    else fallback?.();
  };
  const viewItem = (view: ViewMeta) => (
    <DropdownMenuItem key={view.id} className="min-h-10 items-start py-2" onSelect={() => run(`view.${view.id}`, () => openView(view.id))}>
      <Icon name={view.icon} className="mt-0.5" />
      <ViewText view={view} />
    </DropdownMenuItem>
  );
  return (
    <header inert={inert} className="flex h-12 shrink-0 items-center gap-0.5 border-b bg-sidebar px-1 md:hidden">
      <Tooltip content="Open binder" side="bottom">
        <button type="button" aria-label="Open binder" onClick={() => setUi({ left: true, right: false })} className={barButton}>
          <Icon name="hamburger-menu-linear" className="size-5" />
        </button>
      </Tooltip>
      <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium">{project.title}</span>
      <Tooltip content="Find a note" side="bottom">
        <button type="button" aria-label="Find a note" onClick={() => setUi({ palette: "files" })} className={barButton}>
          <Icon name="magnifer-linear" className="size-5" />
        </button>
      </Tooltip>
      <NotificationsBell className="size-10 [&_svg]:size-5" />
      <DropdownMenu>
        <Tooltip content="Views and commands" side="bottom">
          <DropdownMenuTrigger aria-label="Views and commands" className={barButton}>
            <Icon name="widget-linear" className="size-5" />
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent align="end" className="max-h-[80dvh] w-72 overflow-y-auto">
          {ribbon.shown.map(viewItem)}
          {ribbon.more.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="min-h-10">
                <Icon name="widget-4-linear" />
                More views…
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-[70dvh] w-72 overflow-y-auto">{ribbon.more.map(viewItem)}</DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="min-h-10" onSelect={() => setUi({ palette: "commands" })}>
            <Icon name="command-linear" />
            All commands
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-10" onSelect={() => setUi({ projectSettings: true })}>
            <Icon name="settings-linear" />
            Project settings
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-10" onSelect={() => setUi({ hotkeys: true })}>
            <Icon name="keyboard-linear" />
            Keyboard shortcuts
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Tooltip content="Open details" side="bottom">
        <button type="button" aria-label="Open details" onClick={() => setUi({ right: true, left: false })} className={barButton}>
          <Icon name="panel-right-linear" className="size-5" />
        </button>
      </Tooltip>
    </header>
  );
}

/** A view's name with what it's for underneath, for the "More" and mobile menus. */
function ViewText({ view }: { view: ViewMeta }) {
  const { project } = useWorkspace();
  return (
    <span className="flex min-w-0 flex-col">
      <span>{viewLabel(view, project.settings)}</span>
      <span className="text-xs text-muted-foreground">{view.description}</span>
    </span>
  );
}

function LeftSidebar() {
  const { setUi } = useWorkspace();
  const ui = useUi();
  const { leftTab } = ui;
  const tabs: Array<{ id: typeof ui.leftTab; label: string; icon: IconName }> = [
    { id: "binder", label: "Binder", icon: "folder-linear" },
    { id: "tags", label: "Tags", icon: "hashtag-linear" },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Sidebar" className="relative isolate flex h-9 shrink-0 items-center gap-1 border-b border-sidebar-border px-1.5">
        <Pill className="rounded-md bg-sidebar-accent" />
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={leftTab === t.id}
            onClick={() => setUi({ leftTab: t.id })}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2 text-ui-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:h-9",
              leftTab === t.id && "text-foreground",
            )}
          >
            <Icon name={t.icon} className="size-4" />
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={leftTab === "binder" ? "Binder" : "Tags"} className="min-h-0 flex-1">
        {leftTab === "binder" ? <Binder /> : <TagsPane />}
      </div>
    </div>
  );
}

// Widths are kept in px at the default interface size and drawn in rem, so a
// sidebar grows with Customize → Look → Interface size along with its text.
function useSidebarWidth(side: "left" | "right", fallback: number) {
  const key = `plotra:sidebar-${side}`;
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const saved = Number(localStorage.getItem(key));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
    if (saved >= 200 && saved <= 520) setWidth(saved);
  }, [key]);
  const commit = (next: number) => {
    try {
      localStorage.setItem(key, String(next));
    } catch {}
  };
  return { width, setWidth, commit };
}

function ResizeHandle({
  side,
  width,
  setWidth,
  commit,
}: {
  side: "left" | "right";
  width: number;
  setWidth: (w: number) => void;
  commit: (w: number) => void;
}) {
  const start = useRef<{ x: number; width: number; scale: number } | null>(null);
  const clamp = (w: number) => Math.min(520, Math.max(200, w));

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${side === "left" ? "binder" : "inspector"}`}
      aria-valuenow={width}
      aria-valuemin={200}
      aria-valuemax={520}
      tabIndex={0}
      onKeyDown={(e) => {
        const step = e.key === "ArrowRight" ? 16 : e.key === "ArrowLeft" ? -16 : 0;
        if (!step) return;
        e.preventDefault();
        const next = clamp(width + (side === "left" ? step : -step));
        setWidth(next);
        commit(next);
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        // How many screen px one stored px is at this interface size.
        const scale = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;
        start.current = { x: e.clientX, width, scale };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const delta = (e.clientX - start.current.x) / start.current.scale;
        setWidth(clamp(start.current.width + (side === "left" ? delta : -delta)));
      }}
      onPointerUp={() => {
        start.current = null;
        commit(width);
      }}
      className={cn(
        "absolute inset-y-0 z-10 w-1.5 cursor-col-resize outline-none transition-colors hover:bg-ember/30 focus-visible:bg-ember/40",
        side === "left" ? "-right-[3px]" : "-left-[3px]",
      )}
    />
  );
}

function RibbonButton({
  icon,
  label,
  shortcut,
  text,
  onClick,
  active,
  disabled,
  guide,
}: {
  icon: IconName;
  label: string;
  /** The keys that do the same, shown in the tooltip. */
  shortcut?: string;
  /** A word shown under the icon. The views have one; the shell's own controls are icons only. */
  text?: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  /** A name the "Getting started" checklist can point at (components/onboarding/getting-started.tsx). */
  guide?: string;
}) {
  return (
    <Tooltip content={label} shortcut={shortcut} side="right">
      <button type="button" data-guide={guide} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick} className={cn(text ? ribbonLabeled : ribbonIcon, active && "text-foreground")}>
        <Icon name={icon} className="size-[18px] shrink-0" />
        {text && <span className={ribbonText}>{text}</span>}
      </button>
    </Tooltip>
  );
}

const ribbonBase =
  "shrink-0 rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40";
const ribbonIcon = cn(ribbonBase, "grid size-8 place-items-center pointer-coarse:size-10");
const ribbonLabeled = cn(ribbonBase, "flex w-16 flex-col items-center gap-1 px-1 py-1.5 text-center text-meta leading-tight");
// Long names ("Manuscript", "Relationships") break onto a second line rather than being cut off.
const ribbonText = "line-clamp-2 w-full break-words hyphens-auto";

/** Runs a view's "Open …" command, which knows the folder a container view should start in. */
function useOpenView() {
  const { commands, openView } = useWorkspace();
  return (id: string) => {
    const command = commands.find((c) => c.id === `view.${id}`);
    if (command) command.run();
    else openView(id);
  };
}

/**
 * The ribbon (onboarding-plan.md 3): the shell's own controls, then the few
 * views this person keeps there, each with its name, then "More" for every
 * other view and for arranging the ribbon.
 */
function Ribbon({ inert }: { inert: boolean }) {
  const { workspace, commands, setUi, ui, project } = useWorkspace();
  const { left, right } = useUi();
  const ribbon = useRibbon();
  const open = useOpenView();
  const label = (title: string, id: string) => {
    const key = commands.find((c) => c.id === id)?.hotkey;
    return key ? `${title} (${formatHotkey(key)})` : title;
  };
  const keys = (id: string) => {
    const key = commands.find((c) => c.id === id)?.hotkey;
    return key ? formatHotkey(key) : undefined;
  };
  const back = `Back to ${workspace.role ? workspace.name : "shared projects"}`;

  return (
    <nav aria-label="Ribbon" inert={inert} className="hidden w-18 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-2 md:flex">
      <Tooltip content={back} side="right">
        <Link
          href={workspace.homeHref}
          transitionTypes={nav.close}
          aria-label={back}
          className="mb-1 grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:size-10"
        >
          <Icon name="arrow-left-linear" className="size-4" />
        </Link>
      </Tooltip>
      <RibbonButton icon="panel-left-linear" label={left ? "Hide the binder" : "Show the binder"} shortcut={keys("view.left-sidebar")} active={left} onClick={() => setUi({ left: !ui.get().left })} />
      <RibbonButton icon="magnifer-linear" label="Find a note" shortcut={keys("palette.files")} onClick={() => setUi({ palette: "files" })} />
      <RibbonButton icon="command-linear" guide="palette" label="All commands" shortcut={keys("palette.commands")} onClick={() => setUi({ palette: "commands" })} />
      <div className="my-1 h-px w-8 bg-border" />
      {/* It scrolls when someone has pinned more views than fit. */}
      <div className="flex min-h-0 flex-col items-center gap-1 overflow-y-auto [scrollbar-width:none]">
        {ribbon.shown.map((view, i) => (
          // Right-click arranges the ribbon where it is (onboarding-plan.md 4.3); Customize has the rest.
          <ContextMenu key={view.id}>
            <ContextMenuTrigger asChild>
              <span className="contents">
                <RibbonButton
                  guide={view.id}
                  icon={view.icon}
                  text={viewShort(view, project.settings)}
                  label={`${viewLabel(view, project.settings)}: ${view.description}`}
                  shortcut={keys(`view.${view.id}`)}
                  onClick={() => open(view.id)}
                />
              </span>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-52">
              {ribbon.all ? (
                // With every view shown there's no order of your own to change: say so, and offer the way back.
                <ContextMenuItem onSelect={() => ribbon.setAll(false)}>Show only your ribbon&apos;s views</ContextMenuItem>
              ) : (
                <>
                  <ContextMenuItem disabled={i === 0} onSelect={() => ribbon.move(view.id, -1)}>
                    Move up
                  </ContextMenuItem>
                  <ContextMenuItem disabled={i === ribbon.shown.length - 1} onSelect={() => ribbon.move(view.id, 1)}>
                    Move down
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => ribbon.setShown(view.id, false)}>Remove from ribbon</ContextMenuItem>
                </>
              )}
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => setUi({ customize: true })}>Customize…</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </div>
      <MoreViews ribbon={ribbon} label={label} />
      <div className="mt-auto flex shrink-0 flex-col items-center gap-1 pt-1">
        <RibbonButton icon="settings-linear" label="Project settings" onClick={() => setUi({ projectSettings: true })} />
        <RibbonButton icon="panel-right-linear" label={right ? "Hide the inspector" : "Show the inspector"} shortcut={keys("view.right-sidebar")} active={right} onClick={() => setUi({ right: !ui.get().right })} />
      </div>
    </nav>
  );
}

/**
 * Everything the ribbon doesn't show: the other views, by what they are for,
 * the shell's less-used switches, and the choice of what the ribbon holds.
 */
function MoreViews({ ribbon, label }: { ribbon: ReturnType<typeof useRibbon>; label: (title: string, id: string) => string }) {
  const { setUi, commands, modules, project, binder } = useWorkspace();
  const { typewriter } = useUi();
  const open = useOpenView();
  const { kept } = useKept(project.id);
  // Tool sets this project hasn't switched on, for someone who can. The AI agent is switched on from the workspace.
  const off = project.actions.includes("manage") ? moduleIds.filter((id) => !modules.has(id) && !optInModules.has(id)) : [];
  const hotkey = (id: string) => commands.find((c) => c.id === id)?.hotkey;
  const groups = Object.entries(viewGroups)
    .map(([id, title]) => ({ id, title, views: ribbon.more.filter((view) => view.group === id) }))
    .filter((group) => group.views.length > 0);

  return (
    <DropdownMenu>
      <Tooltip content="More views, modes and settings" side="right">
        <DropdownMenuTrigger data-guide="more" aria-label="More views, modes and settings" className={ribbonLabeled}>
          <Icon name="widget-linear" className="size-[18px] shrink-0" />
          <span className={ribbonText}>More</span>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent side="right" align="start" className="max-h-[80vh] w-80 overflow-y-auto">
        {groups.map((group) => (
          <DropdownMenuGroup key={group.id}>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{group.title}</DropdownMenuLabel>
            {group.views.map((view) => {
              const key = hotkey(`view.${view.id}`);
              return (
                <DropdownMenuItem key={view.id} className="items-start py-2" onSelect={() => open(view.id)}>
                  <Icon name={view.icon} className="mt-0.5" />
                  <ViewText view={view} />
                  {key && <DropdownMenuShortcut className="mt-0.5 self-start">{formatHotkey(key)}</DropdownMenuShortcut>}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        ))}
        {off.length > 0 && (
          <>
            {groups.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Icon name="widget-4-linear" />
                More tools
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-[70vh] w-72 overflow-y-auto">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Not switched on in this project</DropdownMenuLabel>
                {off.map((id) => (
                  <DropdownMenuItem key={id} onSelect={() => offerModule(id)}>
                    <Icon name={moduleMeta[id].icon} />
                    {moduleMeta[id].label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
        {(groups.length > 0 || off.length > 0) && <DropdownMenuSeparator />}
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Modes</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setUi({ palette: "layouts" })}>
          <Icon name="widget-linear" />
          {label("Saved layouts", "layout.switch")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setUi({ focus: true })}>
          <Icon name="full-screen-linear" />
          {label("Focus mode", "view.focus")}
        </DropdownMenuItem>
        {/* In local mode every project is on this device already. */}
        {!isLocalMode && (
          <DropdownMenuCheckboxItem checked={kept} onCheckedChange={(on) => void setKept(project.id, project.title, binder.get().nodes, on === true)}>
            Keep on this device, for offline
          </DropdownMenuCheckboxItem>
        )}
        <DropdownMenuCheckboxItem checked={typewriter} onCheckedChange={(on) => setUi({ typewriter: on === true })}>
          {label("Typewriter scrolling", "view.typewriter")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Settings</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setUi({ hotkeys: true })}>
          <Icon name="keyboard-linear" />
          {label("Keyboard shortcuts", "app.hotkeys")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setUi({ customize: true })}>
          <Icon name="settings-linear" />
          Customize…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const syncLabels = {
  saved: { icon: "cloud-check-linear", text: "Saved", title: "Every change is saved." },
  saving: { icon: "refresh-linear", text: "Saving…", title: "Saving your latest changes." },
  connecting: {
    icon: "refresh-linear",
    text: "Connecting…",
    title: "Reaching Plotra. What you type is kept on this device and saved as soon as it connects.",
  },
  offline: {
    icon: "cloud-cross-linear",
    text: "Offline — changes kept on this device",
    title: "You're offline. Your changes are kept on this device and saved when you're back online.",
  },
} as const;

/** Whether the browser thinks it's online, kept up to date. */
function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

function Presence() {
  const { peers, binder, openNode } = useWorkspace();
  const all = useStore(peers);
  const { index } = useStore(binder);
  // One avatar per person, even with several tabs open.
  const people = all.filter((p, i) => all.findIndex((q) => q.id === p.id) === i);
  if (!people.length) return null;
  return (
    <div className="flex items-center -space-x-1.5">
      {people.slice(0, 5).map((p) => {
        const where = p.nodeId ? index.byId.get(p.nodeId) : undefined;
        return (
          <Tooltip key={p.id} content={`${p.name}${where ? ` · in ${where.title}` : ""}`}>
          <button
            type="button"
            aria-label={where ? `${p.name}, in ${where.title}. Open it.` : `${p.name} is in the project`}
            onClick={() => where && openNode(where.id, "tab")}
            className="grid size-6 place-items-center overflow-hidden rounded-full text-meta font-semibold ring-2 ring-sidebar outline-none focus-visible:ring-ring/50"
            style={{ backgroundColor: p.color, color: readableOn(p.color) }}
          >
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatars from the auth provider
              <img src={p.image} alt="" className="size-full object-cover" />
            ) : (
              p.name.slice(0, 1).toUpperCase()
            )}
          </button>
          </Tooltip>
        );
      })}
      {people.length > 5 && (
        <span className="pl-2.5 text-meta">
          +{people.length - 5}
          <span className="sr-only"> more people here</span>
        </span>
      )}
    </div>
  );
}

/** Shown while a spoiler horizon is on (plan.md 2.8 "World as of release X"); click to lift it. */
function HorizonChip() {
  const { horizon, openView } = useWorkspace();
  const releaseId = useStore(horizon);
  const release = useWorld().data?.releases.find((r) => r.id === releaseId);
  if (!release) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 rounded bg-ember/15 pr-0.5 pl-1.5 text-ember-ink">
      <Icon name="eye-linear" className="size-3.5" />
      <Tooltip content="Only what the audience knows by this release is shown. Open the roadmap to change it.">
        <button type="button" onClick={() => openView("roadmap")} className="rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          World as of {release.title}
        </button>
      </Tooltip>
      <IconButton icon="close-linear" label="Show the whole world" size="xs" onClick={() => horizon.set(null)} className="text-ember-ink hover:bg-ember/20 hover:text-ember-ink" />
    </span>
  );
}

/** The session's words against the session goal (plan.md 2.3); opens the Stats view. */
function SessionGoal() {
  const { openView } = useWorkspace();
  const { words } = useSession();
  const goal = usePrefs().data?.sessionGoal ?? null;
  const written = Math.max(words, 0);
  if (!goal && !written) return null;
  const reached = goal !== null && written >= goal;
  return (
    <Tooltip content="Words you've typed this session. Open stats and goals.">
    <button
      type="button"
      onClick={() => openView("stats")}
      className={cn("flex shrink-0 items-center gap-1.5 rounded tabular-nums outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50", reached && "text-foreground")}
    >
      <Icon name={reached ? "check-read-linear" : "target-linear"} className={cn("size-3.5", reached && "text-teal-ink")} />
      <span>
        <span className="sr-only">Session: </span>
        {written.toLocaleString()}
        {goal ? ` / ${goal.toLocaleString()}` : ""}
        <span className="max-sm:sr-only"> this session</span>
      </span>
    </button>
    </Tooltip>
  );
}

/** Whether this project is kept on this device (components/offline/keep-offline.ts), and how a download is going. */
function KeptChip() {
  const { project } = useWorkspace();
  const { kept, progress } = useKept(project.id);
  if (progress) {
    return (
      <span role="status" className="flex shrink-0 items-center gap-1.5 tabular-nums">
        <Icon name="refresh-linear" className="size-3.5 animate-spin" />
        <span className="max-sm:sr-only">{progress.mode === "keep" ? "Copying to this device" : "Removing from this device"}</span> {progress.done} / {progress.total}
      </span>
    );
  }
  if (!kept) return null;
  return (
    <Tooltip content="Kept on this device: every note opens offline">
      <span tabIndex={0} className="flex shrink-0 items-center gap-1.5 rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <Icon name="monitor-linear" className="size-3.5" />
        <span className="max-md:sr-only">On this device</span>
      </span>
    </Tooltip>
  );
}

function StatusBar({ inert }: { inert: boolean }) {
  const { workspace, project, user, activeNodeId, docs, binder, setUi, saving } = useWorkspace();
  const pending = useStore(saving);
  const online = useOnline();
  const nodeId = useStore(activeNodeId);
  const allDocs = useStore(docs);
  const { nodes } = useStore(binder);
  const stats = allDocs[nodeId ?? ""] ?? emptyStats;
  const projectWords = nodes.reduce((sum, n) => sum + (n.deletedAt ? 0 : n.wordCount), 0);
  // Only the note in front of the person counts: a document closed a while ago can sit at "connecting" forever.
  const active = nodeId ? allDocs[nodeId]?.sync : undefined;
  const overall = !online || active === "offline" ? "offline" : pending > 0 ? "saving" : active === "connecting" ? "connecting" : "saved";
  const sync = syncLabels[overall];
  const gettingStarted = useGettingStarted();
  // The items the person kept, in their order (Customize → Status bar). The account menu always stays, last: it's the way to everything else.
  const { shell } = useShell();
  const order = arranged(shell, "status");
  const shown = (id: string) => isShown(shell, `status.${id}`);
  // Words and characters side by side read as one: "120 words · 640 chars".
  const charsAfterWords = shown("note-words") && order.indexOf("status.chars") === order.indexOf("status.note-words") + 1;
  const items: Record<string, React.ReactNode> = {
    [STATUS_GAP]: <span aria-hidden className="flex-1" />,
    path: shown("path") && (
      <span className="truncate max-md:hidden">
        {workspace.name} / {project.title}
      </span>
    ),
    horizon: shown("horizon") && <HorizonChip />,
    "project-words": shown("project-words") && (
      <span className="shrink-0 tabular-nums max-lg:hidden">{projectWords.toLocaleString()} words in the project</span>
    ),
    "note-words": nodeId && shown("note-words") && (
      <span className="shrink-0 tabular-nums">{`${stats.words.toLocaleString()} ${plural(stats.words, "word")}`}</span>
    ),
    chars: nodeId && shown("chars") && (
      <span className={cn("shrink-0 tabular-nums max-sm:hidden", charsAfterWords && "-ml-2 sm:-ml-3")}>
        {charsAfterWords && "· "}
        {stats.characters.toLocaleString()} characters (with spaces)
      </span>
    ),
    session: shown("session") && <SessionGoal />,
    sync: (
      <>
        {/* A live region: a change of sync state is read out, the word counts beside it are not. Hidden, it's still read out. */}
        <Tooltip content={sync.title}>
          <span
            role="status"
            aria-live="polite"
            tabIndex={shown("sync") || overall === "offline" ? 0 : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              overall === "offline" && "text-gold-ink",
              !shown("sync") && overall !== "offline" && "sr-only",
            )}
          >
            <Icon name={sync.icon} className={cn("size-3.5", (overall === "saving" || overall === "connecting") && "animate-spin")} />
            {overall === "offline" ? (
              <span>
                Offline<span className="max-sm:sr-only"> — changes kept on this device</span>
              </span>
            ) : (
              <span className={cn(overall === "saved" && "max-sm:sr-only")}>{sync.text}</span>
            )}
          </span>
        </Tooltip>
        <KeptChip />
      </>
    ),
    presence: shown("presence") && <Presence />,
    bell: shown("bell") && <NotificationsBell className="max-md:hidden" />,
  };

  return (
    <footer inert={inert} className="flex h-7 shrink-0 items-center gap-3 overflow-hidden border-t bg-sidebar px-3 text-xs text-muted-foreground sm:gap-4 pointer-coarse:h-9">
      {order.map((id) => (
        <Fragment key={id}>{items[id === STATUS_GAP ? id : id.slice("status.".length)]}</Fragment>
      ))}
      <UserMenu
        user={user}
        onShortcuts={() => setUi({ hotkeys: true })}
        // Offered once the checklist has been closed, which is the only way back to it.
        onGettingStarted={gettingStarted?.dismissed ? () => gettingStarted.setDismissed(false) : undefined}
        gettingStartedLabel={gettingStarted?.title}
      />
    </footer>
  );
}
