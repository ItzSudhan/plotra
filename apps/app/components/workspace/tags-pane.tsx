"use client";

import { Icon } from "@plotra/icons";
import { IconButton } from "@plotra/ui/components/icon-button";
import { cn } from "@plotra/ui/lib/utils";
import { useMemo, useState } from "react";
import { flatten, nodeIcon, type BinderNode } from "@/lib/tree";
import { useStore } from "./stores";
import { useWorkspace } from "./workspace-provider";

// Tags pane (plan.md 2.4): every tag in the project, nested by "/", from both
// the Tags property and #tags written in the text.

type TagNode = { name: string; path: string; count: number; children: Map<string, TagNode> };

export const nodeTags = (n: BinderNode) => [...new Set([...n.tags, ...n.contentTags])];

function buildTree(nodes: BinderNode[]) {
  const root: TagNode = { name: "", path: "", count: 0, children: new Map() };
  for (const n of nodes) {
    // Count a note once per tag level, even if it has several tags below it.
    const seen = new Set<string>();
    for (const tag of nodeTags(n)) {
      let cursor = root;
      let path = "";
      for (const part of tag.split("/").filter(Boolean)) {
        path = path ? `${path}/${part}` : part;
        let child = cursor.children.get(part);
        if (!child) {
          child = { name: part, path, count: 0, children: new Map() };
          cursor.children.set(part, child);
        }
        if (!seen.has(path)) {
          child.count++;
          seen.add(path);
        }
        cursor = child;
      }
    }
  }
  return root;
}

function TagRow({
  tag,
  depth,
  selected,
  onSelect,
}: {
  tag: TagNode;
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const children = [...tag.children.values()].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <li>
      <div
        className={cn(
          "group flex h-8 items-center gap-1 rounded-md pr-2 text-ui-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
          selected === tag.path && "bg-sidebar-accent text-foreground",
        )}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        {children.length ? (
          <IconButton
            icon={open ? "alt-arrow-down-linear" : "alt-arrow-right-linear"}
            label={`${open ? "Hide" : "Show"} tags inside #${tag.path}`}
            size="xs"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="hover:bg-transparent"
          />
        ) : (
          <span aria-hidden className="size-6 shrink-0" />
        )}
        <button
          type="button"
          aria-pressed={selected === tag.path}
          onClick={() => onSelect(tag.path)}
          className="flex h-full min-w-0 flex-1 items-center gap-1 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Icon name="hashtag-linear" className="size-3.5 shrink-0 opacity-60" />
          <span className="truncate">{tag.name}</span>
          <span className="ml-auto pl-2 text-xs text-muted-foreground tabular-nums">
            {tag.count}
            <span className="sr-only">{tag.count === 1 ? " note" : " notes"}</span>
          </span>
        </button>
      </div>
      {open && children.length > 0 && (
        <ul>
          {children.map((child) => (
            <TagRow key={child.path} tag={child} depth={depth + 1} selected={selected} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function TagsPane() {
  const { binder, openNode } = useWorkspace();
  const { index } = useStore(binder);
  const [selected, setSelected] = useState<string | null>(null);
  const nodes = useMemo(() => flatten(index), [index]);
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const tagged = selected
    ? nodes.filter((n) => nodeTags(n).some((t) => t === selected || t.startsWith(`${selected}/`)))
    : [];
  const top = [...tree.children.values()].sort((a, b) => a.name.localeCompare(b.name));

  if (!top.length) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
        No tags yet. Add them under Tags in a note&apos;s details, or write #tag in the text.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ul aria-label="Tags" className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {top.map((tag) => (
          <TagRow key={tag.path} tag={tag} depth={0} selected={selected} onSelect={(p) => setSelected(p === selected ? null : p)} />
        ))}
      </ul>
      {selected && (
        <div className="max-h-[45%] shrink-0 overflow-y-auto border-t border-sidebar-border p-1.5">
          <p className="flex items-center justify-between px-2 pt-1 pb-1.5 text-ui-sm font-medium text-muted-foreground">
            <span id="tags-pane-selected">Notes tagged #{selected}</span>
            <IconButton icon="close-linear" label="Stop showing notes with this tag" size="xs" onClick={() => setSelected(null)} />
          </p>
          <ul aria-labelledby="tags-pane-selected">
            {tagged.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={(e) => openNode(n.id, e.metaKey || e.ctrlKey ? "tab" : "replace")}
                  className="flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-ui-sm text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <Icon name={nodeIcon(n)} className="size-3.5 shrink-0" />
                  <span className="truncate">{n.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
