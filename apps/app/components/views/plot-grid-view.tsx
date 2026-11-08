"use client";

import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { confirm } from "@plotra/ui/components/dialogs";
import { IconButton } from "@plotra/ui/components/icon-button";
import { undoToast } from "@plotra/ui/components/sonner";
import { generateKeyBetween } from "fractional-indexing";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { StatusDot } from "@/components/workspace/status";
import { useViewSetting } from "@/components/workspace/shell-prefs";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { STORY_NOTICE, useStory } from "@/components/workflow/data";
import { createThread, deleteThread, setSceneThread, updateThread, type PlotThread, type SceneThreadCell } from "@/lib/story-actions";
import { propertyText } from "@/lib/property-text";
import { swatches } from "@/lib/story";
import { ancestors, flatten, nodeKindMeta, type BinderNode } from "@/lib/tree";
import { useEditableCard } from "./use-editable-card";
import { EmptyState, errorText, Swatches, ToolButton, Toolbar } from "./view-ui";
import { SelectField } from "@plotra/ui/components/select-field";
import { plural } from "@/lib/plural";

// Plot grid (plan.md 2.5): scenes down the side in reading order, plot threads
// across the top; each cell says what happens to that thread in that scene,
// like Plottr or Aeon. A filled (or dotted) cell puts the scene in the thread,
// which is also how the timeline groups scenes into thread lanes.

const rowKinds = new Set(["scene", "chapter"]);

const focusRing = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Closes a small popover on a press outside `ref`. Presses inside a menu it
 * opened (a select's list, portalled elsewhere) don't count. Escape is handled
 * by the popover's own onKeyDown (`escapeTo`).
 */
function useCloseOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || ref.current?.contains(target) || target.closest("[data-radix-popper-content-wrapper]")) return;
      closeRef.current();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, ref]);
}

const escapeTo = (close: () => void) => (e: React.KeyboardEvent) => {
  // A select's list is portalled but still bubbles here through React; its Escape closes only the list.
  if (e.key !== "Escape" || !e.currentTarget.contains(e.target as Node)) return;
  e.stopPropagation();
  close();
};

