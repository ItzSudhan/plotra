"use client";

import { Icon } from "@plotra/icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@plotra/ui/components/dropdown-menu";
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { confirm } from "@plotra/ui/components/dialogs";
import { undoToast } from "@plotra/ui/components/sonner";
import * as Y from "yjs";
import { useRoomDoc } from "@/components/collab/use-room-doc";
import { useNodeReview } from "@/components/editorial/data";
import {
  cardLabel,
  DialogueContext,
  dialogueEdgeComponents,
  dialogueNodeComponents,
  nodeTypeMeta,
  SOURCE_HANDLE,
  TARGET_HANDLE,
  useSpeakerName,
  type DialogueFlowEdge,
  type DialogueFlowNode,
} from "@/components/interactive/dialogue-cards";
import { forgetImportReport, importDialogueAsNew, ImportReportDialog, peekImportReport, pickDialogueFile, type ImportReport } from "@/components/interactive/dialogue-import";
import { NodePanel, VariablesPanel } from "@/components/interactive/dialogue-panels";
import { downloadText } from "@/components/interactive/download";
import { PlayPanel } from "@/components/interactive/play-panel";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { colorFor, readableOn } from "@/lib/colors";
import { importDialogueInto } from "@/lib/interactive-actions";
import { checkDialogue } from "@/lib/interactive/check";
import { exportDialogue, exportFileName, exportFormats, type ExportFormat } from "@/lib/interactive/export";
import {
  dialogueGraph,
  dialogueMaps,
  dialogueNodeTypes,
  hasStringId,
  nextStringId,
  orderedNodes,
  repairStringIds,
  stringIdPrefix,
  type DialogueEdge,
  type DialogueGraph,
  type DialogueMaps,
  type DialogueNode,
  type DialogueNodeType,
  type DialogueVariable,
} from "@/lib/interactive/model";
import { createVersion } from "@/lib/workflow-actions";
import { Divider, errorText, ToolButton, Toolbar } from "./view-ui";

// Branching dialogue editor (plan.md 2.8 "Interactive & branching narrative"):
// lines, choices, conditions and variable changes as cards joined by jumps,
// edited live by everyone who has it open. The graph lives in the dialogue
// node's Yjs doc (lib/interactive/model.ts). A play-through preview walks it
// like a game would, and it exports to JSON, CSV, Ink, Yarn Spinner and Twine,
// and imports from the last three (lib/interactive/import.ts).

const LOCAL = Symbol("local");

/** The one Start node has a fixed id, so two people opening a new dialogue at once make the same one. */
const START_ID = "start";

/** What the toolbar and the "drag to empty space" menu can add. */
const addable: DialogueNodeType[] = ["line", "choice", "condition", "set", "random", "call", "return", "end"];

/** Cards nothing leaves by a jump. */
const isStop = (type: DialogueNodeType | undefined) => type === "end" || type === "return";

const isKnownType = (type: string): type is DialogueNodeType => (dialogueNodeTypes as readonly string[]).includes(type);

// ---- Conversion between the doc and React Flow ----------------------------------------------

function toFlowNodes(nodes: Y.Map<DialogueNode>, prev: DialogueFlowNode[]): DialogueFlowNode[] {
  const before = new Map(prev.map((n) => [n.id, n]));
  return [...nodes.entries()]
    .filter(([, node]) => isKnownType(node.type))
    .map(([id, node]) => ({
      ...(before.get(id) ?? {}),
      id,
      type: node.type,
      position: { x: node.x, y: node.y },
      data: { node },
      deletable: node.type !== "start",
    }));
}

function toFlowEdges({ nodes, edges }: Pick<DialogueMaps, "nodes" | "edges">, prev: DialogueFlowEdge[]): DialogueFlowEdge[] {
  const before = new Map(prev.map((e) => [e.id, e]));
  return [...edges.entries()].flatMap(([id, edge]) => {
    const source = nodes.get(edge.source);
    if (!source || !nodes.has(edge.target)) return [];
    const outcome = source.type === "condition" ? (edge.sourceHandle ?? "true") : undefined;
    const target = nodes.get(edge.target)!;
    return [
      {
        ...(before.get(id) ?? {}),
        id,
        source: edge.source,
        target: edge.target,
        sourceHandle: outcome ?? SOURCE_HANDLE,
        targetHandle: TARGET_HANDLE,
        type: "jump",
        data: { outcome },
        // Jumps are focusable: Enter or Space selects one, Delete removes it (with Undo).
        ariaLabel: jumpLabel(source, target, outcome),
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      },
    ];
  });
}

