"use client";

import { nodeKinds, type NodeKind } from "@plotra/db/schema";
import { Icon } from "@plotra/icons";
import { IconButton } from "@plotra/ui/components/icon-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plotra/ui/components/select";
import { cn } from "@plotra/ui/lib/utils";
import Graph from "graphology";
import type FA2LayoutSupervisor from "graphology-layout-forceatlas2/worker";
import type Sigma from "sigma";
import type { NodeDisplayData, PartialButFor } from "sigma/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/components/workspace/stores";
import { useHorizon, useSharedWorld, useWorldLinks } from "@/components/world/data";
import { useViewSetting } from "@/components/workspace/shell-prefs";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { read } from "@/lib/read";
import { isTrashed, type BinderNode, type NodeIndex } from "@/lib/tree";
import { useReached } from "@/components/onboarding/reached";
import { useVocabulary } from "@/components/workspace/vocabulary";
import { linkList } from "@/lib/graph-list";
import { plural } from "@/lib/plural";

// ---- Types ---------------------------------------------------------------------

type LinkKind = "wiki" | "embed" | "property";
type ProjectLink = { source: string; target: string; kind: LinkKind };

type NodeAttrs = { x: number; y: number; size: number; label: string; kind: NodeKind; search: string };
type EdgeAttrs = { kind: LinkKind; size: number; weight: number };
type GraphModel = {
  nodes: Map<string, Omit<NodeAttrs, "x" | "y">>;
  edges: Map<string, { source: string; target: string } & EdgeAttrs>;
};

type Mode = "global" | "local";
type Options = {
  mode: Mode;
  centerId: string | null;
  depth: number;
  hiddenKinds: ReadonlySet<NodeKind>;
  tag: string | null;
  showOrphans: boolean;
  includeProperty: boolean;
};

const ALL_TAGS = "__all";
const LAYOUT_MS = 2500;
const POLL_MS = 15_000;
/** Barnes-Hut approximates repulsion; below this size it's slower than the exact sum and its error keeps nodes shaking instead of settling. */
const BARNES_HUT_MIN = 2000;

/** Kind colors come from theme tokens so they track light/dark mode. `note` has no token, so it gets a fixed blue. */
const NOTE_BLUE = "#4f8ce0";
const kindToken: Record<NodeKind, string | null> = {
  character: "--rose",
  location: "--teal",
  scene: "--ember",
  chapter: "--gold",
  research: "--violet",
  note: null,
  folder: "--faint",
  canvas: "--faint",
  timeline: "--faint",
  entity: "--violet",
  dialogue: "--faint",
};
const kindCss = (kind: NodeKind) => (kindToken[kind] ? `var(${kindToken[kind]})` : NOTE_BLUE);

const linkPriority: Record<LinkKind, number> = { embed: 3, wiki: 2, property: 1 };
const linkStyle: Record<LinkKind, { size: number; weight: number }> = {
  embed: { size: 2.4, weight: 2 },
  wiki: { size: 1.2, weight: 1 },
  property: { size: 0.8, weight: 0.5 },
};

// ---- Colors --------------------------------------------------------------------

type Rgba = [number, number, number, number];

type Palette = {
  kinds: Record<NodeKind, string>;
  background: string;
  foreground: string;
  popover: string;
  border: string;
  dim: string;
  edge: string;
  edgeFaint: string;
  edgeHighlight: string;
  font: string;
};

const fallbackPalette: Palette = {
  kinds: {
    character: "#d5467f",
    location: "#109a82",
    scene: "#e2602a",
    chapter: "#b98021",
    research: "#7556d6",
    note: NOTE_BLUE,
    folder: "#9b968e",
    canvas: "#9b968e",
    timeline: "#9b968e",
    entity: "#5f3dc4",
    dialogue: "#9b968e",
  },
  background: "#f7f6f3",
  foreground: "#161412",
  popover: "#ffffff",
  border: "#e3e1dd",
  dim: "#dcd9d3",
  edge: "#cfcbc4",
  edgeFaint: "#e3e0da",
  edgeHighlight: "#e2602a",
  font: "system-ui, sans-serif",
};

