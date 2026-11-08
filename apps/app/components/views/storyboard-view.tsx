"use client";

import { Icon, type IconName } from "@plotra/icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@plotra/ui/components/dropdown-menu";
import { IconButton } from "@plotra/ui/components/icon-button";
import { undoToast } from "@plotra/ui/components/sonner";
import { cn } from "@plotra/ui/lib/utils";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { useRoomDoc } from "@/components/collab/use-room-doc";
import { NODE_MIME } from "@/components/workspace/binder";
import { StatusDot } from "@/components/workspace/status";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { canvasMaps, isMap, strokeCard, type CardData, type EdgeData } from "@/lib/canvas";
import { MapView } from "./map-view";
import { colorFor } from "@/lib/colors";
import { swatches } from "@/lib/story";
import { flatten, isTrashed, nodeKindMeta } from "@/lib/tree";
import { useVocabulary } from "@/components/workspace/vocabulary";
import { SelectField } from "@plotra/ui/components/select-field";
import { ImagePickerDialog } from "./image-picker";
import { swatchName, Swatches, ToolButton } from "./view-ui";

// Storyboard / canvas (plan.md 2.5): an infinite canvas of note cards, text,
// image and shot panels, groups and arrows, edited live by everyone who has
// it open. The cards and edges live in the canvas node's Yjs doc
// (lib/canvas.ts); note cards are live links to binder nodes.

const LOCAL = Symbol("local");

type CardNode = Node<{ card: CardData }>;

const shotTypes = ["Extreme wide", "Wide", "Full", "Medium", "Medium close-up", "Close-up", "Extreme close-up", "Over the shoulder", "POV", "Insert"];
const cameraMoves = ["Static", "Pan", "Tilt", "Dolly", "Truck", "Crane", "Handheld", "Zoom", "Tracking"];

const defaultSize: Record<CardData["type"], { w: number; h: number }> = {
  note: { w: 220, h: 120 },
  text: { w: 200, h: 100 },
  image: { w: 260, h: 230 },
  group: { w: 520, h: 340 },
  sticky: { w: 200, h: 180 },
  shape: { w: 200, h: 130 },
  stroke: { w: 40, h: 40 },
};

/** What the toolbar's Add menu offers; the note card asks which note first. */
const addItems: Array<{ label: string; hint?: string; icon: IconName; card?: Omit<CardData, "x" | "y"> }> = [
  { label: "Note card…", hint: "Or drag notes in from the binder", icon: "document-add-linear" },
  { label: "Text card", icon: "text-square-linear", card: { type: "text", text: "" } },
  { label: "Image or shot panel", icon: "camera-linear", card: { type: "image" } },
  { label: "Group", hint: "An act, a sequence…", icon: "layers-linear", card: { type: "group", text: "Group" } },
  { label: "Sticky note", icon: "sticker-square-linear", card: { type: "sticky", text: "" } },
  { label: "Shape", icon: "ruler-pen-linear", card: { type: "shape", shape: "rect", text: "" } },
];

/** A sticky note's colour when none was chosen: the yellow of the paper kind. */
const STICKY = "#f2cf54";

/** Writes to the canvas doc, shared with every card component. */
const CanvasContext = createContext<{
  update: (id: string, patch: Partial<CardData>) => void;
  editable: boolean;
  /** The card whose text is being edited in place (double-click, or Enter/F2 on a focused card). */
  editingId: string | null;
  setEditingId: (id: string | null) => void;
} | null>(null);
const useCanvas = () => use(CanvasContext)!;

// ---- Cards ---------------------------------------------------------------------------

function Handles() {
  const { editable } = useCanvas();
  const cls = cn("!size-2.5 !border-2 !border-background !bg-ember transition-opacity", !editable && "!opacity-0");
  return (
    <>
      <Handle type="source" position={Position.Top} id="t" className={cls} />
      <Handle type="source" position={Position.Right} id="r" className={cls} />
      <Handle type="source" position={Position.Bottom} id="b" className={cls} />
      <Handle type="source" position={Position.Left} id="l" className={cls} />
    </>
  );
}

function Resizer({ selected, min = 100 }: { selected: boolean; min?: number }) {
  const { editable } = useCanvas();
  return <NodeResizer isVisible={selected && editable} minWidth={min} minHeight={60} lineClassName="!border-ember/60" handleClassName="!size-2 !border-ember !bg-background" />;
}

function NoteCard({ data, selected }: NodeProps<CardNode>) {
  const { binder, openNode } = useWorkspace();
  const words = useVocabulary();
  const { index } = useStore(binder);
  const target = data.card.nodeId ? index.byId.get(data.card.nodeId) : undefined;
  const gone = !target || isTrashed(index, target.id);
  return (
    <div
      onDoubleClick={() => target && !gone && openNode(target.id, "tab")}
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-lg border bg-card shadow-sm",
        selected && "ring-2 ring-ember/60",
      )}
      style={{ borderTop: `3px solid ${data.card.color ?? "var(--border)"}` }}
    >
      <Resizer selected={selected} min={140} />
      <Handles />
      {gone ? (
        // Never show the title of a note the viewer can't see (plan.md 2.9 "no leaks through side doors").
        <div className="grid flex-1 place-items-center p-3 text-center text-xs text-muted-foreground">
          <span>
            <Icon name="lock-keyhole-minimalistic-linear" className="mx-auto mb-1 size-4" />
            {target ? "In the trash" : "Restricted or deleted note"}
          </span>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-1 p-3">
          <p className="flex items-center gap-1.5 text-meta text-faint">
            <Icon name={nodeKindMeta[target.kind].icon} className="size-3.5" />
            {words.label(target.kind)}
            <StatusDot status={target.status} className="ml-auto" />
          </p>
          <p className="font-display text-lg leading-tight">{target.title}</p>
          {target.synopsis && <p className="line-clamp-4 text-xs leading-relaxed text-muted-foreground">{target.synopsis}</p>}
        </div>
      )}
    </div>
  );
}