/** How a jump is read out and named in its Undo toast. */
function jumpLabel(from: DialogueNode, to: DialogueNode, outcome?: string) {
  const when = outcome ? ` when ${outcome === "false" ? "false" : "true"}` : "";
  return `Jump from ‘${cardLabel(from)}’ to ‘${cardLabel(to)}’${when}`;
}

// ---- The view ---------------------------------------------------------------------------------

export function DialogueView({ nodeId }: { nodeId: string }) {
  const { binder } = useWorkspace();
  const node = useStore(binder).index.byId.get(nodeId);
  if (!node) return null;
  return (
    <ReactFlowProvider>
      <DialogueEditor key={nodeId} nodeId={nodeId} />
    </ReactFlowProvider>
  );
}

type Remote = { clientId: number; name: string; color: string; x: number; y: number };

/** The menu that opens where a jump is dropped on empty space. */
type AddMenu = { left: number; top: number; at: { x: number; y: number }; from: { id: string; handle: string | null } };

function DialogueEditor({ nodeId }: { nodeId: string }) {
  const { project, user, binder, registerEditor, setDocStats, track, announce, open } = useWorkspace();
  const { index } = useStore(binder);
  const node = index.byId.get(nodeId)!;
  // A locked dialogue is read-only for everyone but its approvers; the server refuses their writes too (lib/editorial-guard).
  const review = useNodeReview(nodeId);
  const editable = node.actions.includes("edit") && !review.readOnly;
  // A new dialogue goes beside this one: into its folder, or the top of the binder.
  const parent = node.parentId ? index.byId.get(node.parentId) : undefined;
  const canCreate = parent ? parent.actions.includes("edit") : project.actions.includes("edit");
  const { resolvedTheme } = useTheme();
  const flow = useReactFlow<DialogueFlowNode, DialogueFlowEdge>();
  const { doc, provider, ready, sync } = useRoomDoc({
    projectId: project.id,
    room: `node-${nodeId}`,
  });
  const maps = useMemo(() => (doc ? dialogueMaps(doc) : null), [doc]);
  const prefix = stringIdPrefix(nodeId);
  const [nodes, setNodes] = useState<DialogueFlowNode[]>([]);
  const [edges, setEdges] = useState<DialogueFlowEdge[]>([]);
  const [variables, setVariables] = useState<Array<[string, DialogueVariable]>>([]);
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [showVariables, setShowVariables] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playingAt, setPlayingAt] = useState<string | null>(null);
  const [menu, setMenu] = useState<AddMenu | null>(null);
  // A dialogue just imported shows what the import skipped.
  const [report, setReport] = useState<ImportReport | null>(() => peekImportReport(nodeId));
  const [importing, setImporting] = useState(false);
  const fitted = useRef(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const speakerName = useSpeakerName();

  useEffect(() => {
    setDocStats(nodeId, { sync });
  }, [nodeId, setDocStats, sync]);
  useEffect(() => {
    forgetImportReport(nodeId);
  }, [nodeId]);

  // Mirror the doc into React state, keeping local-only flags (selection, dragging).
  useEffect(() => {
    if (!maps) return;
    const pull = () => {
      setNodes((prev) => toFlowNodes(maps.nodes, prev));
      setEdges((prev) => toFlowEdges(maps, prev));
      setVariables([...maps.variables.entries()].sort(([a, va], [b, vb]) => va.order - vb.order || (a < b ? -1 : 1)));
    };
    pull();
    maps.nodes.observe(pull);
    maps.edges.observe(pull);
    maps.variables.observe(pull);
    return () => {
      maps.nodes.unobserve(pull);
      maps.edges.unobserve(pull);
      maps.variables.unobserve(pull);
    };
  }, [maps]);

  useEffect(() => {
    if (ready && !fitted.current && nodes.length) {
      fitted.current = true;
      requestAnimationFrame(() => void flow.fitView({ padding: 0.25, maxZoom: 1 }));
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

  // A dialogue the server has never seen starts with its Start node. And should
  // two people have been handed the same String ID at the same moment, one is renumbered.
  const count = nodes.length;
  useEffect(() => {
    if (!maps || !editable || sync !== "synced") return;
    transact(() => {
      if (maps.nodes.size === 0) maps.nodes.set(START_ID, { type: "start", x: 0, y: 0 });
      repairStringIds(maps, prefix);
    });
  }, [count, editable, maps, prefix, sync, transact]);

  const update = useCallback(
    (id: string, patch: Partial<DialogueNode>) =>
      transact(() => {
        const current = maps?.nodes.get(id);
        if (current) maps!.nodes.set(id, { ...current, ...patch });
      }),
    [maps, transact],
  );

  /**
   * Deletes cards (with their jumps) and jumps, from the card panel or the
   * Delete key (React Flow's own delete is turned into this by onBeforeDelete),
   * and offers Undo.
   */
  const removeElements = useCallback(
    (ids: string[], jumpIds: string[] = []) => {
      if (!maps || !editable) return;
      // Start stays: a dialogue always has somewhere to begin.
      const doomed = new Set(ids.filter((id) => maps.nodes.get(id)?.type !== "start"));
      const picked = new Set(jumpIds);
      // Kept so Undo can put the cards and their jumps back.
      const cards = [...doomed].flatMap((id) => {
        const card = maps.nodes.get(id);
        return card ? [[id, card] as const] : [];
      });
      const jumps: [string, DialogueEdge][] = [];
      maps.edges.forEach((edge, id) => {
        if (picked.has(id) || doomed.has(edge.source) || doomed.has(edge.target)) jumps.push([id, edge]);
      });
      if (!cards.length && !jumps.length) return;
      transact(() => {
        for (const [id] of cards) maps.nodes.delete(id);
        for (const [id] of jumps) maps.edges.delete(id);
      });
      const only = jumps[0]?.[1];
      const from = only && maps.nodes.get(only.source);
      const to = only && maps.nodes.get(only.target);
      const message = cards.length
        ? cards.length === 1
          ? `Deleted ‘${cardLabel(cards[0][1])}’`
          : `Deleted ${cards.length} cards`
        : jumps.length === 1 && from && to
          ? `Deleted the jump from ‘${cardLabel(from)}’ to ‘${cardLabel(to)}’`
          : `Deleted ${jumps.length} jumps`;
      undoToast(message, () =>
        transact(() => {
          for (const [id, card] of cards) if (!maps.nodes.has(id)) maps.nodes.set(id, card);
          for (const [id, edge] of jumps) if (!maps.edges.has(id) && maps.nodes.has(edge.source) && maps.nodes.has(edge.target)) maps.edges.set(id, edge);
        }),
      );
    },
    [editable, maps, transact],
  );

  /** Whether a jump may be drawn: not into Start, not out of an End, not to itself, not twice. */
  const canJump = useCallback(
    (source: string, target: string, handle: string | null | undefined) => {
      if (!maps || source === target) return false;
      const from = maps.nodes.get(source);
      const to = maps.nodes.get(target);
      if (!from || !to || isStop(from.type) || to.type === "start") return false;
      const outcome = from.type === "condition" ? (handle === "false" ? "false" : "true") : undefined;
      for (const edge of maps.edges.values()) {
        if (edge.source === source && edge.target === target && (outcome === undefined || (edge.sourceHandle ?? "true") === outcome)) return false;
      }
      return true;
    },
    [maps],
  );

  /** Adds a jump. Call inside a transaction, after `canJump`. */
  const jump = useCallback(
    (source: string, target: string, handle: string | null | undefined) => {
      const from = maps?.nodes.get(source);
      if (!maps || !from) return;
      const edge: DialogueEdge = { source, target, ...(from.type === "condition" && { sourceHandle: handle === "false" ? "false" : "true" }) };
      maps.edges.set(crypto.randomUUID(), edge);
    },
    [maps],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<DialogueFlowNode>[]) => {
      setNodes((ns) => applyNodeChanges(changes, ns));
      if (!editable) return;
      const removed: string[] = [];
      transact(() => {
        for (const ch of changes) {
          if (ch.type === "position" && ch.position) update(ch.id, { x: Math.round(ch.position.x), y: Math.round(ch.position.y) });
          else if (ch.type === "remove") removed.push(ch.id);
        }
      });
      if (removed.length) removeElements(removed);
    },
    [editable, removeElements, transact, update],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<DialogueFlowEdge>[]) => {
      setEdges((es) => applyEdgeChanges(changes.filter((ch) => ch.type !== "remove"), es));
      const removed = changes.flatMap((ch) => (ch.type === "remove" ? [ch.id] : []));
      if (removed.length) removeElements([], removed);
    },
    [removeElements],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!editable || !canJump(c.source, c.target, c.sourceHandle)) return;
      transact(() => jump(c.source, c.target, c.sourceHandle));
    },
    [canJump, editable, jump, transact],
  );

  const hasStart = nodes.some((n) => n.type === "start");

  /**
   * Adds a node: where a jump was dropped (`at`, joined to `from`), else to the
   * right of the selected node and joined to it, else in the middle of the pane.
   */
  const addNode = useCallback(
    (type: DialogueNodeType, at?: { x: number; y: number }, from?: { id: string; handle: string | null }) => {
      if (!maps || !editable || (type === "start" && hasStart)) return;
      let position = at ? { x: at.x, y: at.y - 30 } : null;
      let source = from ?? null;
      const selected = nodes.filter((n) => n.selected);
      const anchor = !position && selected.length === 1 ? maps.nodes.get(selected[0].id) : undefined;
      if (anchor && !isStop(anchor.type) && type !== "start") {
        const leaving = [...maps.edges.values()].filter((e) => e.source === selected[0].id);
        // From a condition, the first node added is its "true" side and the next its "false" side.
        const handle = anchor.type === "condition" && leaving.some((e) => (e.sourceHandle ?? "true") === "true") ? "false" : "true";
        position = { x: anchor.x + 320, y: anchor.y + leaving.length * 130 };
        source = { id: selected[0].id, handle: anchor.type === "condition" ? handle : null };
      }
      if (!position) {
        // In the middle of the pane, cascading so additions don't hide each other.
        const rect = paneRef.current?.getBoundingClientRect();
        const cascade = (maps.nodes.size % 8) * 28;
        const center = flow.screenToFlowPosition({
          x: (rect ? rect.left + rect.width / 2 : window.innerWidth / 2) + cascade,
          y: (rect ? rect.top + rect.height / 2 : window.innerHeight / 2) + cascade,
        });
        position = { x: center.x - 120, y: center.y - 40 };
      }
      const id = type === "start" ? START_ID : crypto.randomUUID();
      const placed = position;
      transact(() => {
        maps.nodes.set(id, {
          type,
          x: Math.round(placed.x),
          y: Math.round(placed.y),
          // The String ID is given once, here, and never changes after.
          ...(hasStringId(type) && { sid: nextStringId(maps, prefix), text: "" }),
          ...((type === "condition" || type === "set") && { expr: "" }),
        });
        if (source && canJump(source.id, id, source.handle)) jump(source.id, id, source.handle);
      });
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
    },
    [canJump, editable, flow, hasStart, jump, maps, nodes, prefix, transact],
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
        if (!editable || !value || typeof value !== "object" || Array.isArray(value)) return;
        const restored = value as Partial<DialogueGraph>;
        transact(() => {
          maps.nodes.clear();
          maps.edges.clear();
          maps.variables.clear();
          for (const [id, n] of Object.entries(restored.nodes ?? {})) maps.nodes.set(id, n);
          for (const [id, e] of Object.entries(restored.edges ?? {})) maps.edges.set(id, e);
          for (const [id, v] of Object.entries(restored.variables ?? {})) maps.variables.set(id, v);
        });
      },
    });
    return () => registerEditor(nodeId, null);
  }, [doc, editable, maps, nodeId, registerEditor, transact]);

  const selectedNodes = nodes.filter((n) => n.selected);
  const selected = selectedNodes.length === 1 ? selectedNodes[0] : null;

  // What the play-through and the check walk: the same nodes and jumps that are on screen.
  const graph = useMemo<DialogueGraph>(
    () => ({
      nodes: Object.fromEntries(nodes.map((n) => [n.id, n.data.node])),
      edges: Object.fromEntries(edges.map((e) => [e.id, { source: e.source, target: e.target, ...(e.data?.outcome && { sourceHandle: e.data.outcome }) }])),
      variables: Object.fromEntries(variables),
    }),
    [edges, nodes, variables],
  );
  // Deferred, so dragging a card in a large dialogue doesn't wait on the check.
  const checked = useDeferredValue(graph);
  const problems = useMemo(() => (ready ? checkDialogue(checked) : []), [checked, ready]);
  const errors = problems.filter((p) => p.severity === "error").length;

  const reveal = useCallback(
    (id: string) => {
      const target = flow.getNode(id);
      if (!target) return;
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
      void flow.setCenter(target.position.x + 120, target.position.y + 40, { zoom: Math.max(flow.getZoom(), 0.8), duration: 300 });
    },
    [flow],
  );
  const context = useMemo(() => ({ update, editable, playingAt, reveal }), [editable, playingAt, reveal, update]);
  // What a Call card may call: any card but Start and the call itself, in reading order.
  const caller = selected?.type === "call" ? selected.id : null;
  const callable = caller
    ? orderedNodes(graph)
        .filter((id) => id !== caller && graph.nodes[id].type !== "start")
        .map((id) => ({ id, label: cardLabel(graph.nodes[id]) }))
    : [];

  const exportAs = (format: ExportFormat) => {
    if (!doc) return;
    const meta = exportFormats.find((f) => f.id === format)!;
    // Read at the moment of export, so speakers renamed a second ago export under their new names.
    const notes = binder.get().index.byId;
    const title = notes.get(nodeId)?.title ?? "Dialogue";
    try {
      const text = exportDialogue(dialogueGraph(doc), format, { title, speakerName: (id) => notes.get(id)?.title, ifid: nodeId });
      downloadText(exportFileName(title, meta.extension), meta.mime, text);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  /** Replaces everything in this dialogue with a file's cards, after asking and after saving a version of how it is now. */
  const replaceFromFile = async () => {
    if (!doc || !maps || !editable) return;
    const picked = await pickDialogueFile();
    if (!picked) return;
    const title = binder.get().index.byId.get(nodeId)?.title ?? "this dialogue";
    const replace = await confirm({
      title: `Replace everything in “${title}” with ${picked.fileName}?`,
      description: "Its cards, jumps and variables are replaced for everyone who has it open. A copy of how it is now is saved in History first, so you can go back.",
      confirmLabel: "Replace",
    });
    if (!replace) return;
    setImporting(true);
    try {
      try {
        await track(createVersion(project.id, nodeId, "Before import", toBase64(Y.encodeStateAsUpdate(doc))));
      } catch (error) {
        const anyway = await confirm({
          title: "Replace it without a saved copy?",
          description: `Plotra couldn't save a copy of how it is now: ${errorText(error)} If you go on, there'll be no way back to the current cards.`,
          confirmLabel: "Replace anyway",
        });
        if (!anyway) return;
      }
      const result = await track(importDialogueInto(project.id, nodeId, { ...picked, counter: maps.meta.get("counter") ?? 0 }));
      transact(() => {
        maps.nodes.clear();
        maps.edges.clear();
        maps.variables.clear();
        for (const [id, n] of Object.entries(result.graph.nodes)) maps.nodes.set(id, n);
        for (const [id, e] of Object.entries(result.graph.edges)) maps.edges.set(id, e);
        for (const [id, v] of Object.entries(result.graph.variables)) maps.variables.set(id, v);
        maps.meta.set("counter", Math.max(maps.meta.get("counter") ?? 0, result.counter));
      });
      requestAnimationFrame(() => void flow.fitView({ padding: 0.25, maxZoom: 1, duration: 300 }));
      if (result.warnings.length) setReport({ fileName: picked.fileName, warnings: result.warnings });
      else toast.success(`Imported ${picked.fileName}.`);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setImporting(false);
    }
  };

  /** Imports a file as a new dialogue beside this one, and opens it. */
  const importAsNew = async () => {
    const created = await importDialogueAsNew({ projectId: project.id, parentId: node.parentId, binder, track, announce });
    if (created) open(created, "tab");
  };

  const addVariable = () =>
    transact(() => {
      if (!maps) return;
      const taken = new Set([...maps.variables.values()].map((v) => v.name));
      let name = "variable";
      for (let n = 2; taken.has(name); n++) name = `variable_${n}`;
      const order = Math.max(0, ...[...maps.variables.values()].map((v) => v.order)) + 1;
      maps.variables.set(crypto.randomUUID(), { name, value: 0, order });
    });

  return (
    <DialogueContext value={context}>
      <div className="flex h-full flex-col">
        <Toolbar>
          {!hasStart && ready && (
            <ToolButton icon={nodeTypeMeta.start.icon} label="Add the Start card" disabled={!editable} onClick={() => addNode("start")}>
              Start
            </ToolButton>
          )}
          {addable.map((type) => (
            <ToolButton
              key={type}
              icon={nodeTypeMeta[type].icon}
              label={`Add: ${nodeTypeMeta[type].hint.toLowerCase()}${selected && !isStop(selected.data.node.type) ? " (after the selected card)" : ""}`}
              disabled={!editable || !ready}
              onClick={() => addNode(type)}
            >
              {nodeTypeMeta[type].label}
            </ToolButton>
          ))}
          <Divider />
          <ToolButton icon="slider-vertical-linear" label="Variables and their starting values" pressed={showVariables} onClick={() => setShowVariables(!showVariables)}>
            Variables{variables.length ? ` (${variables.length})` : ""}
          </ToolButton>
          <ToolButton icon="play-linear" label="Play through the dialogue from Start" pressed={playing} disabled={!ready} onClick={() => setPlaying(!playing)}>
            Play
          </ToolButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Export this dialogue"
                disabled={!ready}
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <Icon name="export-linear" className="size-4" />
                Export
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {exportFormats.map((format) => (
                <DropdownMenuItem key={format.id} onSelect={() => exportAs(format.id)}>
                  <Icon name="download-linear" />
                  {format.label}
                  <span className="ml-auto text-xs text-muted-foreground">.{format.extension}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Import a dialogue from Ink, Yarn Spinner or Twine"
                disabled={!ready || importing}
                className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <Icon name="import-linear" className="size-4" />
                {importing ? "Importing…" : "Import"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem disabled={!editable} onSelect={() => void replaceFromFile()}>
                <Icon name="refresh-linear" />
                Replace this dialogue…
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canCreate} onSelect={() => void importAsNew()}>
                <Icon name="add-square-linear" />
                As a new dialogue…
              </DropdownMenuItem>
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Ink (.ink), Yarn Spinner (.yarn), Twine (.twee, .tw, or a Twine 2 .html)</p>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Problems found without playing: cards nothing reaches, paths without an End, expressions that can't be read"
                disabled={!ready}
                className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40 ${errors ? "text-destructive" : "text-muted-foreground"}`}
              >
                <Icon name={problems.length ? "danger-triangle-linear" : "check-circle-linear"} className="size-4" />
                Check{problems.length ? ` (${problems.length})` : ""}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 w-80 overflow-y-auto">
              {problems.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No problems found.</p>}
              {problems.map((problem, i) => (
                <DropdownMenuItem key={i} onSelect={() => problem.nodeId && reveal(problem.nodeId)} className="items-start text-xs">
                  <Icon
                    name={problem.severity === "error" ? "danger-circle-linear" : "danger-triangle-linear"}
                    className={problem.severity === "error" ? "mt-0.5 text-destructive" : "mt-0.5 text-muted-foreground"}
                  />
                  <span className="min-w-0 flex-1">
                    {problem.nodeId && graph.nodes[problem.nodeId] && (
                      <span className="block text-meta text-muted-foreground">{cardLabel(graph.nodes[problem.nodeId])}</span>
                    )}
                    {problem.text}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Divider />
          <ToolButton icon="full-screen-linear" label="Fit everything" onClick={() => void flow.fitView({ padding: 0.25, duration: 300 })} />
          {!editable && <span className="px-2 text-xs text-muted-foreground">{review.readOnly ? "Locked: only an approver can change it" : "Read only"}</span>}
          {!ready && <span className="px-2 text-xs text-muted-foreground">Loading…</span>}
        </Toolbar>

        <div className="flex min-h-0 flex-1">
          <div
            ref={paneRef}
            className="relative min-w-0 flex-1"
            onPointerMove={(e) => {
              const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
              provider?.awareness.setLocalStateField("pointer", { x: Math.round(p.x), y: Math.round(p.y) });
            }}
            onPointerLeave={() => provider?.awareness.setLocalStateField("pointer", null)}
            onKeyDown={(e) => e.key === "Escape" && setMenu(null)}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={dialogueNodeComponents}
              edgeTypes={dialogueEdgeComponents}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={(c) => canJump(c.source, c.target, c.sourceHandle)}
              onConnectStart={() => setMenu(null)}
              onConnectEnd={(event, state) => {
                if (!editable || state.isValid || !state.fromNode || state.fromHandle?.type !== "source") return;
                const point = "changedTouches" in event ? event.changedTouches[0] : event;
                const from = { id: state.fromNode.id, handle: state.fromHandle.id ?? null };
                // Dropped anywhere on another card (not just its dot): jump to it.
                const over = document.elementFromPoint(point.clientX, point.clientY)?.closest<HTMLElement>(".react-flow__node")?.dataset.id;
                if (over) {
                  if (canJump(from.id, over, from.handle)) transact(() => jump(from.id, over, from.handle));
                  return;
                }
                // Dropped on empty space: offer to add a card there.
                const rect = paneRef.current?.getBoundingClientRect();
                if (!rect || isStop(maps?.nodes.get(from.id)?.type)) return;
                setMenu({
                  left: Math.min(point.clientX - rect.left, rect.width - 190),
                  top: Math.min(point.clientY - rect.top, rect.height - 200),
                  at: flow.screenToFlowPosition({ x: point.clientX, y: point.clientY }),
                  from,
                });
              }}
              onPaneClick={() => setMenu(null)}
              onMoveStart={() => setMenu(null)}
              nodesDraggable={editable}
              nodesConnectable={editable}
              elementsSelectable
              deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
              // Deleting goes through removeElements, so it can be undone; React Flow removes nothing itself.
              onBeforeDelete={async ({ nodes: cards, edges: jumps }) => {
                removeElements(
                  cards.map((n) => n.id),
                  jumps.map((e) => e.id),
                );
                return false;
              }}
              edgesFocusable
              colorMode={resolvedTheme === "dark" ? "dark" : "light"}
              minZoom={0.1}
              maxZoom={2}
              className="bg-background"
            >
              <Background gap={22} size={1.2} />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap pannable zoomable position="bottom-right" className="!bg-card" maskColor="color-mix(in oklab, var(--foreground) 8%, transparent)" />
              <RemotePointers remotes={remotes} />
            </ReactFlow>

            {menu && (
              <div className="absolute z-20 w-44 rounded-lg border bg-popover p-1 text-ui-sm shadow-lg" style={{ left: Math.max(menu.left, 4), top: Math.max(menu.top, 4) }}>
                {addable.map((type, i) => (
                  <button
                    key={type}
                    type="button"
                    autoFocus={i === 0}
                    title={nodeTypeMeta[type].hint}
                    onClick={() => {
                      addNode(type, menu.at, menu.from);
                      setMenu(null);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <span style={{ color: nodeTypeMeta[type].color }}>
                      <Icon name={nodeTypeMeta[type].icon} className="size-4" />
                    </span>
                    {nodeTypeMeta[type].label}
                  </button>
                ))}
              </div>
            )}

            {showVariables && maps && (
              <VariablesPanel
                variables={variables}
                editable={editable}
                onAdd={addVariable}
                onChange={(id, patch) =>
                  transact(() => {
                    const current = maps.variables.get(id);
                    if (current) maps.variables.set(id, { ...current, ...patch });
                  })
                }
                onRemove={(id) => {
                  const removed = maps.variables.get(id);
                  transact(() => maps.variables.delete(id));
                  if (!removed) return;
                  undoToast(`Deleted the variable ‘${removed.name}’`, () =>
                    transact(() => {
                      if (!maps.variables.has(id)) maps.variables.set(id, removed);
                    }),
                  );
                }}
                onClose={() => setShowVariables(false)}
              />
            )}

            {selected && (
              <NodePanel
                key={selected.id}
                node={selected.data.node}
                editable={editable}
                cards={callable}
                onChange={(patch) => update(selected.id, patch)}
                onRemove={() => removeElements([selected.id])}
                onReveal={reveal}
              />
            )}

            {ready && nodes.length <= 1 && (
              <p className="pointer-events-none absolute bottom-6 left-1/2 max-w-md -translate-x-1/2 rounded-md bg-popover px-3 py-1.5 text-center text-xs text-muted-foreground shadow">
                {editable
                  ? "Select Start and add a line from the toolbar, or drag from a card's dot to empty space. A line followed by several choices offers those choices."
                  : "Nothing here yet."}
              </p>
            )}
          </div>

          {report && <ImportReportDialog report={report} onClose={() => setReport(null)} />}

          {playing && (
            <PlayPanel graph={graph} speakerName={speakerName} onAt={setPlayingAt} onReveal={reveal} onClose={() => setPlaying(false)} />
          )}
        </div>
      </div>
    </DialogueContext>
  );
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
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
          <span className="rounded px-1 text-meta font-medium" style={{ backgroundColor: r.color, color: readableOn(r.color) }}>
            {r.name}
          </span>
        </div>
      ))}
    </div>
  );
}
