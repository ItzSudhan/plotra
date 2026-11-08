"use client";

import type { NodeKind } from "@plotra/db/schema";
import { errorText } from "@/lib/errors";
import { updateProjectSettings } from "@/lib/project-actions";
import { kindPlural, viewLabel } from "@/lib/vocabulary";
import { arranged, isShown } from "@/lib/shell-prefs";
import { Icon } from "@plotra/icons";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@plotra/ui/components/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@plotra/ui/components/dropdown-menu";
import { confirm } from "@plotra/ui/components/dialogs";
import { IconButton } from "@plotra/ui/components/icon-button";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { cn } from "@plotra/ui/lib/utils";
import { generateKeyBetween } from "fractional-indexing";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHorizon, useWorld } from "@/components/world/data";
import { EntityIcon, NodeIcon } from "@/components/world/entity-icon";
import {
  containerKinds,
  isDescendant,
  isTrashed,
  liveChildren,
  nodeKindMeta,
  type BinderNode,
  type NodeIndex,
} from "@/lib/tree";
import { isFirstStage } from "@/lib/stages";
import { isDocumentKind, plainKinds } from "@/lib/story";
import { filterBinder, highlightParts, typeAhead, type BinderFilter } from "./binder-filter";
import { countWithin, indent, moveDown, moveInto, moveTargets, moveUp, newMenuKinds, outdent, type Place } from "./binder-moves";
import { formatHotkey } from "./hotkeys";
import { StatusDot } from "./status";
import { containerViews } from "./view-registry";
import { useStore } from "./stores";
import { creatableKinds, useUi, useWorkspace, type OpenMode } from "./workspace-provider";
import { labelOf } from "@/lib/vocabulary";
import { sheetFrom } from "@/lib/beat-sheets";
import { toast } from "sonner";
import { useOwnSheets, useShell } from "./shell-prefs";
import { useVocabulary } from "./vocabulary";
import { isLocalMode } from "@/lib/local-mode";
import { plural } from "@/lib/plural";

/** Drag-and-drop type carrying a binder node id, for drops onto boards. */
export const NODE_MIME = "application/x-plotra-node";

type DropTarget = { id: string; where: "before" | "after" | "inside" };

const expandedKey = (projectId: string) => `plotra:binder-expanded:${projectId}`;

function openModeFor(e: React.MouseEvent | React.KeyboardEvent): OpenMode {
  if ((e.metaKey || e.ctrlKey) && e.altKey) return "split";
  if (e.metaKey || e.ctrlKey) return "tab";
  return "replace";
}

/** The children a row shows: its live ones, or while filtering only those the filter keeps. */
const shownChildren = (index: NodeIndex, parentId: string | null, shown: Set<string> | null) =>
  liveChildren(index, parentId).filter((n) => !shown || shown.has(n.id));

/** Rows currently visible in the tree, top to bottom, for keyboard navigation. */
function visibleRows(index: NodeIndex, expanded: Set<string>, shown: Set<string> | null, parentId: string | null = null, out: BinderNode[] = []) {
  for (const n of shownChildren(index, parentId, shown)) {
    out.push(n);
    if (expanded.has(n.id)) visibleRows(index, expanded, shown, n.id, out);
  }
  return out;
}

/** "⌘⌫" on a Mac, where Backspace is the delete key; "Del" elsewhere. */
const trashKeyLabel = () => (formatHotkey("mod") === "⌘" ? formatHotkey("mod+backspace") : "Del");

const rowSelector = (id: string) => `[data-node-id="${CSS.escape(id)}"]`;

