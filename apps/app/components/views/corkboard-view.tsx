"use client";

import { Icon } from "@plotra/icons";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@plotra/ui/components/dropdown-menu";
import { IconButton } from "@plotra/ui/components/icon-button";
import { cn } from "@plotra/ui/lib/utils";
import { generateKeyBetween } from "fractional-indexing";
import { useMemo, useState } from "react";
import { StatusDot } from "@/components/workspace/status";
import { useStore } from "@/components/workspace/stores";
import { useViewSetting } from "@/components/workspace/shell-prefs";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { ancestors, liveChildren, nodeKindMeta, type BinderNode } from "@/lib/tree";
import { EmptyState, ToolButton, Toolbar } from "./view-ui";
import { editableCardClass, useEditableCard } from "./use-editable-card";
import { stepPosition } from "@/lib/card-order";
import { labelOf } from "@/lib/vocabulary";
import { propertyText } from "@/lib/property-text";
import { useReached } from "@/components/onboarding/reached";

// Corkboard (plan.md 2.5): the children of a folder or chapter as index
// cards (title, synopsis, status). Dragging a card reorders the binder; so do
// Alt+←/→ on a focused card and Move left/right in its ⋯ menu.

type CardSize = "s" | "m" | "l";
const cardSizes: Record<CardSize, { label: string; width: string; height: string }> = {
  s: { label: "Small", width: "11rem", height: "8rem" },
  m: { label: "Medium", width: "14rem", height: "11rem" },
  l: { label: "Large", width: "19rem", height: "15rem" },
};
const cardParts: Array<[string, string]> = [
  ["synopsis", "Synopsis"],
  ["status", "Status"],
  ["label", "Label colour"],
  ["words", "Word count"],
  ["number", "Number"],
];

