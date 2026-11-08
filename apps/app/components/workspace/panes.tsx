"use client";

import { Icon } from "@plotra/icons";
import { viewLabel } from "@/lib/vocabulary";
import { cn } from "@plotra/ui/lib/utils";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@plotra/ui/components/context-menu";
import { Tooltip } from "@plotra/ui/components/tooltip";
import {
  DockviewReact,
  themeLight,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { useEffect, useMemo, useState } from "react";
import { focusWhenMounted, takeOpenParam } from "@/components/onboarding/open-from-url";
import { ProjectHome } from "@/components/onboarding/project-home";
import { isTrashed, nodeIcon, type NodeIndex } from "@/lib/tree";
import { useStore } from "./stores";
import { useMedia, WIDE_ENOUGH_FOR_BINDER } from "./use-media";
import { getView, viewRegistry } from "./view-registry";
import { useUi, useWorkspace, type PanelParams } from "./workspace-provider";

const layoutKey = (projectId: string) => `plotra:layout:${projectId}`;
// Colours come from our own tokens (see globals.css), so one theme covers light and dark.
const theme = { ...themeLight, name: "plotra", className: "dockview-theme-plotra" };

const components = Object.fromEntries(
  viewRegistry.map((view) => [
    view.id,
    function ViewPanel({ params }: IDockviewPanelProps<PanelParams>) {
      return <view.component nodeId={params?.nodeId} panel={params?.panel} />;
    },
  ]),
);

/** The view id of a standalone panel ("view:graph:…"), or null for a note's editor. */
const standaloneViewOf = (panelId: string) => (panelId.startsWith("view:") ? panelId.split(":")[1] : null);

function Tab({ api, params }: IDockviewPanelHeaderProps<PanelParams>) {
  const { binder, docs, peers, project, pinned, togglePin } = useWorkspace();
  const node = useStore(binder).index.byId.get(params.nodeId ?? "");
  const sync = useStore(docs)[params.nodeId ?? ""]?.sync;
  const here = useStore(peers).filter((p, i, all) => p.nodeId && p.nodeId === params.nodeId && all.findIndex((q) => q.id === p.id) === i);
  const view = standaloneViewOf(api.id);
  const isPinned = useStore(pinned).has(api.id);

  const viewDef = view ? getView(view) : undefined;
  const viewTitle = viewDef ? viewLabel(viewDef, project.settings) : "";
  // A plugin's panel is called what the plugin calls it.
  const title =
    view === "plugin" && params.title
      ? params.title
      : viewDef
        ? node
          ? `${viewTitle}: ${node.title}`
          : viewTitle
        : (node?.title ?? "This note was moved to Trash or deleted");
  // Unsynced local edits (offline): show a dot like an unsaved file.
  const dirty = !view && sync === "offline";
  const tip = [title, dirty && "Not saved online yet: kept on this device until you're back online", here.length > 0 && `Also here: ${here.map((p) => p.name).join(", ")}`]
    .filter(Boolean)
    .join(" · ");

  // Keep dockview's own copy of the title (overflow menu, popouts) in step with renames.
  useEffect(() => {
    if (api.title !== title) api.setTitle(title);
  }, [api, title]);

  const small = "relative grid size-6 shrink-0 place-items-center rounded outline-none hover:bg-foreground/10 focus-visible:ring-[3px] focus-visible:ring-ring/50";
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="group/tab flex h-full max-w-56 items-center gap-1.5 pr-1 pl-3 text-ui-sm"
          onMouseDown={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              api.close();
            }
          }}
        >
          <Icon name={viewDef ? viewDef.icon : node ? nodeIcon(node) : "document-text-linear"} className="size-3.5 shrink-0 opacity-70" />
          <Tooltip content={tip} side="bottom">
            <span className="truncate">{title}</span>
          </Tooltip>
          {dirty && <span className="sr-only">(not saved online yet, kept on this device)</span>}
          {here.length > 0 && (
            <span className="flex shrink-0 -space-x-1">
              {here.slice(0, 3).map((p) => (
                <span key={p.id} aria-hidden className="size-2 rounded-full ring-1 ring-background" style={{ backgroundColor: p.color }} />
              ))}
              <span className="sr-only">Also here: {here.map((p) => p.name).join(", ")}</span>
            </span>
          )}
          {isPinned ? (
            <Tooltip content="Pinned: opening another note won't replace it. Click to unpin.">
              <button
                type="button"
                aria-label={`Unpin ${title}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePin(api.id);
                }}
                className={cn(small, "opacity-70 hover:opacity-100")}
              >
                <Icon name="pin-linear" className="size-3.5" />
              </button>
            </Tooltip>
          ) : (
            <Tooltip content={dirty ? "Not saved online yet. Close tab" : "Close tab"}>
              <button
                type="button"
                aria-label={`Close ${title}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  api.close();
                }}
                className={cn(small, "group/close opacity-60 hover:opacity-100 focus-visible:opacity-100")}
              >
                {/* An unsaved tab shows a dot until hovered or focused from the keyboard, then its ✕. */}
                <span
                  aria-hidden
                  className={cn("absolute size-1.5 rounded-full bg-current transition-opacity group-hover/tab:opacity-0 group-focus-visible/close:opacity-0", !dirty && "opacity-0")}
                />
                <Icon name="close-linear" className={cn("size-3.5 transition-opacity", dirty && "opacity-0 group-hover/tab:opacity-100 group-focus-visible/close:opacity-100")} />
              </button>
            </Tooltip>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={() => togglePin(api.id)}>
          <Icon name="pin-linear" />
          {isPinned ? "Unpin tab" : "Pin tab"}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => api.close()}>
          <Icon name="close-linear" />
          Close tab
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Drops tabs for notes that were deleted, trashed or hidden since a layout was saved, and unknown views. */
export function prunePanels(api: DockviewApi, index: NodeIndex) {
  for (const panel of [...api.panels]) {
    const view = standaloneViewOf(panel.id);
    const nodeId = (panel.params as PanelParams | undefined)?.nodeId;
    const missingNode = nodeId ? !index.byId.has(nodeId) || isTrashed(index, nodeId) : !view;
    if ((view && !getView(view)) || missingNode) api.removePanel(panel);
  }
}

