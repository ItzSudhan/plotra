"use client";

import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import {
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { IconButton } from "@plotra/ui/components/icon-button";
import { undoToast } from "@plotra/ui/components/sonner";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { useHorizon, useWorld, WORLD_NOTICE } from "@/components/world/data";
import {
  countStates,
  doneObjectives,
  MAX_QUEST_OBJECTIVE as MAX_OBJECTIVE,
  MAX_QUEST_OBJECTIVES as MAX_OBJECTIVES,
  QUEST_DONE_KEY,
  QUEST_STATE_KEY,
  QUEST_STATES,
  questReady,
  questState,
  questStateMeta,
  questTiers,
  renameDone,
  storedQuestState,
  tierLayout,
  toggleDone,
  wouldLoop,
  type QuestLink,
  type QuestState,
} from "@/lib/interactive/quests";
import { setQuestProgress } from "@/lib/quest-actions";
import { setNodeSettings } from "@/lib/story-actions";
import { ensureWorldDefaults } from "@/lib/world-actions";
import { flatten, isTrashed, nodeKindMeta, type BinderNode } from "@/lib/tree";
import { CommitInput, EmptyState, errorText, Field, fieldClass, ToolButton, Toolbar } from "./view-ui";
import { SelectField } from "@plotra/ui/components/select-field";
import { plural } from "@/lib/plural";

// Quest / mission designer (plan.md 2.8): the project's quests as a graph of
// what unlocks what. Quests are world entries of the built-in Quest type, so
// each is a page in the binder; an arrow A → B means A must be done before B
// and is stored in B's "Prerequisites" property. Card positions are saved on
// each quest, so everyone sees the same map. A quest's state and ticked
// objectives (lib/quest-actions.ts) colour its card and filter the map.

type QuestNode = Node<{ quest: BinderNode; tier: number; giver: string | null; objectives: number; done: number; state: QuestState; ready: boolean }>;

const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
const text = (value: unknown) => (typeof value === "string" ? value : "");

type Workspace = ReturnType<typeof useWorkspace>;

/** Puts a removed prerequisite back, reading the quest as it is now (for Undo, which runs after later renders). */
function relink(binder: Workspace["binder"], actions: Workspace["actions"], before: string, after: string) {
  const quest = binder.get().index.byId.get(after);
  if (!quest || !binder.get().index.byId.has(before)) return;
  const current = list(quest.properties.prerequisites);
  if (!current.includes(before)) void actions.setProperties(after, { prerequisites: [...current, before] });
}

/** A quest's state as a small coloured pill. */
function StateBadge({ state, ready }: { state: QuestState; ready?: boolean }) {
  const meta = questStateMeta(state);
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 text-meta leading-4 text-foreground" style={{ borderColor: meta.color }}>
      <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {ready ? "Ready" : meta.label}
    </span>
  );
}

function QuestCard({ data, selected }: NodeProps<QuestNode>) {
  const { quest, tier, giver, objectives, done, state, ready } = data;
  const editable = quest.actions.includes("edit");
  const handle = cn("!size-2.5 !border-2 !border-background !bg-ember", !editable && "!opacity-40");
  return (
    <div
      className={cn("w-56 rounded-lg border border-l-4 bg-card px-3 py-2 shadow-sm", selected && "ring-2 ring-ember/60", state === "failed" && "opacity-75")}
      style={{ borderLeftColor: questStateMeta(state).color }}
    >
      <Handle type="target" position={Position.Left} className={handle} />
      <p className="flex items-center gap-1.5 text-meta text-faint">
        <Icon name="target-linear" className="size-3.5 text-ember-ink" />
        <span className="flex-1">{tier === 1 ? "Tier 1 · open from the start" : `Tier ${tier}`}</span>
        <StateBadge state={state} ready={ready} />
      </p>
      <p className={cn("mt-0.5 font-display text-lg leading-tight", state === "failed" && "line-through decoration-1")}>{quest.title}</p>
      <p className="mt-1 truncate text-meta text-muted-foreground">
        {done > 0 ? `${done}/${objectives} objectives done` : `${objectives} ${plural(objectives, "objective")}`}
        {giver && ` · from ${giver}`}
      </p>
      <Handle type="source" position={Position.Right} className={cn(handle, "!cursor-crosshair")} title="Drag to the quest this one unlocks" />
    </div>
  );
}