/** Normalizes any CSS color the canvas understands to rgba components. */
function toRgba(ctx: CanvasRenderingContext2D, value: string, fallback: string): Rgba {
  ctx.fillStyle = fallback;
  if (value) ctx.fillStyle = value;
  const out = String(ctx.fillStyle);
  if (out.startsWith("#")) {
    const n = Number.parseInt(out.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const parts = out.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1];
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
}

const toCss = ([r, g, b, a]: Rgba) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;

/** Mixes `color` over `base`, resolving alpha against the base so WebGL gets an opaque color. */
function mix(color: Rgba, base: Rgba, amount: number): string {
  const t = amount * color[3];
  return toCss([
    color[0] * t + base[0] * (1 - t),
    color[1] * t + base[1] * (1 - t),
    color[2] * t + base[2] * (1 - t),
    1,
  ]);
}

function readPalette(): Palette {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return fallbackPalette;
  const css = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => toRgba(ctx, css.getPropertyValue(name).trim(), fallback);

  const background = token("--background", fallbackPalette.background);
  const foreground = token("--foreground", fallbackPalette.foreground);
  const faint = token("--faint", "#9b968e");
  const kinds = {} as Record<NodeKind, string>;
  for (const kind of nodeKinds) {
    const name = kindToken[kind];
    kinds[kind] = name ? toCss(token(name, fallbackPalette.kinds[kind])) : NOTE_BLUE;
  }
  return {
    kinds,
    background: toCss(background),
    foreground: toCss(foreground),
    popover: mix(token("--popover", fallbackPalette.popover), background, 1),
    border: mix(token("--border", "rgba(22, 20, 18, 0.1)"), background, 1),
    dim: mix(faint, background, 0.35),
    edge: mix(foreground, background, 0.22),
    edgeFaint: mix(foreground, background, 0.12),
    edgeHighlight: toCss(token("--ember", fallbackPalette.edgeHighlight)),
    font: getComputedStyle(document.body).fontFamily || fallbackPalette.font,
  };
}

// ---- Model ---------------------------------------------------------------------

const allTagsOf = (node: BinderNode) => [...(node.tags ?? []), ...(node.contentTags ?? [])];

/** Pure: which nodes and edges the graph should show for the given filters. */
function buildModel(nodes: BinderNode[], index: NodeIndex, links: ProjectLink[], o: Options): GraphModel {
  const center = o.mode === "local" && o.centerId && index.byId.has(o.centerId) ? o.centerId : null;
  const model: GraphModel = { nodes: new Map(), edges: new Map() };
  if (o.mode === "local" && !center) return model;

  const candidates = new Map<string, BinderNode>();
  for (const n of nodes) {
    if (isTrashed(index, n.id)) continue;
    const passes = !o.hiddenKinds.has(n.kind) && (!o.tag || allTagsOf(n).includes(o.tag));
    if (passes || n.id === center) candidates.set(n.id, n);
  }

  const adjacency = new Map<string, Set<string>>();
  const connect = (a: string, b: string) => {
    let set = adjacency.get(a);
    if (!set) adjacency.set(a, (set = new Set()));
    set.add(b);
  };
  for (const l of links) {
    if (l.source === l.target || (l.kind === "property" && !o.includeProperty)) continue;
    if (!candidates.has(l.source) || !candidates.has(l.target)) continue;
    const [source, target] = l.source < l.target ? [l.source, l.target] : [l.target, l.source];
    const key = `${source}|${target}`;
    const existing = model.edges.get(key);
    if (existing && linkPriority[existing.kind] >= linkPriority[l.kind]) continue;
    model.edges.set(key, { source, target, kind: l.kind, ...linkStyle[l.kind] });
    connect(source, target);
    connect(target, source);
  }

  let keep: Set<string>;
  if (center) {
    keep = new Set([center]);
    let frontier = [center];
    for (let hop = 0; hop < o.depth && frontier.length; hop++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const neighbour of adjacency.get(id) ?? []) {
          if (keep.has(neighbour)) continue;
          keep.add(neighbour);
          next.push(neighbour);
        }
      }
      frontier = next;
    }
  } else {
    keep = new Set(candidates.keys());
  }

  for (const [key, e] of model.edges) {
    if (!keep.has(e.source) || !keep.has(e.target)) model.edges.delete(key);
  }
  const degree = new Map<string, number>();
  for (const e of model.edges.values()) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  for (const id of keep) {
    const n = candidates.get(id)!;
    const d = degree.get(id) ?? 0;
    if (d === 0 && !o.showOrphans && id !== center) continue;
    const words = n.wordCount ?? 0;
    model.nodes.set(id, {
      label: n.title || "Untitled",
      kind: n.kind,
      size: 4 + Math.sqrt(d) * 2.6 + Math.min(Math.log10(words + 1), 4.5) * 0.7,
      search: [n.title, ...(n.aliases ?? [])].join("\n").toLowerCase(),
    });
  }
  return model;
}