function TextCard({ id, data, selected }: NodeProps<CardNode>) {
  return (
    <div
      className={cn("size-full overflow-hidden rounded-lg border p-3 shadow-sm", selected && "ring-2 ring-ember/60")}
      style={{ backgroundColor: data.card.color ? `color-mix(in oklab, ${data.card.color} 16%, var(--card))` : "var(--card)" }}
    >
      <Resizer selected={selected} />
      <Handles />
      <CardText id={id} card={data.card} className="text-sm leading-relaxed" />
    </div>
  );
}

const WRITE_HINT = "Double-click or press Enter to write";

/**
 * Text written on a card, edited in place. React Flow gives the card itself
 * focus, so the canvas turns Enter or F2 on a focused card into editing
 * (Canvas, below); a double-click does it too. Escape cancels, and focus goes
 * back to the card. Shared by text cards, sticky notes and shapes.
 */
function CardText({
  id,
  card,
  className,
  placeholder = WRITE_HINT,
  faintClass = "text-faint",
}: {
  id: string;
  card: CardData;
  className?: string;
  placeholder?: string;
  faintClass?: string;
}) {
  const { update, editable, editingId, setEditingId } = useCanvas();
  const editing = editable && editingId === id;
  const [draft, setDraft] = useState(card.text ?? "");
  const [synced, setSynced] = useState(card.text ?? "");
  const cancelled = useRef(false);
  if (!editing && (card.text ?? "") !== synced) {
    setSynced(card.text ?? "");
    setDraft(card.text ?? "");
  }
  const backToCard = (el: HTMLElement) => {
    const node = el.closest<HTMLElement>(".react-flow__node");
    requestAnimationFrame(() => node?.focus({ preventScroll: true }));
  };
  return editing ? (
    <textarea
      autoFocus
      aria-label="Card text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        cancelled.current = false;
      }}
      onBlur={() => {
        setEditingId(null);
        if (!cancelled.current && draft !== (card.text ?? "")) update(id, { text: draft.slice(0, 5000) });
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          // Cancelled: nothing is saved on the blur that follows.
          cancelled.current = true;
          setDraft(card.text ?? "");
          setEditingId(null);
          backToCard(e.currentTarget);
        }
      }}
      className={cn("nodrag nowheel size-full resize-none bg-transparent outline-none", className)}
    />
  ) : (
    <p
      onDoubleClick={(e) => {
        if (!editable) return;
        e.stopPropagation();
        setEditingId(id);
      }}
      className={cn("size-full overflow-hidden whitespace-pre-wrap", !card.text && faintClass, className)}
    >
      {card.text || (editable ? placeholder : "")}
    </p>
  );
}

function StickyCard({ id, data, selected }: NodeProps<CardNode>) {
  const color = data.card.color ?? STICKY;
  return (
    <div
      className={cn("size-full p-3 shadow-[0_1px_2px_rgb(0_0_0/0.12),0_8px_18px_-10px_rgb(0_0_0/0.35)]", selected && "ring-2 ring-ember/60")}
      style={{ backgroundColor: `color-mix(in oklab, ${color} 55%, white)`, color: "#1d1a14" }}
    >
      <Resizer selected={selected} min={80} />
      <Handles />
      <CardText id={id} card={data.card} faintClass="text-[#1d1a14]/65" className="font-prose text-[15px] leading-snug" />
    </div>
  );
}