export function CorkboardView({ nodeId }: { nodeId?: string }) {
  useReached("corkboard");
  const { binder, actions, openNode, project, propertyDefs } = useWorkspace();
  const { index } = useStore(binder);
  const [containerId, setContainerId] = useState<string | null>(nodeId ?? null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null);
  // How the cards look, remembered for the person (useViewSetting).
  const [size, setSize] = useViewSetting<CardSize>("corkboard.size", "m", (v) => (v === "s" || v === "m" || v === "l" ? v : undefined));
  const [hidden, setHidden] = useViewSetting<string[]>("corkboard.hide", [], (v) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : undefined));
  const show = useMemo(() => ({ synopsis: !hidden.includes("synopsis"), status: !hidden.includes("status"), words: !hidden.includes("words"), number: !hidden.includes("number"), label: !hidden.includes("label") }), [hidden]);
  // Fields of the cards' kinds to write on them (`property_def` keys), remembered too.
  const [fields, setFields] = useViewSetting<string[]>("corkboard.fields", [], (v) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : undefined));
  const allDefs = useStore(propertyDefs);

  const container = containerId ? index.byId.get(containerId) : undefined;
  const parentId = container?.id ?? null;
  // Boards (canvases, timelines) aren't index cards.
  const cards = liveChildren(index, parentId).filter((n) => n.kind !== "canvas" && n.kind !== "timeline");
  const canAdd = container ? container.actions.includes("edit") : project.actions.includes("edit");
  const trail = container ? [...ancestors(index, container.id), container] : [];
  // The fields the cards here can show: one entry per key, whichever of their kinds defines it.
  const kinds = new Set(cards.map((c) => c.kind));
  const offeredByKey = new Map<string, string>();
  for (const def of allDefs) if (kinds.has(def.nodeKind) && !offeredByKey.has(def.key)) offeredByKey.set(def.key, def.label);
  const offered = [...offeredByKey].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
  const lines = (n: BinderNode) =>
    fields.flatMap((key) => {
      const def = allDefs.find((d) => d.nodeKind === n.kind && d.key === key);
      const text = def ? propertyText(def.type, n.properties[key], (id) => index.byId.get(id)?.title) : "";
      return def && text ? [{ label: def.label, text }] : [];
    });

  const drop = (targetId: string, after: boolean) => {
    if (!dragId || dragId === targetId) return;
    const siblings = cards.filter((c) => c.id !== dragId);
    const at = siblings.findIndex((c) => c.id === targetId);
    const [before, next] = after ? [siblings[at], siblings[at + 1]] : [siblings[at - 1], siblings[at]];
    void actions.move(dragId, parentId, generateKeyBetween(before?.position ?? null, next?.position ?? null));
  };

  /** Moves a card one place left or right, keeping focus on it. */
  const step = (id: string, by: -1 | 1) => {
    const position = stepPosition(cards, id, by);
    if (position === null) return;
    void actions.move(id, parentId, position);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)?.focus());
  };

  return (
    <div className="flex h-full flex-col">
      <Toolbar>
        <nav className="flex min-w-0 items-center gap-1 text-muted-foreground">
          <button type="button" onClick={() => setContainerId(null)} className="shrink-0 rounded-sm outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
            {project.title}
          </button>
          {trail.map((n) => (
            <span key={n.id} className="flex min-w-0 items-center gap-1">
              <Icon name="alt-arrow-right-linear" className="size-3.5 shrink-0" />
              <button type="button" onClick={() => setContainerId(n.id)} className={cn("truncate rounded-sm outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50", n.id === containerId && "text-foreground")}>
                {n.title}
              </button>
            </span>
          ))}
        </nav>
        <span className="ml-auto" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Card size and what cards show"
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-accent data-[state=open]:text-foreground pointer-coarse:h-10"
            >
              <Icon name="widget-2-linear" className="size-4" />
              Cards
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-meta text-muted-foreground">Size</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={size} onValueChange={(v) => setSize(v as CardSize)}>
              {(Object.keys(cardSizes) as CardSize[]).map((s) => (
                <DropdownMenuRadioItem key={s} value={s} onSelect={(e) => e.preventDefault()}>
                  {cardSizes[s].label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-meta text-muted-foreground">Show</DropdownMenuLabel>
            {cardParts.map(([key, label]) => (
              <DropdownMenuCheckboxItem
                key={key}
                checked={!hidden.includes(key)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(checked) => setHidden(checked ? hidden.filter((h) => h !== key) : [...hidden, key])}
              >
                {label}
              </DropdownMenuCheckboxItem>
            ))}
            {offered.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-meta text-muted-foreground">Fields</DropdownMenuLabel>
                {offered.map(({ key, label }) => (
                  <DropdownMenuCheckboxItem
                    key={key}
                    checked={fields.includes(key)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(checked) => setFields(checked ? [...fields, key] : fields.filter((f) => f !== key))}
                  >
                    <span className="truncate">{label}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <ToolButton icon="clapperboard-text-linear" label="New scene card" disabled={!canAdd} onClick={() => void actions.create("scene", parentId, undefined, { open: false })}>
          Scene
        </ToolButton>
        <ToolButton icon="book-bookmark-linear" label="New chapter card" disabled={!canAdd} onClick={() => void actions.create("chapter", parentId, undefined, { open: false })}>
          Chapter
        </ToolButton>
      </Toolbar>
      {cards.length === 0 ? (
        <EmptyState icon="sticker-square-bold-duotone" title="No cards here" action={canAdd && { label: "New scene", onClick: () => void actions.create("scene", container?.id) }}>
          Add scenes or chapters{container ? ` to ${container.title}` : ""} and they appear as index cards.
        </EmptyState>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto bg-[color-mix(in_oklab,var(--gold)_6%,var(--background))] p-6">
          <ol className="grid gap-5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardSizes[size].width}, 1fr))` }}>
            {cards.map((n, i) => (
              <Card
                key={n.id}
                node={n}
                number={i + 1}
                show={show}
                fields={lines(n)}
                minHeight={cardSizes[size].height}
                hasChildren={liveChildren(index, n.id).length > 0}
                dragging={dragId === n.id}
                drop={dropAt?.id === n.id ? (dropAt.after ? "after" : "before") : null}
                onOpen={(e) => openNode(n.id, e.metaKey || e.ctrlKey ? "tab" : "replace")}
                onEnter={() => setContainerId(n.id)}
                onMove={(by) => step(n.id, by)}
                isFirst={i === 0}
                isLast={i === cards.length - 1}
                onDragStart={() => setDragId(n.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setDropAt(null);
                }}
                onDragOver={(after) => setDropAt((p) => (p?.id === n.id && p.after === after ? p : { id: n.id, after }))}
                onDrop={(after) => {
                  drop(n.id, after);
                  setDragId(null);
                  setDropAt(null);
                }}
              />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Card({
  node,
  number,
  show,
  fields,
  minHeight,
  hasChildren,
  dragging,
  drop,
  onOpen,
  onEnter,
  onMove,
  isFirst,
  isLast,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  node: BinderNode;
  number: number;
  show: { synopsis: boolean; status: boolean; words: boolean; number: boolean; label: boolean };
  /** The chosen fields that have a value on this card. */
  fields: Array<{ label: string; text: string }>;
  minHeight: string;
  hasChildren: boolean;
  dragging: boolean;
  drop: "before" | "after" | null;
  onOpen: (e: { metaKey: boolean; ctrlKey: boolean }) => void;
  onEnter: () => void;
  onMove: (by: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (after: boolean) => void;
  onDrop: (after: boolean) => void;
}) {
  const { actions, project } = useWorkspace();
  const label = labelOf(node, project.settings);
  const canEdit = node.actions.includes("edit");
  const [synopsis, setSynopsis] = useState(node.synopsis ?? "");
  const canWrite = canEdit && show.synopsis;
  // Enter or F2 on the focused card, a double-click, or "Edit synopsis" writes the synopsis.
  const { editing, startEditing, finishEditing, cardProps, fieldProps } = useEditableCard<HTMLLIElement>({
    disabled: !canWrite,
    onCancel: () => setSynopsis(node.synopsis ?? ""),
  });
  const edit = () => {
    setSynopsis(node.synopsis ?? "");
    startEditing();
  };
  const after = (e: React.DragEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientX > rect.left + rect.width / 2;
  };

  return (
    <li
      {...cardProps}
      data-card-id={node.id}
      aria-label={`${node.title}, card ${number}`}
      onDoubleClick={(e) => {
        if (editing || !canWrite) return;
        e.stopPropagation();
        edit();
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || editing) return;
        if (e.altKey && canEdit && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
          e.preventDefault();
          onMove(e.key === "ArrowLeft" ? -1 : 1);
          return;
        }
        if ((e.key === "Enter" || e.key === "F2") && canWrite) {
          e.preventDefault();
          edit();
        }
      }}
      draggable={canEdit && !editing}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", node.title);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(after(e));
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(after(e));
      }}
      className={cn(
        "group relative flex flex-col rounded-sm bg-card shadow-[0_1px_2px_rgb(0_0_0/0.08),0_6px_16px_-8px_rgb(0_0_0/0.25)] transition-transform",
        canEdit && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
        "hover:-rotate-[0.4deg]",
        editableCardClass,
      )}
      style={{ minHeight }}
    >
      {drop && <span className={cn("absolute inset-y-1 w-1 rounded-full bg-ember", drop === "before" ? "-left-3" : "-right-3")} />}
      {label && show.label && <span className="absolute inset-x-0 top-0 h-1 rounded-t-sm" style={{ backgroundColor: label.color }}>
          <span className="sr-only">Label: {label.name}</span>
        </span>}
      <div className="flex items-center gap-1.5 border-b border-rose/30 px-3 py-2">
        {show.number && <span className="text-meta text-faint tabular-nums">{number}</span>}
        <Icon name={nodeKindMeta[node.kind].icon} className="size-3.5 text-muted-foreground" />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate rounded-sm text-left font-display text-lg leading-tight outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50">
          {node.title}
        </button>
        {show.status && <StatusDot status={node.status} className="size-2" />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton icon="menu-dots-linear" label={`More for ${node.title}`} size="xs" className="-mr-1" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => onOpen({ metaKey: false, ctrlKey: false })}>
              <Icon name="file-text-linear" />
              Open
            </DropdownMenuItem>
            {canWrite && (
              <DropdownMenuItem onSelect={() => requestAnimationFrame(edit)}>
                <Icon name="pen-linear" />
                Edit synopsis
                <DropdownMenuShortcut>Enter</DropdownMenuShortcut>
              </DropdownMenuItem>
            )}
            {hasChildren && (
              <DropdownMenuItem onSelect={onEnter}>
                <Icon name="alt-arrow-right-linear" />
                Open its cards
              </DropdownMenuItem>
            )}
            {canEdit && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={isFirst} onSelect={() => onMove(-1)}>
                  <Icon name="arrow-left-linear" />
                  Move left
                  <DropdownMenuShortcut>Alt+←</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={isLast} onSelect={() => onMove(1)}>
                  <Icon name="arrow-right-linear" />
                  Move right
                  <DropdownMenuShortcut>Alt+→</DropdownMenuShortcut>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!show.synopsis ? (
        <span className="flex-1" />
      ) : editing ? (
        <textarea
          {...fieldProps}
          aria-label={`Synopsis of ${node.title}`}
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          onBlur={() => {
            finishEditing();
            if (synopsis.trim() !== (node.synopsis ?? "").trim()) void actions.update(node.id, { synopsis: synopsis.trim() || null });
          }}
          className="flex-1 resize-none bg-transparent px-3 py-2 font-prose text-[15px] leading-snug outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
          placeholder="What happens here?"
        />
      ) : (
        <div
          className="relative flex-1 px-3 py-2"
          style={{ backgroundImage: "repeating-linear-gradient(transparent 0 21px, color-mix(in oklab, var(--teal) 14%, transparent) 21px 22px)" }}
        >
          {node.synopsis || !canWrite ? (
            <p className={cn("font-prose text-[15px] leading-snug whitespace-pre-wrap", !node.synopsis && "text-faint italic")}>{node.synopsis || "No synopsis"}</p>
          ) : (
            <button type="button" onClick={edit} className="rounded-sm text-left font-prose text-[15px] leading-snug text-faint italic outline-none hover:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
              Write a synopsis
            </button>
          )}
          {node.synopsis && canWrite && (
            <IconButton
              icon="pen-linear"
              label="Edit synopsis"
              size="xs"
              onClick={edit}
              className="absolute right-1.5 bottom-1 bg-card opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
            />
          )}
        </div>
      )}
      {fields.length > 0 && (
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-2 gap-y-0.5 border-t border-dashed px-3 py-1.5 text-meta">
          {fields.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-faint">{f.label}</dt>
              <dd className="truncate text-muted-foreground">{f.text}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex items-center gap-2 px-3 py-1.5 text-meta text-faint">
        {show.words && <span>{node.wordCount.toLocaleString()} words</span>}
        {hasChildren && (
          <button type="button" onClick={onEnter} className="ml-auto flex items-center gap-0.5 rounded-sm outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
            Open cards
            <Icon name="alt-arrow-right-linear" className="size-3" />
          </button>
        )}
      </div>
    </li>
  );
}