export function Binder() {
  const { project, binder, actions, open, setUi, commands, modules } = useWorkspace();
  const words = useVocabulary();
  const entityTypes = useWorld().data?.entityTypes ?? [];
  const { index } = useStore(binder);
  const { selectedId } = useUi();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [drop, setDrop] = useState<DropTarget | null>(null);
  // The row whose menu is open from the keyboard or its ⋯ button.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  // Remember which folders are open, per project.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(expandedKey(project.id)) ?? "[]") as string[];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
      setExpanded(new Set(saved));
    } catch {
      // Ignore a corrupt entry; folders just start closed.
    }
  }, [project.id]);

  const toggle = useCallback(
    (id: string, force?: boolean) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (force ?? !next.has(id)) next.add(id);
        else next.delete(id);
        try {
          localStorage.setItem(expandedKey(project.id), JSON.stringify([...next]));
        } catch {}
        return next;
      }),
    [project.id],
  );

  // Reveal the selected node: open every folder above it.
  useEffect(() => {
    if (!selectedId) return;
    const missing: string[] = [];
    for (let n = index.byId.get(selectedId); n?.parentId; n = index.byId.get(n.parentId)) {
      if (!expanded.has(n.parentId)) missing.push(n.parentId);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- revealing a selection made elsewhere (palette, tabs)
    for (const id of missing) toggle(id, true);
    treeRef.current?.querySelector(rowSelector(selectedId))?.scrollIntoView({ block: "nearest" });
  }, [expanded, index, selectedId, toggle]);

  // The "Filter…" box: matching notes and the folders above them, opened.
  const [query, setQuery] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);
  const filter = useMemo(() => filterBinder(index, query), [index, query]);
  // Folders closed by hand while filtering, forgotten when the filter changes.
  const [closedWhileFiltering, setClosedWhileFiltering] = useState<Set<string>>(() => new Set());
  const changeQuery = (next: string) => {
    setQuery(next);
    setClosedWhileFiltering(new Set());
  };
  const shown = filter?.shown ?? null;
  const shownExpanded = useMemo(
    () => (filter ? new Set([...expanded, ...filter.open].filter((id) => !closedWhileFiltering.has(id))) : expanded),
    [closedWhileFiltering, expanded, filter],
  );
  /** Opens or closes a row by hand: while filtering, without touching the folders remembered for later. */
  const toggleRow = useCallback(
    (id: string, force?: boolean) => {
      if (!filter) return toggle(id, force);
      const want = force ?? !shownExpanded.has(id);
      setClosedWhileFiltering((prev) => {
        const next = new Set(prev);
        if (want) next.delete(id);
        else next.add(id);
        return next;
      });
      if (want && !filter.open.has(id)) toggle(id, true);
    },
    [filter, shownExpanded, toggle],
  );

  const roots = shownChildren(index, null, shown);
  const rows = visibleRows(index, shownExpanded, shown);
  // Roving focus: one row is in the Tab order, the selected one if it's showing, else the first.
  const focusId = rows.some((r) => r.id === selectedId) ? selectedId : (rows[0]?.id ?? null);
  const trashed = useMemo(
    () =>
      [...index.byId.values()]
        .filter((n) => n.deletedAt && !(n.parentId && isTrashed(index, n.parentId)))
        .sort((a, b) => +new Date(b.deletedAt!) - +new Date(a.deletedAt!)),
    [index],
  );

  /** Puts keyboard focus on a row, once it has rendered. */
  const focusRow = useCallback((id: string) => {
    requestAnimationFrame(() => (treeRef.current?.querySelector(rowSelector(id)) as HTMLElement | null)?.focus());
  }, []);

  /** Moves a note by keyboard or menu, keeping it in view and focused. */
  const place = useCallback(
    (id: string, to: Place | null) => {
      if (!to) return;
      if (to.parentId) toggle(to.parentId, true);
      void actions.move(id, to.parentId, to.position);
      setUi({ selectedId: id });
      focusRow(id);
    },
    [actions, focusRow, setUi, toggle],
  );

  // ---- Drag and drop (mouse, and touch through the grip) ----------------------

  function dropTargetAt(rect: DOMRect, clientY: number, node: BinderNode): DropTarget | null {
    const from = dragId.current;
    if (!from || from === node.id || isDescendant(index, node.id, from)) return null;
    const y = (clientY - rect.top) / rect.height;
    if (y < 0.28) return { id: node.id, where: "before" };
    if (y > 0.72 && !(shownExpanded.has(node.id) && shownChildren(index, node.id, shown).length)) return { id: node.id, where: "after" };
    return { id: node.id, where: "inside" };
  }

  function commitDrop(target: DropTarget) {
    const from = dragId.current;
    const node = index.byId.get(target.id);
    if (!from || !node) return;
    if (target.where === "inside") {
      const siblings = index.children.get(node.id) ?? [];
      toggleRow(node.id, true);
      void actions.move(from, node.id, generateKeyBetween(siblings.at(-1)?.position ?? null, null));
      return;
    }
    const siblings = (index.children.get(node.parentId) ?? []).filter((s) => s.id !== from);
    const at = siblings.findIndex((s) => s.id === node.id);
    const [before, after] = target.where === "before" ? [siblings[at - 1], siblings[at]] : [siblings[at], siblings[at + 1]];
    void actions.move(from, node.parentId, generateKeyBetween(before?.position ?? null, after?.position ?? null));
  }

  /** Touch and pen drag from a row's grip: the browser's drag and drop only answers a mouse. */
  const pointerDrag = {
    start: (e: React.PointerEvent, id: string) => {
      if (e.pointerType === "mouse") return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragId.current = id;
    },
    move: (e: React.PointerEvent) => {
      if (!dragId.current || e.pointerType === "mouse") return;
      const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-node-id]");
      const node = row?.dataset.nodeId ? index.byId.get(row.dataset.nodeId) : undefined;
      const target = row && node ? dropTargetAt(row.getBoundingClientRect(), e.clientY, node) : null;
      setDrop((prev) => (prev?.id === target?.id && prev?.where === target?.where ? prev : target));
    },
    end: (e: React.PointerEvent) => {
      if (!dragId.current || e.pointerType === "mouse") return;
      if (drop) commitDrop(drop);
      dragId.current = null;
      setDrop(null);
    },
  };

  // ---- Keyboard --------------------------------------------------------------

  function onTreeKeyDown(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const i = rows.findIndex((r) => r.id === selectedId);
    const current = rows[i];
    const select = (n?: BinderNode) => {
      if (!n) return;
      setUi({ selectedId: n.id });
      focusRow(n.id);
    };

    // Alt+arrows move the note (ux-audit.md #10): up and down among its neighbours, right into the one above, left out of its folder.
    if (e.altKey && !e.metaKey && !e.ctrlKey && current && e.key.startsWith("Arrow")) {
      const to =
        e.key === "ArrowUp" ? moveUp(index, current.id) : e.key === "ArrowDown" ? moveDown(index, current.id) : e.key === "ArrowRight" ? indent(index, current.id) : outdent(index, current.id);
      place(current.id, to);
      e.preventDefault();
      return;
    }
    // Shift+F10 and the menu key open the row's menu, as right-click does.
    if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
      if (current) setMenuFor(current.id);
      e.preventDefault();
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        select(rows[Math.min(i + 1, rows.length - 1)] ?? rows[0]);
        break;
      case "ArrowUp":
        select(rows[Math.max(i - 1, 0)] ?? rows[0]);
        break;
      case "Home":
        select(rows[0]);
        break;
      case "End":
        select(rows.at(-1));
        break;
      case "ArrowRight":
        if (current && shownChildren(index, current.id, shown).length) {
          if (!shownExpanded.has(current.id)) toggleRow(current.id, true);
          else select(shownChildren(index, current.id, shown)[0]);
        }
        break;
      case "ArrowLeft":
        if (current && shownExpanded.has(current.id)) toggleRow(current.id, false);
        else if (current?.parentId) select(index.byId.get(current.parentId));
        break;
      case "Enter":
      case " ":
        if (current) {
          if (current.kind === "folder") toggleRow(current.id);
          else open(current.id, openModeFor(e));
        }
        break;
      case "Delete":
        if (current) void actions.trash(current.id);
        break;
      case "Backspace":
        // Backspace alone is too easy to hit by accident; ⌘⌫ (Ctrl+Backspace) moves to the trash, with an Undo.
        if (!(e.metaKey || e.ctrlKey)) return;
        if (current) void actions.trash(current.id);
        break;
      case "Escape":
        // Clears the filter from the tree too, keeping focus on the note.
        if (!filter) return;
        changeQuery("");
        if (current) focusRow(current.id);
        break;
      default:
        // Type-ahead: a letter or digit jumps to the next row starting with it.
        if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey || !/[\p{L}\p{N}]/u.test(e.key)) return;
        select(typeAhead(rows, current?.id ?? null, e.key));
    }
    e.preventDefault();
  }

  // ⌘⌥N makes the first of the main kinds (binder-moves.ts quickKind); its shortcut is shown beside it.
  const newNoteKey = commands.find((c) => c.id === "binder.new-note")?.hotkey;
  const { main, rest } = newMenuKinds(project.type, modules);
  const quick = main[0];
  // The header's buttons the person kept, in their order (Customize → Binder header).
  const { shell } = useShell();
  const headerButtons: Record<string, React.ReactNode> = {
    "binder.new": project.actions.includes("edit") && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={cn(sidebarButtonClass, "flex w-auto items-center gap-1 px-2 text-ui-sm font-medium whitespace-nowrap text-foreground pointer-coarse:w-auto")}>
            <Icon name="add-linear" className="size-4" />
            New
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[70vh] w-52 overflow-y-auto">
          {main.map((kind) => (
            <DropdownMenuItem key={kind} onSelect={() => void actions.create(kind)}>
              <Icon name={nodeKindMeta[kind].icon} />
              {words.label(kind)}
              {kind === quick && newNoteKey && <DropdownMenuShortcut>{formatHotkey(newNoteKey)}</DropdownMenuShortcut>}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {rest.map((kind) => (
            <DropdownMenuItem key={kind} onSelect={() => void actions.create(kind)}>
              <Icon name={nodeKindMeta[kind].icon} />
              {words.label(kind)}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => void actions.create("canvas", undefined, "Untitled map", { board: "map" })}>
            <Icon name="map-linear" />
            Map
          </DropdownMenuItem>
          {modules.has("world") && entityTypes.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">World entries</DropdownMenuLabel>
              {entityTypes.map((type) => (
                <DropdownMenuItem key={type.id} onSelect={() => void actions.create("entity", undefined, `Untitled ${type.name.toLowerCase()}`, { entityTypeId: type.id })}>
                  <EntityIcon type={type} />
                  {type.name}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    // The whole project in and out (plan.md 2.7), and structures to start from; folders have import and export in their own menu.
    "binder.more": (
      <DropdownMenu>
        <Tooltip content="Import, export and beat sheets">
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="More: import, export and beat sheets" className={sidebarButtonClass}>
              <Icon name="menu-dots-linear" className="size-4" />
            </button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-56">
          {project.actions.includes("edit") && (
            <DropdownMenuItem onSelect={() => setUi({ beatSheets: true })}>
              <Icon name="clipboard-list-linear" />
              Start from a beat sheet…
            </DropdownMenuItem>
          )}
          {project.actions.includes("edit") && (
            <DropdownMenuItem onSelect={() => setUi({ io: { mode: "import", nodeId: null } })}>
              <Icon name="import-linear" />
              Import…
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setUi({ io: { mode: "export", nodeId: null } })}>
            <Icon name="export-linear" />
            Export project…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    "binder.collapse": <SidebarButton label="Collapse all folders" icon="sort-vertical-linear" onClick={() => setExpanded(new Set())} />,
    "binder.share": project.actions.includes("manage") && !isLocalMode && (
      <SidebarButton label="Share project…" icon="users-group-rounded-linear" onClick={() => setUi({ sharing: true })} />
    ),
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* "New" leads on the left; the rest of the toolbar sits at the right. */}
      <div className="flex h-10 shrink-0 items-center gap-1 px-1.5">
        {isShown(shell, "binder.new") && headerButtons["binder.new"]}
        <span className="flex-1" />
        {arranged(shell, "binder")
          .filter((id) => id !== "binder.new" && isShown(shell, id))
          .map((id) => (
            <Fragment key={id}>{headerButtons[id]}</Fragment>
          ))}
      </div>

      {liveChildren(index, null).length > 0 && (
        <div className="shrink-0 border-b border-sidebar-border px-1.5 pb-1.5">
          <div className="relative">
            <Icon name="magnifer-linear" aria-hidden className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-faint" />
            <input
              ref={filterRef}
              type="search"
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) {
                  e.preventDefault();
                  e.stopPropagation();
                  changeQuery("");
                } else if (e.key === "ArrowDown" && rows[0]) {
                  // Down from the box goes into the tree.
                  e.preventDefault();
                  setUi({ selectedId: rows[0].id });
                  focusRow(rows[0].id);
                } else if (e.key === "Enter" && filter && rows.length) {
                  // Enter opens the first match.
                  const first = rows.find((r) => filter.matches.has(r.id));
                  if (first && first.kind !== "folder") open(first.id, openModeFor(e));
                }
              }}
              placeholder="Filter…"
              aria-label="Filter the binder"
              aria-controls="binder-tree"
              className="h-8 w-full rounded-md border border-sidebar-border bg-transparent pr-8 pl-7 text-ui-sm outline-none placeholder:text-faint focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:h-10 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <IconButton
                icon="close-linear"
                label="Clear filter"
                size="xs"
                onClick={() => {
                  changeQuery("");
                  filterRef.current?.focus();
                }}
                className="absolute top-1/2 right-1 -translate-y-1/2"
              />
            )}
          </div>
          <span className="sr-only" aria-live="polite">
            {filter ? `${filter.matches.size === 0 ? "No" : filter.matches.size.toLocaleString()} ${filter.matches.size === 1 ? "note matches" : "notes match"}` : ""}
          </span>
        </div>
      )}

      <div
        ref={treeRef}
        id="binder-tree"
        role="tree"
        aria-label="Binder"
        aria-describedby="binder-keys"
        data-binder-tree=""
        onKeyDown={onTreeKeyDown}
        className="min-h-0 flex-1 overflow-y-auto py-1.5"
        onDragOver={(e) => {
          // Dropping on empty space below the tree moves the node to the end of the root.
          if (e.target === e.currentTarget && dragId.current) {
            e.preventDefault();
            setDrop(null);
          }
        }}
        onDrop={(e) => {
          if (e.target !== e.currentTarget || !dragId.current) return;
          e.preventDefault();
          void actions.move(
            dragId.current,
            null,
            generateKeyBetween((index.children.get(null) ?? []).at(-1)?.position ?? null, null),
          );
        }}
      >
        {filter && roots.length === 0 ? (
          <div className="px-4 py-6 text-center text-ui-sm text-muted-foreground">
            <p>No notes match ‘{query.trim()}’.</p>
            <button
              type="button"
              onClick={() => {
                changeQuery("");
                filterRef.current?.focus();
              }}
              className="mt-2 rounded-sm text-ember-ink underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Clear filter
            </button>
          </div>
        ) : roots.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            <p>Your binder is empty. Everything you write and track lives here.</p>
            <button
              type="button"
              onClick={() => void actions.create("scene")}
              className="mt-3 rounded-sm text-ember-ink underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Write a scene
            </button>
            <span className="mx-1.5 text-faint">or</span>
            <button
              type="button"
              onClick={() => void actions.create("chapter")}
              className="mt-3 rounded-sm text-ember-ink underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              start a chapter
            </button>
          </div>
        ) : (
          roots.map((node) => (
            <TreeRow
              key={node.id}
              node={node}
              depth={0}
              index={index}
              expanded={shownExpanded}
              toggle={toggleRow}
              filter={filter}
              query={query}
              drop={drop}
              focusId={focusId}
              menuFor={menuFor}
              setMenuFor={setMenuFor}
              place={place}
              pointerDrag={pointerDrag}
              onDragStart={(id) => (dragId.current = id)}
              onDragEnd={() => {
                dragId.current = null;
                setDrop(null);
              }}
              onDragOver={(e, n) => {
                const target = dropTargetAt(e.currentTarget.getBoundingClientRect(), e.clientY, n);
                if (!target) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "move";
                setDrop((prev) => (prev?.id === target.id && prev.where === target.where ? prev : target));
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (drop) commitDrop(drop);
                dragId.current = null;
                setDrop(null);
              }}
            />
          ))
        )}
      </div>
      <p id="binder-keys" className="sr-only">
        Arrow keys move between notes, and typing a letter jumps to the next one starting with it. Enter opens one. F2 renames, Delete moves to Trash. Alt with the arrow keys moves a note. Shift F10 opens its menu.
      </p>

      <Trash nodes={trashed} index={index} />
    </div>
  );
}

const sidebarButtonClass =
  "grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-sidebar-accent pointer-coarse:size-10";

export function SidebarButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ComponentProps<typeof Icon>["name"];
  onClick: () => void;
}) {
  return (
    <Tooltip content={label}>
      <button type="button" aria-label={label} onClick={onClick} className={sidebarButtonClass}>
        <Icon name={icon} className="size-4" />
      </button>
    </Tooltip>
  );
}

type PointerDrag = {
  start: (e: React.PointerEvent, id: string) => void;
  move: (e: React.PointerEvent) => void;
  end: (e: React.PointerEvent) => void;
};

function TreeRow({
  node,
  depth,
  index,
  expanded,
  toggle,
  filter,
  query,
  drop,
  focusId,
  menuFor,
  setMenuFor,
  place,
  pointerDrag,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  node: BinderNode;
  depth: number;
  index: NodeIndex;
  /** Rows open now (with the folders a filter opens). */
  expanded: Set<string>;
  toggle: (id: string, force?: boolean) => void;
  filter: BinderFilter | null;
  query: string;
  drop: DropTarget | null;
  focusId: string | null;
  menuFor: string | null;
  setMenuFor: (id: string | null) => void;
  place: (id: string, to: Place | null) => void;
  pointerDrag: PointerDrag;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, node: BinderNode) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const { open, setUi, activeNodeId, stages, project } = useWorkspace();
  const label = labelOf(node, project.settings);
  const { selectedId, renamingId } = useUi();
  // Under a spoiler horizon, notes the audience doesn't know yet are dimmed.
  const horizon = useHorizon();
  const hidden = horizon ? !horizon.shows(node.id) : false;
  const activeId = useStore(activeNodeId);
  const children = shownChildren(index, node.id, filter?.shown ?? null);
  const isMatch = filter?.matches.has(node.id) ?? false;
  const isOpen = expanded.has(node.id);
  const isDrop = drop?.id === node.id ? drop.where : null;
  const hasChildren = children.length > 0;
  const renaming = renamingId === node.id;
  const selected = selectedId === node.id;
  const rowRef = useRef<HTMLDivElement>(null);
  const can = node.actions.includes("edit");

  return (
    <div role="none">
      <NodeContextMenu node={node} place={place}>
        <div
          ref={rowRef}
          role="treeitem"
          aria-selected={selected}
          aria-expanded={hasChildren ? isOpen : undefined}
          aria-level={depth + 1}
          tabIndex={focusId === node.id ? 0 : -1}
          data-node-id={node.id}
          draggable={!renaming && can}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", node.title);
            // Lets views outside the binder (canvas, timeline) accept the note.
            e.dataTransfer.setData(NODE_MIME, node.id);
            onDragStart(node.id);
          }}
          onDragEnd={onDragEnd}
          onDragOver={(e) => onDragOver(e, node)}
          onDrop={onDrop}
          onFocus={(e) => {
            // Tabbing into the tree picks the row it lands on.
            if (e.target === e.currentTarget && !selected) setUi({ selectedId: node.id });
          }}
          onClick={(e) => {
            setUi({ selectedId: node.id });
            if (node.kind === "folder" && !(e.metaKey || e.ctrlKey)) toggle(node.id);
            else open(node.id, openModeFor(e));
          }}
          onAuxClick={(e) => {
            if (e.button === 1 && node.kind !== "folder") open(node.id, "tab");
          }}
          style={{ paddingLeft: 4 + depth * 12 }}
          className={cn(
            "group relative mx-1.5 flex h-7 cursor-default items-center gap-1 rounded-md pr-1 text-ui-sm outline-none select-none pointer-coarse:h-10",
            "hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
            // A bar as well as the tint: the tint alone is too faint to see in light mode.
            selected && "bg-sidebar-accent text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-ember",
            activeId === node.id && "font-medium text-foreground",
            activeId !== node.id && !selected && "text-sidebar-foreground/85",
            isDrop === "inside" && "bg-ember/15 ring-1 ring-ember/50",
            hidden && "opacity-45",
          )}
        >
          {isDrop === "before" && <span className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded bg-ember" />}
          {isDrop === "after" && <span className="pointer-events-none absolute inset-x-1 -bottom-px h-0.5 rounded bg-ember" />}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.id);
            }}
            className={cn("grid size-6 shrink-0 place-items-center rounded text-faint hover:bg-sidebar-border/60 hover:text-foreground", !hasChildren && "invisible")}
          >
            <Icon name="alt-arrow-right-linear" className={cn("size-3.5 transition-transform duration-200 ease-out", isOpen && "rotate-90")} />
          </button>
          <NodeIcon
            node={node}
            open={isOpen}
            className={cn("size-4 shrink-0", containerKinds.includes(node.kind) ? "text-ember-ink" : "text-muted-foreground")}
          />
          {renaming ? (
            <RenameInput node={node} />
          ) : (
            // While filtering, the matching part is marked, and the folders on the way are quieter.
            <span className={cn("min-w-0 flex-1 truncate pl-1", filter && !isMatch && "text-muted-foreground")}>
              {isMatch
                ? highlightParts(node.title, query).map((part, i) =>
                    part.match ? (
                      <mark key={i} className="rounded-[2px] bg-gold/35 text-foreground">
                        {part.text}
                      </mark>
                    ) : (
                      <Fragment key={i}>{part.text}</Fragment>
                    ),
                  )
                : node.title}
            </span>
          )}
          {hidden && !renaming && (
            <>
              <Icon name="eye-closed-linear" className="size-3.5 shrink-0 text-faint" />
              <span className="sr-only">Not revealed yet</span>
            </>
          )}
          {label && !renaming && (
            <span title={label.name} className="relative size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: label.color }}>
              <span className="sr-only">Label: {label.name}</span>
            </span>
          )}
          {!isFirstStage(stages, node.status) && !renaming && <StatusDot status={node.status} />}
          {!renaming && can && (
            // The grip: drag with a mouse anywhere on the row, with a finger or pen here.
            <span
              aria-hidden
              onPointerDown={(e) => pointerDrag.start(e, node.id)}
              onPointerMove={pointerDrag.move}
              onPointerUp={pointerDrag.end}
              onPointerCancel={pointerDrag.end}
              onClick={(e) => e.stopPropagation()}
              className="hidden size-6 shrink-0 cursor-grab touch-none place-items-center rounded text-faint pointer-coarse:grid"
            >
              <Icon name="reorder-linear" className="size-3.5" />
            </span>
          )}
          {!renaming && (
            <RowMenuButton
              node={node}
              open={menuFor === node.id}
              onOpenChange={(isOpen) => {
                setMenuFor(isOpen ? node.id : null);
                if (isOpen) setUi({ selectedId: node.id });
              }}
              onClosed={() => rowRef.current?.focus()}
              place={place}
              className={cn(
                "hidden group-hover:inline-flex group-focus-within:inline-flex pointer-coarse:inline-flex",
                (selected || menuFor === node.id) && "inline-flex",
              )}
            />
          )}
        </div>
      </NodeContextMenu>
      {isOpen && hasChildren && (
        <div role="group">
          {children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              index={index}
              expanded={expanded}
              toggle={toggle}
              filter={filter}
              query={query}
              drop={drop}
              focusId={focusId}
              menuFor={menuFor}
              setMenuFor={setMenuFor}
              place={place}
              pointerDrag={pointerDrag}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RenameInput({ node }: { node: BinderNode }) {
  const { actions, setUi } = useWorkspace();
  const [value, setValue] = useState(node.title);
  const done = useRef(false);

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const next = value.trim();
    if (save && next && next !== node.title) void actions.update(node.id, { title: next });
    setUi({ renamingId: null });
    // Back to the row, so the keyboard carries on from there.
    requestAnimationFrame(() => (document.querySelector(rowSelector(node.id)) as HTMLElement | null)?.focus());
  };

  return (
    <input
      autoFocus
      aria-label={`Rename ${node.title}`}
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      className="ml-1 h-6 min-w-0 flex-1 rounded-sm bg-background px-1 text-ui-sm outline-none ring-1 ring-ring"
    />
  );
}

// ---- The row's menu -----------------------------------------------------------

// The same entries open from a right-click (a context menu) and from the ⋯
// button or Shift+F10 (a dropdown). The two menus take the same props, so the
// entries are written once against either set of parts.
type MenuKit = {
  Item: typeof DropdownMenuItem;
  Label: typeof DropdownMenuLabel;
  Separator: typeof DropdownMenuSeparator;
  Shortcut: typeof DropdownMenuShortcut;
  Sub: typeof DropdownMenuSub;
  SubTrigger: typeof DropdownMenuSubTrigger;
  SubContent: typeof DropdownMenuSubContent;
};
const dropdownKit: MenuKit = {
  Item: DropdownMenuItem,
  Label: DropdownMenuLabel,
  Separator: DropdownMenuSeparator,
  Shortcut: DropdownMenuShortcut,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
};
/** The UI kit's context menu has no label part; this matches the dropdown's. */
function ContextMenuLabel({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="presentation" className={cn("px-2 py-1.5 text-sm font-medium", className)} {...props} />;
}
const contextKit = {
  Item: ContextMenuItem,
  Label: ContextMenuLabel,
  Separator: ContextMenuSeparator,
  Shortcut: ContextMenuShortcut,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
} as unknown as MenuKit;

function NodeContextMenu({ node, place, children }: { node: BinderNode; place: (id: string, to: Place | null) => void; children: React.ReactNode }) {
  const { setUi } = useWorkspace();
  return (
    <ContextMenu onOpenChange={(isOpen) => isOpen && setUi({ selectedId: node.id })}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <NodeMenuItems node={node} place={place} kit={contextKit} />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function RowMenuButton({
  node,
  open,
  onOpenChange,
  onClosed,
  place,
  className,
}: {
  node: BinderNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClosed: () => void;
  place: (id: string, to: Place | null) => void;
  className?: string;
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon="menu-dots-linear"
          label={`More for ${node.title}`}
          size="xs"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className={className}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-60"
        onCloseAutoFocus={(e) => {
          // Back to the row rather than the hidden ⋯ button.
          e.preventDefault();
          onClosed();
        }}
      >
        <NodeMenuItems node={node} place={place} kit={dropdownKit} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NodeMenuItems({ node, place, kit: K }: { node: BinderNode; place: (id: string, to: Place | null) => void; kit: MenuKit }) {
  const { actions, open, openView, setUi, binder, modules, stages, project, projectChanged } = useWorkspace();
  const words = useVocabulary();
  const entityTypes = useWorld().data?.entityTypes ?? [];
  const index = binder.get().index;
  const hasChildren = liveChildren(index, node.id).length > 0;
  const can = (action: (typeof node.actions)[number]) => node.actions.includes(action);
  // Entries the person took away (Customize → Right-click menu). Rename, Move to and Move to Trash always stay.
  const { shell } = useShell();
  const shown = (id: string) => isShown(shell, id);
  const own = useOwnSheets();
  const kind = node.kind === "entity" ? (entityTypes.find((t) => t.id === node.entityTypeId)?.name ?? words.label(node.kind)) : words.label(node.kind);
  // A folder's structure, kept as a beat sheet of the person's own to build again anywhere (lib/beat-sheets.ts).
  const saveAsSheet = (id: string) => {
    const sheet = sheetFrom(index, id);
    if (!sheet) return void toast.message(`There's nothing in “${node.title}” to keep yet. Add some scenes first.`);
    if (own.full) return void toast.error("You have 12 beat sheets of your own. Remove one in Start from a beat sheet first.");
    own.add({ ...sheet, description: sheet.description || `Saved from ${node.title}` });
    toast.success(`Saved “${sheet.title}” as a beat sheet: it's under Yours in Start from a beat sheet, in every project.`);
  };
  const targets = moveTargets(index, node.id);
  return (
    <>
      {node.kind !== "folder" && (shown("menu.open") || shown("menu.graph")) && (
        <>
          {shown("menu.open") && (
            <>
              <K.Item onSelect={() => open(node.id, "tab")}>
                Open in new tab
                <K.Shortcut>{formatHotkey("mod")}click</K.Shortcut>
              </K.Item>
              <K.Item onSelect={() => open(node.id, "split")}>
                Open to the right
                <K.Shortcut>{formatHotkey("mod+alt")}click</K.Shortcut>
              </K.Item>
            </>
          )}
          {shown("menu.graph") && (
            <K.Item onSelect={() => openView("graph", { nodeId: node.id }, "split")}>
              <Icon name="graph-new-linear" />
              Graph around this {kind.toLowerCase()}
            </K.Item>
          )}
          <K.Separator />
        </>
      )}
      {shown("menu.views") && (containerKinds.includes(node.kind) || hasChildren) && (
        <>
          {containerViews(modules).map((view) => (
            <K.Item key={view.id} onSelect={() => openView(view.id, { nodeId: node.id })}>
              <Icon name={view.icon} />
              {viewLabel(view, project.settings)}
            </K.Item>
          ))}
          <K.Separator />
        </>
      )}
      {shown("menu.new-inside") && (
        <K.Sub>
          <K.SubTrigger disabled={!can("edit")}>
            <Icon name="add-linear" />
            New inside
          </K.SubTrigger>
          <K.SubContent className="max-h-[70vh] w-48 overflow-y-auto">
            {creatableKinds(modules).map((k) => (
              <K.Item key={k} onSelect={() => void actions.create(k, node.id)}>
                <Icon name={nodeKindMeta[k].icon} />
                {words.label(k)}
              </K.Item>
            ))}
            <K.Item onSelect={() => void actions.create("canvas", node.id, "Untitled map", { board: "map" })}>
              <Icon name="map-linear" />
              Map
            </K.Item>
            {modules.has("world") &&
              entityTypes.map((type) => (
                <K.Item key={type.id} onSelect={() => void actions.create("entity", node.id, `Untitled ${type.name.toLowerCase()}`, { entityTypeId: type.id })}>
                  <EntityIcon type={type} />
                  {type.name}
                </K.Item>
              ))}
          </K.SubContent>
        </K.Sub>
      )}
      {node.kind !== "folder" && isDocumentKind(node.kind) && project.actions.includes("manage") && (
        <K.Item
          onSelect={() => {
            const isTemplate = project.settings.noteTemplates?.[node.kind] === node.id;
            void updateProjectSettings(project.id, { noteTemplate: { kind: node.kind, nodeId: isTemplate ? null : node.id } }).then(
              () => {
                projectChanged();
                toast.success(
                  isTemplate
                    ? `New ${kindPlural(node.kind, project.settings).toLowerCase()} start blank again.`
                    : `New ${kindPlural(node.kind, project.settings).toLowerCase()} start as a copy of “${node.title}”.`,
                );
              },
              (error) => toast.error(errorText(error)),
            );
          }}
        >
          <Icon name="document-add-linear" />
          {project.settings.noteTemplates?.[node.kind] === node.id
            ? `Stop starting new ${kindPlural(node.kind, project.settings).toLowerCase()} from this`
            : `Start new ${kindPlural(node.kind, project.settings).toLowerCase()} from this`}
        </K.Item>
      )}
      {shown("menu.beat-sheet") && containerKinds.includes(node.kind) && (
        <K.Item onSelect={() => saveAsSheet(node.id)}>
          <Icon name="widget-2-linear" />
          Save as a beat sheet
        </K.Item>
      )}
      <K.Item disabled={!can("edit")} onSelect={() => setUi({ renamingId: node.id })}>
        <Icon name="text-field-linear" />
        Rename
        <K.Shortcut>F2</K.Shortcut>
      </K.Item>
      {shown("menu.duplicate") && (
        <K.Item onSelect={() => void actions.duplicate(node.id)}>
          <Icon name="copy-linear" />
          Duplicate
        </K.Item>
      )}
      <K.Sub>
        <K.SubTrigger disabled={!can("edit")}>
          <Icon name="folder-linear" />
          Move to…
        </K.SubTrigger>
        <K.SubContent className="max-h-[70vh] w-60 overflow-y-auto">
          <K.Item disabled={!moveUp(index, node.id)} onSelect={() => place(node.id, moveUp(index, node.id))}>
            <Icon name="arrow-up-linear" />
            Move up
            <K.Shortcut>{formatHotkey("alt+arrowup")}</K.Shortcut>
          </K.Item>
          <K.Item disabled={!moveDown(index, node.id)} onSelect={() => place(node.id, moveDown(index, node.id))}>
            <Icon name="arrow-down-linear" />
            Move down
            <K.Shortcut>{formatHotkey("alt+arrowdown")}</K.Shortcut>
          </K.Item>
          <K.Separator />
          <K.Label className="text-xs font-normal text-muted-foreground">Into a folder</K.Label>
          <K.Item disabled={node.parentId === null} onSelect={() => place(node.id, moveInto(index, node.id, null))}>
            <Icon name="list-linear" />
            Top of the binder
          </K.Item>
          {targets.map(({ node: target, depth }) => (
            <K.Item key={target.id} disabled={node.parentId === target.id} onSelect={() => place(node.id, moveInto(index, node.id, target.id))}>
              <span aria-hidden style={{ width: depth * 12 }} className="shrink-0" />
              <NodeIcon node={target} className="size-4 shrink-0" />
              <span className="truncate">{target.title}</span>
            </K.Item>
          ))}
        </K.SubContent>
      </K.Sub>
      {shown("menu.kind") && (
        <K.Sub>
          <K.SubTrigger disabled={!can("edit")}>
            <Icon name={nodeKindMeta[node.kind].icon} />
            Change type
          </K.SubTrigger>
          <K.SubContent className="max-h-[70vh] w-48 overflow-y-auto">
            {(isDocumentKind(node.kind) ? plainKinds : [node.kind]).map((k: NodeKind) => (
              <K.Item key={k} disabled={k === node.kind} onSelect={() => void actions.update(node.id, { kind: k })}>
                <Icon name={nodeKindMeta[k].icon} />
                {words.label(k)}
              </K.Item>
            ))}
            {isDocumentKind(node.kind) &&
              modules.has("world") &&
              entityTypes.map((type) => (
                <K.Item key={type.id} disabled={node.entityTypeId === type.id} onSelect={() => void actions.update(node.id, { kind: "entity", entityTypeId: type.id })}>
                  <EntityIcon type={type} />
                  {type.name}
                </K.Item>
              ))}
          </K.SubContent>
        </K.Sub>
      )}
      {shown("menu.status") && (
        <K.Sub>
          <K.SubTrigger disabled={!can("edit")}>
            <StatusDot status={node.status} className="mx-[5px]" title={false} />
            Status
          </K.SubTrigger>
          <K.SubContent className="w-44">
            {stages.map((stage) => (
              <K.Item key={stage.id} disabled={stage.id === node.status} onSelect={() => void actions.update(node.id, { status: stage.id })}>
                <StatusDot status={stage.id} className="mx-[5px]" title={false} />
                {stage.label}
              </K.Item>
            ))}
          </K.SubContent>
        </K.Sub>
      )}
      <K.Separator />
      {shown("menu.io") && (
        <>
          {containerKinds.includes(node.kind) && (
            <K.Item disabled={!can("edit")} onSelect={() => setUi({ io: { mode: "import", nodeId: node.id } })}>
              <Icon name="import-linear" />
              Import…
            </K.Item>
          )}
          <K.Item onSelect={() => setUi({ io: { mode: "export", nodeId: node.id } })}>
            <Icon name="export-linear" />
            Export…
          </K.Item>
          <K.Separator />
        </>
      )}
      <K.Item variant="destructive" disabled={!can("delete")} onSelect={() => void actions.trash(node.id)}>
        <Icon name="trash-bin-minimalistic-linear" />
        Move to Trash
        <K.Shortcut>{trashKeyLabel()}</K.Shortcut>
      </K.Item>
    </>
  );
}

// ---- Trash ----------------------------------------------------------------------

const notes = (n: number) => `${n.toLocaleString()} ${plural(n, "note")}`;

function Trash({ nodes, index }: { nodes: BinderNode[]; index: NodeIndex }) {
  const { actions } = useWorkspace();
  const [open, setOpen] = useState(false);

  const destroy = async (node: BinderNode) => {
    const inside = countWithin(index, node.id) - 1;
    const ok = await confirm({
      title: `Delete ‘${node.title}’ forever?`,
      description: inside
        ? `It and the ${notes(inside)} inside it are deleted for good. This can't be undone.`
        : "It's deleted for good. This can't be undone.",
      confirmLabel: "Delete forever",
    });
    if (ok) void actions.destroy(node.id);
  };

  const emptyTrash = async () => {
    const count = nodes.reduce((sum, node) => sum + countWithin(index, node.id), 0);
    const ok = await confirm({
      title: "Empty the trash?",
      description: `${notes(count)} ${count === 1 ? "is" : "are"} deleted for good. This can't be undone.`,
      confirmLabel: "Empty trash",
    });
    if (ok) void actions.emptyTrash();
  };

  return (
    <div className="shrink-0 border-t border-sidebar-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-9 w-full items-center gap-2 px-3 text-ui-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset pointer-coarse:h-11"
      >
        <Icon name="trash-bin-trash-linear" className="size-4" />
        Trash
        {nodes.length > 0 && (
          <span className="text-xs text-faint">
            {nodes.length}
            <span className="sr-only"> {plural(nodes.length, "note")}</span>
          </span>
        )}
        <Icon name="alt-arrow-up-linear" className={cn("ml-auto size-3.5 transition-transform duration-200 ease-out", !open && "rotate-180")} />
      </button>
      {open && (
        <div className="max-h-56 overflow-y-auto pb-2">
          {nodes.length === 0 ? (
            <p className="px-4 py-2 text-sm text-muted-foreground">Nothing in the trash. Notes you move here can be put back.</p>
          ) : (
            <>
              <ul aria-label="In the trash">
                {nodes.map((node) => (
                  <li key={node.id} className="group mx-1.5 flex h-7 items-center gap-1 rounded-md pr-1 pl-2 text-ui-sm hover:bg-sidebar-accent pointer-coarse:h-10">
                    <NodeIcon node={node} className="size-4 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate pl-1 text-muted-foreground line-through decoration-faint">{node.title}</span>
                    <IconButton
                      icon="restart-linear"
                      label={`Put back ‘${node.title}’`}
                      size="xs"
                      onClick={() => void actions.restore(node.id)}
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                    />
                    <IconButton
                      icon="trash-bin-trash-linear"
                      label={`Delete ‘${node.title}’ forever`}
                      size="xs"
                      variant="destructive"
                      onClick={() => void destroy(node)}
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                    />
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void emptyTrash()}
                className="mx-3 mt-1 rounded-sm px-1 py-1 text-sm text-muted-foreground outline-none hover:text-destructive focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                Empty trash…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