function ShapeCard({ id, data, selected }: NodeProps<CardNode>) {
  const color = data.card.color ?? "var(--muted-foreground)";
  const shape = data.card.shape ?? "rect";
  return (
    <div className="relative size-full">
      <Resizer selected={selected} min={60} />
      <Handles />
      <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {shape === "ellipse" ? (
          <ellipse cx="50" cy="50" rx="49" ry="49" fill={`color-mix(in oklab, ${color} 12%, var(--card))`} stroke={selected ? "var(--ember)" : color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        ) : shape === "diamond" ? (
          <polygon points="50,1 99,50 50,99 1,50" fill={`color-mix(in oklab, ${color} 12%, var(--card))`} stroke={selected ? "var(--ember)" : color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        ) : (
          <rect x="1" y="1" width="98" height="98" rx="4" fill={`color-mix(in oklab, ${color} 12%, var(--card))`} stroke={selected ? "var(--ember)" : color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <div className={cn("absolute grid place-items-center text-center", shape === "diamond" ? "inset-[22%]" : "inset-3")}>
        <CardText id={id} card={data.card} placeholder="" className="grid place-items-center text-sm leading-snug" />
      </div>
    </div>
  );
}

/** A pen stroke: its points, stretched with the card when it's resized. */
function StrokeCard({ data, selected }: NodeProps<CardNode>) {
  const { card } = data;
  const points = card.points ?? [];
  const d = points.reduce((path, value, i) => (i % 2 === 0 ? `${path}${i === 0 ? "M" : " L"}${value}` : `${path},${value}`), "");
  return (
    <div className={cn("size-full", selected && "rounded outline-1 outline-ember/60 outline-dashed")}>
      <Resizer selected={selected} min={10} />
      <svg className="size-full overflow-visible" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden>
        <path d={d} fill="none" stroke={card.color ?? "var(--foreground)"} strokeWidth={card.strokeWidth ?? 3} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function ImageCard({ data, selected }: NodeProps<CardNode>) {
  const { card } = data;
  const badges = [card.shot, card.move, card.duration ? `${card.duration}s` : null].filter(Boolean);
  return (
    <div className={cn("flex size-full flex-col overflow-hidden rounded-lg border bg-card shadow-sm", selected && "ring-2 ring-ember/60")}>
      <Resizer selected={selected} min={140} />
      <Handles />
      <div className="relative min-h-0 flex-1 bg-muted">
        {card.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-supplied image URLs
          <img src={card.url} alt={card.caption ?? ""} className="size-full object-cover" draggable={false} />
        ) : (
          <div className="grid size-full place-items-center text-faint">
            <Icon name="camera-linear" className="size-8" />
          </div>
        )}
        {badges.length > 0 && (
          <div className="absolute top-1.5 left-1.5 flex flex-wrap gap-1">
            {badges.map((b) => (
              <span key={b} className="rounded bg-black/60 px-1.5 py-px text-meta font-medium text-white">
                {b}
              </span>
            ))}
          </div>
        )}
      </div>
      <p className={cn("shrink-0 px-2.5 py-1.5 text-xs leading-snug", !card.caption && "text-faint")}>{card.caption || "No caption"}</p>
    </div>
  );
}

function GroupCard({ data, selected }: NodeProps<CardNode>) {
  return (
    <div
      className={cn("size-full rounded-xl border-2 border-dashed", selected && "border-ember/60")}
      style={{
        borderColor: selected ? undefined : (data.card.color ?? "var(--border)"),
        backgroundColor: `color-mix(in oklab, ${data.card.color ?? "var(--foreground)"} 5%, transparent)`,
      }}
    >
      <Resizer selected={selected} min={200} />
      <p className="px-3 py-2 font-display text-xl text-muted-foreground">{data.card.text || "Group"}</p>
    </div>
  );
}

const nodeTypes = { note: NoteCard, text: TextCard, image: ImageCard, group: GroupCard, sticky: StickyCard, shape: ShapeCard, stroke: StrokeCard };

function LabelledEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, selected, style }: EdgeProps<Edge<{ label?: string }>>) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 12 });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...style, stroke: selected ? "var(--ember)" : "var(--muted-foreground)", strokeWidth: 1.5 }} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className="nodrag nopan absolute rounded bg-background px-1.5 py-px text-meta text-muted-foreground shadow-sm ring-1 ring-border"
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { labelled: LabelledEdge };

// ---- Conversion between the doc and React Flow ----------------------------------------------

function toFlowNodes(cards: Y.Map<CardData>, prev: CardNode[]): CardNode[] {
  const before = new Map(prev.map((n) => [n.id, n]));
  const all = [...cards.entries()];
  // React Flow needs parents before their children.
  all.sort(([, a], [, b]) => (a.type === "group" ? 0 : 1) - (b.type === "group" ? 0 : 1));
  return all.map(([id, card]) => {
    const old = before.get(id);
    const size = defaultSize[card.type] ?? defaultSize.text;
    const parent = card.parentId && cards.has(card.parentId) ? card.parentId : undefined;
    return {
      ...(old ?? {}),
      id,
      type: card.type,
      position: { x: card.x, y: card.y },
      data: { card },
      parentId: parent,
      width: card.w ?? size.w,
      height: card.h ?? size.h,
      zIndex: card.type === "group" ? -1 : 0,
    } as CardNode;
  });
}

const cardKinds = { note: "Note card", text: "Text card", image: "Image / shot", group: "Group", sticky: "Sticky note", shape: "Shape", stroke: "Pen stroke" } as const;

/** A card's name for screen readers and Undo: its note's title, its words, or its kind. */
function cardName(card: CardData | undefined, title: (id: string) => string | undefined): string {
  if (!card) return "a card";
  const words = (card.type === "note" ? card.nodeId && title(card.nodeId) : card.type === "image" ? card.caption : card.text)?.replace(/\s+/g, " ").trim();
  return words ? (words.length > 40 ? `${words.slice(0, 39)}…` : words) : cardKinds[card.type];
}

function connectionLabel(e: EdgeData, cards: Y.Map<CardData>, title: (id: string) => string | undefined) {
  return `Connection from ‘${cardName(cards.get(e.source), title)}’ to ‘${cardName(cards.get(e.target), title)}’${e.label ? `: ${e.label}` : ""}`;
}

function toFlowEdges(edges: Y.Map<EdgeData>, cards: Y.Map<CardData>, title: (id: string) => string | undefined, prev: Edge[]): Edge[] {
  const before = new Map(prev.map((e) => [e.id, e]));
  return [...edges.entries()].map(([id, e]) => ({
    ...(before.get(id) ?? {}),
    id,
    // Focusable: Enter or Space selects it and opens its panel, Delete removes it (with Undo).
    ariaLabel: connectionLabel(e, cards, title),
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    type: "labelled",
    data: { label: e.label },
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
  }));
}

// ---- The view ---------------------------------------------------------------------------------