const sameLinks = (a: ProjectLink[] | null, b: ProjectLink[]) =>
  !!a && a.length === b.length && a.every((l, i) => l.source === b[i].source && l.target === b[i].target && l.kind === b[i].kind);

// ---- Component -----------------------------------------------------------------

type Runtime = {
  sigma: Sigma<NodeAttrs, EdgeAttrs>;
  layout: FA2LayoutSupervisor<NodeAttrs, EdgeAttrs>;
  barnesHut: boolean;
  createLayout: (barnesHut: boolean) => FA2LayoutSupervisor<NodeAttrs, EdgeAttrs>;
};

/** The whole project's notes and links, or those around one note (N steps away) (plan.md 2.5). A List mode shows the same as text. */
export function GraphView({ nodeId }: { nodeId?: string }) {
  useReached("graph");
  const { project, binder, activeNodeId, open, openView, actions, commands } = useWorkspace();
  const quickNew = commands.find((c) => c.id === "binder.new-note");
  const words = useVocabulary();
  const { nodes, index } = useStore(binder);
  const active = useStore(activeNodeId);

  // Follow the last opened note, so focusing this pane doesn't blank a local graph.
  const [followed, setFollowed] = useState(active);
  if (active && active !== followed) setFollowed(active);
  const centerId = nodeId ?? followed;

  const [mode, setMode] = useState<Mode>(nodeId ? "local" : "global");
  // Remembered for the person, in every project (components/workspace/shell-prefs.ts, useViewSetting).
  const [depth, setDepth] = useViewSetting<number>("graph.depth", 1, (v) => (typeof v === "number" && v >= 1 && v <= 5 ? v : undefined));
  const [search, setSearch] = useState("");
  const [hiddenList, setHiddenList] = useViewSetting<NodeKind[]>("graph.hiddenKinds", ["folder", "timeline"], (v) =>
    Array.isArray(v) ? v.filter((k): k is NodeKind => (nodeKinds as readonly string[]).includes(k)) : undefined,
  );
  const hiddenKey = hiddenList.join(",");
  const hiddenKinds = useMemo<ReadonlySet<NodeKind>>(() => new Set(hiddenKey ? (hiddenKey.split(",") as NodeKind[]) : []), [hiddenKey]);
  const [tag, setTag] = useState<string | null>(null);
  const yesNo = (v: unknown) => (typeof v === "boolean" ? v : undefined);
  const [showOrphans, setShowOrphans] = useViewSetting("graph.orphans", true, yesNo);
  const [includeProperty, setIncludeProperty] = useViewSetting("graph.propertyLinks", true, yesNo);
  const [links, setLinks] = useState<ProjectLink[] | null>(null);
  // The canvas, or the same notes as a list that works with a keyboard and a screen reader.
  const [display, setDisplay] = useViewSetting<"graph" | "list">("graph.display", "graph", (v) => (v === "graph" || v === "list" ? v : undefined));
  const [ready, setReady] = useState(false);
  const [layoutRunning, setLayoutRunning] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const [graph] = useState(() => new Graph<NodeAttrs, EdgeAttrs>({ type: "undirected", multi: false, allowSelfLoops: false }));
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const hoveredRef = useRef<string | null>(null);
  const searchRef = useRef("");
  const centerRef = useRef<string | null>(null);
  const openRef = useRef(open);
  const layoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  // ---- Links: on mount, when the binder changes, and every 15s while visible.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      read("getProjectLinks", project.id)
        .then((next) => {
          if (!cancelled) setLinks((prev) => (sameLinks(prev, next as ProjectLink[]) ? prev : (next as ProjectLink[])));
        })
        .catch(() => {
          if (!cancelled) setLinks((prev) => prev ?? []);
        });
    };
    const debounce = setTimeout(load, 300);
    const poll = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      clearInterval(poll);
    };
  }, [project.id, nodes]);

  const tags = useMemo(() => {
    const all = new Set<string>();
    for (const n of nodes) if (!isTrashed(index, n.id)) for (const t of allTagsOf(n)) all.add(t);
    return [...all].sort((a, b) => a.localeCompare(b));
  }, [nodes, index]);

  const kindCounts = useMemo(() => {
    const counts = new Map<NodeKind, number>();
    for (const n of nodes) if (!isTrashed(index, n.id)) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
    return counts;
  }, [nodes, index]);

  // Under a spoiler horizon the graph only has what the audience knows by then.
  const horizon = useHorizon();
  const known = useMemo(() => (horizon ? nodes.filter((n) => horizon.knows(n.id)) : nodes), [horizon, nodes]);

  // Entries of the shared world that notes here link to: drawn with the project, opened in the Codex.
  const shared = useSharedWorld();
  const worldLinks = useWorldLinks();
  const worldEntries = useMemo(() => {
    if (!shared || !worldLinks?.length) return [];
    const linked = new Set(worldLinks.map((l) => l.target));
    return shared.entries
      .filter((e) => linked.has(e.id))
      .map((e) => ({ id: e.id, kind: e.kind, title: `${e.title} ↗`, aliases: e.aliases, wordCount: 0, tags: [], contentTags: [], parentId: null, deletedAt: null }) as unknown as BinderNode);
  }, [shared, worldLinks]);
  const worldIds = useRef(new Set<string>());
  const openViewRef = useRef(openView);
  useEffect(() => {
    worldIds.current = new Set(worldEntries.map((e) => e.id));
    openViewRef.current = openView;
  }, [openView, worldEntries]);

  const allLinks = useMemo(() => (worldLinks?.length ? [...(links ?? []), ...worldLinks] : (links ?? [])), [links, worldLinks]);
  const model = useMemo(
    () =>
      buildModel(worldEntries.length ? [...known, ...worldEntries] : known, index, allLinks, {
        mode,
        centerId,
        depth,
        hiddenKinds,
        tag,
        showOrphans,
        includeProperty,
      }),
    [known, worldEntries, index, allLinks, mode, centerId, depth, hiddenKinds, tag, showOrphans, includeProperty],
  );

  // What List mode shows: the graph's notes (narrowed by the search), each with its links both ways.
  const listed = useMemo(() => {
    if (display !== "list") return [];
    const q = search.trim().toLowerCase();
    const shown = [...model.nodes].map(([id, n]) => ({ id, label: n.label, search: n.search }));
    const all = linkList(shown, allLinks as ProjectLink[], includeProperty ? undefined : "property");
    return q ? all.filter((n) => shown.find((s) => s.id === n.id)!.search.includes(q)) : all;
  }, [display, model, allLinks, includeProperty, search]);

  const openFromList = (id: string, e: React.MouseEvent) => {
    if (worldIds.current.has(id)) openView("codex", { nodeId: id }, e.metaKey || e.ctrlKey ? "split" : "tab");
    else open(id, e.metaKey || e.ctrlKey ? "tab" : "replace");
  };

  const runLayout = useCallback((ms = LAYOUT_MS) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (layoutTimer.current) clearTimeout(layoutTimer.current);
    if (runtime.layout.isRunning()) runtime.layout.stop();
    const order = runtime.sigma.getGraph().order;
    if (order === 0) {
      setLayoutRunning(false);
      return;
    }
    const barnesHut = order > BARNES_HUT_MIN;
    if (barnesHut !== runtime.barnesHut) {
      runtime.layout.kill();
      runtime.layout = runtime.createLayout(barnesHut);
      runtime.barnesHut = barnesHut;
    }
    runtime.layout.start();
    setLayoutRunning(true);
    layoutTimer.current = setTimeout(() => {
      runtime.layout.stop();
      setLayoutRunning(false);
    }, ms);
  }, []);

  // ---- Sigma + layout worker (browser only).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let teardown = () => {};

    void Promise.all([import("sigma"), import("graphology-layout-forceatlas2/worker")]).then(
      ([{ default: SigmaCtor }, { default: FA2Layout }]) => {
        if (disposed) return;
        let palette = readPalette();

        const drawHover = (
          ctx: CanvasRenderingContext2D,
          data: PartialButFor<NodeDisplayData, "x" | "y" | "size" | "label" | "color">,
          settings: { labelSize: number; labelFont: string; labelWeight: string },
        ) => {
          ctx.beginPath();
          ctx.arc(data.x, data.y, data.size + 3, 0, Math.PI * 2);
          ctx.fillStyle = palette.background;
          ctx.strokeStyle = palette.edgeHighlight;
          ctx.lineWidth = 1.5;
          ctx.fill();
          ctx.stroke();
          if (!data.label) return;
          const size = settings.labelSize;
          ctx.font = `600 ${size}px ${settings.labelFont}`;
          const width = ctx.measureText(data.label).width;
          const x = data.x + data.size + 6;
          const y = data.y - size / 2 - 4;
          ctx.beginPath();
          ctx.roundRect(x, y, width + 12, size + 8, 5);
          ctx.fillStyle = palette.popover;
          ctx.strokeStyle = palette.border;
          ctx.lineWidth = 1;
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = palette.foreground;
          ctx.textBaseline = "middle";
          ctx.fillText(data.label, x + 6, data.y);
          ctx.textBaseline = "alphabetic";
        };

        const sigma = new SigmaCtor<NodeAttrs, EdgeAttrs>(graph, container, {
          allowInvalidContainer: true,
          renderEdgeLabels: false,
          labelFont: palette.font,
          labelSize: 12,
          labelWeight: "500",
          labelColor: { color: palette.foreground },
          labelDensity: 0.6,
          labelRenderedSizeThreshold: 7,
          defaultEdgeType: "line",
          minCameraRatio: 0.05,
          maxCameraRatio: 8,
          stagePadding: 40,
          zIndex: true,
          defaultDrawNodeHover: drawHover,
          nodeReducer: (node, data) => {
            const res: Partial<NodeDisplayData> = { ...data, color: palette.kinds[data.kind] ?? NOTE_BLUE };
            const hovered = hoveredRef.current;
            const query = searchRef.current;
            if (node === centerRef.current) {
              res.forceLabel = true;
              res.zIndex = 1;
            }
            if (hovered && graph.hasNode(hovered)) {
              if (node === hovered || graph.areNeighbors(node, hovered)) {
                res.forceLabel = true;
                res.zIndex = 2;
              } else {
                res.color = palette.dim;
                res.label = null;
                res.forceLabel = false;
                res.zIndex = 0;
              }
            } else if (query) {
              if (data.search.includes(query)) {
                res.forceLabel = true;
                res.highlighted = true;
                res.zIndex = 2;
              } else {
                res.color = palette.dim;
                res.label = null;
                res.forceLabel = false;
                res.zIndex = 0;
              }
            }
            return res;
          },
          edgeReducer: (edge, data) => {
            const res = { ...data, color: data.kind === "property" ? palette.edgeFaint : palette.edge, zIndex: 0 };
            const hovered = hoveredRef.current;
            const query = searchRef.current;
            if (hovered && graph.hasNode(hovered)) {
              if (graph.hasExtremity(edge, hovered)) {
                res.color = palette.edgeHighlight;
                res.zIndex = 1;
              } else {
                res.color = palette.edgeFaint;
                res.size = Math.min(data.size, 0.6);
              }
            } else if (query) {
              const [s, t] = graph.extremities(edge);
              if (!graph.getNodeAttribute(s, "search").includes(query) && !graph.getNodeAttribute(t, "search").includes(query)) {
                res.color = palette.edgeFaint;
              }
            }
            return res;
          },
        });

        const createLayout = (barnesHut: boolean) =>
          new FA2Layout<NodeAttrs, EdgeAttrs>(graph, {
            getEdgeWeight: "weight",
            settings: {
              gravity: 0.6,
              strongGravityMode: true,
              scalingRatio: 8,
              slowDown: 4,
              barnesHutOptimize: barnesHut,
              barnesHutTheta: 0.6,
              edgeWeightInfluence: 1,
            },
          });

        const setHovered = (id: string | null) => {
          hoveredRef.current = id;
          container.style.cursor = id ? "pointer" : "";
          sigma.refresh({ skipIndexation: true });
        };
        sigma.on("enterNode", ({ node }) => setHovered(node));
        sigma.on("leaveNode", () => setHovered(null));
        sigma.on("clickNode", ({ node, event }) => {
          const e = event.original;
          if (worldIds.current.has(node)) openViewRef.current("codex", { nodeId: node }, e.metaKey || e.ctrlKey ? "split" : "tab");
          else openRef.current(node, e.metaKey || e.ctrlKey ? "tab" : "replace");
        });

        const resize = new ResizeObserver(() => {
          sigma.resize();
          sigma.refresh({ skipIndexation: true });
        });
        resize.observe(container);

        const theme = new MutationObserver(() => {
          palette = readPalette();
          sigma.setSetting("labelColor", { color: palette.foreground });
          sigma.refresh({ skipIndexation: true });
        });
        theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });

        const runtime: Runtime = { sigma, layout: createLayout(false), barnesHut: false, createLayout };
        runtimeRef.current = runtime;
        setReady(true);

        teardown = () => {
          theme.disconnect();
          resize.disconnect();
          runtime.layout.kill();
          sigma.kill();
          runtimeRef.current = null;
        };
      },
    );

    return () => {
      disposed = true;
      if (layoutTimer.current) clearTimeout(layoutTimer.current);
      teardown();
    };
  }, [graph]);

  // ---- Sync the model into the graph incrementally, keeping positions stable.
  useEffect(() => {
    if (!ready) return;
    centerRef.current = mode === "local" ? centerId : null;

    for (const id of graph.nodes()) {
      if (!model.nodes.has(id)) {
        positions.current.set(id, { x: graph.getNodeAttribute(id, "x"), y: graph.getNodeAttribute(id, "y") });
        graph.dropNode(id);
      }
    }
    for (const key of graph.edges()) if (!model.edges.has(key)) graph.dropEdge(key);

    let added = 0;
    const spread = Math.max(10, Math.sqrt(model.nodes.size) * 12);
    for (const [id, attrs] of model.nodes) {
      if (graph.hasNode(id)) {
        graph.mergeNodeAttributes(id, attrs);
        continue;
      }
      // Place newcomers where they were before, else next to a placed neighbour, else randomly.
      let pos = positions.current.get(id);
      if (!pos) {
        for (const e of model.edges.values()) {
          const other = e.source === id ? e.target : e.target === id ? e.source : null;
          if (other && graph.hasNode(other)) {
            pos = {
              x: graph.getNodeAttribute(other, "x") + (Math.random() - 0.5) * 4,
              y: graph.getNodeAttribute(other, "y") + (Math.random() - 0.5) * 4,
            };
            break;
          }
        }
      }
      if (!pos) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random()) * spread;
        pos = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
      }
      graph.addNode(id, { ...attrs, ...pos });
      added++;
    }

    for (const [key, e] of model.edges) {
      const { source, target, ...attrs } = e;
      if (graph.hasEdge(key)) graph.mergeEdgeAttributes(key, attrs);
      else {
        graph.addEdgeWithKey(key, source, target, attrs);
        added++;
      }
    }

    runtimeRef.current?.sigma.refresh();
    if (added > 0) runLayout();
  }, [ready, graph, model, mode, centerId, runLayout]);

  useEffect(() => {
    searchRef.current = search.trim().toLowerCase();
    runtimeRef.current?.sigma.refresh({ skipIndexation: true });
  }, [search, ready]);

  const toggleKind = (kind: NodeKind) => {
    const next = new Set(hiddenKinds);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    setHiddenList([...next]);
  };

  const recenter = () => runtimeRef.current?.sigma.getCamera().animatedReset({ duration: 300 });

  const empty =
    links === null
      ? null
      : mode === "local" && !centerId
        ? "Open a note to see what's around it."
        : model.nodes.size === 0
          ? nodes.length === 0
            ? "Nothing here yet. Create a note to start your graph."
            : "No notes match these filters."
          : model.edges.size === 0
            ? mode === "local"
              ? "This note has no links yet. Type [[ in a note to link it."
              : "No links yet. Type [[ in a note to link it to another."
            : null;

  const matchCount = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    let count = 0;
    for (const n of model.nodes.values()) if (n.search.includes(q)) count++;
    return count;
  }, [model, search]);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-background text-ui-sm">
      <div
        ref={containerRef}
        className="absolute inset-0"
        role="img"
        aria-label={`A graph of ${model.nodes.size} notes and ${model.edges.size} links. Choose List to go through them with a keyboard.`}
      />

      {display === "list" && (
        <div className="absolute inset-0 overflow-y-auto bg-background px-3 pt-24 pb-16 sm:px-6">
          {listed.length === 0 ? (
            <p className="mx-auto max-w-2xl py-8 text-center text-muted-foreground">{empty ?? "No notes match the search."}</p>
          ) : (
            <ul aria-label="Notes and their links" className="mx-auto grid max-w-2xl gap-2">
              {listed.map((n) => (
                <li key={n.id} className="rounded-lg border bg-card p-3">
                  <button
                    type="button"
                    onClick={(e) => openFromList(n.id, e)}
                    className="flex max-w-full items-center gap-2 rounded-sm text-left font-medium outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: kindCss(model.nodes.get(n.id)!.kind) }} />
                    <span className="truncate">{n.label}</span>
                    <span className="sr-only">, {words.label(model.nodes.get(n.id)!.kind)}</span>
                  </button>
                  <LinkRow label="Links to" notes={n.linksTo} onOpen={openFromList} />
                  <LinkRow label="Mentioned in" notes={n.linkedFrom} onOpen={openFromList} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Top-left: mode, search, filters. */}
      <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap items-start gap-2">
        <div role="group" aria-label="Show as" className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-sidebar/95 p-1 shadow-sm backdrop-blur">
          {(["graph", "list"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={display === d}
              onClick={() => setDisplay(d)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md px-2 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                display === d && "bg-sidebar-accent text-foreground",
              )}
            >
              <Icon name={d === "graph" ? "graph-new-linear" : "list-linear"} className="size-4" />
              {d === "graph" ? "Graph" : "List"}
            </button>
          ))}
        </div>

        <div role="group" aria-label="Which notes" className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-sidebar/95 p-1 shadow-sm backdrop-blur">
          {(["global", "local"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "h-8 rounded-md px-2 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                mode === m && "bg-sidebar-accent text-foreground",
              )}
            >
              {m === "global" ? "Whole project" : "Around this note"}
            </button>
          ))}
          {mode === "local" && (
            <div className="ml-1 flex items-center gap-1 border-l border-sidebar-border pl-2 text-muted-foreground">
              <span className="text-muted-foreground">Steps away</span>
              {[1, 2, 3].map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={depth === d}
                  aria-label={`${d} step${d > 1 ? "s" : ""} away`}
                  onClick={() => setDepth(d)}
                  className={cn(
                    "size-8 rounded-md tabular-nums outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    depth === d && "bg-sidebar-accent text-foreground",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="pointer-events-auto flex h-8 w-52 items-center gap-1.5 rounded-lg border border-border bg-sidebar/95 px-2 shadow-sm backdrop-blur focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
          <Icon name="magnifer-linear" className="size-4 shrink-0 text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setSearch("")}
            placeholder="Find a note"
            aria-label="Find a note in the graph"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint"
          />
          {matchCount !== null && (
            <span className="shrink-0 text-meta text-faint tabular-nums" aria-live="polite">
              {matchCount}
              <span className="sr-only"> {plural(matchCount, "match")}</span>
            </span>
          )}
        </label>

        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-sidebar/95 p-1 shadow-sm backdrop-blur">
          <Select value={tag ?? ALL_TAGS} onValueChange={(v) => setTag(v === ALL_TAGS ? null : v)}>
            <SelectTrigger size="sm" aria-label="Tag" className="h-8 min-w-28 border-0 bg-transparent px-2 text-ui-sm shadow-none dark:bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TAGS}>All tags</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t} value={t}>
                  #{t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleChip on={showOrphans} onClick={() => setShowOrphans(!showOrphans)} label="Unlinked notes" />
          <ToggleChip on={includeProperty} onClick={() => setIncludeProperty(!includeProperty)} label="Links from fields" />
        </div>
      </div>

      {/* Bottom-left: kind legend, doubles as a filter. */}
      <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1 rounded-lg border border-border bg-sidebar/95 p-1 shadow-sm backdrop-blur">
        {nodeKinds.map((kind) => {
          const hidden = hiddenKinds.has(kind);
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={!hidden}
              onClick={() => toggleKind(kind)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md px-2 text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                hidden && "text-faint line-through decoration-faint/60",
              )}
            >
              <span
                aria-hidden
                className={cn("size-2.5 rounded-full", hidden && "opacity-30")}
                style={{ background: kindCss(kind) }}
              />
              {words.label(kind)}
              <span className="text-meta text-faint tabular-nums">{kindCounts.get(kind) ?? 0}</span>
              {hidden && <span className="sr-only">(hidden)</span>}
            </button>
          );
        })}
      </div>

      {/* Bottom-right: camera and layout. */}
      <div className="absolute right-2 bottom-2 flex items-center gap-1 rounded-lg border border-border bg-sidebar/95 p-1 shadow-sm backdrop-blur">
        <IconButton icon="graph-new-linear" label="Fit to screen" onClick={recenter} disabled={display === "list"} className="hover:bg-sidebar-accent" />
        <IconButton
          icon="refresh-linear"
          label="Tidy up"
          onClick={() => runLayout()}
          disabled={!ready || model.nodes.size === 0 || display === "list"}
          className={cn("hover:bg-sidebar-accent", layoutRunning && "[&_svg]:animate-spin")}
        />
      </div>

      {empty && model.nodes.size > 0 && display === "graph" && (
        <p className="pointer-events-none absolute inset-x-0 top-24 text-center text-meta text-muted-foreground">{empty}</p>
      )}
      {empty && model.nodes.size === 0 && display === "graph" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="flex max-w-xs flex-col items-center gap-2 text-center text-muted-foreground">
            <Icon name="graph-new-linear" className="size-8" />
            <p className="text-ui-sm">{empty}</p>
            {/* An empty project: the graph starts with its first note. */}
            {nodes.length === 0 && project.actions.includes("edit") && (
              <button
                type="button"
                onClick={() => (quickNew ? quickNew.run() : void actions.create("note"))}
                className="pointer-events-auto mt-1 flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm text-background outline-none hover:bg-foreground/90 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Icon name="add-linear" className="size-4" />
                {quickNew?.title ?? "New note"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleChip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1 rounded-md px-2 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
        on && "bg-sidebar-accent text-foreground",
      )}
    >
      <Icon name={on ? "eye-linear" : "eye-closed-linear"} className="size-3.5" />
      {label}
    </button>
  );
}

/** One direction of a listed note's links, as buttons that open each note. */
function LinkRow({ label, notes, onOpen }: { label: string; notes: Array<{ id: string; label: string }>; onOpen: (id: string, e: React.MouseEvent) => void }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-ui-sm">
      <span className="text-muted-foreground">{label}:</span>
      {notes.length === 0 ? (
        <span className="text-faint">nothing</span>
      ) : (
        notes.map((n, i) => (
          <span key={n.id}>
            <button
              type="button"
              onClick={(e) => onOpen(n.id, e)}
              className="rounded-sm text-teal-ink underline-offset-2 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {n.label}
            </button>
            {i < notes.length - 1 && <span className="text-faint">,</span>}
          </span>
        ))
      )}
    </div>
  );
}