/**
 * The central dockview pane area. Open tabs and splits are saved per project
 * in localStorage; named layouts are saved to the server (see layouts.tsx).
 */
export function Panes() {
  const { project, binder, dock, activeNodeId, setUi, openNode, withEditor } = useWorkspace();
  const [ready, setReady] = useState(false);
  const { focus } = useUi();
  const narrow = !useMedia(WIDE_ENOUGH_FOR_BINDER);

  // One pane at a time, in focus mode (plan.md 2.5) and on a phone, where two
  // side by side are each too narrow to write in. The splits aren't thrown
  // away: the active group is maximized over the others, and they come back
  // when there's room again. Dockview drops the maximized state whenever
  // another group becomes active, so it is put back after every change.
  useEffect(() => {
    const api = dock.current;
    if (!ready || !api) return;
    if (!focus && !narrow) {
      if (api.hasMaximizedGroup()) api.exitMaximizedGroup();
      return;
    }
    const fill = () => {
      const panel = api.activePanel;
      if (panel && api.groups.length > 1 && !api.hasMaximizedGroup()) api.maximizeGroup(panel);
    };
    fill();
    const onActive = api.onDidActivePanelChange(fill);
    const onLayout = api.onDidLayoutChange(fill);
    return () => {
      onActive.dispose();
      onLayout.dispose();
    };
  }, [dock, focus, narrow, ready]);

  const pruneMissing = useMemo(() => (api: DockviewApi) => prunePanels(api, binder.get().index), [binder]);

  const onReady = useMemo(
    () => (event: DockviewReadyEvent) => {
      const api = event.api;
      dock.set(api);

      try {
        const saved = localStorage.getItem(layoutKey(project.id));
        if (saved) api.fromJSON(JSON.parse(saved));
      } catch {
        api.clear();
      }
      pruneMissing(api);

      const syncActive = () => {
        const panel = api.activePanel;
        // Standalone views (graph, codex) don't change the active note.
        if (panel && standaloneViewOf(panel.id)) return;
        const nodeId = (panel?.params as PanelParams | undefined)?.nodeId ?? null;
        activeNodeId.set(nodeId);
        if (nodeId) setUi({ selectedId: nodeId });
      };
      syncActive();
      api.onDidActivePanelChange(syncActive);
      api.onDidRemovePanel(syncActive);

      // `?open=<note id>`: a new project lands on its first scene with the cursor
      // in the text, a sample on its first scene (plan.md Phase 8 "Onboarding").
      const first = takeOpenParam();
      if (first && binder.get().index.byId.has(first.id)) {
        openNode(first.id, "tab");
        withEditor(first.id, (handle) => focusWhenMounted(first.atEnd ? handle.focusEnd : handle.focus));
      }

      let saveTimer: ReturnType<typeof setTimeout> | undefined;
      api.onDidLayoutChange(() => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          try {
            localStorage.setItem(layoutKey(project.id), JSON.stringify(api.toJSON()));
          } catch {
            // Storage full or blocked: the layout just won't survive a reload.
          }
        }, 300);
      });
      setReady(true);
    },
    [activeNodeId, binder, dock, openNode, project.id, pruneMissing, setUi, withEditor],
  );

  return (
    <div className={cn("plotra-dock h-full min-h-0 min-w-0 flex-1", !ready && "opacity-0")}>
      <DockviewReact
        theme={theme}
        components={components}
        defaultTabComponent={Tab}
        watermarkComponent={ProjectHome}
        onReady={onReady}
        defaultRenderer="always"
      />
    </div>
  );
}