export function StoryboardView({ nodeId }: { nodeId: string }) {
  const { binder } = useWorkspace();
  const node = useStore(binder).index.byId.get(nodeId);
  if (!node) return null;
  // A canvas made as a map has its own view (./map-view.tsx).
  if (isMap(node)) return <MapView nodeId={nodeId} />;
  return (
    <ReactFlowProvider>
      <Canvas key={nodeId} nodeId={nodeId} />
    </ReactFlowProvider>
  );
}

type Remote = { clientId: number; name: string; color: string; x: number; y: number };

function Canvas({ nodeId }: { nodeId: string }) {
  const { project, user, binder, registerEditor, setDocStats, openNode } = useWorkspace();
  const { index } = useStore(binder);
  const node = index.byId.get(nodeId)!;
  const editable = node.actions.includes("edit");
  const { resolvedTheme } = useTheme();
  const flow = useReactFlow();
  const { doc, provider, ready, sync } = useRoomDoc({
    projectId: project.id,
    room: `node-${nodeId}`,
  });
  const maps = useMemo(() => (doc ? canvasMaps(doc) : null), [doc]);
  const [nodes, setNodes] = useState<CardNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [picker, setPicker] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Drawing with the pen: on, and the colour it draws in (none: the text colour).
  const [pen, setPen] = useState(false);
  const [penColor, setPenColor] = useState<string | undefined>(undefined);
  const fitted = useRef(false);
  const paneRef = useRef<HTMLDivElement>(null);
  // Note titles for card names, read fresh each time (so a rename doesn't resubscribe to the doc).
  const titleOf = useCallback((id: string) => binder.get().index.byId.get(id)?.title, [binder]);

  useEffect(() => {
    setDocStats(nodeId, { sync });
  }, [nodeId, setDocStats, sync]);

  // Mirror the doc into React Flow state, keeping local-only flags (selection, dragging).
  useEffect(() => {
    if (!maps) return;
    const pull = () => {
      setNodes((prev) => toFlowNodes(maps.cards, prev));
      setEdges((prev) => toFlowEdges(maps.edges, maps.cards, titleOf, prev));
    };
    pull();
    maps.cards.observe(pull);
    maps.edges.observe(pull);
    return () => {
      maps.cards.unobserve(pull);
      maps.edges.unobserve(pull);
    };
  }, [maps, titleOf]);

  useEffect(() => {
    if (ready && !fitted.current && nodes.length) {
      fitted.current = true;
      requestAnimationFrame(() => void flow.fitView({ padding: 0.2, maxZoom: 1 }));
    }
  }, [flow, nodes.length, ready]);

  // Other people's pointers, through the room's awareness.
  useEffect(() => {
    if (!provider) return;
    const awareness = provider.awareness;
    awareness.setLocalStateField("user", { name: user.name, color: colorFor(user.id) });
    const onChange = () => {
      const list: Remote[] = [];
      awareness.getStates().forEach((state, clientId) => {
        const s = state as { user?: { name: string; color: string }; pointer?: { x: number; y: number } | null };
        if (clientId !== awareness.clientID && s.user && s.pointer) list.push({ clientId, ...s.user, ...s.pointer });
      });
      setRemotes(list);
    };
    awareness.on("change", onChange);
    return () => awareness.off("change", onChange);
  }, [provider, user.id, user.name]);

  const transact = useCallback((fn: () => void) => doc?.transact(fn, LOCAL), [doc]);

  const update = useCallback(
    (id: string, patch: Partial<CardData>) =>
      transact(() => {
        const card = maps?.cards.get(id);
        if (card) maps!.cards.set(id, { ...card, ...patch });
      }),
    [maps, transact],
  );

  /**
   * Removes cards (with their connections) and connections, from the panels or
   * the Delete key (React Flow's own delete becomes this through onBeforeDelete),
   * and offers Undo.
   */
  const removeCards = useCallback(
    (ids: string[], edgeIds: string[] = []) => {
      if (!maps || !editable) return;
      const doomed = new Set(ids.filter((id) => maps.cards.has(id)));
      const picked = new Set(edgeIds);
      // What the removal changes, so Undo can put it back.
      const cardsBefore = new Map<string, CardData>();
      maps.cards.forEach((card, id) => {
        if (doomed.has(id) || (card.parentId && doomed.has(card.parentId))) cardsBefore.set(id, card);
      });
      const edgesBefore = new Map<string, EdgeData>();
      maps.edges.forEach((e, id) => {
        if (picked.has(id) || doomed.has(e.source) || doomed.has(e.target)) edgesBefore.set(id, e);
      });
      if (!doomed.size && !edgesBefore.size) return;
      const only = edgesBefore.size === 1 ? [...edgesBefore.values()][0] : null;
      const message = doomed.size
        ? doomed.size === 1
          ? "Removed a card from the canvas"
          : `Removed ${doomed.size} cards from the canvas`
        : only
          ? `Removed the connection from ‘${cardName(maps.cards.get(only.source), titleOf)}’ to ‘${cardName(maps.cards.get(only.target), titleOf)}’`
          : `Removed ${edgesBefore.size} connections`;
      transact(() => {
        // Cards inside a deleted group stay, placed where they were.
        maps.cards.forEach((card, id) => {
          if (card.parentId && doomed.has(card.parentId) && !doomed.has(id)) {
            const parent = maps.cards.get(card.parentId)!;
            maps.cards.set(id, { ...card, parentId: undefined, x: card.x + parent.x, y: card.y + parent.y });
          }
        });
        for (const id of doomed) maps.cards.delete(id);
        edgesBefore.forEach((_, id) => maps.edges.delete(id));
      });
      undoToast(message, () =>
        transact(() => {
          cardsBefore.forEach((card, id) => maps.cards.set(id, card));
          edgesBefore.forEach((e, id) => {
            if (maps.cards.has(e.source) && maps.cards.has(e.target)) maps.edges.set(id, e);
          });
        }),
      );
    },
    [editable, maps, titleOf, transact],
  );

  /** Selects one connection (from a card's Connections list), which opens its panel. */
  const selectEdge = useCallback((id: string) => {
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setEdges((es) => es.map((e) => ({ ...e, selected: e.id === id })));
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange<CardNode>[]) => {
      setNodes((ns) => applyNodeChanges(changes, ns));
      if (!editable) return;
      const removed: string[] = [];
      transact(() => {
        for (const ch of changes) {
          if (ch.type === "position" && ch.position) update(ch.id, { x: Math.round(ch.position.x), y: Math.round(ch.position.y) });
          else if (ch.type === "dimensions" && ch.resizing && ch.dimensions) {
            update(ch.id, { w: Math.round(ch.dimensions.width), h: Math.round(ch.dimensions.height) });
          } else if (ch.type === "remove") removed.push(ch.id);
        }
      });
      if (removed.length) removeCards(removed);
    },
    [editable, removeCards, transact, update],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((es) => applyEdgeChanges(changes.filter((ch) => ch.type !== "remove"), es));
      const removed = changes.flatMap((ch) => (ch.type === "remove" ? [ch.id] : []));
      if (removed.length) removeCards([], removed);
    },
    [removeCards],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!editable || !maps || c.source === c.target) return;
      setEdges((es) => addEdge(c, es));
      transact(() =>
        maps.edges.set(crypto.randomUUID(), {
          source: c.source,
          target: c.target,
          ...(c.sourceHandle && { sourceHandle: c.sourceHandle }),
          ...(c.targetHandle && { targetHandle: c.targetHandle }),
        }),
      );
    },
    [editable, maps, transact],
  );

  /** Puts a card into the group it was dropped on, or takes it out of its group. */
  const onNodeDragStop = useCallback(
    (_: unknown, dragged: CardNode) => {
      if (!editable || !maps || dragged.type === "group") return;
      const card = maps.cards.get(dragged.id);
      if (!card) return;
      const absolute = flow.getInternalNode(dragged.id)?.internals.positionAbsolute ?? dragged.position;
      const group = flow
        .getIntersectingNodes(dragged)
        .filter((n) => n.type === "group" && n.id !== dragged.id)
        .at(-1);
      if (group?.id === card.parentId) return;
      if (group) {
        const g = maps.cards.get(group.id)!;
        update(dragged.id, { parentId: group.id, x: Math.round(absolute.x - g.x), y: Math.round(absolute.y - g.y) });
      } else if (card.parentId) {
        update(dragged.id, { parentId: undefined, x: Math.round(absolute.x), y: Math.round(absolute.y) });
      }
    },
    [editable, flow, maps, update],
  );

  const addCard = useCallback(
    (card: Omit<CardData, "x" | "y">, at?: { x: number; y: number }) => {
      if (!maps || !editable) return;
      const size = defaultSize[card.type];
      // Toolbar additions go in the middle of the pane, cascading so they don't hide each other.
      const rect = paneRef.current?.getBoundingClientRect();
      const cascade = (maps.cards.size % 8) * 28;
      const center =
        at ??
        flow.screenToFlowPosition({
          x: (rect ? rect.left + rect.width / 2 : window.innerWidth / 2) + cascade,
          y: (rect ? rect.top + rect.height / 2 : window.innerHeight / 2) + cascade,
        });
      const id = crypto.randomUUID();
      transact(() => maps.cards.set(id, { ...card, x: Math.round(center.x - size.w / 2), y: Math.round(center.y - size.h / 2), w: size.w, h: size.h }));
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
    },
    [editable, flow, maps, transact],
  );

  // History: snapshot and restore (the same handle the editor registers).
  useEffect(() => {
    if (!doc || !maps) return;
    registerEditor(nodeId, {
      focus: () => {},
      focusEnd: () => {},
      scrollToHeading: () => {},
      scrollToHeadingText: () => {},
      linkMention: () => false,
      comment: () => {},
      revealThread: () => {},
      resolveSuggestion: () => {},
      snapshot: () => Y.encodeStateAsUpdate(doc),
      replaceContent: (value) => {
        if (!editable || !value || typeof value !== "object") return;
        const { cards, edges } = value as { cards: Record<string, CardData>; edges: Record<string, EdgeData> };
        transact(() => {
          maps.cards.clear();
          maps.edges.clear();
          for (const [id, card] of Object.entries(cards ?? {})) maps.cards.set(id, card);
          for (const [id, edge] of Object.entries(edges ?? {})) maps.edges.set(id, edge);
        });
      },
    });
    return () => registerEditor(nodeId, null);
  }, [doc, editable, maps, nodeId, registerEditor, transact]);

  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedEdges = edges.filter((e) => e.selected);
  const context = useMemo(() => ({ update, editable, editingId, setEditingId }), [editable, editingId, update]);

  /** Enter or F2 on a focused card: open a note card's note, or write on a card with text. */
  const onCardKey = (e: React.KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (!el.classList.contains("react-flow__node") || (e.key !== "Enter" && e.key !== "F2")) return;
    const id = el.dataset.id;
    const card = id ? maps?.cards.get(id) : undefined;
    if (!id || !card) return;
    if (card.type === "note") {
      if (card.nodeId && index.byId.has(card.nodeId)) openNode(card.nodeId, "tab");
    } else if (editable && (card.type === "text" || card.type === "sticky" || card.type === "shape")) {
      e.preventDefault();
      setEditingId(id);
    }
  };

  return (
    <CanvasContext value={context}>
      <div
        ref={paneRef}
        className="relative h-full"
        onDragOver={(e) => {
          if (editable && e.dataTransfer.types.includes(NODE_MIME)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(e) => {
          const id = e.dataTransfer.getData(NODE_MIME);
          if (!id || !editable) return;
          e.preventDefault();
          addCard({ type: "note", nodeId: id }, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
        }}
        onPointerMove={(e) => {
          const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
          provider?.awareness.setLocalStateField("pointer", { x: Math.round(p.x), y: Math.round(p.y) });
        }}
        onPointerLeave={() => provider?.awareness.setLocalStateField("pointer", null)}
        onKeyDown={onCardKey}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onNodeDoubleClick={(_, n) => {
            const target = n.data.card.nodeId;
            if (n.type === "note" && target && index.byId.has(target)) openNode(target, "tab");
          }}
          connectionMode={ConnectionMode.Loose}
          nodesDraggable={editable}
          nodesConnectable={editable}
          elementsSelectable
          deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
          // Deleting goes through removeCards, so it can be undone; React Flow removes nothing itself.
          onBeforeDelete={async ({ nodes: cards, edges: links }) => {
            removeCards(
              cards.map((n) => n.id),
              links.map((e) => e.id),
            );
            return false;
          }}
          edgesFocusable
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          minZoom={0.1}
          maxZoom={2.5}
          className="bg-background"
        >
          <Background gap={22} size={1.2} />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap pannable zoomable position="bottom-right" className="!bg-card" maskColor="color-mix(in oklab, var(--foreground) 8%, transparent)" />
          <RemotePointers remotes={remotes} />
        </ReactFlow>

        <div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-sm">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={!editable}
                className="flex h-8 items-center gap-1.5 rounded-md px-2 text-ui-sm text-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 pointer-coarse:h-10"
              >
                <Icon name="add-linear" className="size-4" />
                Add
                <Icon name="alt-arrow-down-linear" className="size-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {addItems.map((item) => (
                <DropdownMenuItem
                  key={item.label}
                  onSelect={() => (item.card ? addCard(item.card) : setPicker(true))}
                  className="items-start"
                >
                  <Icon name={item.icon} className="mt-0.5 size-4" />
                  <span className="grid">
                    <span>{item.label}</span>
                    {item.hint && <span className="text-meta text-muted-foreground">{item.hint}</span>}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <ToolButton icon="paint-brush-linear" label={pen ? "Stop drawing" : "Draw with the pen"} shortcut={pen ? "Esc" : undefined} pressed={pen} disabled={!editable} onClick={() => setPen(!pen)}>
            {pen ? "Stop drawing" : "Draw"}
          </ToolButton>
          {pen && (
            <span className="flex items-center gap-1 px-1" role="group" aria-label="Pen colour">
              {[undefined, ...swatches.slice(0, 6)].map((c) => (
                <button
                  key={c ?? "ink"}
                  type="button"
                  aria-label={c ? swatchName(c) : "Ink"}
                  aria-pressed={penColor === c}
                  onClick={() => setPenColor(c)}
                  className={cn(
                    "relative size-5 rounded-full ring-offset-1 ring-offset-popover outline-none after:absolute after:-inset-1.5 after:content-[''] focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    penColor === c && "ring-2 ring-foreground/50",
                  )}
                  style={{ backgroundColor: c ?? "var(--foreground)" }}
                />
              ))}
            </span>
          )}
          <span className="mx-0.5 h-5 w-px bg-border" />
          <ToolButton icon="full-screen-linear" label="Fit everything" onClick={() => void flow.fitView({ padding: 0.2, duration: 300 })} />
          {!editable && <span className="px-2 text-xs text-muted-foreground">Read only</span>}
          {!ready && <span className="px-2 text-xs text-muted-foreground">Loading…</span>}
        </div>

        {pen && editable && (
          <PenLayer
            color={penColor}
            onStroke={(points) => {
              if (!maps) return;
              transact(() => maps.cards.set(crypto.randomUUID(), strokeCard(points, flow.screenToFlowPosition, penColor)));
            }}
            onDone={() => setPen(false)}
          />
        )}

        {picker && (
          <NotePicker
            onPick={(id) => {
              addCard({ type: "note", nodeId: id });
              setPicker(false);
            }}
            onClose={() => setPicker(false)}
          />
        )}

        {editable && selectedNodes.length === 1 && maps?.cards.get(selectedNodes[0].id) && (
          <CardEditor
            id={selectedNodes[0].id}
            canvasId={nodeId}
            card={maps.cards.get(selectedNodes[0].id)!}
            update={update}
            remove={() => removeCards([selectedNodes[0].id])}
            connections={edges.flatMap((e) => {
              const id = selectedNodes[0].id;
              if (e.source !== id && e.target !== id) return [];
              const outgoing = e.source === id;
              const other = cardName(maps.cards.get(outgoing ? e.target : e.source), titleOf);
              const label = maps.edges.get(e.id)?.label;
              return [{ id: e.id, text: `${outgoing ? "To" : "From"} ‘${other}’${label ? ` · ${label}` : ""}` }];
            })}
            onSelectConnection={selectEdge}
            onRemoveConnection={(edgeId) => removeCards([], [edgeId])}
          />
        )}
        {editable && selectedNodes.length === 0 && selectedEdges.length === 1 && maps && (
          <EdgeEditor
            key={selectedEdges[0].id}
            edge={maps.edges.get(selectedEdges[0].id)}
            onChange={(label) =>
              transact(() => {
                const e = maps.edges.get(selectedEdges[0].id);
                if (e) maps.edges.set(selectedEdges[0].id, { ...e, label: label || undefined });
              })
            }
            onRemove={() => removeCards([], [selectedEdges[0].id])}
          />
        )}

        {ready && nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="max-w-sm text-center">
              <Icon name="widget-4-bold-duotone" className="mx-auto size-10 text-faint" />
              <p className="mt-3 font-display text-2xl">An empty canvas</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {editable
                  ? "Drag notes in from the binder, or use Add for text, shot panels, groups, sticky notes and shapes, or draw with the pen. Connect cards by dragging from their edges."
                  : "Nothing here yet."}
              </p>
            </div>
          </div>
        )}
      </div>
    </CanvasContext>
  );
}

/**
 * Drawing with the pen: a layer over the canvas that turns a drag into a
 * stroke, shown in screen space while it's drawn and handed over as points
 * on the screen when the pointer lifts. Esc puts the pen down.
 */
function PenLayer({ color, onStroke, onDone }: { color?: string; onStroke: (points: Array<{ x: number; y: number }>) => void; onDone: () => void }) {
  const [points, setPoints] = useState<Array<{ x: number; y: number }>>([]);
  const box = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);
  const local = (e: React.PointerEvent) => {
    const rect = box.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, screenX: e.clientX, screenY: e.clientY };
  };
  const screen = useRef<Array<{ x: number; y: number }>>([]);
  return (
    <div
      ref={box}
      // Over the canvas, under the toolbar (z-10), so the pen can be put down from it.
      className="absolute inset-0 z-[9] cursor-crosshair touch-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drawing.current = true;
        const p = local(e);
        screen.current = [{ x: p.screenX, y: p.screenY }];
        setPoints([{ x: p.x, y: p.y }]);
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return;
        const p = local(e);
        const last = screen.current.at(-1)!;
        // Every couple of pixels is enough for a smooth line, and keeps a stroke small.
        if (Math.hypot(p.screenX - last.x, p.screenY - last.y) < 2 || screen.current.length >= 2000) return;
        screen.current.push({ x: p.screenX, y: p.screenY });
        setPoints((all) => [...all, { x: p.x, y: p.y }]);
      }}
      onPointerUp={() => {
        drawing.current = false;
        if (screen.current.length >= 2) onStroke(screen.current);
        screen.current = [];
        setPoints([]);
      }}
    >
      {points.length > 1 && (
        <svg className="pointer-events-none absolute inset-0 size-full">
          <polyline points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={color ?? "var(--foreground)"} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

function RemotePointers({ remotes }: { remotes: Remote[] }) {
  const viewport = useViewport();
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {remotes.map((r) => (
        <div
          key={r.clientId}
          className="absolute flex items-center gap-1 transition-transform duration-75"
          style={{ transform: `translate(${r.x * viewport.zoom + viewport.x}px, ${r.y * viewport.zoom + viewport.y}px)` }}
        >
          <span className="size-2.5 rounded-full ring-2 ring-background" style={{ backgroundColor: r.color }} />
          <span className="rounded px-1 text-meta font-medium text-white" style={{ backgroundColor: r.color }}>
            {r.name}
          </span>
        </div>
      ))}
    </div>
  );
}

function NotePicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const { binder } = useWorkspace();
  const { index } = useStore(binder);
  const [query, setQuery] = useState("");
  const results = flatten(index)
    .filter((n) => n.kind !== "folder" && n.kind !== "canvas" && n.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 50);
  return (
    <div className="absolute top-14 left-3 z-20 w-72 rounded-lg border bg-popover p-1.5 shadow-lg">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && results[0]) onPick(results[0].id);
        }}
        placeholder="Find a note…"
        aria-label="Find a note to add"
        className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-ui-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <ul className="mt-1 max-h-72 overflow-y-auto">
        {results.map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => onPick(n.id)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-ui-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <Icon name={nodeKindMeta[n.kind].icon} className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{n.title}</span>
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="px-2 py-2 text-xs text-muted-foreground">No matching notes.</li>}
      </ul>
    </div>
  );
}