export function PlotGridView({ nodeId }: { nodeId?: string }) {
  const { project, binder, openNode, notify, actions, propertyDefs } = useWorkspace();
  const { index } = useStore(binder);
  const { data: story, refresh } = useStory();
  const [pending, setPending] = useState<Record<string, string | null>>({});
  const canEditProject = project.actions.includes("edit");
  // The rows, remembered for the person (useViewSetting): chapters as rows of their own, scenes' synopses, and scene fields as columns.
  const [chapterRows, setChapterRows] = useViewSetting("plotgrid.chapters", true, (v) => (typeof v === "boolean" ? v : undefined));
  const [synopses, setSynopses] = useViewSetting("plotgrid.synopsis", true, (v) => (typeof v === "boolean" ? v : undefined));
  const [fields, setFields] = useViewSetting<string[]>("plotgrid.fields", [], (v) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : undefined));
  const [rowMenu, setRowMenu] = useState(false);
  const rowMenuRef = useRef<HTMLDivElement>(null);
  useCloseOutside(rowMenuRef, rowMenu, () => setRowMenu(false));
  const sceneDefs = useStore(propertyDefs).filter((d) => d.nodeKind === "scene").sort((a, b) => (a.position < b.position ? -1 : 1));
  const fieldDefs = fields.flatMap((key) => sceneDefs.filter((d) => d.key === key));

  const root = nodeId ? index.byId.get(nodeId) : undefined;
  const rows = useMemo(() => {
    const list = flatten(index, root?.id ?? null).filter((n) => rowKinds.has(n.kind) && (chapterRows || n.kind !== "chapter"));
    return list;
  }, [chapterRows, index, root?.id]);
  const threads = story?.threads ?? [];
  const cells = useMemo(() => {
    const map = new Map<string, SceneThreadCell>();
    for (const c of story?.cells ?? []) map.set(`${c.nodeId}:${c.threadId}`, c);
    return map;
  }, [story?.cells]);

  const changed = () => {
    notify(STORY_NOTICE);
    refresh();
  };
  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
      changed();
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const noteFor = (nodeId: string, threadId: string): string | null => {
    const key = `${nodeId}:${threadId}`;
    if (key in pending) return pending[key];
    return cells.get(key)?.note ?? null;
  };

  const cellCount = (threadId: string) => (story?.cells ?? []).filter((c) => c.threadId === threadId).length;

  const removeThread = async (thread: PlotThread) => {
    const count = cellCount(thread.id);
    const ok = await confirm({
      title: count ? `Delete ‘${thread.name}’ and its ${count} ${plural(count, "cell")}?` : `Delete ‘${thread.name}’?`,
      description: count
        ? "What you wrote in its cells is deleted with it, and its scenes leave the thread. This can't be undone."
        : "The thread's column is removed from the grid. This can't be undone.",
      confirmLabel: "Delete thread",
    });
    if (ok) void run(() => deleteThread(project.id, thread.id));
  };

  const setCell = (node: BinderNode, thread: PlotThread, note: string | null) => {
    const key = `${node.id}:${thread.id}`;
    setPending((p) => ({ ...p, [key]: note }));
    void run(() => setSceneThread(project.id, node.id, thread.id, note)).finally(() =>
      setPending((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      }),
    );
  };

  const moveThread = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= threads.length) return;
    const [lo, hi] = by < 0 ? [threads[j - 1]?.position ?? null, threads[j].position] : [threads[j].position, threads[j + 1]?.position ?? null];
    void run(() => updateThread(project.id, threads[i].id, { position: generateKeyBetween(lo, hi) }));
  };

  if (!story) return <div className="m-6 h-40 animate-pulse rounded-lg bg-muted" />;

  return (
    <div className="flex h-full flex-col">
      <Toolbar>
        <span className="font-medium text-foreground">{root ? `Plot grid: ${root.title}` : "Plot grid"}</span>
        <ToolButton
          icon="add-square-linear"
          label="Add a plot thread"
          disabled={!canEditProject}
          onClick={() => void run(() => createThread(project.id, {}))}
        >
          Thread
        </ToolButton>
        <div className="relative" ref={rowMenuRef} onKeyDown={escapeTo(() => setRowMenu(false))}>
          <ToolButton icon="widget-2-linear" label="What the rows show" pressed={rowMenu} onClick={() => setRowMenu(!rowMenu)}>
            Rows
          </ToolButton>
          {rowMenu && (
            <div className="absolute top-full left-0 z-30 mt-1 grid w-56 gap-1 rounded-lg border bg-popover p-3 text-ui-sm shadow-lg">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={chapterRows} onChange={(e) => setChapterRows(e.target.checked)} className="size-4 accent-[var(--ember)]" />
                Chapters as rows
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={synopses} onChange={(e) => setSynopses(e.target.checked)} className="size-4 accent-[var(--ember)]" />
                Each scene&apos;s synopsis
              </label>
              {sceneDefs.length > 0 && (
                <>
                  <span className="mt-1 text-meta font-medium text-muted-foreground">Fields as columns</span>
                  {sceneDefs.map((d) => (
                    <label key={d.id} className="flex items-center gap-2">
                      <input type="checkbox" checked={fields.includes(d.key)} onChange={(e) => setFields(e.target.checked ? [...fields, d.key] : fields.filter((f) => f !== d.key))} className="size-4 accent-[var(--ember)]" />
                      <span className="truncate">{d.label}</span>
                    </label>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
        <span className="ml-auto hidden text-meta text-muted-foreground lg:inline">Choose a cell to write what happens to that thread in that scene.</span>
      </Toolbar>
      {rows.length === 0 ? (
        <EmptyState icon="widget-2-linear" title="No scenes yet" action={canEditProject && { label: "New scene", onClick: () => void actions.create("scene", root?.id) }}>
          Add a scene in the binder{root ? `, inside ${root.title}` : ""}. Scenes become rows here, and each plot thread a column.
        </EmptyState>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="border-separate border-spacing-0 text-ui-sm">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 min-w-64 border-r border-b bg-sidebar px-3 py-2 text-left text-meta font-medium text-muted-foreground">
                  Scene
                </th>
                {fieldDefs.map((d) => (
                  <th key={d.id} className="min-w-28 border-r border-b bg-sidebar px-3 py-2 text-left text-meta font-medium text-muted-foreground">
                    {d.label}
                  </th>
                ))}
                {threads.map((t, i) => (
                  <ThreadHeader
                    key={t.id}
                    thread={t}
                    editable={canEditProject}
                    onRename={(name) => void run(() => updateThread(project.id, t.id, { name }))}
                    onColor={(color) => void run(() => updateThread(project.id, t.id, { color }))}
                    scenes={rows.filter((n) => n.kind === "scene")}
                    onClose={(closedNodeId) => void run(() => updateThread(project.id, t.id, { closedNodeId }))}
                    onMove={(by) => moveThread(i, by)}
                    onDelete={() => void removeThread(t)}
                  />
                ))}
                {threads.length === 0 && (
                  <th className="border-b bg-sidebar px-4 py-2 text-left font-normal text-muted-foreground">Add a plot thread to start the grid.</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => {
                const depth = ancestors(index, n.id).length - (root ? ancestors(index, root.id).length + 1 : 0);
                const canEdit = n.actions.includes("edit");
                if (n.kind === "chapter") {
                  return (
                    <tr key={n.id}>
                      <td className="sticky left-0 z-10 border-r border-b bg-muted/60 px-3 py-1.5" style={{ paddingLeft: 12 + depth * 14 }}>
                        <button type="button" onClick={() => openNode(n.id, "tab")} className="flex items-center gap-1.5 font-display text-base hover:underline">
                          <Icon name={nodeKindMeta[n.kind].icon} className="size-4 text-muted-foreground" />
                          {n.title}
                        </button>
                      </td>
                      <td colSpan={Math.max(threads.length, 1) + fieldDefs.length} className="border-b bg-muted/60" />
                    </tr>
                  );
                }
                return (
                  <tr key={n.id} className="group/row">
                    <td className="sticky left-0 z-10 max-w-80 border-r border-b bg-background px-3 py-2 align-top" style={{ paddingLeft: 12 + depth * 14 }}>
                      <button type="button" onClick={() => openNode(n.id, "tab")} className="flex items-center gap-1.5 text-left hover:underline">
                        <StatusDot status={n.status} />
                        <span className="font-medium">{n.title}</span>
                      </button>
                      {synopses && n.synopsis && <p className="mt-0.5 line-clamp-2 pl-3 text-xs text-muted-foreground">{n.synopsis}</p>}
                    </td>
                    {fieldDefs.map((d) => (
                      <td key={d.id} className="max-w-48 border-r border-b px-3 py-2 align-top text-xs text-muted-foreground">
                        <span className="line-clamp-3">{propertyText(d.type, n.properties[d.key], (id) => index.byId.get(id)?.title)}</span>
                      </td>
                    ))}
                    {threads.map((t) => (
                      <Cell
                        key={t.id}
                        note={noteFor(n.id, t.id)}
                        color={t.color}
                        scene={n.title || "Untitled"}
                        threadName={t.name}
                        editable={canEdit}
                        onChange={(note) => setCell(n, t, note)}
                      />
                    ))}
                    {threads.length === 0 && <td className="border-b" />}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ThreadHeader({
  thread,
  editable,
  scenes,
  onRename,
  onColor,
  onClose,
  onMove,
  onDelete,
}: {
  thread: PlotThread;
  editable: boolean;
  scenes: BinderNode[];
  onClose: (closedNodeId: string | null) => void;
  onRename: (name: string) => void;
  onColor: (color: string) => void;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(thread.name);
  const [synced, setSynced] = useState(thread.name);
  const [menu, setMenu] = useState(false);
  const headerRef = useRef<HTMLTableCellElement>(null);
  useCloseOutside(headerRef, menu, () => setMenu(false));
  if (thread.name !== synced) {
    setSynced(thread.name);
    setName(thread.name);
  }
  return (
    <th ref={headerRef} onKeyDown={escapeTo(() => setMenu(false))} className="relative w-56 min-w-56 border-r border-b bg-sidebar p-0 text-left font-normal" style={{ borderTop: `3px solid ${thread.color}` }}>
      <div className="flex items-center gap-1 px-2 py-1.5">
        <input
          value={name}
          aria-label={thread.closedNodeId ? "Thread name (resolved)" : "Thread name"}
          title={thread.closedNodeId ? "This thread is resolved" : undefined}
          readOnly={!editable}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== thread.name && onRename(name)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="h-7 min-w-0 flex-1 rounded bg-transparent px-1 font-medium outline-none focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        {editable && (
          <IconButton icon="menu-dots-linear" size="xs" label={`Options for ${thread.name}`} aria-expanded={menu} onClick={() => setMenu(!menu)} />
        )}
      </div>
      {menu && (
        <div role="group" aria-label={`Options for ${thread.name}`} className="absolute top-full right-1 z-40 mt-1 grid w-52 gap-2 rounded-lg border bg-popover p-2.5 shadow-lg">
          <Swatches value={thread.color} allowNone={false} onChange={(c) => onColor(c ?? swatches[0])} />
          <div className="flex gap-1">
            <button type="button" onClick={() => onMove(-1)} className={cn("h-8 flex-1 rounded-md text-ui-sm hover:bg-accent", focusRing)}>
              ← Move left
            </button>
            <button type="button" onClick={() => onMove(1)} className={cn("h-8 flex-1 rounded-md text-ui-sm hover:bg-accent", focusRing)}>
              Move right →
            </button>
          </div>
          {/* The scene that resolves the thread: later scenes in it are a continuity warning. */}
          <label className="grid gap-1 text-meta font-medium text-muted-foreground">
            Resolved in
            <SelectField
              value={thread.closedNodeId ?? ""}
              onValueChange={(v) => onClose(v || null)}
              className="h-8 w-full rounded-md border border-input bg-background px-1.5 text-ui-sm font-normal text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">Still open</option>
              {scenes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </SelectField>
          </label>
          <button type="button" onClick={onDelete} className={cn("h-8 rounded-md text-ui-sm text-destructive hover:bg-destructive/10", focusRing)}>
            Delete thread
          </button>
        </div>
      )}
    </th>
  );
}

function Cell({
  note,
  color,
  scene,
  threadName,
  editable,
  onChange,
}: {
  note: string | null;
  color: string;
  scene: string;
  threadName: string;
  editable: boolean;
  onChange: (note: string | null) => void;
}) {
  const [draft, setDraft] = useState(note ?? "");
  const { editing, startEditing, finishEditing, cancelEditing, cardRef } = useEditableCard<HTMLButtonElement>({
    disabled: !editable,
    onCancel: () => setDraft(note ?? ""),
  });
  const member = note !== null;
  const noteId = useId();

  if (editing) {
    return (
      <td className="border-r border-b p-0 align-top">
        <textarea
          autoFocus
          value={draft}
          rows={3}
          aria-label={`Note for ${scene} in ${threadName}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            finishEditing();
            if (draft !== (note ?? "") && (member || draft.trim())) onChange(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancelEditing();
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.currentTarget.blur();
              finishEditing(true);
            }
          }}
          className="block h-full min-h-20 w-full resize-none bg-background px-2.5 py-2 text-ui-sm leading-snug outline-none ring-2 ring-ember/50 ring-inset"
        />
      </td>
    );
  }

  const clear = () => {
    const before = note;
    onChange(null);
    undoToast(`Took the scene out of ‘${threadName}’`, () => onChange(before));
  };

  const content = member ? (
    note ? (
      <span id={noteId} className="line-clamp-5 text-ui-sm leading-snug whitespace-pre-wrap">
        {note}
      </span>
    ) : (
      <>
        <span className="inline-block size-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="sr-only">In this thread, nothing written</span>
      </>
    )
  ) : (
    editable && (
      <span aria-hidden className="text-faint opacity-0 group-hover/cell:opacity-100 group-focus-within/cell:opacity-100 pointer-coarse:opacity-100">
        +
      </span>
    )
  );

  return (
    <td
      className={cn("group/cell relative border-r border-b p-0 align-top", editable && "hover:bg-accent/40")}
      style={member ? { backgroundColor: `color-mix(in oklab, ${color} 9%, transparent)` } : undefined}
    >
      {editable ? (
        // Enter or Space starts editing, as a click does.
        <button
          ref={cardRef}
          type="button"
          aria-label={member ? `Edit the note for ${scene} in ${threadName}` : `Add ${scene} to ${threadName}`}
          aria-describedby={note ? noteId : undefined}
          onClick={() => {
            setDraft(note ?? "");
            startEditing();
          }}
          className={cn("block min-h-10 w-full cursor-text px-2.5 py-2 text-left align-top focus-visible:ring-inset", focusRing)}
        >
          {content}
        </button>
      ) : (
        <div className="min-h-10 px-2.5 py-2">{content}</div>
      )}
      {member && editable && (
        <IconButton
          icon="close-linear"
          size="xs"
          label="Take the scene out of this thread"
          onClick={clear}
          className="absolute top-1 right-1 bg-background/70 opacity-0 group-hover/cell:opacity-100 group-focus-within/cell:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
        />
      )}
    </td>
  );
}