const nodeTypes = { quest: QuestCard };

export function QuestsView() {
  return (
    <ReactFlowProvider>
      <QuestMap />
    </ReactFlowProvider>
  );
}

const edgeId = (before: string, after: string) => `${before}>${after}`;

function QuestMap() {
  const { project, binder, actions, openNode, modules, notify, setUi } = useWorkspace();
  const { index } = useStore(binder);
  const { data: world, refresh: refreshWorld } = useWorld();
  const horizon = useHorizon();
  const { resolvedTheme } = useTheme();
  const flow = useReactFlow<QuestNode>();
  const [nodes, setNodes] = useState<QuestNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  // States left off the map. Empty: every quest shows.
  const [hidden, setHidden] = useState<ReadonlySet<QuestState>>(new Set());

  const questType = world?.entityTypes.find((t) => t.builtin === "quest");
  const quests = useMemo(
    () => (questType ? flatten(index).filter((n) => n.kind === "entity" && n.entityTypeId === questType.id && (!horizon || horizon.shows(n.id))) : []),
    [horizon, index, questType],
  );
  const links = useMemo<QuestLink[]>(() => quests.map((q) => ({ id: q.id, prerequisites: list(q.properties.prerequisites) })), [quests]);
  const tiers = useMemo(() => questTiers(links), [links]);
  const states = useMemo(() => new Map(quests.map((q) => [q.id, questState(q.properties[QUEST_STATE_KEY])])), [quests]);
  const counts = useMemo(() => countStates(states.values()), [states]);
  const tracking = counts["not-started"] < quests.length;
  // Tiers and places come from every quest the horizon shows; the state filter only hides cards.
  const shown = useMemo(() => quests.filter((q) => !hidden.has(states.get(q.id) ?? "not-started")), [hidden, quests, states]);

  const auto = useMemo(() => tierLayout(links, tiers), [links, tiers]);

  // Rebuild the cards when quests change. A quest nobody has placed yet sits in its tier's column.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from the binder
    setNodes((prev) => {
      const before = new Map(prev.map((n) => [n.id, n]));
      return shown.map((quest) => {
        const old = before.get(quest.id);
        const { x, y } = quest.settings;
        const saved = typeof x === "number" && typeof y === "number" ? { x, y } : null;
        const giver = text(quest.properties.giver);
        const character = giver ? index.byId.get(giver) : undefined;
        return {
          ...(old ?? {}),
          id: quest.id,
          type: "quest",
          // A card being dragged keeps following the pointer.
          position: old?.dragging ? old.position : (saved ?? auto.get(quest.id) ?? { x: 0, y: 0 }),
          data: {
            quest,
            tier: tiers.get(quest.id) ?? 1,
            giver: character && !isTrashed(index, character.id) ? character.title : null,
            objectives: list(quest.properties.objectives).length,
            done: doneObjectives(list(quest.properties.objectives), list(quest.properties[QUEST_DONE_KEY])).length,
            state: states.get(quest.id) ?? "not-started",
            // "Ready" only means something once the project tracks states at all.
            ready: tracking && questReady(links, states, quest.id),
          },
          selected: quest.id === selectedId,
          deletable: false,
        } as QuestNode;
      });
    });
  }, [auto, index, links, selectedId, shown, states, tiers, tracking]);

  const edges = useMemo<Edge[]>(() => {
    const visible = new Set(shown.map((q) => q.id));
    return links.flatMap((quest) =>
      [...new Set(quest.prerequisites)]
        .filter((before) => visible.has(before) && visible.has(quest.id) && before !== quest.id)
        .map((before) => {
          const id = edgeId(before, quest.id);
          return {
            id,
            source: before,
            target: quest.id,
            // Focusable: Enter or Space selects it, Delete removes it (with Undo).
            ariaLabel: `‘${index.byId.get(before)?.title ?? "A quest"}’ must be done before ‘${index.byId.get(quest.id)?.title ?? "this quest"}’`,
            selected: id === selectedEdge,
            deletable: !!index.byId.get(quest.id)?.actions.includes("edit"),
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
            style: { stroke: id === selectedEdge ? "var(--ember)" : "var(--muted-foreground)", strokeWidth: id === selectedEdge ? 2.5 : 1.5 },
          };
        }),
    );
  }, [index, links, selectedEdge, shown]);

  const savePosition = (id: string, position: { x: number; y: number } | null) => {
    const quest = index.byId.get(id);
    // Someone who can't edit a quest can still move it around for themselves, until the map reloads.
    if (!quest?.actions.includes("edit")) return;
    const patch = position ? { x: Math.round(position.x), y: Math.round(position.y) } : { x: null, y: null };
    const settings = { ...quest.settings };
    if (position) Object.assign(settings, patch);
    else {
      delete settings.x;
      delete settings.y;
    }
    binder.patch(id, { settings });
    setNodeSettings(project.id, id, patch)
      .then((n) => binder.upsert(n))
      .catch((error) => toast.error(errorText(error)));
  };

  const onNodesChange = (changes: NodeChange<QuestNode>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns));
    for (const ch of changes) {
      if (ch.type === "position" && !ch.dragging && ch.position) savePosition(ch.id, ch.position);
      if (ch.type === "select") {
        setSelectedId((current) => (ch.selected ? ch.id : current === ch.id ? null : current));
        if (ch.selected) setSelectedEdge(null);
      }
    }
  };

  /** Makes `before` a prerequisite of `after`, unless that would make a loop. */
  const link = (before: string, after: string) => {
    const quest = index.byId.get(after);
    if (!quest || before === after) return;
    if (!quest.actions.includes("edit")) {
      toast.error(`You can't edit ${quest.title}.`);
      return;
    }
    const current = list(quest.properties.prerequisites);
    if (current.includes(before)) return;
    if (wouldLoop(links, before, after)) {
      toast.error(`That would make a loop: ${index.byId.get(before)?.title ?? "that quest"} already needs ${quest.title} first.`);
      return;
    }
    void actions.setProperties(after, { prerequisites: [...current, before] });
  };

  const unlink = (before: string, after: string) => {
    const quest = index.byId.get(after);
    if (!quest?.actions.includes("edit")) return;
    void actions.setProperties(after, { prerequisites: list(quest.properties.prerequisites).filter((id) => id !== before) });
    setSelectedEdge(null);
  };

  /** Removes prerequisites (the panel's button or the Delete key), with Undo. */
  const removeLinks = (removed: Array<{ source: string; target: string }>) => {
    const done = removed.filter((e) => index.byId.get(e.target)?.actions.includes("edit"));
    if (!done.length) return;
    // One target at a time, so removing two arrows into the same quest doesn't lose one.
    const byTarget = new Map<string, string[]>();
    for (const e of done) byTarget.set(e.target, [...(byTarget.get(e.target) ?? []), e.source]);
    for (const [after, befores] of byTarget) {
      const quest = index.byId.get(after)!;
      void actions.setProperties(after, { prerequisites: list(quest.properties.prerequisites).filter((id) => !befores.includes(id)) });
    }
    setSelectedEdge(null);
    const title = (id: string) => index.byId.get(id)?.title ?? "a quest";
    undoToast(
      done.length === 1 ? `Removed ‘${title(done[0].source)}’ from what ‘${title(done[0].target)}’ needs first` : `Removed ${done.length} prerequisites`,
      () => {
        for (const [after, befores] of byTarget) {
          const quest = binder.get().index.byId.get(after);
          if (!quest) continue;
          const current = list(quest.properties.prerequisites);
          const back = befores.filter((id) => !current.includes(id) && binder.get().index.byId.has(id));
          if (back.length) void actions.setProperties(after, { prerequisites: [...current, ...back] });
        }
      },
    );
  };

  const onConnect = (c: Connection) => {
    if (c.source && c.target) link(c.source, c.target);
  };

  const canCreate = project.actions.includes("edit") && !!questType;
  const newQuest = async () => {
    if (!questType) return;
    // Beside the other quests, wherever the writer keeps them.
    const created = await actions.create("entity", quests[0]?.parentId, "New quest", { entityTypeId: questType.id, open: false });
    if (created) setSelectedId(created.id);
  };

  const arrange = () => {
    // Saved places are forgotten, so the columns follow the chain as it changes.
    for (const quest of quests) if (typeof quest.settings.x === "number") savePosition(quest.id, null);
    setNodes((ns) => ns.map((n) => ({ ...n, position: auto.get(n.id) ?? n.position })));
    requestAnimationFrame(() => void flow.fitView({ padding: 0.2, duration: 300 }));
  };

  const toggleHidden = (state: QuestState) =>
    setHidden((current) => {
      const next = new Set(current);
      if (!next.delete(state)) next.add(state);
      return next;
    });

  const selected = selectedId ? shown.find((q) => q.id === selectedId) : undefined;
  const depth = Math.max(0, ...tiers.values());

  // Puts back the built-in Quest type if it was deleted: the same step that adds it when the tool is switched on.
  const restoreQuestType = async () => {
    try {
      await ensureWorldDefaults(project.id);
      notify(WORLD_NOTICE);
      refreshWorld();
      toast.success("The Quest type is back.");
    } catch (error) {
      toast.error(errorText(error, "Couldn't bring back the Quest type. Try again in a moment."));
    }
  };

  if (!world) return null;
  if (!questType) {
    const on = modules.has("interactive");
    const restore = { label: "Restore the Quest type", icon: "restart-linear" as const, onClick: () => void restoreQuestType() };
    const settings = { label: "Open project settings", icon: "settings-linear" as const, onClick: () => setUi({ projectSettings: true }) };
    return (
      <EmptyState icon="target-linear" title="No Quest type" action={project.actions.includes("edit") && (on ? restore : settings)}>
        Quests are world entries of the Quest type, which comes with the Interactive narrative tools.{" "}
        {on
          ? "This project's Quest type was deleted. Restore it to make quests again; your other notes aren't touched."
          : "Switch on Interactive narrative in the project settings to use it."}
      </EmptyState>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <Toolbar>
        <ToolButton icon="add-linear" label="New quest" disabled={!canCreate} onClick={() => void newQuest()}>
          New quest
        </ToolButton>
        <ToolButton icon="sort-from-top-to-bottom-linear" label="Arrange in columns, a tier each" disabled={!quests.length} onClick={arrange}>
          Arrange by tier
        </ToolButton>
        <ToolButton icon="full-screen-linear" label="Fit everything" onClick={() => void flow.fitView({ padding: 0.2, duration: 300 })} />
        {quests.length > 0 && (
          <div role="group" aria-label="Show quests by state" className="ml-2 flex shrink-0 items-center gap-1">
            {QUEST_STATES.map((s) => {
              const on = !hidden.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  title={on ? `Hide ${s.label.toLowerCase()} quests` : `Show ${s.label.toLowerCase()} quests`}
                  onClick={() => toggleHidden(s.id)}
                  className={cn("flex h-6 items-center gap-1 rounded-full border px-2 text-meta hover:bg-accent", !on && "border-dashed text-faint")}
                >
                  <span className="size-2 rounded-full" style={{ backgroundColor: on ? s.color : "transparent", outline: `1px solid ${s.color}` }} />
                  {s.label} <span className="tabular-nums text-muted-foreground">{counts[s.id]}</span>
                </button>
              );
            })}
          </div>
        )}
        {quests.length > 0 && (
          <span className="ml-auto shrink-0 text-meta text-muted-foreground">
            {quests.length} {plural(quests.length, "quest")} · {depth} {plural(depth, "tier")} · an arrow means “do this first”
          </span>
        )}
      </Toolbar>
      <div className="relative min-h-0 flex-1">
        {quests.length === 0 ? (
          <EmptyState icon="target-linear" title="No quests yet">
            Quests are world entries of the Quest type: each is a page in the binder with a giver, objectives, a reward and the notes it reveals. Create
            one, then drag from one quest to another (or pick it under “Needs first” in its panel) to say which has to be done first.
            {canCreate && (
              <button type="button" onClick={() => void newQuest()} className="mx-auto mt-3 flex h-8 items-center gap-1.5 rounded-md border px-3 text-foreground hover:bg-accent">
                <Icon name="add-linear" className="size-4" />
                New quest
              </button>
            )}
          </EmptyState>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onConnect={onConnect}
            onConnectEnd={(event, state) => {
              // Dropping anywhere on another quest (not just its dot) links them too.
              if (state.isValid || !state.fromNode || state.fromHandle?.type !== "source") return;
              const point = "changedTouches" in event ? event.changedTouches[0] : event;
              const over = document.elementFromPoint(point.clientX, point.clientY)?.closest<HTMLElement>(".react-flow__node")?.dataset.id;
              if (over && over !== state.fromNode.id) link(state.fromNode.id, over);
            }}
            onEdgeClick={(_, edge) => {
              setSelectedEdge(edge.id);
              setSelectedId(null);
            }}
            // Keyboard selection (Enter or Space on a focused arrow) arrives as a change.
            onEdgesChange={(changes) => {
              for (const ch of changes) {
                if (ch.type !== "select") continue;
                setSelectedEdge((current) => (ch.selected ? ch.id : current === ch.id ? null : current));
                if (ch.selected) setSelectedId(null);
              }
            }}
            // The Delete key goes through removeLinks, so it can be undone; React Flow removes nothing itself.
            onBeforeDelete={async ({ edges: removed }) => {
              removeLinks(removed);
              return false;
            }}
            deleteKeyCode={["Backspace", "Delete"]}
            edgesFocusable
            onPaneClick={() => {
              setSelectedEdge(null);
              setSelectedId(null);
            }}
            onNodeDoubleClick={(_, n) => openNode(n.id, "tab")}
            colorMode={resolvedTheme === "dark" ? "dark" : "light"}
            fitView
            fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
            minZoom={0.15}
            className="bg-background"
          >
            <Background gap={22} size={1.2} />
            <Controls showInteractive={false} position="bottom-left" />
          </ReactFlow>
        )}
        {quests.length > 0 && shown.length === 0 && (
          <p className="pointer-events-none absolute top-6 left-1/2 -translate-x-1/2 rounded-md bg-popover px-3 py-1.5 text-xs text-muted-foreground shadow">
            Every quest is in a state you&apos;ve hidden. Turn a state back on in the toolbar.
          </p>
        )}
        {shown.length > 1 && edges.length === 0 && (
          <p className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-popover px-3 py-1.5 text-xs text-muted-foreground shadow">
            Drag from the dot on a quest&apos;s right to the quest it unlocks.
          </p>
        )}
        {selected && (
          <QuestPanel
            key={selected.id}
            quest={selected}
            quests={quests}
            links={links}
            tier={tiers.get(selected.id) ?? 1}
            onRequire={(before) => link(before, selected.id)}
            onUnrequire={(before) => unlink(before, selected.id)}
            onClose={() => setSelectedId(null)}
          />
        )}
        {!selected && selectedEdge && edges.some((e) => e.id === selectedEdge && e.deletable) && (
          <div className="absolute top-3 right-3 z-10 rounded-lg border bg-popover p-1 shadow-md">
            <button
              type="button"
              onClick={() => {
                const edge = edges.find((e) => e.id === selectedEdge);
                if (edge) removeLinks([edge]);
              }}
              className="flex h-8 items-center gap-1.5 rounded-md px-2 text-ui-sm text-destructive hover:bg-destructive/10"
            >
              <Icon name="trash-bin-minimalistic-linear" className="size-3.5" />
              Remove this prerequisite
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function QuestPanel({
  quest,
  quests,
  links,
  tier,
  onRequire,
  onUnrequire,
  onClose,
}: {
  quest: BinderNode;
  quests: BinderNode[];
  links: QuestLink[];
  tier: number;
  onRequire: (before: string) => void;
  onUnrequire: (before: string) => void;
  onClose: () => void;
}) {
  const { project, binder, actions, openNode } = useWorkspace();
  const { index } = useStore(binder);
  const editable = quest.actions.includes("edit");
  const characters = useMemo(() => flatten(index).filter((n) => n.kind === "character"), [index]);
  const giver = text(quest.properties.giver);
  const objectives = list(quest.properties.objectives);
  const prerequisites = list(quest.properties.prerequisites);
  const reveals = list(quest.properties.reveals);
  const state = questState(quest.properties[QUEST_STATE_KEY]);
  const done = list(quest.properties[QUEST_DONE_KEY]);
  const [objective, setObjective] = useState("");
  const [query, setQuery] = useState("");

  const set = (patch: Record<string, unknown>) => void actions.setProperties(quest.id, patch);

  /** Saves the state and/or ticks, showing them at once. */
  const progress = (input: { state?: QuestState; done?: string[] }) => {
    // From the binder, not this render: an objective edit a moment ago may not be in `quest` yet.
    const properties = { ...(binder.get().index.byId.get(quest.id)?.properties ?? quest.properties) };
    if (input.state !== undefined) {
      const stored = storedQuestState(input.state);
      if (stored === null) delete properties[QUEST_STATE_KEY];
      else properties[QUEST_STATE_KEY] = stored;
    }
    if (input.done !== undefined) {
      if (input.done.length) properties[QUEST_DONE_KEY] = input.done;
      else delete properties[QUEST_DONE_KEY];
    }
    binder.patch(quest.id, { properties });
    setQuestProgress(project.id, quest.id, input)
      .then((n) => binder.upsert(n))
      .catch((error) => toast.error(errorText(error)));
  };
  /** Renames (or with null removes) an objective, carrying its tick along. */
  const changeObjective = (i: number, to: string | null) => {
    const from = objectives[i];
    set({ objectives: to === null ? objectives.filter((_, at) => at !== i) : objectives.map((o, at) => (at === i ? to : o)) });
    if (done.includes(from)) progress({ done: renameDone(done, from, to) });
    if (to === null) {
      const before = { objectives, done };
      undoToast(`Removed the objective ‘${from}’`, () => {
        set({ objectives: before.objectives });
        if (before.done.includes(from)) progress({ done: before.done });
      });
    }
  };
  const visible = (id: string) => {
    const n = index.byId.get(id);
    return n && !isTrashed(index, id) ? n : undefined;
  };

  const addObjective = () => {
    const clean = objective.trim().slice(0, MAX_OBJECTIVE);
    if (!clean) return;
    if (objectives.includes(clean)) toast.error("That objective is already on the list.");
    else set({ objectives: [...objectives, clean] });
    setObjective("");
  };
  const moveObjective = (from: number, to: number) => {
    const next = [...objectives];
    next.splice(to, 0, ...next.splice(from, 1));
    set({ objectives: next });
  };

  const candidates = quests.filter((q) => q.id !== quest.id && !prerequisites.includes(q.id) && !wouldLoop(links, q.id, quest.id));
  const matches = query.trim()
    ? flatten(index)
        .filter((n) => n.id !== quest.id && n.kind !== "folder" && !reveals.includes(n.id) && n.title.toLowerCase().includes(query.trim().toLowerCase()))
        .slice(0, 6)
    : [];

  return (
    <aside className="absolute top-3 right-3 bottom-3 z-10 flex w-80 flex-col gap-3 overflow-y-auto rounded-lg border bg-popover p-3 text-ui-sm shadow-lg">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-meta font-medium text-muted-foreground">Quest · tier {tier}</p>
        <StateBadge state={state} />
        <IconButton icon="close-linear" label="Close" size="xs" onClick={onClose} />
      </div>

      <Field label="State">
        <SelectField value={state} disabled={!editable} onValueChange={(v) => progress({ state: v as QuestState })} className={fieldClass}>
          {QUEST_STATES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </SelectField>
        {state === "not-started" && questReady(links, new Map(quests.map((q) => [q.id, questState(q.properties[QUEST_STATE_KEY])])), quest.id) && (
          <p className="text-xs text-muted-foreground">Ready to start: everything it needs first is done.</p>
        )}
      </Field>

      <Field label="Title">
        <CommitInput value={quest.title} disabled={!editable} onCommit={(title) => title.trim() && void actions.update(quest.id, { title: title.trim() })} />
      </Field>

      <Field label="Given by">
        <SelectField value={visible(giver) ? giver : ""} disabled={!editable} onValueChange={(v) => set({ giver: v || null })} className={fieldClass}>
          <option value="">{giver && !visible(giver) ? "Someone you can't see" : "Nobody"}</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </SelectField>
      </Field>

      <div className="grid gap-1">
        <p className="text-meta font-medium text-muted-foreground">Needs first</p>
        {prerequisites.length === 0 && <p className="text-xs text-muted-foreground">Nothing: it&apos;s open from the start.</p>}
        {prerequisites.map((id) => {
          const before = visible(id);
          return (
            <div key={id} className="flex items-center gap-1.5">
              <Icon name="target-linear" className="size-3.5 shrink-0 text-ember-ink" />
              <span className={cn("min-w-0 flex-1 truncate", !before && "text-muted-foreground")}>{before?.title ?? "A quest you can't see"}</span>
              {editable && (
                <IconButton
                  icon="close-linear"
                  label="Remove this prerequisite"
                  size="xs"
                  onClick={() => {
                    onUnrequire(id);
                    undoToast(`Removed ‘${before?.title ?? "a quest"}’ from what this needs first`, () => relink(binder, actions, id, quest.id));
                  }}
                />
              )}
            </div>
          );
        })}
        {editable && candidates.length > 0 && (
          <SelectField value="" aria-label="Add a prerequisite" onValueChange={(v) => v && onRequire(v)} className={fieldClass}>
            <option value="">Add a quest to do first…</option>
            {candidates.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title}
              </option>
            ))}
          </SelectField>
        )}
      </div>

      <div className="grid gap-1">
        <p className="text-meta font-medium text-muted-foreground">Objectives</p>
        {objectives.length === 0 && <p className="text-xs text-muted-foreground">What the player has to do, in order.</p>}
        {objectives.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {doneObjectives(objectives, done).length} of {objectives.length} done. Tick the box to mark one off.
          </p>
        )}
        <ol className="grid gap-0.5">
          {objectives.map((item, i) => (
            <li key={item} className="group flex items-start gap-1.5">
              <input
                type="checkbox"
                checked={done.includes(item)}
                disabled={!editable}
                aria-label={`Objective ${i + 1} done`}
                onChange={(e) => progress({ done: toggleDone(objectives, done, item, e.target.checked) })}
                className="mt-1 size-4 shrink-0 accent-ember"
              />
              <label className="contents">
                <span className="sr-only">{`Objective ${i + 1}`}</span>
                <CommitInput
                  value={item}
                  disabled={!editable}
                  onCommit={(value) => {
                    const clean = value.trim().slice(0, MAX_OBJECTIVE);
                    // Cleared: the objective is removed. A repeat of another one is ignored.
                    if (!clean) changeObjective(i, null);
                    else if (!objectives.includes(clean)) changeObjective(i, clean);
                  }}
                  className={cn("h-6 flex-1 border-transparent px-1 hover:border-input", done.includes(item) && "text-muted-foreground line-through")}
                />
              </label>
              {editable && (
                <span className="flex opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
                  <IconButton icon="alt-arrow-up-linear" label="Move up" size="xs" disabled={i === 0} onClick={() => moveObjective(i, i - 1)} />
                  <IconButton icon="alt-arrow-down-linear" label="Move down" size="xs" disabled={i === objectives.length - 1} onClick={() => moveObjective(i, i + 1)} />
                  <IconButton icon="close-linear" label={`Remove objective ${i + 1}`} size="xs" onClick={() => changeObjective(i, null)} />
                </span>
              )}
            </li>
          ))}
        </ol>
        {editable && objectives.length < MAX_OBJECTIVES && (
          <input
            value={objective}
            maxLength={MAX_OBJECTIVE}
            aria-label="New objective"
            placeholder="Add an objective, then press Enter"
            onChange={(e) => setObjective(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addObjective()}
            onBlur={addObjective}
            className={fieldClass}
          />
        )}
      </div>

      <Field label="Reward">
        <CommitInput value={text(quest.properties.reward)} disabled={!editable} placeholder="Gold, an item, a new ally…" onCommit={(reward) => set({ reward })} />
      </Field>

      <div className="grid gap-1">
        <p className="text-meta font-medium text-muted-foreground">Reveals</p>
        {reveals.length === 0 && <p className="text-xs text-muted-foreground">Notes the player learns about by doing this quest.</p>}
        {reveals.map((id) => {
          const note = visible(id);
          return (
            <div key={id} className="flex items-center gap-1.5">
              <Icon name={note ? nodeKindMeta[note.kind].icon : "lock-keyhole-minimalistic-linear"} className="size-3.5 shrink-0 text-muted-foreground" />
              {note ? (
                <button type="button" onClick={() => openNode(note.id, "tab")} className="min-w-0 flex-1 truncate text-left hover:underline">
                  {note.title}
                </button>
              ) : (
                <span className="min-w-0 flex-1 truncate text-muted-foreground">A note you can&apos;t see</span>
              )}
              {editable && (
                <IconButton
                  icon="close-linear"
                  label="Remove this reveal"
                  size="xs"
                  onClick={() => {
                    const before = reveals;
                    set({ reveals: reveals.filter((r) => r !== id) });
                    undoToast(`Removed ‘${note?.title ?? "a note"}’ from what this quest reveals`, () => set({ reveals: before }));
                  }}
                />
              )}
            </div>
          );
        })}
        {editable && (
          <div className="relative">
            <input
              value={query}
              aria-label="Link a note this quest reveals"
              placeholder="Link a note it reveals…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
                if (e.key === "Enter" && matches[0]) {
                  set({ reveals: [...reveals, matches[0].id] });
                  setQuery("");
                }
              }}
              className={fieldClass}
            />
            {query.trim() && (
              <ul className="mt-1 rounded-md border bg-background p-0.5">
                {matches.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        set({ reveals: [...reveals, n.id] });
                        setQuery("");
                      }}
                      className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-accent"
                    >
                      <Icon name={nodeKindMeta[n.kind].icon} className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{n.title}</span>
                    </button>
                  </li>
                ))}
                {matches.length === 0 && <li className="px-1.5 py-1 text-xs text-muted-foreground">No matching notes.</li>}
              </ul>
            )}
          </div>
        )}
      </div>

      <button type="button" onClick={() => openNode(quest.id, "tab")} className="mt-auto flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border hover:bg-accent">
        <Icon name="square-arrow-right-up-linear" className="size-3.5" />
        Open page
      </button>
    </aside>
  );
}
