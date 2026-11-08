"use client";

import type { ModuleId, NodeKind, NodeStatus, ProjectSettings, ProjectType, ScriptFormat } from "@plotra/db/schema";
import { viewLabel } from "@/lib/vocabulary";
import type { DockviewApi } from "dockview-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { undoToast } from "@plotra/ui/components/sonner";
import * as binderActions from "@/lib/binder-actions";
import {
  containerKinds,
  flatten,
  isTrashed,
  lastPosition,
  positionAfter,
  type BinderNode,
} from "@/lib/tree";
import { holdRoom } from "@/components/collab/party-provider";
import { seedNewDocument } from "@/components/collab/use-collab-editor";
import { exportFountainFile, importFountainFile } from "@/components/editor/script/fountain-io";
import { importDialogueAsNew } from "@/components/interactive/dialogue-import";
import { starterBody } from "@/lib/collab/seed";
import { Presence } from "@/components/collab/presence";
import { colorFor } from "@/lib/colors";
import type { PropertyDef } from "@/lib/knowledge-actions";
import { read } from "@/lib/read";
import type { BlockTags } from "@/lib/doc-index";
import { defaultFormat, enabledModules } from "@/lib/modules";
import { kindLabel } from "@/lib/vocabulary";
import { noAi, type AiState } from "@/lib/agent/types";
import { stagesOf } from "@/lib/stages";
import { isDocumentKind } from "@/lib/story";
import type { ShellDefaults } from "@/lib/shell-defaults";
import { viewMeta, type ViewMeta } from "./view-meta";
import { quickKind } from "./binder-moves";
import { eventToHotkey, resolveHotkey } from "./hotkeys";
import { useLivePrefs } from "@/components/editor/live-prefs";
import { setKept, useKept } from "@/components/offline/keep-offline";
import { BinderStore, emptyStats, Store, useStore, type DocStats, type Peer } from "./stores";
import { errorText } from "@/lib/errors";
import { showNavPending } from "@/components/nav-feedback";
import { nav } from "@/components/transitions";
import { panelKey, PluginRegistry, runPluginPart } from "@/components/plugins/plugin-registry";
import { usePluginThemes, useThemes } from "./use-themes";
import { plural } from "@/lib/plural";

export type ProjectInfo = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  type: ProjectType;
  settings: ProjectSettings;
  /** The project whose world bible this one shares, if any (plan.md 2.8). */
  worldId: string | null;
  actions: string[];
};
export type WorkspaceInfo = {
  name: string;
  slug: string;
  /** The user's role in the workspace; null for a guest the project was shared with. */
  role: "owner" | "admin" | "member" | null;
  /** Where "back" leads: the workspace's projects, or a guest's shared projects. */
  homeHref: string;
  /** The setup the workspace's projects start from where nobody chose one (lib/shell-defaults.ts). */
  defaults?: ShellDefaults | null;
};
export type UserInfo = { id: string; name: string; email: string; image?: string | null };

/** "replace" swaps the active tab, "tab" opens a new tab, "split" opens beside the active pane. */
export type OpenMode = "replace" | "tab" | "split";

export type UiState = {
  left: boolean;
  right: boolean;
  leftTab: "binder" | "tags";
  rightTab: "outline" | "properties" | "links" | "story" | "comments" | "history" | "agent" | "chat";
  /** Which chat the Chat panel shows: the whole project's, or the open note's. */
  chatScope: "project" | "note";
  palette: null | "commands" | "files" | "layouts" | "search";
  /** Counts requests to put the caret in the AI chat's message box ("Ask AI…"). */
  askAi: number;
  /** Words a command put in the AI chat's message box ("Draft this scene"), with the notes it points at and the mode to switch to. */
  aiDraft: { text: string; mentions: Array<{ id: string; title: string }>; mode?: "ask" | "suggest" | "auto" } | null;
  hotkeys: boolean;
  /** Focus mode: no chrome, just the page (plan.md 2.5 "Focus / Typewriter"). */
  focus: boolean;
  /** Keep the caret's line in the middle of the screen while writing. */
  typewriter: boolean;
  /** Edits in the editor are tracked as suggestions instead of applied. */
  suggesting: boolean;
  /** The beat-sheet picker. */
  beatSheets: boolean;
  /** Project settings: type, modules, workflow, languages. A tab's id ("kinds", "words"…) opens it on that tab; true opens it where it opens. */
  projectSettings: boolean | string;
  /** The person's own setup of the shell: ribbon, inspector, the look of the page (components/workspace/customize-dialog.tsx). */
  customize: boolean;
  /** Blocks of a note being tagged (canon, reveal, claim). */
  tagging: { nodeId: string; blockIds: string[] } | null;
  /** A comment being started on a passage of a note. */
  commenting: { nodeId: string; anchor: { start: string; end: string } | null; quote: string | null } | null;
  /** The comment thread to highlight in the editor and the comments panel. */
  activeThreadId: string | null;
  renamingId: string | null;
  selectedId: string | null;
  /** The project's Share dialog. */
  sharing: boolean;
  /** The Import… or Export… dialog (components/io), started from a note or folder, or null for the whole project. */
  io: { mode: "import" | "export"; nodeId: string | null } | null;
};

export type Command = {
  id: string;
  title: string;
  group: string;
  hotkey?: string;
  /** Other words people search for it by ("delete", "hide sidebar", "print"). */
  keywords?: string;
  /** The title naming the note it acts on by its type ("Rename this chapter"), given that type's name. */
  withKind?: (kind: string) => string;
  run: () => void;
};

/** What an open editor exposes to the rest of the shell (outline jumps, focusing, linking mentions). */
export type EditorHandle = {
  focus: () => void;
  /** Focuses with the cursor after the last of the text. */
  focusEnd: () => void;
  scrollToHeading: (id: string) => void;
  scrollToHeadingText: (text: string) => void;
  /** Turns the first plain-text occurrence of `text` into a link to `targetId`. */
  linkMention: (text: string, targetId: string) => boolean;
  /** Starts a comment on the current selection (or the whole note). */
  comment: () => void;
  /** Reveals a comment thread's passage. */
  revealThread: (threadId: string) => void;
  /** The live Yjs state, for saving a version. */
  snapshot: () => Uint8Array | null;
  /** Replaces the whole document (restoring a version); syncs to everyone. */
  replaceContent: (value: unknown) => void;
  /** Accepts or rejects one suggestion, or all of them with `null`. */
  resolveSuggestion: (id: string | null, accept: boolean) => void;
  // Block tags (plan.md 2.8) are only on text documents, not boards.
  /** Opens the tag dialog (canon, reveal, fact-check) for the selected blocks. */
  tagBlocks?: () => void;
  /** Sets (or, with null values, clears) tags on blocks by id. */
  setBlockTags?: (blockIds: string[], tags: BlockTagPatch) => void;
  /** The tags currently on a block. */
  getBlockTags?: (blockId: string) => BlockTags;
};

