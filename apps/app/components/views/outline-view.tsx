"use client";

import type { NodeKind, WorkflowStage } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plotra/ui/components/dropdown-menu";
import { IconButton } from "@plotra/ui/components/icon-button";
import { cn } from "@plotra/ui/lib/utils";
import { useMemo, useState } from "react";
import { PropertyInput } from "@/components/workspace/properties";
import { useStore } from "@/components/workspace/stores";
import { nodeTags } from "@/components/workspace/tags-pane";
import { useHorizon } from "@/components/world/data";
import { useViewSetting } from "@/components/workspace/shell-prefs";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import type { PropertyDef } from "@/lib/knowledge-actions";
import { ancestors, flatten, liveChildren, nodeKindMeta, type BinderNode } from "@/lib/tree";
import { CommitInput, EmptyState, Toolbar, ToolbarSelect } from "./view-ui";
import { useVocabulary } from "@/components/workspace/vocabulary";
import { SelectField } from "@plotra/ui/components/select-field";
import { plural } from "@/lib/plural";

// Outline (plan.md 2.5): the binder as a table, a lightweight "Dataview" for
// stories. Property columns, inline editing, sorting and filters.

type SortKey = "binder" | "title" | "kind" | "status" | "words" | `prop:${string}`;


function sortValue(n: BinderNode, key: SortKey, index: Map<string, BinderNode>, stages: WorkflowStage[]): string | number {
  switch (key) {
    case "title":
      return n.title.toLowerCase();
    case "kind":
      return n.kind;
    case "status":
      return stages.findIndex((s) => s.id === n.status);
    case "words":
      return n.wordCount;
    default: {
      const v = n.properties[key.slice(5)];
      if (v === undefined || v === null) return "￿";
      if (typeof v === "number") return v;
      const first = Array.isArray(v) ? v[0] : String(v);
      return (index.get(String(first))?.title ?? String(first ?? "")).toLowerCase();
    }
  }
}