const fieldClass = "h-7 w-full rounded-md border border-input bg-transparent px-2 text-ui-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function Commit({ value, onCommit, placeholder, label, type = "text" }: { value: string; onCommit: (v: string) => void; placeholder?: string; label: string; type?: string }) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  return (
    <input
      type={type}
      value={draft}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(value);
      }}
      className={fieldClass}
    />
  );
}

function CardEditor({
  id,
  canvasId,
  card,
  update,
  remove,
  connections,
  onSelectConnection,
  onRemoveConnection,
}: {
  id: string;
  canvasId: string;
  card: CardData;
  update: (id: string, patch: Partial<CardData>) => void;
  remove: () => void;
  /** The card's connections, as a list: the way to them without a mouse. */
  connections: Array<{ id: string; text: string }>;
  onSelectConnection: (id: string) => void;
  onRemoveConnection: (id: string) => void;
}) {
  const { project } = useWorkspace();
  const [picking, setPicking] = useState(false);
  const set = (patch: Partial<CardData>) => update(id, patch);
  return (
    <div className="absolute top-3 right-3 z-10 grid w-64 gap-2.5 rounded-lg border bg-popover p-3 text-ui-sm shadow-md">
      <p className="text-meta font-medium text-muted-foreground">
        {cardKinds[card.type]}
      </p>
      {card.type === "group" && <Commit value={card.text ?? ""} label="Group label" placeholder="Label" onCommit={(text) => set({ text: text.slice(0, 120) })} />}
      {card.type === "shape" && (
        <div className="flex gap-1">
          {(["rect", "ellipse", "diamond"] as const).map((shape) => (
            <button
              key={shape}
              type="button"
              aria-pressed={(card.shape ?? "rect") === shape}
              onClick={() => set({ shape })}
              className="flex-1 rounded-md border px-2 py-1 text-xs hover:bg-accent aria-pressed:border-ember aria-pressed:bg-accent"
            >
              {{ rect: "Box", ellipse: "Oval", diamond: "Diamond" }[shape]}
            </button>
          ))}
        </div>
      )}
      {card.type === "stroke" && (
        <div className="flex gap-1">
          {[2, 3, 6].map((width) => (
            <button
              key={width}
              type="button"
              aria-pressed={(card.strokeWidth ?? 3) === width}
              onClick={() => set({ strokeWidth: width })}
              className="flex-1 rounded-md border px-2 py-1 text-xs hover:bg-accent aria-pressed:border-ember aria-pressed:bg-accent"
            >
              {{ 2: "Fine", 3: "Medium", 6: "Thick" }[width]}
            </button>
          ))}
        </div>
      )}
      {card.type === "image" && (
        <>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Icon name="gallery-linear" className="size-4" />
              {card.url ? "Change picture…" : "Add a picture…"}
            </button>
            {card.url && (
              <button
                type="button"
                onClick={() => set({ url: undefined })}
                className="flex h-8 items-center rounded-md px-2 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                Remove
              </button>
            )}
          </div>
          {card.url && (
            <p className="truncate text-meta text-muted-foreground" title={card.url}>
              {card.url.startsWith("/api/files/") ? "Uploaded picture" : card.url}
            </p>
          )}
          <ImagePickerDialog
            open={picking}
            onOpenChange={setPicking}
            projectId={project.id}
            nodeId={canvasId}
            title={card.url ? "Change the picture" : "Add a picture"}
            onPick={({ url }) => set({ url: url.slice(0, 2000) })}
          />
          <Commit value={card.caption ?? ""} label="Caption or action" placeholder="Caption / action" onCommit={(caption) => set({ caption: caption.slice(0, 500) })} />
          <div className="grid grid-cols-2 gap-1.5">
            <SelectField value={card.shot ?? ""} aria-label="Shot" onValueChange={(v) => set({ shot: v || undefined })} className={fieldClass}>
              <option value="">Shot…</option>
              {shotTypes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </SelectField>
            <SelectField value={card.move ?? ""} aria-label="Camera move" onValueChange={(v) => set({ move: v || undefined })} className={fieldClass}>
              <option value="">Camera…</option>
              {cameraMoves.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </SelectField>
          </div>
          <Commit
            type="number"
            value={card.duration ? String(card.duration) : ""}
            label="Duration in seconds"
            placeholder="Duration (seconds)"
            onCommit={(v) => set({ duration: Number(v) > 0 ? Math.min(Number(v), 36000) : undefined })}
          />
        </>
      )}
      <Swatches value={card.color} onChange={(color) => set({ color: color ?? undefined })} />
      {connections.length > 0 && (
        <section aria-label="Connections" className="grid gap-1">
          <p className="text-meta font-medium text-muted-foreground">Connections · {connections.length}</p>
          <ul className="grid max-h-40 gap-0.5 overflow-y-auto">
            {connections.map((c) => (
              <li key={c.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelectConnection(c.id)}
                  className="min-h-8 min-w-0 flex-1 truncate rounded px-1 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {c.text}
                </button>
                <IconButton icon="trash-bin-minimalistic-linear" label={`Remove the connection ${c.text}`} size="xs" variant="destructive" onClick={() => onRemoveConnection(c.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <button type="button" onClick={remove} className="flex h-8 items-center justify-center gap-1.5 rounded-md text-destructive hover:bg-destructive/10">
        <Icon name="trash-bin-minimalistic-linear" className="size-3.5" />
        Remove from canvas
      </button>
    </div>
  );
}

function EdgeEditor({ edge, onChange, onRemove }: { edge?: EdgeData; onChange: (label: string) => void; onRemove: () => void }) {
  if (!edge) return null;
  return (
    <div className="absolute top-3 right-3 z-10 grid w-60 gap-2 rounded-lg border bg-popover p-3 text-ui-sm shadow-md">
      <p className="text-meta font-medium text-muted-foreground">Connection</p>
      <Commit value={edge.label ?? ""} label="Connection label" placeholder="Label (causes, then, meanwhile…)" onCommit={(v) => onChange(v.slice(0, 80))} />
      <button type="button" onClick={onRemove} className="flex h-8 items-center justify-center gap-1.5 rounded-md text-destructive hover:bg-destructive/10">
        <Icon name="trash-bin-minimalistic-linear" className="size-3.5" />
        Remove
      </button>
    </div>
  );
}