/** Tags to set on blocks; null clears one. */
export type BlockTagPatch = { [K in keyof BlockTags]?: BlockTags[K] | null };

/** Panel parameters: a note for node views, nothing (or a focus note) for standalone views. */
export type PanelParams = {
  nodeId?: string;
  /** A plugin panel's "<plugin id>:<panel id>" (components/plugins). */
  panel?: string;
  /** A plugin panel's title, as its plugin gives it. */
  title?: string;
};

/** A mutable box shared through context, like a ref but safe to capture in memoized callbacks. */
class Holder<T> {
  constructor(public current: T) {}
  set(value: T) {
    this.current = value;
  }
}

/** Binder writes still on their way to the server, and how many have finished. */
class PendingWrites {
  inFlight = 0;
  settled = 0;
  /** Counts `write` as pending until it settles. */
  track<T>(write: Promise<T>): Promise<T> {
    this.inFlight++;
    return write.finally(() => {
      this.inFlight--;
      this.settled++;
    });
  }
}

/** Announced when project settings change, so every open workspace reloads them. */
const PROJECT_NOTICE = "project";

export const panelId = (nodeId: string) => `node:${nodeId}`;

/** The view a binder node opens in: boards have their own, everything else is a document. */
export const componentFor = (kind: NodeKind) =>
  (viewMeta as readonly ViewMeta[]).find((view) => view.accepts?.length === 1 && view.accepts[0] === kind)?.id ?? "editor";

/** Kinds offered when creating a note, given the modules that are on. Custom entities are created per type. */
export function creatableKinds(modules: ReadonlySet<ModuleId>): NodeKind[] {
  const kinds: NodeKind[] = ["note", "scene", "chapter", "folder", "character", "location", "research", "canvas", "timeline"];
  if (modules.has("interactive")) kinds.push("dialogue");
  return kinds;
}
/** Words people look for a view by, beyond its name and description (command palette). */
const viewKeywords: Record<string, string> = {
  manuscript: "scrivenings whole draft read all",
  read: "print preview pdf book",
  codex: "world bible wiki characters places",
  graph: "map links network connections",
  outline: "table list spreadsheet",
  corkboard: "index cards",
  stats: "goals word count progress",
  publish: "ebook epub website",
};

export const viewPanelId = (viewId: string, nodeId?: string) => `view:${viewId}${nodeId ? `:${nodeId}` : ""}`;

const errorMessage = (error: unknown) => errorText(error);