export function OutlineView() {
  const { binder, propertyDefs, openNode, actions, stages, project, setUi } = useWorkspace();
  const words = useVocabulary();
  const { index } = useStore(binder);
  const defs = useStore(propertyDefs);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<NodeKind | "all">("all");
  const [status, setStatus] = useState<string>("all");
  const [tag, setTag] = useState("all");
  // The sort and the columns are remembered for the person, in every project (useViewSetting).
  const [savedSort, saveSort] = useViewSetting<string>("outline.sort", "binder:1", (v) => (typeof v === "string" ? v : undefined));
  const sort = useMemo(() => {
    // "words:-1", "prop:pov:1": the direction is after the last colon.
    const at = savedSort.lastIndexOf(":");
    const key = savedSort.slice(0, at);
    const valid = ["binder", "title", "kind", "status", "words"].includes(key) || /^prop:[a-z0-9-]{1,60}$/.test(key);
    return { key: valid ? (key as SortKey) : "binder", dir: savedSort.slice(at + 1) === "-1" ? -1 : 1 } as { key: SortKey; dir: 1 | -1 };
  }, [savedSort]);
  const setSort = (next: (s: { key: SortKey; dir: 1 | -1 }) => { key: SortKey; dir: 1 | -1 }) => {
    const s = next(sort);
    saveSort(`${s.key}:${s.dir}`);
  };
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [columns, saveColumns] = useViewSetting<string[]>("outline.columns", ["pov", "story-date"], (v) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : undefined));

  // One column per property key, whichever kinds define it.
  const propertyColumns = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string }>();
    for (const d of defs) if (!byKey.has(d.key)) byKey.set(d.key, { key: d.key, label: d.label });
    return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [defs]);
  const shownColumns = propertyColumns.filter((c) => columns.includes(c.key));
  const defFor = (n: BinderNode, key: string): PropertyDef | undefined => defs.find((d) => d.nodeKind === n.kind && d.key === key);

  // Under a spoiler horizon the outline only lists what the audience knows by then (and the folders holding it).
  const horizon = useHorizon();
  const all = useMemo(() => flatten(index).filter((n) => !horizon || horizon.shows(n.id)), [horizon, index]);
  const tags = useMemo(() => [...new Set(all.flatMap(nodeTags))].sort(), [all]);
  const q = query.trim().toLowerCase();
  const filtering = q || kind !== "all" || status !== "all" || tag !== "all";
  const matches = (n: BinderNode) =>
    (!q || n.title.toLowerCase().includes(q) || (n.synopsis ?? "").toLowerCase().includes(q)) &&
    (kind === "all" || n.kind === kind) &&
    (status === "all" || n.status === status) &&
    (tag === "all" || nodeTags(n).some((t) => t === tag || t.startsWith(`${tag}/`)));

  // Tree order unless sorted or filtered; then a flat list.
  const rows = useMemo(() => {
    if (sort.key === "binder" && !filtering) {
      const out: BinderNode[] = [];
      const walk = (parentId: string | null) => {
        for (const n of liveChildren(index, parentId)) {
          if (horizon && !horizon.shows(n.id)) continue;
          out.push(n);
          if (!collapsed.has(n.id)) walk(n.id);
        }
      };
      walk(null);
      return out;
    }
    const list = all.filter(matches);
    if (sort.key !== "binder") {
      list.sort((a, b) => {
        const x = sortValue(a, sort.key, index.byId, stages);
        const y = sortValue(b, sort.key, index.byId, stages);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
    }
    return list;
    // matches is derived from the filter state listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, collapsed, filtering, horizon, index, kind, q, sort, stages, status, tag]);

  const header = (key: SortKey, label: string, className?: string) => (
    <th key={key} className={cn("border-b bg-sidebar px-2 py-1.5 text-left text-meta font-medium whitespace-nowrap text-muted-foreground", className)}>
      <button
        type="button"
        onClick={() => setSort((s) => (s.key === key ? (s.dir === 1 ? { key, dir: -1 } : { key: "binder", dir: 1 }) : { key, dir: 1 }))}
        aria-label={`Sort by ${label.toLowerCase()}${sort.key === key ? (sort.dir === 1 ? ", sorted ascending" : ", sorted descending") : ""}`}
        className="flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {label}
        {sort.key === key && <Icon name={sort.dir === 1 ? "alt-arrow-down-linear" : "alt-arrow-up-linear"} className="size-3" />}
      </button>
    </th>
  );

  const canAdd = project.actions.includes("edit");
  // Who may change the project's note types and their fields.
  const canManage = project.actions.includes("manage");
  const totalWords = rows.reduce((n, r) => n + r.wordCount, 0);

  return (
    <div className="flex h-full flex-col">
      <Toolbar>
        <div className="flex h-8 w-56 shrink-0 items-center gap-1.5 rounded-md border border-input px-2 focus-within:ring-[3px] focus-within:ring-ring/50">
          <Icon name="magnifer-linear" className="size-3.5 text-muted-foreground" />
          <input
            type="search"
            aria-label="Filter by title or synopsis"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title or synopsis"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint"
          />
        </div>
        <ToolbarSelect
          label="Kind"
          value={kind}
          onChange={setKind}
          options={[{ value: "all", label: "All kinds" }, ...Object.entries(nodeKindMeta).map(([k, m]) => ({ value: k as NodeKind, label: m.label }))]}
        />
        <ToolbarSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[{ value: "all", label: "Any status" }, ...stages.map((s) => ({ value: s.id, label: s.label }))]}
        />
        {tags.length > 0 && <ToolbarSelect label="Tag" value={tag} onChange={setTag} options={[{ value: "all", label: "Any tag" }, ...tags.map((t) => ({ value: t, label: `#${t}` }))]} />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-accent data-[state=open]:text-foreground pointer-coarse:h-10"
            >
              <Icon name="table-columns-split-linear" className="size-4" />
              Columns
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-60">
            {propertyColumns.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.key}
                checked={columns.includes(c.key)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(checked) => saveColumns(checked ? [...columns, c.key] : columns.filter((k) => k !== c.key))}
              >
                {c.label}
              </DropdownMenuCheckboxItem>
            ))}
            {propertyColumns.length === 0 && (
              <>
                <p className="px-2 py-1.5 text-meta text-muted-foreground">
                  Fields such as point of view or story date become columns here. Add them to a note type in Project settings → Note types.
                </p>
                {canManage && (
                  <DropdownMenuItem onSelect={() => setUi({ projectSettings: true })}>
                    <Icon name="settings-linear" />
                    Open project settings
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </Toolbar>
      {rows.length === 0 ? (
        filtering ? (
          <EmptyState
            icon="magnifer-linear"
            title="Nothing matches"
            action={{
              label: "Clear filters",
              icon: "close-circle-linear",
              onClick: () => {
                setQuery("");
                setKind("all");
                setStatus("all");
                setTag("all");
              },
            }}
          >
            No notes match these filters. Try fewer words, or clear the filters to see everything.
          </EmptyState>
        ) : (
          <EmptyState
            icon="list-linear"
            title="Nothing to outline yet"
            action={canAdd && { label: "New scene", onClick: () => void actions.create("scene", null) }}
          >
            Every scene, chapter and note in your binder shows here as a row you can sort, filter and edit.
          </EmptyState>
        )
      ) : (
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-ui-sm">
          <thead className="sticky top-0 z-10">
            <tr>
              {header("title", "Title", "min-w-72")}
              {header("kind", "Kind")}
              {header("status", "Status")}
              <th className="min-w-64 border-b bg-sidebar px-2 py-1.5 text-left text-meta font-medium text-muted-foreground">Synopsis</th>
              {shownColumns.map((c) => header(`prop:${c.key}`, c.label, "min-w-44"))}
              {header("words", "Words", "text-right")}
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => {
              const canEdit = n.actions.includes("edit");
              const depth = sort.key === "binder" && !filtering ? ancestors(index, n.id).length : 0;
              const hasKids = liveChildren(index, n.id).length > 0;
              return (
                <tr key={n.id} className="group/row hover:bg-accent/30">
                  <td className="border-b px-2 py-1" style={{ paddingLeft: 8 + depth * 16 }}>
                    <div className="flex items-center gap-1">
                      {hasKids && sort.key === "binder" && !filtering ? (
                        <button
                          type="button"
                          aria-label={collapsed.has(n.id) ? `Expand ${n.title}` : `Collapse ${n.title}`}
                          aria-expanded={!collapsed.has(n.id)}
                          onClick={() =>
                            setCollapsed((s) => {
                              const next = new Set(s);
                              if (!next.delete(n.id)) next.add(n.id);
                              return next;
                            })
                          }
                          className="relative grid size-6 shrink-0 place-items-center rounded text-muted-foreground outline-none after:absolute after:-inset-1 after:content-[''] hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                          <Icon name={collapsed.has(n.id) ? "alt-arrow-right-linear" : "alt-arrow-down-linear"} className="size-3.5" />
                        </button>
                      ) : (
                        <span className="size-6 shrink-0" />
                      )}
                      <Icon name={nodeKindMeta[n.kind].icon} className="size-4 shrink-0 text-muted-foreground" />
                      <label className="min-w-0 flex-1">
                        <span className="sr-only">Title</span>
                        <CommitInput value={n.title} disabled={!canEdit} className="border-transparent font-medium hover:border-input" onCommit={(title) => title.trim() && void actions.update(n.id, { title })} />
                      </label>
                      <IconButton
                        icon="square-arrow-right-up-linear"
                        label={`Open ${n.title}`}
                        size="xs"
                        onClick={(e) => openNode(n.id, e.metaKey || e.ctrlKey ? "tab" : "replace")}
                        className="opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                      />
                    </div>
                  </td>
                  <td className="border-b px-2 py-1 whitespace-nowrap text-muted-foreground">{words.label(n.kind)}</td>
                  <td className="border-b px-2 py-1">
                    <SelectField
                      disabled={!canEdit}
                      value={n.status}
                      onValueChange={(v) => void actions.update(n.id, { status: v })}
                      aria-label={`Status of ${n.title}`}
                      className="h-7 rounded-md border border-transparent bg-transparent px-1 outline-none hover:border-input focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      {!stages.some((s) => s.id === n.status) && <option value={n.status}>{n.status}</option>}
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </SelectField>
                  </td>
                  <td className="border-b px-2 py-1">
                    <label className="block">
                      <span className="sr-only">Synopsis of {n.title}</span>
                      <CommitInput
                        value={n.synopsis ?? ""}
                        placeholder="—"
                        disabled={!canEdit}
                        className="border-transparent hover:border-input"
                        onCommit={(synopsis) => void actions.update(n.id, { synopsis: synopsis.trim() || null })}
                      />
                    </label>
                  </td>
                  {shownColumns.map((c) => {
                    const def = defFor(n, c.key);
                    return (
                      <td key={c.key} className="border-b px-1 py-0.5">
                        {def ? <PropertyInput def={def} node={n} disabled={!canEdit} /> : <span className="px-2 text-faint">·</span>}
                      </td>
                    );
                  })}
                  <td className="border-b px-2 py-1 text-right text-muted-foreground tabular-nums">{n.wordCount.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0">
            <tr>
              <td colSpan={4 + shownColumns.length} className="border-t bg-sidebar px-3 py-1.5 text-meta text-muted-foreground">
                {rows.length} {plural(rows.length, "item")}
              </td>
              <td className="border-t bg-sidebar px-2 py-1.5 text-right text-meta text-muted-foreground tabular-nums">{totalWords.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      )}
    </div>
  );
}
