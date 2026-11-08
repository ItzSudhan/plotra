"use client";

import { Icon } from "@plotra/icons";
import { Button } from "@plotra/ui/components/button";
import { IconButton } from "@plotra/ui/components/icon-button";
import { undoToast } from "@plotra/ui/components/sonner";
import { cn } from "@plotra/ui/lib/utils";
import {
  Background,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useInternalNode,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type InternalNode,
  type Node,
  type NodeChange,
  type NodeProps,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { NODE_MIME } from "@/components/workspace/binder";
import { useStore } from "@/components/workspace/stores";
import { useViewSetting } from "@/components/workspace/shell-prefs";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { STORY_NOTICE, useStory } from "@/components/workflow/data";
import { createRelationship, deleteRelationship, updateRelationship, type Relationship } from "@/lib/story-actions";
import { familyTree, PARENT, SIBLING, SPOUSE } from "@/lib/family-tree";
import { relationshipMeta, relationshipTypes, relationshipTypesFor, type RelationshipAmong } from "@/lib/story";
import { useWorld } from "@/components/world/data";
import { flatten, type BinderNode } from "@/lib/tree";
import { CommitInput, EmptyState, errorText, Field, Segmented, ToolButton, Toolbar } from "./view-ui";
import { SelectField } from "@plotra/ui/components/select-field";
import { plural } from "@/lib/plural";

// Relationship map (plan.md 2.5): characters and the typed, labelled edges
// between them, editable on the map. Drag from one character to another to
// relate them. Positions are remembered per browser.
//
// It can show other kinds of note instead (beat-the-competitors.md, item 6):
// places, or the entries of a world-bible type (factions, nations, houses),
// with stances between them (at war, trades with, vassal of): a diplomacy web.
// And characters can be laid out as a family tree (lib/family-tree.ts), from
// "Parent of", "Married to" and "Sibling of".

type CharacterNode = Node<{ node: BinderNode; links: number; tree?: boolean }>;
type RelEdge = Edge<{ rel: Relationship }>;

/** What the map shows: characters, places, or one world-bible type's entries (`type:<id>`). */
type Show = string;

// Characters keep the key positions were always kept under.
const positionsKey = (projectId: string, show: Show) => (show === "characters" ? `plotra:relationships:${projectId}` : `plotra:relationships:${projectId}:${show}`);

/** A card in the family tree: arranged, not dragged, and joined top to bottom and side to side. */
function PersonCard({ data, selected }: NodeProps<CharacterNode>) {
  const hidden = "!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent";
  return (
    <div className={cn("relative flex w-[190px] items-center gap-2 rounded-lg border bg-card px-2 py-1.5 shadow-sm", selected && "ring-2 ring-ember/60")}>
      <Handle type="target" id="top" position={Position.Top} className={hidden} isConnectable={false} />
      <Handle type="source" id="bottom" position={Position.Bottom} className={hidden} isConnectable={false} />
      <Handle type="source" id="right" position={Position.Right} className={hidden} isConnectable={false} />
      <Handle type="target" id="left" position={Position.Left} className={hidden} isConnectable={false} />
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-rose/15 font-display text-base text-rose-ink">{data.node.title.slice(0, 1).toUpperCase()}</span>
      <span className="min-w-0 truncate text-ui-sm font-medium">{data.node.title}</span>
    </div>
  );
}

function CharacterCard({ data, selected }: NodeProps<CharacterNode>) {
  const { node, links } = data;
  // The avatar is the connection handle: drag from it to relate; drag the name to move the card.
  const handle = "!left-1.5 !top-1/2 !size-8 !-translate-y-1/2 !translate-x-0 !rounded-full !border-0 !bg-transparent !cursor-crosshair";
  return (
    <div
      className={cn(
        "relative flex min-w-36 items-center gap-2.5 rounded-full border bg-card py-1.5 pr-4 pl-1.5 shadow-sm",
        selected && "ring-2 ring-ember/60",
      )}
    >
      <Handle type="source" position={Position.Left} className={handle} title="Drag to another character to relate them" />
      <span className="pointer-events-none grid size-8 shrink-0 place-items-center rounded-full bg-rose/15 font-display text-lg text-rose-ink">
        {node.title.slice(0, 1).toUpperCase()}
      </span>
      <span className="pointer-events-none min-w-0">
        <span className="block truncate text-ui-sm font-medium">{node.title}</span>
        <span className="block text-meta text-faint">
          {links} {plural(links, "relationship")}
        </span>
      </span>
    </div>
  );
}

/** Where the line from one node's centre to another's crosses its border. */
function borderPoint(from: InternalNode, to: InternalNode) {
  const w = (from.measured.width ?? 0) / 2;
  const h = (from.measured.height ?? 0) / 2;
  const x1 = from.internals.positionAbsolute.x + w;
  const y1 = from.internals.positionAbsolute.y + h;
  const x2 = to.internals.positionAbsolute.x + (to.measured.width ?? 0) / 2;
  const y2 = to.internals.positionAbsolute.y + (to.measured.height ?? 0) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (!dx && !dy) return { x: x1, y: y1 };
  const scale = 1 / Math.max(Math.abs(dx) / (w || 1), Math.abs(dy) / (h || 1));
  return { x: x1 + dx * scale, y: y1 + dy * scale };
}

function RelationshipEdge({ id, source, target, data, selected, markerEnd, markerStart }: EdgeProps<RelEdge>) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t || !data) return null;
  const a = borderPoint(s, t);
  const b = borderPoint(t, s);
  // Bow parallel edges apart a little so two relationships between the same pair stay readable.
  const offset = (parseInt(id.replace(/[^0-9a-f]/g, "").slice(0, 2) || "0", 16) % 5) * 9 - 18;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const cx = mx + (-(b.y - a.y) / len) * offset;
  const cy = my + ((b.x - a.x) / len) * offset;
  const path = `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
  const meta = relationshipMeta(data.rel.type);
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{ stroke: meta.color, strokeWidth: selected ? 3 : 2, opacity: selected ? 1 : 0.8 }}
      />
      <EdgeLabelRenderer>
        <div
          style={{ transform: `translate(-50%, -50%) translate(${(mx + cx) / 2}px, ${(my + cy) / 2}px)`, borderColor: meta.color }}
          className={cn("nodrag nopan pointer-events-auto absolute rounded-full border bg-background px-2 py-px text-meta shadow-sm", selected && "ring-2 ring-ember/50")}
        >
          {data.rel.label || meta.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

/** How a relationship is read out: "Ana — Sister of — Ben". */
function relationshipLabel(rel: Relationship, title: (id: string) => string | undefined) {
  return `${title(rel.fromNodeId) || "Untitled"} — ${rel.label || relationshipMeta(rel.type).label} — ${title(rel.toNodeId) || "Untitled"}`;
}

const nodeTypes = { character: CharacterCard, person: PersonCard };
const edgeTypes = { relationship: RelationshipEdge };

export function RelationshipsView() {
  return (
    <ReactFlowProvider>
      <RelationshipMap />
    </ReactFlowProvider>
  );
}

function RelationshipMap() {
  const { project, binder, openNode, notify, actions } = useWorkspace();
  const { index } = useStore(binder);
  const { data: story, refresh } = useStory();
  const entityTypes = useWorld().data?.entityTypes;
  const { resolvedTheme } = useTheme();
  const flow = useReactFlow();
  // Remembered for the person (useViewSetting).
  const [onlyLinked, setOnlyLinked] = useViewSetting("relationships.onlyLinked", false, (v) => (typeof v === "boolean" ? v : undefined));
  const [savedShow, setShow] = useViewSetting<Show>("relationships.show", "characters", (v) => (typeof v === "string" ? v : undefined));
  const [savedLayout, setLayout] = useViewSetting<"map" | "tree">("relationships.layout", "map", (v) => (v === "map" || v === "tree" ? v : undefined));
  // A type that isn't in this project (the setting is the person's, in every project) shows characters.
  const shownType = savedShow.startsWith("type:") ? entityTypes?.find((t) => t.id === savedShow.slice(5)) : undefined;
  const show: Show = savedShow === "locations" || shownType ? savedShow : "characters";
  const people = show === "characters";
  const among: RelationshipAmong = people ? "people" : "powers";
  const tree = people && savedLayout === "tree";
  const what = people ? { one: "character", many: "characters" } : show === "locations" ? { one: "place", many: "places" } : { one: shownType!.name.toLowerCase(), many: shownType!.plural.toLowerCase() };
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [nodes, setNodes] = useState<CharacterNode[]>([]);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  // The "Add relationship" form, and the type it starts on.
  const [adding, setAdding] = useState<string | null>(null);
  // Every relationship as a list: the way to them without a mouse.
  const [listing, setListing] = useViewSetting("relationships.list", false, (v) => (typeof v === "boolean" ? v : undefined));
  const titleOf = (id: string) => index.byId.get(id)?.title;

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
      setPositions(JSON.parse(localStorage.getItem(positionsKey(project.id, show)) ?? "{}"));
    } catch {}
    setNodes([]);
  }, [project.id, show]);

  const characters = useMemo(
    () =>
      flatten(index).filter((n) =>
        show === "characters" ? n.kind === "character" : show === "locations" ? n.kind === "location" : n.kind === "entity" && n.entityTypeId === show.slice(5),
      ),
    [index, show],
  );
  const relationships = useMemo(() => story?.relationships ?? [], [story?.relationships]);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of relationships) for (const id of [r.fromNodeId, r.toNodeId]) map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  }, [relationships]);

  // The family tree arranges itself from the family relationships.
  const family = useMemo(
    () => (tree ? familyTree(characters.map((c) => ({ id: c.id, title: c.title })), relationships.map((r) => ({ from: r.fromNodeId, to: r.toNodeId, type: r.type }))) : null),
    [characters, relationships, tree],
  );

  // Rebuild nodes when characters or relationships change; place new ones on a circle.
  useEffect(() => {
    if (family) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from the binder and story data
      setNodes(
        characters
          .filter((c) => family.positions.has(c.id))
          .map((c) => ({ id: c.id, type: "person", position: family.positions.get(c.id)!, draggable: false, data: { node: c, links: counts.get(c.id) ?? 0, tree: true } })),
      );
      return;
    }
    const shown = onlyLinked ? characters.filter((c) => counts.has(c.id)) : characters;
    const radius = Math.max(220, shown.length * 34);
    setNodes((prev) => {
      const before = new Map(prev.filter((n) => !n.data.tree).map((n) => [n.id, n]));
      return shown.map((c, i) => {
        const angle = (i / Math.max(shown.length, 1)) * Math.PI * 2;
        return {
          ...(before.get(c.id) ?? {}),
          id: c.id,
          type: "character",
          position: before.get(c.id)?.position ?? positions[c.id] ?? { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
          data: { node: c, links: counts.get(c.id) ?? 0 },
        } as CharacterNode;
      });
    });
  }, [characters, counts, family, onlyLinked, positions]);
  useEffect(() => {
    requestAnimationFrame(() => void flow.fitView({ padding: 0.2, duration: 300 }));
  }, [flow, tree, show]);

  const treeEdges = useMemo<RelEdge[]>(() => {
    if (!family) return [];
    return relationships.flatMap((r): RelEdge[] => {
      const from = family.positions.get(r.fromNodeId);
      const to = family.positions.get(r.toNodeId);
      if (!from || !to) return [];
      const meta = relationshipMeta(r.type);
      const style = { stroke: meta.color, strokeWidth: r.id === selectedEdge ? 3 : 2 };
      const ariaLabel = relationshipLabel(r, (id) => index.byId.get(id)?.title);
      if (r.type === PARENT) {
        return [{ id: r.id, source: r.fromNodeId, target: r.toNodeId, sourceHandle: "bottom", targetHandle: "top", type: "smoothstep", data: { rel: r }, style, selected: r.id === selectedEdge, ariaLabel }];
      }
      if (r.type === SPOUSE || r.type === SIBLING) {
        // From whoever is on the left to whoever is on the right.
        const [left, right] = from.x <= to.x ? [r.fromNodeId, r.toNodeId] : [r.toNodeId, r.fromNodeId];
        return [
          {
            id: r.id,
            source: left,
            target: right,
            sourceHandle: "right",
            targetHandle: "left",
            type: "straight",
            data: { rel: r },
            style: { ...style, ...(r.type === SIBLING && { strokeDasharray: "4 4" }) },
            ...(r.label && { label: r.label }),
            selected: r.id === selectedEdge,
            ariaLabel,
          },
        ];
      }
      return [];
    });
  }, [family, index, relationships, selectedEdge]);

  const mapEdges = useMemo<RelEdge[]>(
    () =>
      relationships
        .filter((r) => nodes.some((n) => n.id === r.fromNodeId) && nodes.some((n) => n.id === r.toNodeId))
        .map((r) => {
          const meta = relationshipMeta(r.type);
          const directed = r.directed || meta.directed;
          return {
            id: r.id,
            source: r.fromNodeId,
            target: r.toNodeId,
            type: "relationship",
            data: { rel: r },
            selected: r.id === selectedEdge,
            // Focusable: Enter or Space opens it, Delete removes it (with Undo).
            ariaLabel: relationshipLabel(r, (id) => index.byId.get(id)?.title),
            // Mutual relationships are plain lines; one-way ones point at whoever they're about.
            ...(directed && { markerEnd: { type: MarkerType.ArrowClosed, color: meta.color, width: 14, height: 14 } }),
          };
        }),
    [index, nodes, relationships, selectedEdge],
  );
  const edges = tree ? treeEdges : mapEdges;

  const changed = () => {
    notify(STORY_NOTICE);
    refresh();
  };

  const onNodesChange = (changes: NodeChange<CharacterNode>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    const done = changes.filter((c) => c.type === "position" && !c.dragging && c.position);
    if (done.length) {
      setPositions((prev) => {
        const next = { ...prev };
        for (const c of done) if (c.type === "position" && c.position) next[c.id] = c.position;
        try {
          localStorage.setItem(positionsKey(project.id, show), JSON.stringify(next));
        } catch {}
        return next;
      });
    }
  };

  const onConnect = async (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    const from = index.byId.get(c.source);
    if (!from?.actions.includes("edit")) {
      toast.error(`You can't edit ${from?.title ?? `that ${what.one}`}.`);
      return;
    }
    try {
      const rel = await createRelationship(project.id, { fromNodeId: c.source, toNodeId: c.target, type: "ally" });
      changed();
      setSelectedEdge(rel.id);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  /** Deletes relationships at once (the panel, the list or the Delete key), with Undo. */
  const removeRelationships = async (doomed: Relationship[]) => {
    const mine = doomed.filter((r) => index.byId.get(r.fromNodeId)?.actions.includes("edit"));
    if (!mine.length) return;
    const gone: Relationship[] = [];
    for (const r of mine) {
      try {
        await deleteRelationship(project.id, r.id);
        gone.push(r);
      } catch (error) {
        toast.error(errorText(error));
      }
    }
    if (!gone.length) return;
    changed();
    if (gone.some((r) => r.id === selectedEdge)) setSelectedEdge(null);
    const one = gone[0];
    undoToast(
      gone.length === 1 ? `Deleted the relationship between ${titleOf(one.fromNodeId) ?? "them"} and ${titleOf(one.toNodeId) ?? "them"}` : `Deleted ${gone.length} relationships`,
      async () => {
        try {
          for (const r of gone) await createRelationship(project.id, { fromNodeId: r.fromNodeId, toNodeId: r.toNodeId, type: r.type, label: r.label, directed: r.directed });
          changed();
        } catch (error) {
          toast.error(errorText(error));
        }
      },
    );
  };

  // Enter or Space on a focused line selects it, which opens its panel.
  const onEdgesChange = (changes: EdgeChange<RelEdge>[]) => {
    for (const ch of changes) {
      if (ch.type === "select") setSelectedEdge((current) => (ch.selected ? ch.id : current === ch.id ? null : current));
    }
  };

  const savePositions = (next: Record<string, { x: number; y: number }>) => {
    try {
      if (Object.keys(next).length) localStorage.setItem(positionsKey(project.id, show), JSON.stringify(next));
      else localStorage.removeItem(positionsKey(project.id, show));
    } catch {}
  };

  // Puts everyone back on a circle at once; Undo puts the hand-placed positions back.
  const arrangeInCircle = () => {
    const before = { ...positions, ...Object.fromEntries(nodes.map((n) => [n.id, n.position])) };
    setPositions({});
    setNodes([]);
    savePositions({});
    requestAnimationFrame(() => void flow.fitView({ padding: 0.2, duration: 300 }));
    undoToast(`Arranged the ${what.many} in a circle`, () => {
      setPositions(before);
      setNodes([]);
      savePositions(before);
      requestAnimationFrame(() => void flow.fitView({ padding: 0.2, duration: 300 }));
    });
  };

  const rel = relationships.find((r) => r.id === selectedEdge);
  const canCreate = project.actions.includes("edit");

  return (
    <div className="relative flex h-full flex-col">
      <Toolbar>
        <SelectField value={show} onValueChange={(v) => setShow(v)} aria-label="What the map shows" className="h-7 w-auto rounded-md border border-input bg-transparent px-1.5 text-meta">
          <option value="characters">Characters</option>
          <option value="locations">Places</option>
          {(entityTypes ?? []).map((t) => (
            <option key={t.id} value={`type:${t.id}`}>
              {t.plural}
            </option>
          ))}
        </SelectField>
        {people && (
          <Segmented
            value={tree ? "tree" : "map"}
            onChange={(v) => setLayout(v)}
            options={[
              { value: "map", label: "Map" },
              { value: "tree", label: "Family tree" },
            ]}
          />
        )}
        {people ? (
          <ToolButton icon="user-rounded-linear" label="New character" disabled={!canCreate} onClick={() => void actions.create("character", undefined, undefined, { open: false })}>
            Character
          </ToolButton>
        ) : null}
        {!tree && (
          <ToolButton icon="filter-linear" label={`Only ${what.many} with relationships`} pressed={onlyLinked} onClick={() => setOnlyLinked(!onlyLinked)}>
            Only related
          </ToolButton>
        )}
        {characters.length > 1 && (
          <ToolButton
            icon="link-round-linear"
            label="Add a relationship"
            pressed={adding !== null}
            onClick={() => {
              setSelectedEdge(null);
              setAdding(adding === null ? (tree ? PARENT : relationshipTypesFor(among)[0]?.id ?? "ally") : null);
            }}
          >
            Add relationship
          </ToolButton>
        )}
        {relationships.length > 0 && (
          <ToolButton icon="list-linear" label="Show every relationship as a list" pressed={listing} onClick={() => setListing(!listing)}>
            List
          </ToolButton>
        )}
        <ToolButton icon="people-nearby-linear" label="Arrange in a circle" disabled={tree} onClick={arrangeInCircle} />
        <ToolButton icon="full-screen-linear" label="Fit everything" onClick={() => void flow.fitView({ padding: 0.2, duration: 300 })} />
        <span className="ml-auto flex shrink-0 flex-wrap items-center gap-2.5 text-meta text-muted-foreground">
          {(tree ? relationshipTypes.filter((t) => t.id === PARENT || t.id === SPOUSE || t.id === SIBLING) : relationshipTypesFor(among)).map((t) => (
            <span key={t.id} className="flex items-center gap-1">
              <span className="h-0.5 w-3 rounded" style={{ backgroundColor: t.color }} />
              {t.label}
            </span>
          ))}
        </span>
      </Toolbar>
      <div
        className="relative min-h-0 flex-1"
        onDragOver={(e) => e.dataTransfer.types.includes(NODE_MIME) && e.preventDefault()}
        onDrop={(e) => {
          // Dropping one from the binder places it there.
          const id = e.dataTransfer.getData(NODE_MIME);
          if (tree || !characters.some((c) => c.id === id)) return;
          e.preventDefault();
          const at = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
          setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, position: at } : n)));
          onNodesChange([{ type: "position", id, position: at, dragging: false }]);
        }}
      >
        {characters.length === 0 ? (
          <EmptyState
            icon="users-group-two-rounded-bold-duotone"
            title={`No ${what.many} yet`}
            action={people && canCreate && { label: "New character", onClick: () => void actions.create("character") }}
          >
            {people
              ? "Create character notes in the binder, then drag from one to another here to relate them."
              : `Add ${what.many} to the binder, then drag from one to another here to say where they stand: allies, at war, trading, a vassal.`}
          </EmptyState>
        ) : tree && family && family.positions.size === 0 ? (
          <EmptyState
            icon="users-group-two-rounded-bold-duotone"
            title="No family yet"
            action={characters.length > 1 && canCreate && { label: "Add a family tie", icon: "link-round-linear", onClick: () => setAdding(PARENT) }}
          >
            The tree is drawn from &ldquo;Parent of&rdquo;, &ldquo;Married to&rdquo; and &ldquo;Sibling of&rdquo;. Add one of those between two characters, or relate them that way on the map.
          </EmptyState>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onConnect={(c) => void onConnect(c)}
            onConnectEnd={(event, state) => {
              // Dropping anywhere on another character (not just its avatar) relates them too.
              if (state.isValid || !state.fromNode) return;
              const point = "changedTouches" in event ? event.changedTouches[0] : event;
              const target = document.elementFromPoint(point.clientX, point.clientY)?.closest<HTMLElement>(".react-flow__node");
              const id = target?.dataset.id;
              if (id && id !== state.fromNode.id) void onConnect({ source: state.fromNode.id, target: id, sourceHandle: null, targetHandle: null });
            }}
            onEdgeClick={(_, e) => setSelectedEdge(e.id)}
            onEdgesChange={onEdgesChange}
            edgesFocusable
            // Delete removes the selected relationship, with Undo; cards are never removed here.
            deleteKeyCode={["Backspace", "Delete"]}
            onBeforeDelete={async ({ edges: removed }) => {
              void removeRelationships(relationships.filter((r) => removed.some((e) => e.id === r.id)));
              return false;
            }}
            onPaneClick={() => setSelectedEdge(null)}
            onNodeDoubleClick={(_, n) => openNode(n.id, "tab")}
            nodesConnectable={!tree}
            connectionMode={ConnectionMode.Loose}
            colorMode={resolvedTheme === "dark" ? "dark" : "light"}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.15}
            className="bg-background"
          >
            <Background gap={22} size={1.2} />
            <Controls showInteractive={false} position="bottom-left" />
          </ReactFlow>
        )}
        {!tree && nodes.length > 1 && relationships.length === 0 && (
          <p className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-popover px-3 py-1.5 text-xs text-muted-foreground shadow">
            Drag from one {what.one}&apos;s initial to another to relate them, or use Add relationship.
          </p>
        )}
        {tree && family && family.left.length > 0 && family.positions.size > 0 && (
          <p className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-popover px-3 py-1.5 text-xs text-muted-foreground shadow">
            {family.left.length === 1 ? "1 character with no family ties is" : `${family.left.length} characters with no family ties are`} on the map, not in the tree.
          </p>
        )}
        {listing && relationships.length > 0 && (
          <RelationshipList
            relationships={relationships.filter((r) => characters.some((c) => c.id === r.fromNodeId) && characters.some((c) => c.id === r.toNodeId))}
            selected={selectedEdge}
            what={what}
            onEdit={(id) => {
              setAdding(null);
              setSelectedEdge(id);
            }}
            onDelete={(r) => void removeRelationships([r])}
            onClose={() => setListing(false)}
          />
        )}
        {rel && (
          <RelationshipPanel key={rel.id} rel={rel} among={among} onClose={() => setSelectedEdge(null)} onChanged={changed} onDelete={() => void removeRelationships([rel])} />
        )}
        {!rel && adding !== null && (
          <AddRelationship
            key={adding}
            candidates={characters}
            among={among}
            startType={adding}
            what={what}
            onClose={() => setAdding(null)}
            onAdded={(id) => {
              changed();
              setAdding(null);
              if (!tree) setSelectedEdge(id);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Every relationship on the map as rows, each with Edit and Delete. */
function RelationshipList({
  relationships,
  selected,
  what,
  onEdit,
  onDelete,
  onClose,
}: {
  relationships: Relationship[];
  selected: string | null;
  what: { one: string; many: string };
  onEdit: (id: string) => void;
  onDelete: (rel: Relationship) => void;
  onClose: () => void;
}) {
  const { binder } = useWorkspace();
  const { index } = useStore(binder);
  const title = (id: string) => index.byId.get(id)?.title;
  const sorted = [...relationships].sort((a, b) => relationshipLabel(a, title).localeCompare(relationshipLabel(b, title)));
  return (
    <aside
      aria-label="Relationships"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      className="absolute top-3 left-3 z-10 flex max-h-[calc(100%-1.5rem)] w-80 flex-col rounded-lg border bg-popover text-ui-sm shadow-lg"
    >
      <div className="flex items-center gap-2 border-b p-2 pl-3">
        <h3 className="min-w-0 flex-1 font-medium">Relationships · {sorted.length}</h3>
        <IconButton icon="close-linear" label="Close the list" size="xs" onClick={onClose} />
      </div>
      {sorted.length === 0 ? (
        <p className="p-3 text-muted-foreground">None between the {what.many} shown.</p>
      ) : (
        <ul className="min-h-0 overflow-y-auto p-1">
          {sorted.map((r) => {
            const editable = !!index.byId.get(r.fromNodeId)?.actions.includes("edit");
            const label = relationshipLabel(r, title);
            return (
              <li key={r.id} className={cn("flex items-center gap-1 rounded-md pl-2", r.id === selected && "bg-accent")}>
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: relationshipMeta(r.type).color }} aria-hidden />
                <button
                  type="button"
                  aria-current={r.id === selected || undefined}
                  onClick={() => onEdit(r.id)}
                  className="min-h-8 min-w-0 flex-1 truncate rounded px-1 text-left outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {label}
                </button>
                <IconButton icon="pen-linear" label={`Edit ${label}`} size="xs" onClick={() => onEdit(r.id)} />
                {editable && <IconButton icon="trash-bin-minimalistic-linear" label={`Delete ${label}`} size="xs" variant="destructive" onClick={() => onDelete(r)} />}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

function RelationshipPanel({
  rel,
  among,
  onClose,
  onChanged,
  onDelete,
}: {
  rel: Relationship;
  among: RelationshipAmong;
  onClose: () => void;
  onChanged: () => void;
  onDelete: () => void;
}) {
  const { project, binder } = useWorkspace();
  const { index } = useStore(binder);
  const from = index.byId.get(rel.fromNodeId);
  const to = index.byId.get(rel.toNodeId);
  const editable = !!from?.actions.includes("edit");
  const builtin = relationshipTypes.some((t) => t.id === rel.type);
  const [custom, setCustom] = useState(!builtin);

  const save = async (patch: Parameters<typeof updateRelationship>[2]) => {
    try {
      await updateRelationship(project.id, rel.id, patch);
      onChanged();
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <aside className="absolute top-3 right-3 z-10 grid w-72 gap-3 rounded-lg border bg-popover p-3 text-ui-sm shadow-lg">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-medium">
          {from?.title} {rel.directed || relationshipMeta(rel.type).directed ? "→" : "↔"} {to?.title}
        </p>
        <IconButton icon="close-linear" label="Close" size="xs" onClick={onClose} />
      </div>
      <Field label="Type">
        <SelectField
          disabled={!editable}
          value={custom ? "__custom" : rel.type}
          onValueChange={(v) => {
            if (v === "__custom") setCustom(true);
            else {
              setCustom(false);
              void save({ type: v });
            }
          }}
          className="h-7 rounded-md border border-input bg-transparent px-1.5"
        >
          {[...relationshipTypesFor(among), ...relationshipTypes.filter((t) => t.id === rel.type && !relationshipTypesFor(among).some((o) => o.id === t.id))].map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
          <option value="__custom">Other…</option>
        </SelectField>
      </Field>
      {custom && (
        <CommitInput value={builtin ? "" : rel.type} placeholder="e.g. betrayed, owes a debt to" disabled={!editable} onCommit={(type) => type.trim() && void save({ type })} />
      )}
      <Field label="Label">
        <CommitInput value={rel.label ?? ""} placeholder="Shown on the map instead of the type" disabled={!editable} onCommit={(label) => void save({ label })} />
      </Field>
      {editable && (
        <div className="flex flex-wrap gap-1.5">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={rel.directed} onChange={(e) => void save({ directed: e.target.checked })} />
            One-way
          </label>
          <button type="button" onClick={() => void save({ reverse: true })} className="ml-auto flex h-7 items-center gap-1 rounded-md px-2 hover:bg-accent">
            <Icon name="transfer-horizontal-linear" className="size-3.5" />
            Reverse
          </button>
        </div>
      )}
      {editable && (
        <button
          type="button"
          onClick={onDelete}
          className="flex h-8 items-center justify-center gap-1.5 rounded-md text-destructive hover:bg-destructive/10"
        >
          <Icon name="trash-bin-minimalistic-linear" className="size-3.5" />
          Delete relationship
        </button>
      )}
    </aside>
  );
}

/** Relating two notes without dragging: from, type, to. */
function AddRelationship({
  candidates,
  among,
  startType,
  what,
  onClose,
  onAdded,
}: {
  candidates: BinderNode[];
  among: RelationshipAmong;
  startType: string;
  what: { one: string; many: string };
  onClose: () => void;
  onAdded: (id: string) => void;
}) {
  const { project } = useWorkspace();
  const editable = candidates.filter((c) => c.actions.includes("edit"));
  const [from, setFrom] = useState(editable[0]?.id ?? "");
  const [to, setTo] = useState(candidates.find((c) => c.id !== editable[0]?.id)?.id ?? "");
  const [type, setType] = useState(startType);
  const [busy, setBusy] = useState(false);
  const types = [...relationshipTypesFor(among), ...relationshipTypes.filter((t) => t.id === startType && !relationshipTypesFor(among).some((o) => o.id === t.id))];
  const same = from !== "" && from === to;
  const selectClass = "h-8 rounded-md border border-input bg-transparent px-1.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

  const add = async () => {
    if (!from || !to || same) return;
    setBusy(true);
    try {
      const rel = await createRelationship(project.id, { fromNodeId: from, toNodeId: to, type });
      onAdded(rel.id);
    } catch (error) {
      toast.error(errorText(error));
      setBusy(false);
    }
  };

  return (
    <aside aria-label="Add a relationship" className="absolute top-3 right-3 z-10 w-72 rounded-lg border bg-popover p-3 text-ui-sm shadow-lg">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 font-medium">Add a relationship</p>
          <IconButton icon="close-linear" label="Close" size="xs" onClick={onClose} />
        </div>
        {editable.length === 0 ? (
          <p className="text-muted-foreground">You can&apos;t edit any of these {what.many}, so you can&apos;t relate them.</p>
        ) : (
          <>
            <Field label="From">
              <SelectField autoFocus value={from} onValueChange={setFrom} className={selectClass}>
                {editable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title || "Untitled"}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="Relationship">
              <SelectField value={type} onValueChange={setType} className={selectClass}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label="To">
              <SelectField value={to} onValueChange={setTo} className={selectClass}>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title || "Untitled"}
                  </option>
                ))}
              </SelectField>
            </Field>
            {same && (
              <p role="alert" className="text-destructive">
                Pick two different {what.many}.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy || !from || !to || same}>
                Add
              </Button>
            </div>
          </>
        )}
      </form>
    </aside>
  );
}