function useWorkspaceState({
  project,
  workspace,
  user,
  initialNodes,
  initialPropertyDefs,
  ai = noAi,
}: {
  project: ProjectInfo;
  workspace: WorkspaceInfo;
  user: UserInfo;
  initialNodes: BinderNode[];
  initialPropertyDefs: PropertyDef[];
  /** Whether AI is on for this project and this person (lib/agent/availability.ts). Off when left out. */
  ai?: AiState;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [binder] = useState(() => new BinderStore(initialNodes));
  const [docs] = useState(() => new Store<Record<string, DocStats>>({}));
  const [activeNodeId] = useState(() => new Store<string | null>(null));
  const [propertyDefs] = useState(() => new Store<PropertyDef[]>(initialPropertyDefs));
  const [peers] = useState(() => new Store<Peer[]>([]));
  // Pinned tabs aren't replaced when opening another note (dockview's own pinning is an enterprise module).
  const [pinned] = useState(() => new Store<ReadonlySet<string>>(new Set()));
  useEffect(() => {
    const key = `plotra:pinned:${project.id}`;
    try {
      pinned.set(new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]));
    } catch {}
    return pinned.subscribe(() => {
      try {
        localStorage.setItem(key, JSON.stringify([...pinned.get()]));
      } catch {}
    });
  }, [pinned, project.id]);
  const togglePin = useCallback(
    (panelId: string) =>
      pinned.set((prev) => {
        const next = new Set(prev);
        if (!next.delete(panelId)) next.add(panelId);
        return next;
      }),
    [pinned],
  );
  const [ui] = useState(
    () =>
      new Store<UiState>({
        left: true,
        // A calm first open (ux-audit.md #9): the inspector waits for a note (workspace-shell.tsx), then shows its properties.
        right: false,
        leftTab: "binder",
        rightTab: "properties",
        chatScope: "project",
        palette: null,
        askAi: 0,
        aiDraft: null,
        hotkeys: false,
        focus: false,
        typewriter: false,
        suggesting: false,
        beatSheets: false,
        projectSettings: false,
        customize: false,
        tagging: null,
        commenting: null,
        activeThreadId: null,
        renamingId: null,
        selectedId: null,
        sharing: false,
        io: null,
      }),
  );
  // Mutable holders (not refs) because commands built during render close over them.
  const [dock] = useState(() => new Holder<DockviewApi | null>(null));
  const [editors] = useState(() => new Holder(new Map<string, EditorHandle>()));
  // Work waiting for an editor that is still loading (jump to a heading, link a mention).
  const [pendingEditorWork] = useState(() => new Holder(new Map<string, Array<(handle: EditorHandle) => void>>()));
  const [presence] = useState(() => new Store<Presence | null>(null));
  // What the person's plugins added here (components/plugins).
  const [plugins] = useState(() => new PluginRegistry());
  const pluginParts = useStore(plugins.parts);
  const pluginsOn = (useStore(plugins.plugins)?.length ?? 0) > 0;
  const themes = useThemes(usePluginThemes(plugins.parts));
  const { choices: themeChoices, choose: chooseTheme } = themes;
  const projectId = project.id;

  // What the project type and its settings switch on (plan.md 2.8).
  const modules = useMemo(() => {
    const on = enabledModules(project.type, project.settings);
    // The AI module also needs the workspace's switch and edit access (plan.md 2.11 "Trust"): off means no AI control anywhere.
    if (!ai.enabled) on.delete("ai");
    return on;
  }, [ai.enabled, project.settings, project.type]);
  const stages = useMemo(() => stagesOf(project.settings), [project.settings]);
  const format = defaultFormat(project.type, project.settings);

  // The spoiler horizon: the release the world is shown "as of", per browser.
  const [horizon] = useState(() => new Store<string | null>(null));
  useEffect(() => {
    const key = `plotra:horizon:${projectId}`;
    try {
      horizon.set(localStorage.getItem(key));
    } catch {}
    return horizon.subscribe(() => {
      try {
        const value = horizon.get();
        if (value) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
      } catch {}
    });
  }, [horizon, projectId]);

  // ---- Presence and live binder ------------------------------------------------

  // Refreshes wait for pending writes, and leaving the page while any are pending warns.
  const [writes] = useState(() => new PendingWrites());
  // How many binder writes are on their way, for the status bar's "Saving…".
  const [saving] = useState(() => new Store(0));
  const track = useCallback(
    <T,>(write: Promise<T>) => {
      saving.set((n) => n + 1);
      return writes.track(write).finally(() => saving.set((n) => n - 1));
    },
    [saving, writes],
  );

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshBinder = useCallback(() => {
    const schedule = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        // While our own writes are pending the server's copy is older than ours; try again after.
        if (writes.inFlight) return schedule();
        const settled = writes.settled;
        read("getBinder", projectId)
          .then((nodes) => {
            // A write started or finished meanwhile may be missing from this copy.
            if (writes.inFlight || writes.settled !== settled) schedule();
            else binder.replaceAll(nodes);
          })
          .catch(() => {
            // Offline or signed out: keep what we have.
          });
      }, 300);
    };
    schedule();
  }, [binder, projectId, writes]);

  // Reloading or closing the tab would drop writes that haven't reached the server.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (writes.inFlight) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [writes]);

  /** Tells everyone else in the project to refetch the binder. */
  const announce = useCallback(() => presence.get()?.notify("binder"), [presence]);

  // Other notices ("story", "comments:<nodeId>"…) tell views to refetch their data.
  const [noticeListeners] = useState(() => new Set<(notice: string) => void>());
  /** Tells everyone else in the project (and this tab's other views) that something changed. */
  const notify = useCallback(
    (notice: string) => {
      presence.get()?.notify(notice);
      for (const listener of noticeListeners) listener(notice);
    },
    [noticeListeners, presence],
  );
  const onNotice = useCallback(
    (listener: (notice: string) => void) => {
      noticeListeners.add(listener);
      return () => {
        noticeListeners.delete(listener);
      };
    },
    [noticeListeners],
  );

  useEffect(() => {
    const p = new Presence(projectId, { id: user.id, name: user.name, color: colorFor(user.id), image: user.image });
    presence.set(p);
    p.setNode(activeNodeId.get());
    const unsubPeers = p.peers.subscribe(() => peers.set(p.peers.get().filter((peer) => peer.id !== user.id)));
    const unsubActive = activeNodeId.subscribe(() => p.setNode(activeNodeId.get()));
    const unsubNotice = p.onNotice((notice) => {
      if (notice === "binder") refreshBinder();
      // Project settings come down as props of the page; ask the server for them again.
      else if (notice === PROJECT_NOTICE) router.refresh();
      else for (const listener of noticeListeners) listener(notice);
    });
    // Word counts, headings and tags change as anyone writes; pick them up now and then.
    const interval = setInterval(refreshBinder, 60_000);
    const onFocus = () => refreshBinder();
    window.addEventListener("focus", onFocus);
    return () => {
      unsubPeers();
      unsubActive();
      unsubNotice();
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      p.destroy();
      presence.set(null);
    };
  }, [activeNodeId, noticeListeners, peers, presence, projectId, refreshBinder, router, user.id, user.image, user.name]);

  /** After changing project settings: has everyone else in the project reload them. The settings actions refresh this page themselves. */
  const projectChanged = useCallback(() => {
    presence.get()?.notify(PROJECT_NOTICE);
  }, [presence]);

  const setUi = useCallback((patch: Partial<UiState>) => ui.set((prev) => ({ ...prev, ...patch })), [ui]);

  const setDocStats = useCallback(
    (nodeId: string, patch: Partial<DocStats>) =>
      docs.set((prev) => ({ ...prev, [nodeId]: { ...(prev[nodeId] ?? emptyStats), ...patch } })),
    [docs],
  );

  // ---- Panes ---------------------------------------------------------------

  const open = useCallback(
    (nodeId: string, mode: OpenMode = "replace") => {
      const api = dock.current;
      const node = binder.get().index.byId.get(nodeId);
      if (!api || !node) return;
      setUi({ selectedId: nodeId });

      const existing = api.getPanel(panelId(nodeId));
      if (existing) {
        existing.api.setActive();
        return;
      }

      const active = api.activePanel;
      const panel = api.addPanel({
        id: panelId(nodeId),
        component: componentFor(node.kind),
        title: node.title,
        params: { nodeId },
        renderer: "always",
        ...(active && mode === "split"
          ? { position: { referencePanel: active.id, direction: "right" as const } }
          : active
            ? { position: { referencePanel: active.id, direction: "within" as const } }
            : {}),
      });
      if (active && mode === "replace" && active.id !== panel.id && !pinned.get().has(active.id)) {
        api.removePanel(active);
      }
    },
    [binder, dock, pinned, setUi],
  );

  /** Opens a standalone view (graph, codex…), or focuses it if it's already open. */
  const openView = useCallback(
    (viewId: string, params: PanelParams = {}, mode: Exclude<OpenMode, "replace"> = "tab") => {
      const api = dock.current;
      if (!api) return;
      const id = viewPanelId(viewId, params.nodeId ?? params.panel);
      const existing = api.getPanel(id);
      if (existing) {
        existing.api.setActive();
        return;
      }
      const active = api.activePanel;
      api.addPanel({
        id,
        component: viewId,
        params,
        renderer: "always",
        ...(active ? { position: { referencePanel: active.id, direction: mode === "split" ? ("right" as const) : ("within" as const) } } : {}),
      });
    },
    [dock],
  );

  const registerEditor = useCallback(
    (nodeId: string, handle: EditorHandle | null) => {
      if (!handle) {
        editors.current.delete(nodeId);
        return;
      }
      editors.current.set(nodeId, handle);
      const queued = pendingEditorWork.current.get(nodeId);
      pendingEditorWork.current.delete(nodeId);
      for (const work of queued ?? []) work(handle);
    },
    [editors, pendingEditorWork],
  );

  /** Runs `work` on a note's editor now, or as soon as it has loaded. */
  const withEditor = useCallback(
    (nodeId: string, work: (handle: EditorHandle) => void) => {
      const handle = editors.current.get(nodeId);
      if (handle) work(handle);
      else pendingEditorWork.current.set(nodeId, [...(pendingEditorWork.current.get(nodeId) ?? []), work]);
    },
    [editors, pendingEditorWork],
  );

  /** Opens a note, optionally at a heading (wiki-links like [[Note#Heading]]). */
  const openNode = useCallback(
    (nodeId: string, mode: OpenMode = "replace", at?: { heading?: string }) => {
      open(nodeId, mode);
      if (at?.heading) withEditor(nodeId, (handle) => handle.scrollToHeadingText(at.heading!));
    },
    [open, withEditor],
  );

  const closePanelsFor = useCallback(
    (nodeId: string) => {
      const api = dock.current;
      if (!api) return;
      const { index } = binder.get();
      for (const panel of [...api.panels]) {
        const id = (panel.params as { nodeId?: string } | undefined)?.nodeId;
        if (id && (id === nodeId || !index.byId.has(id) || isTrashed(index, id))) api.removePanel(panel);
      }
    },
    [binder, dock],
  );

  // ---- Binder actions --------------------------------------------------------

  const create = useCallback(
    async (
      kind: NodeKind,
      parentId?: string | null,
      title?: string,
      options: { open?: boolean; entityTypeId?: string; format?: ScriptFormat; board?: "map" } = {},
    ) => {
      const { index } = binder.get();
      let parent: string | null = parentId ?? null;
      if (parentId === undefined) {
        // Default location: the selected container, else beside the active note.
        const selected = ui.get().selectedId ? index.byId.get(ui.get().selectedId!) : undefined;
        const active = activeNodeId.get() ? index.byId.get(activeNodeId.get()!) : undefined;
        if (selected && !selected.deletedAt && containerKinds.includes(selected.kind)) parent = selected.id;
        else parent = (selected ?? active)?.parentId ?? null;
      }
      // Scenes are written in the project's format (a screenplay's scenes are screenplay pages).
      const nodeFormat = options.format ?? (kind === "scene" ? format : "prose");
      // Shown right away under a client-made id; the server's row replaces it.
      const placeholder: BinderNode = {
        id: crypto.randomUUID(),
        parentId: parent,
        kind,
        title: title?.trim() || `Untitled ${kindLabel(kind, project.settings).toLowerCase()}`,
        aliases: [],
        position: lastPosition(index, parent),
        status: stages[0]?.id ?? "draft",
        entityTypeId: options.entityTypeId ?? null,
        canon: "draft",
        revealReleaseId: null,
        revealChannel: null,
        layer: "truth",
        synopsis: null,
        tags: [],
        contentTags: [],
        properties: {},
        settings: { ...(nodeFormat !== "prose" && { format: nodeFormat }), ...(kind === "canvas" && options.board && { board: options.board }) },
        headings: [],
        wordCount: 0,
        updatedAt: new Date(),
        deletedAt: null,
        actions: [...((parent ? index.byId.get(parent)?.actions : project.actions) ?? [])] as BinderNode["actions"],
      };
      const creating = track(
        binderActions.createNode(projectId, {
          id: placeholder.id,
          parentId: parent,
          kind,
          title: placeholder.title,
          position: placeholder.position,
          ...(options.entityTypeId && { entityTypeId: options.entityTypeId }),
          ...(nodeFormat !== "prose" && { format: nodeFormat }),
          ...(kind === "canvas" && options.board && { board: options.board }),
        }),
      );
      // The editor opens now with the starting body; it connects once the node exists.
      holdRoom(`node-${placeholder.id}`, creating);
      // A kind with a template note of the project's is copied on the server (lib/note-templates.ts): nothing to seed here, or the two would merge.
      if (kind !== "folder" && isDocumentKind(kind) && !project.settings.noteTemplates?.[kind]) seedNewDocument(`node-${placeholder.id}`, starterBody(kind, nodeFormat));
      binder.upsert(placeholder);
      if (options.open !== false) {
        if (kind !== "folder") open(placeholder.id, "tab");
        setUi({ selectedId: placeholder.id, renamingId: title ? null : placeholder.id });
      }
      try {
        const created = await creating;
        // Keep a rename made meanwhile; its own update lands right after (actions run in order).
        const local = binder.get().index.byId.get(created.id);
        binder.upsert(local && local.title !== placeholder.title ? { ...created, title: local.title } : created);
        announce();
        return created;
      } catch (error) {
        binder.removeTree(placeholder.id);
        closePanelsFor(placeholder.id);
        toast.error(errorMessage(error));
      }
    },
    [activeNodeId, announce, binder, closePanelsFor, format, open, project.actions, project.settings, projectId, setUi, stages, track, ui],
  );

  /** Applies a change locally right away, then rolls it back if the server refuses. Resolves to whether it was kept. */
  const optimistic = useCallback(
    async (nodeId: string, local: Partial<BinderNode>, remote: () => Promise<BinderNode>): Promise<boolean> => {
      const before = binder.get().index.byId.get(nodeId);
      if (!before) return false;
      binder.patch(nodeId, local);
      try {
        binder.upsert(await track(remote()));
        announce();
        return true;
      } catch (error) {
        binder.patch(nodeId, before);
        toast.error(errorMessage(error));
        return false;
      }
    },
    [announce, binder, track],
  );

  const update = useCallback(
    (
      nodeId: string,
      patch: {
        title?: string;
        kind?: NodeKind;
        status?: NodeStatus;
        synopsis?: string | null;
        aliases?: string[];
        tags?: string[];
        entityTypeId?: string | null;
      },
    ) => optimistic(nodeId, patch, () => binderActions.updateNode(projectId, nodeId, patch)),
    [optimistic, projectId],
  );

  /** Gives a note one of the project's colour labels, or takes it off (lib/vocabulary.ts). */
  const setLabel = useCallback(
    (nodeId: string, labelId: string | null) => {
      const settings = { ...binder.get().index.byId.get(nodeId)?.settings };
      if (labelId) settings.label = labelId;
      else delete settings.label;
      return optimistic(nodeId, { settings }, () => binderActions.setNodeLabel(projectId, nodeId, labelId));
    },
    [binder, optimistic, projectId],
  );

  const setProperties = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      const current = binder.get().index.byId.get(nodeId)?.properties ?? {};
      const next = { ...current } as Record<string, unknown>;
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "" || (Array.isArray(value) && !value.length)) delete next[key];
        else next[key] = value;
      }
      return optimistic(nodeId, { properties: next as BinderNode["properties"] }, () =>
        binderActions.setNodeProperties(projectId, nodeId, patch),
      );
    },
    [binder, optimistic, projectId],
  );

  const move = useCallback(
    (nodeId: string, parentId: string | null, position: string) =>
      optimistic(nodeId, { parentId, position }, () =>
        binderActions.moveNode(projectId, nodeId, { parentId, position }),
      ),
    [optimistic, projectId],
  );

  const restore = useCallback(
    (nodeId: string) =>
      optimistic(nodeId, { deletedAt: null }, () =>
        binderActions.restoreNode(projectId, nodeId, lastPosition(binder.get().index, null)),
      ),
    [binder, optimistic, projectId],
  );

  /** Moves a note to the trash at once, with an Undo that puts it back where it was. */
  const trash = useCallback(
    async (nodeId: string) => {
      const title = binder.get().index.byId.get(nodeId)?.title ?? "the note";
      // The local change applies synchronously, so its tabs can close before the server answers.
      const trashing = optimistic(nodeId, { deletedAt: new Date() }, () => binderActions.trashNode(projectId, nodeId));
      closePanelsFor(nodeId);
      // Refused by the server: it's back already, and the error said why.
      if (!(await trashing)) return;
      undoToast(`Moved ‘${title}’ to Trash`, () => restore(nodeId));
    },
    [binder, closePanelsFor, optimistic, projectId, restore],
  );

  /** Removes nodes (and what's inside them) locally; returns a function that puts back the ones still wanted. */
  const removeLocally = useCallback(
    (ids: string[]) => {
      const before = binder.get().nodes;
      for (const id of ids) if (binder.get().index.byId.has(id)) binder.removeTree(id);
      const removed = before.filter((n) => !binder.get().index.byId.has(n.id));
      return (keep: (node: BinderNode) => boolean = () => true) => {
        const back = removed.filter(keep);
        if (back.length) binder.upsert(...back);
      };
    },
    [binder],
  );

  const destroy = useCallback(
    async (nodeId: string) => {
      const putBack = removeLocally([nodeId]);
      try {
        await track(binderActions.deleteNode(projectId, nodeId));
        announce();
      } catch (error) {
        putBack();
        toast.error(errorMessage(error));
      }
    },
    [announce, projectId, removeLocally, track],
  );

  const emptyTrash = useCallback(async () => {
    const { index, nodes } = binder.get();
    const trashed = nodes.filter((n) => n.deletedAt).map((n) => n.id);
    const putBack = removeLocally(trashed);
    try {
      const deleted = new Set(await track(binderActions.emptyTrash(projectId)));
      // Whatever the server kept comes back, unless it was inside something that went.
      const gone = (id: string) => {
        for (let n = index.byId.get(id); n; n = n.parentId ? index.byId.get(n.parentId) : undefined) {
          if (deleted.has(n.id)) return true;
        }
        return false;
      };
      putBack((node) => !gone(node.id));
      const kept = trashed.filter((id) => !gone(id)).length;
      if (kept) toast.message(`${kept} ${plural(kept, "note")} stayed in the trash: you can't delete ${kept === 1 ? "it" : "them"}.`);
      announce();
    } catch (error) {
      putBack();
      toast.error(errorMessage(error));
    }
  }, [announce, binder, projectId, removeLocally, track]);

  const duplicate = useCallback(
    async (nodeId: string) => {
      try {
        const copies = await track(binderActions.duplicateNode(projectId, nodeId, positionAfter(binder.get().index, nodeId)));
        binder.upsert(...copies);
        announce();
        const root = copies.find((c) => c.parentId === binder.get().index.byId.get(nodeId)?.parentId);
        if (root) setUi({ selectedId: root.id, renamingId: root.id });
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },
    [announce, binder, projectId, setUi, track],
  );

  // ---- Commands --------------------------------------------------------------

  const activeOrSelected = useCallback(
    () => activeNodeId.get() ?? ui.get().selectedId,
    [activeNodeId, ui],
  );

  // The person's shortcuts, from the copy the shell keeps in step (shell-prefs.ts, useLivePrefsSync):
  // their saved settings are read through this provider, so it can't read them itself.
  const overrides = useLivePrefs().hotkeys;
  const { kept: keptHere } = useKept(projectId);

  /** The container views like the corkboard open on: the selected folder or chapter, else the active note's parent. */
  const containerParams = useCallback((): PanelParams => {
    const { index } = binder.get();
    const id = activeOrSelected();
    const n = id ? index.byId.get(id) : undefined;
    if (!n) return {};
    if (containerKinds.includes(n.kind) || (index.children.get(n.id) ?? []).some((c) => !c.deletedAt)) return { nodeId: n.id };
    return n.parentId ? { nodeId: n.parentId } : {};
  }, [activeOrSelected, binder]);

  const commands = useMemo<Command[]>(() => {
    const withActive = (run: (id: string) => void) => () => {
      const id = activeOrSelected();
      if (id) run(id);
    };
    // The quick "New …" (⌘⌥N) makes the project's main kind: a scene for a novel or script, a session for a campaign.
    // It keeps the old "binder.new-note" id so shortcuts people rebound still work, and that kind's own command folds into it.
    const quick = quickKind(project.type, modules);
    const newCommands: Command[] = [
      {
        id: "binder.new-note",
        title: `New ${kindLabel(quick, project.settings).toLowerCase()}`,
        group: "Binder",
        hotkey: resolveHotkey(`binder.new-${quick}`, "mod+alt+n", overrides),
        keywords: "quick new note add write",
        run: () => void create(quick),
      },
      ...creatableKinds(modules)
        .filter((kind) => kind !== quick)
        .map((kind) => ({
          // The generic kind is a "plain note" here: "note" alone means anything in the binder.
          id: kind === "note" ? "binder.new-plain-note" : `binder.new-${kind}`,
          title: kind === "note" && !project.settings.vocabulary?.note ? "New plain note" : `New ${kindLabel(kind, project.settings).toLowerCase()}`,
          group: "Binder",
          hotkey: kind === "folder" ? "mod+alt+shift+n" : undefined,
          ...(kind === "folder" && { keywords: "directory group section part" }),
          ...(kind === "note" && { keywords: "note blank page generic" }),
          run: () => void create(kind),
        })),
    ];
    // A map is a canvas made as one (components/views/map-view.tsx).
    newCommands.push({ id: "binder.new-map", title: "New map", group: "Binder", hotkey: undefined, run: () => void create("canvas", undefined, "Untitled map", { board: "map" }) });
    // Every ribbon view gets an "Open …" command; views of modules that are off don't.
    const viewCommands: Command[] = (viewMeta as readonly ViewMeta[])
      .filter((view) => view.ribbon && (!view.module || modules.has(view.module)))
      .map((view) => ({
        id: `view.${view.id}`,
        // A view the project renamed (Project settings → Words) is opened by its own name.
        title: project.settings.vocabulary?.[`view:${view.id}`] ? `Open ${viewLabel(view, project.settings)}` : (view.commandTitle ?? `Open ${view.title.toLowerCase()}`),
        group: "Views",
        hotkey: view.hotkey,
        keywords: [view.title.toLowerCase(), view.description.toLowerCase(), viewKeywords[view.id]].filter(Boolean).join(" "),
        run: () => openView(view.id, view.container ? containerParams() : {}),
      }));
    const list: Command[] = [
      {
        id: "palette.commands",
        title: "All commands",
        group: "Navigate",
        hotkey: "mod+p",
        keywords: "command palette actions menu everything",
        run: () => setUi({ palette: "commands" }),
      },
      {
        id: "palette.files",
        title: "Find a note",
        group: "Navigate",
        hotkey: "mod+o",
        keywords: "quick switcher open go to jump note file search find",
        run: () => setUi({ palette: "files" }),
      },
      {
        id: "palette.search",
        title: "Search the whole project",
        group: "Navigate",
        hotkey: "mod+shift+o",
        keywords: "find text words replace look up",
        run: () => setUi({ palette: "search" }),
      },
      // Only where AI is on for the workspace and the project, and for people who can edit.
      ...(modules.has("ai")
        ? [
            {
              id: "ai.ask",
              title: "Ask AI…",
              group: "AI",
              run: () => setUi({ right: true, rightTab: "agent", askAi: ui.get().askAi + 1 }),
            },
            // The rest put words in the chat's message box, for the writer to finish or send (plan.md Phase 9d).
            {
              id: "ai.draft",
              title: "AI: Draft this scene or chapter",
              group: "AI",
              run: withActive((id) => {
                const title = binder.get().index.byId.get(id)?.title ?? "this note";
                setUi({ right: true, rightTab: "agent", aiDraft: { text: `Draft @${title} from its synopsis and what comes before it. `, mentions: [{ id, title }] } });
              }),
            },
            {
              id: "ai.check",
              title: "AI: Check this chapter",
              group: "AI",
              run: withActive((id) => {
                const title = binder.get().index.byId.get(id)?.title ?? "this note";
                setUi({
                  right: true,
                  rightTab: "agent",
                  aiDraft: { text: `Read @${title} like an editor: comment on what doesn't work, and run the continuity checks on it. `, mentions: [{ id, title }] },
                });
              }),
            },
            {
              id: "ai.carry",
              title: "AI: Carry a change through the project…",
              group: "AI",
              run: () => setUi({ right: true, rightTab: "agent", aiDraft: { text: "Change this everywhere it appears, and tell me which notes you changed: ", mentions: [] } }),
            },
            {
              id: "ai.premise",
              title: "AI: Build the project from a premise…",
              group: "AI",
              run: () =>
                setUi({
                  right: true,
                  rightTab: "agent",
                  aiDraft: {
                    text: "Build this project from a premise. Plan it as a job: an outline, the main characters and places, then the scenes one by one. The premise: ",
                    mentions: [],
                    mode: "auto",
                  },
                }),
            },
          ]
        : []),
      ...newCommands,
      {
        id: "binder.rename",
        title: "Rename this note",
        withKind: (kind) => `Rename this ${kind}`,
        group: "Binder",
        hotkey: "f2",
        keywords: "title name change",
        run: () => {
          // In the binder, F2 renames the row picked there; anywhere else, the open note.
          const inBinder = document.activeElement?.closest("[data-binder-tree]");
          const id = (inBinder && ui.get().selectedId) || activeOrSelected();
          if (id) setUi({ left: true, selectedId: id, renamingId: id });
        },
      },
      {
        id: "binder.reveal",
        title: "Show this note in the binder",
        withKind: (kind) => `Show this ${kind} in the binder`,
        keywords: "reveal locate find where",
        group: "Binder",
        run: withActive((id) => setUi({ left: true, selectedId: id })),
      },
      {
        id: "binder.duplicate",
        title: "Duplicate this note",
        withKind: (kind) => `Duplicate this ${kind}`,
        keywords: "copy clone",
        group: "Binder",
        run: withActive((id) => void duplicate(id)),
      },
      {
        id: "binder.trash",
        title: "Move this note to Trash",
        withKind: (kind) => `Move this ${kind} to Trash`,
        keywords: "delete remove bin erase discard",
        group: "Binder",
        run: withActive((id) => void trash(id)),
      },
      {
        id: "pane.close",
        title: "Close tab",
        group: "Panes",
        keywords: "close pane",
        hotkey: "alt+w",
        run: () => {
          const panel = dock.current?.activePanel;
          if (panel) dock.current?.removePanel(panel);
        },
      },
      {
        id: "pane.split-right",
        title: "Split right",
        group: "Panes",
        hotkey: "mod+alt+\\",
        run: () => {
          const api = dock.current;
          const panel = api?.activePanel;
          if (!api || !panel || panel.group.panels.length < 2) return;
          panel.api.moveTo({ group: api.addGroup({ referencePanel: panel, direction: "right" }) });
        },
      },
      {
        id: "pane.split-down",
        title: "Split down",
        group: "Panes",
        run: () => {
          const api = dock.current;
          const panel = api?.activePanel;
          if (!api || !panel || panel.group.panels.length < 2) return;
          panel.api.moveTo({ group: api.addGroup({ referencePanel: panel, direction: "below" }) });
        },
      },
      {
        id: "pane.next",
        title: "Next tab",
        group: "Panes",
        hotkey: "mod+alt+arrowright",
        run: () => dock.current?.activateNext(),
      },
      {
        id: "pane.previous",
        title: "Previous tab",
        group: "Panes",
        hotkey: "mod+alt+arrowleft",
        run: () => dock.current?.activatePrevious(),
      },
      {
        id: "pane.pin",
        title: "Pin or unpin tab",
        keywords: "keep stick",
        group: "Panes",
        run: () => {
          const panel = dock.current?.activePanel;
          if (panel) togglePin(panel.id);
        },
      },
      {
        id: "pane.maximize",
        title: "Maximize or restore pane",
        keywords: "full size bigger enlarge zoom",
        group: "Panes",
        hotkey: "mod+shift+m",
        run: () => {
          const api = dock.current;
          const panel = api?.activePanel;
          if (!api || !panel) return;
          if (api.hasMaximizedGroup()) api.exitMaximizedGroup();
          else api.maximizeGroup(panel);
        },
      },
      {
        id: "view.left-sidebar",
        title: "Show or hide the binder",
        group: "View",
        keywords: "toggle sidebar left panel hide show binder tree",
        hotkey: "mod+\\",
        run: () => setUi({ left: !ui.get().left }),
      },
      {
        id: "view.right-sidebar",
        title: "Show or hide the inspector",
        group: "View",
        keywords: "toggle sidebar right panel hide show details properties",
        hotkey: "mod+shift+\\",
        run: () => setUi({ right: !ui.get().right }),
      },
      {
        id: "view.theme",
        title: "Switch between light and dark",
        keywords: "toggle dark mode light mode night theme colours",
        group: "View",
        run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
      {
        id: "view.reset-layout",
        title: "Close all tabs",
        group: "View",
        keywords: "reset layout clear",
        run: () => dock.current?.clear(),
      },
      ...viewCommands,
      {
        id: "view.local-graph",
        title: "Open the graph around this note",
        withKind: (kind) => `Open the graph around this ${kind}`,
        keywords: "local graph links network map",
        group: "Views",
        run: withActive((id) => openView("graph", { nodeId: id }, "split")),
      },
      {
        id: "view.timeline",
        title: "New timeline",
        group: "Views",
        run: () => void create("timeline"),
      },
      {
        id: "view.focus",
        title: "Turn focus mode on or off",
        group: "Writing",
        hotkey: "mod+shift+f",
        keywords: "toggle distraction free zen full screen hide everything",
        run: () => setUi({ focus: !ui.get().focus }),
      },
      {
        id: "view.typewriter",
        title: "Turn typewriter scrolling on or off",
        group: "Writing",
        // ⌘⇧T reopens a closed browser tab, and the browser takes it before the page can.
        hotkey: "mod+alt+shift+t",
        keywords: "toggle centre center caret line scroll",
        run: () => setUi({ typewriter: !ui.get().typewriter }),
      },
      {
        id: "editor.suggesting",
        title: "Turn suggesting (track changes) on or off",
        group: "Writing",
        keywords: "toggle track changes suggest edits review",
        hotkey: "mod+shift+e",
        run: () => setUi({ suggesting: !ui.get().suggesting }),
      },
      {
        id: "editor.comment",
        title: "Comment on selection",
        group: "Writing",
        keywords: "note feedback annotate remark",
        hotkey: "mod+alt+m",
        run: withActive((id) => editors.current.get(id)?.comment()),
      },
      {
        id: "view.comments",
        title: "Show comments",
        group: "View",
        keywords: "feedback notes discussion",
        run: () => setUi({ right: true, rightTab: "comments" }),
      },
      {
        id: "view.history",
        title: "Show version history",
        group: "View",
        keywords: "versions revisions undo restore older backup",
        run: () => setUi({ right: true, rightTab: "history" }),
      },
      {
        id: "binder.beat-sheet",
        title: "Start from a beat sheet… (Save the Cat, Hero's Journey…)",
        group: "Binder",
        keywords: "structure template outline acts plot",
        run: () => setUi({ beatSheets: true }),
      },
      // Markdown, Word, plain text and PDF in and out (plan.md 2.7). Anyone who can read can export.
      ...(project.actions.includes("edit")
        ? [
            {
              id: "io.import",
              title: "Import… (Scrivener, Plottr, World Anvil, Word, Markdown, Obsidian vault)",
              group: "File",
              keywords: "upload bring in open file docx",
              run: () => setUi({ io: { mode: "import", nodeId: activeOrSelected() } }),
            },
          ]
        : []),
      {
        id: "io.export",
        title: "Export… (Word, RTF, Markdown, plain text, Final Draft, PDF)",
        group: "File",
        keywords: "download save print pdf docx compile backup",
        run: () => setUi({ io: { mode: "export", nodeId: activeOrSelected() } }),
      },
      // Fountain in and out (plan.md 2.7), where script formats are switched on.
      ...(modules.has("screenplay")
        ? [
            {
              id: "script.import-fountain",
              title: "Import Fountain…",
              group: "Script",
              run: () =>
                void importFountainFile({ projectId, binder, track, announce }).then(
                  (folder) => folder && setUi({ left: true, selectedId: folder.id }),
                ),
            },
            {
              id: "script.export-fountain",
              title: "Export as Fountain",
              group: "Script",
              run: () =>
                void exportFountainFile({ projectId, projectTitle: project.title, author: user.name, binder, rootId: activeOrSelected() }),
            },
          ]
        : []),
      // Ink, Yarn Spinner and Twine in as a new dialogue (plan.md 2.8), where interactive narrative is switched on.
      ...(modules.has("interactive") && project.actions.includes("edit")
        ? [
            {
              id: "interactive.import",
              title: "Import dialogue (Ink, Yarn Spinner, Twine)…",
              group: "File",
              run: () =>
                void importDialogueAsNew({ projectId, parentId: null, binder, track, announce }).then((id) => {
                  if (!id) return;
                  setUi({ left: true, selectedId: id });
                  open(id, "tab");
                }),
            },
          ]
        : []),
      {
        id: "view.tags",
        title: "Show tags",
        group: "View",
        keywords: "hashtags labels",
        run: () => setUi({ left: true, leftTab: "tags" }),
      },
      {
        id: "view.backlinks",
        title: "Show what mentions this note",
        withKind: (kind) => `Show what mentions this ${kind}`,
        group: "View",
        // ⌘⇧B shows or hides the browser's bookmarks bar.
        hotkey: "mod+alt+shift+b",
        keywords: "backlinks mentioned in links references incoming",
        run: () => setUi({ right: true, rightTab: "links" }),
      },
      {
        id: "layout.switch",
        title: "Saved layouts…",
        group: "Panes",
        keywords: "workspace arrangement panes save restore",
        hotkey: "mod+shift+l",
        run: () => setUi({ palette: "layouts" }),
      },
      {
        id: "project.keep-offline",
        title: keptHere ? "Remove this project from this device" : "Keep this project on this device, for offline",
        group: "File",
        keywords: "offline download sync device",
        run: () => void setKept(projectId, project.title, binder.get().nodes, !keptHere),
      },
      {
        id: "project.settings",
        title: "Project settings (type, tools, workflow)…",
        group: "App",
        keywords: "options preferences modules configure",
        run: () => setUi({ projectSettings: true }),
      },
      {
        id: "editor.tag-block",
        title: "Tag block (canon, reveal, fact-check)…",
        group: "Writing",
        keywords: "spoiler canon reveal fact check",
        hotkey: "mod+alt+t",
        run: withActive((id) => editors.current.get(id)?.tagBlocks?.()),
      },
      {
        id: "view.story",
        title: "Show canon and reveals",
        group: "View",
        run: () => setUi({ right: true, rightTab: "story" }),
      },
      {
        id: "app.customize",
        title: "Customize: presets, ribbon, shortcuts, toolbar and the look of the page",
        group: "App",
        keywords: "settings preferences appearance theme colours font interface size bigger text",
        run: () => setUi({ customize: true }),
      },
      {
        id: "app.hotkeys",
        title: "Keyboard shortcuts",
        group: "App",
        hotkey: "mod+/",
        keywords: "keys hotkeys bindings help",
        run: () => setUi({ hotkeys: true }),
      },
      {
        id: "app.workspace",
        title: workspace.role ? `Back to ${workspace.name}` : "Back to shared projects",
        group: "App",
        run: () => {
          showNavPending(workspace.homeHref);
          router.push(workspace.homeHref, { transitionTypes: nav.close });
        },
      },
    ];
    // The person's plugins' commands, panels and exports (lib/plugins.ts), under their own heading.
    for (const part of pluginParts) {
      const id = `plugin.${part.pluginId}.${part.what}.${part.name}`;
      // A plugin's theme is one of the themes below.
      if (part.what === "theme") continue;
      if (part.what === "panel") list.push({ id, title: `Open ${part.title}`, group: "Plugins", run: () => openView("plugin", { panel: panelKey(part.pluginId, part.name), title: part.title }) });
      else list.push({ id, title: part.what === "export" ? `Export as ${part.title}` : part.title, group: "Plugins", run: () => void runPluginPart(plugins, part, project.title) });
    }
    // Every theme, the app's, the plugins' and the person's own (lib/themes.ts).
    for (const choice of themeChoices) {
      list.push({
        id: `theme.${choice.key}`,
        title: `Use the ${choice.label} theme`,
        group: "View",
        keywords: `theme colours colors palette ${choice.from ?? ""}`,
        run: () => chooseTheme(choice.key),
      });
    }
    if (pluginsOn) list.push({ id: "plugins.reload", title: "Reload plugins", group: "Plugins", run: () => plugins.reload() });
    list.push({
      id: "plugins.manage",
      title: "Manage plugins",
      group: "Plugins",
      run: () => {
        showNavPending("/settings");
        router.push("/settings#plugins");
      },
    });
    return list.map((command) => ({ ...command, hotkey: resolveHotkey(command.id, command.hotkey, overrides) }));
  }, [
    keptHere,
    activeOrSelected,
    announce,
    binder,
    create,
    containerParams,
    dock,
    duplicate,
    editors,
    modules,
    open,
    openView,
    overrides,
    pluginParts,
    plugins,
    pluginsOn,
    themeChoices,
    chooseTheme,
    project.actions,
    project.settings,
    project.title,
    project.type,
    projectId,
    togglePin,
    resolvedTheme,
    router,
    setTheme,
    setUi,
    track,
    trash,
    ui,
    user.name,
    workspace.name,
    workspace.homeHref,
    workspace.role,
  ]);

  const commandsRef = useRef(commands);
  useEffect(() => {
    commandsRef.current = commands;
  }, [commands]);

  // One global listener runs every bound command, even while typing in the editor.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.body.dataset.recordingHotkey) return;
      const hotkey = eventToHotkey(event);
      if (!hotkey) return;
      // Bare keys (like F2) shouldn't fire while typing in a form field.
      const target = event.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable=true]");
      if (typing && !hotkey.includes("mod") && !hotkey.includes("alt") && !/^f\d+$/.test(hotkey)) return;
      const command = commandsRef.current.find((c) => c.hotkey === hotkey);
      if (!command) return;
      event.preventDefault();
      event.stopPropagation();
      command.run();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return {
    project,
    workspace,
    user,
    ai,
    modules,
    stages,
    format,
    horizon,
    projectChanged,
    patchNode: optimistic,
    track,
    saving,
    binder,
    docs,
    activeNodeId,
    ui,
    setUi,
    setDocStats,
    dock,
    editors,
    registerEditor,
    withEditor,
    propertyDefs,
    peers,
    pinned,
    togglePin,
    refreshBinder,
    announce,
    notify,
    onNotice,
    open,
    openNode,
    openView,
    closePanelsFor,
    commands,
    plugins,
    actions: { create, update, setProperties, setLabel, move, trash, restore, destroy, emptyTrash, duplicate },
    allNodes: () => flatten(binder.get().index),
  };
}

export type WorkspaceValue = ReturnType<typeof useWorkspaceState>;

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({
  children,
  ...props
}: Parameters<typeof useWorkspaceState>[0] & { children: React.ReactNode }) {
  const value = useWorkspaceState(props);
  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}

export function useWorkspace() {
  const value = use(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return value;
}

/** The workspace, or null on a page outside a project (the plugin store, a workspace's home). */
export function useOptionalWorkspace() {
  return use(WorkspaceContext);
}

export function useUi() {
  return useStore(useWorkspace().ui);
}
