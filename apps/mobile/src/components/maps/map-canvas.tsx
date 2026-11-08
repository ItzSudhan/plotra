"use dom";

import type { DOMProps } from "expo/dom";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { forceLayout, type Point } from "./layout";
import type { SceneEdge, SceneNode, SceneTheme } from "./scene";

// The phone's graph, relationship map, family tree and boards are drawn here:
// SVG in a web view (an Expo DOM component), so a few thousand notes pan and
// pinch smoothly. One finger pans (or, with moving on, drags a card), two
// pinch to zoom, a tap picks a note, a line or an empty spot. What a tap or a
// drag means is the screen's business: it's told through the callbacks.

type Props = {
  dom?: DOMProps;
  nodes: SceneNode[];
  edges: SceneEdge[];
  theme: SceneTheme;
  /** `force`: lay the notes out here (the graph). `given`: use their x and y. */
  layout: "force" | "given";
  /** Force layout: the note that stays in the middle. */
  fixedId?: string | null;
  selectedId?: string | null;
  /** Dragging a movable node moves it instead of panning. */
  moving?: boolean;
  /** Change it to fit everything on screen again. */
  fitKey?: number;
  onTapNode: (id: string) => Promise<void>;
  onTapEdge?: (id: string) => Promise<void>;
  /** Where on the scene an empty spot was tapped. */
  onTapBackground?: (point: Point) => Promise<void>;
  /** A node was dragged: its new top-left. */
  onMove?: (id: string, x: number, y: number) => Promise<void>;
};

type View = { tx: number; ty: number; scale: number };

const TAP_SLOP = 8;
const MIN_SCALE = 0.04;
const MAX_SCALE = 4;
/** Below this zoom a graph's labels would only be clutter: they show for the selected note and its neighbours. */
const LABEL_ZOOM = 0.55;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Where the line from a node's centre towards a point leaves its shape. */
function borderPoint(n: SceneNode, at: Point, toward: Point): Point {
  const dx = toward.x - at.x;
  const dy = toward.y - at.y;
  if (!dx && !dy) return at;
  if (n.shape === "dot") {
    const d = Math.hypot(dx, dy);
    return { x: at.x + (dx / d) * (n.w / 2), y: at.y + (dy / d) * (n.h / 2) };
  }
  const scale = 1 / Math.max(Math.abs(dx) / (n.w / 2 || 1), Math.abs(dy) / (n.h / 2 || 1));
  return { x: at.x + dx * scale, y: at.y + dy * scale };
}

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export default function MapCanvas(props: Props) {
  const { nodes, edges, theme, layout, fixedId, selectedId, moving, fitKey } = props;
  const callbacks = useRef(props);
  useEffect(() => {
    callbacks.current = props;
  });

  // Where each node is: laid out here, or as given; then whatever was dragged since the data last came.
  const base = useMemo(() => {
    const out = new Map<string, Point>();
    if (layout === "force") {
      const centres = forceLayout(
        nodes.map((n) => n.id),
        edges.map((e) => ({ from: e.from, to: e.to })),
        { fixed: fixedId },
      );
      for (const n of nodes) {
        const c = centres.get(n.id) ?? { x: 0, y: 0 };
        out.set(n.id, { x: c.x - n.w / 2, y: c.y - n.h / 2 });
      }
    } else for (const n of nodes) out.set(n.id, { x: n.x, y: n.y });
    return out;
  }, [nodes, edges, layout, fixedId]);
  const [moved, setMoved] = useState<Map<string, Point>>(new Map());
  const [movedFor, setMovedFor] = useState(base);
  if (movedFor !== base) {
    setMovedFor(base);
    setMoved(new Map());
  }
  const at = (id: string) => moved.get(id) ?? base.get(id);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // ---- The view: panned and zoomed by writing the transform straight onto the scene, not through React.
  const box = useRef<HTMLDivElement>(null);
  const scene = useRef<SVGGElement>(null);
  const view = useRef<View>({ tx: 0, ty: 0, scale: 1 });
  const [zoomedIn, setZoomedIn] = useState(true);
  const apply = () => {
    const v = view.current;
    scene.current?.setAttribute("transform", `translate(${v.tx} ${v.ty}) scale(${v.scale})`);
    const zoomed = v.scale >= LABEL_ZOOM;
    setZoomedIn((z) => (z === zoomed ? z : zoomed));
  };

  const fit = () => {
    const el = box.current;
    if (!el || !nodes.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      const p = at(n.id)!;
      // A dot's label hangs to its right.
      const right = n.shape === "dot" ? Math.min(n.label.length * 7, 160) : 0;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + n.w + right);
      maxY = Math.max(maxY, p.y + n.h);
    }
    const pad = 24;
    const w = Math.max(1, el.clientWidth - pad * 2);
    const h = Math.max(1, el.clientHeight - pad * 2);
    const scale = clamp(Math.min(w / (maxX - minX || 1), h / (maxY - minY || 1)), MIN_SCALE, 1.4);
    view.current = { scale, tx: pad + (w - (maxX - minX) * scale) / 2 - minX * scale, ty: pad + (h - (maxY - minY) * scale) / 2 - minY * scale };
    apply();
  };
  // Fit when asked, and whenever the layout itself changes (not when one card is dragged).
  const fitRef = useRef(fit);
  useEffect(() => {
    fitRef.current = fit;
  });
  useEffect(() => {
    fitRef.current();
  }, [base, fitKey]);
  useEffect(() => {
    const onResize = () => fitRef.current();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ---- Touch: one finger pans or drags, two pinch; a short touch that barely moved is a tap.
  type Gesture = {
    pointers: Map<number, Point>;
    start: Point;
    startAt: number;
    travelled: number;
    multi: boolean;
    target: Element | null;
    drag: { id: string; from: Point; origin: Point } | null;
    pinch: { distance: number; scale: number; mid: Point; scene: Point } | null;
  };
  const gesture = useRef<Gesture | null>(null);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toScene = (p: Point): Point => ({ x: (p.x - view.current.tx) / view.current.scale, y: (p.y - view.current.ty) / view.current.scale });

  const startPinch = (g: Gesture) => {
    const [a, b] = [...g.pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    g.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: view.current.scale, mid, scene: toScene(mid) };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = local(e);
    let g = gesture.current;
    if (!g) {
      const target = e.target instanceof Element ? e.target : null;
      const nodeId = target?.closest("[data-node]")?.getAttribute("data-node") ?? null;
      const node = nodeId ? byId.get(nodeId) : undefined;
      const origin = node ? at(node.id) : undefined;
      g = gesture.current = {
        pointers: new Map(),
        start: p,
        startAt: Date.now(),
        travelled: 0,
        multi: false,
        target,
        drag: moving && node?.movable && origin ? { id: node.id, from: p, origin } : null,
        pinch: null,
      };
    }
    g.pointers.set(e.pointerId, p);
    if (g.pointers.size === 2) {
      g.multi = true;
      // A second finger turns a drag into a pinch: the card goes back where it was.
      if (g.drag) {
        const { id } = g.drag;
        setMoved((m) => {
          const next = new Map(m);
          next.delete(id);
          return next;
        });
        g.drag = null;
      }
      startPinch(g);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || !g.pointers.has(e.pointerId)) return;
    const p = local(e);
    const prev = g.pointers.get(e.pointerId)!;
    g.pointers.set(e.pointerId, p);
    g.travelled = Math.max(g.travelled, Math.hypot(p.x - g.start.x, p.y - g.start.y));
    if (g.pointers.size >= 2 && g.pinch) {
      const [a, b] = [...g.pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const scale = clamp((g.pinch.scale * Math.hypot(a.x - b.x, a.y - b.y)) / g.pinch.distance, MIN_SCALE, MAX_SCALE);
      // The point under the fingers stays under them.
      view.current = { scale, tx: mid.x - g.pinch.scene.x * scale, ty: mid.y - g.pinch.scene.y * scale };
      apply();
      return;
    }
    if (g.drag && g.travelled > TAP_SLOP) {
      const { id, from, origin } = g.drag;
      const s = view.current.scale;
      setMoved((m) => new Map(m).set(id, { x: origin.x + (p.x - from.x) / s, y: origin.y + (p.y - from.y) / s }));
      return;
    }
    if (!g.drag) {
      view.current = { ...view.current, tx: view.current.tx + p.x - prev.x, ty: view.current.ty + p.y - prev.y };
      apply();
    }
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    g.pointers.delete(e.pointerId);
    if (g.pointers.size === 1 && g.multi) {
      // One finger left after a pinch: carry on panning from there, never a tap.
      g.pinch = null;
      return;
    }
    if (g.pointers.size > 0) return;
    gesture.current = null;
    const cb = callbacks.current;
    if (g.drag && g.travelled > TAP_SLOP && !g.multi) {
      const { id, from, origin } = g.drag;
      const p = local(e);
      const s = view.current.scale;
      void cb.onMove?.(id, Math.round(origin.x + (p.x - from.x) / s), Math.round(origin.y + (p.y - from.y) / s));
      return;
    }
    if (g.multi || g.travelled > TAP_SLOP || Date.now() - g.startAt > 700 || e.type === "pointercancel") return;
    const nodeId = g.target?.closest("[data-node]")?.getAttribute("data-node");
    const edgeId = g.target?.closest("[data-edge]")?.getAttribute("data-edge");
    if (nodeId) void cb.onTapNode(nodeId);
    else if (edgeId) void cb.onTapEdge?.(edgeId);
    else void cb.onTapBackground?.(toScene(local(e)));
  };

  // ---- Drawing.
  const neighbours = useMemo(() => {
    const set = new Set<string>();
    if (selectedId) for (const e of edges) if (e.from === selectedId) set.add(e.to);
      else if (e.to === selectedId) set.add(e.from);
    return set;
  }, [edges, selectedId]);
  const markerColors = useMemo(() => [...new Set(edges.filter((e) => e.arrow).map((e) => e.color))], [edges]);
  const markerId = (color: string) => `arrow-${markerColors.indexOf(color)}`;
  const centre = (n: SceneNode): Point => {
    const p = at(n.id)!;
    return { x: p.x + n.w / 2, y: p.y + n.h / 2 };
  };
  const font = "-apple-system, system-ui, Roboto, sans-serif";

  const edgePath = (e: SceneEdge) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) return null;
    const ca = centre(a);
    const cb = centre(b);
    if (e.route === "elbow") {
      const pa = at(a.id)!;
      const pb = at(b.id)!;
      const x1 = ca.x;
      const y1 = pa.y + a.h;
      const x2 = cb.x;
      const y2 = pb.y;
      const mid = (y1 + y2) / 2;
      return { d: `M ${x1} ${y1} V ${mid} H ${x2} V ${y2}`, mid: { x: (x1 + x2) / 2, y: mid } };
    }
    const offset = e.route === "curve" ? (hash(e.id) % 5) * 9 - 18 : 0;
    const len = Math.hypot(cb.x - ca.x, cb.y - ca.y) || 1;
    const control = { x: (ca.x + cb.x) / 2 + (-(cb.y - ca.y) / len) * offset, y: (ca.y + cb.y) / 2 + ((cb.x - ca.x) / len) * offset };
    const start = e.arrow ? borderPoint(a, ca, control) : ca;
    const end = e.arrow ? borderPoint(b, cb, control) : cb;
    const mid = { x: (start.x + 2 * control.x + end.x) / 4, y: (start.y + 2 * control.y + end.y) / 4 };
    return { d: offset ? `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}` : `M ${start.x} ${start.y} L ${end.x} ${end.y}`, mid };
  };

  const fewNodes = nodes.length <= 40;
  const groups = nodes.filter((n) => n.shape === "group");
  const others = nodes.filter((n) => n.shape !== "group");

  return (
    <div
      ref={box}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      style={{ position: "fixed", inset: 0, overflow: "hidden", background: theme.background, touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
    >
      <style>{"html,body{margin:0;padding:0;overscroll-behavior:none;background:transparent}"}</style>
      <svg width="100%" height="100%" style={{ display: "block" }} role="img" aria-label="Map">
        <defs>
          {markerColors.map((color) => (
            <marker key={color} id={markerId(color)} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
            </marker>
          ))}
        </defs>
        <g ref={scene}>
          {groups.map((n) => {
            const p = at(n.id)!;
            return (
              <g key={n.id} data-node={n.id} role="button" aria-label={n.description ?? n.label}>
                <rect x={p.x} y={p.y} width={n.w} height={n.h} rx={14} fill={n.color} fillOpacity={0.08} stroke={n.color} strokeOpacity={0.5} strokeDasharray="6 5" strokeWidth={1.5} />
                <text x={p.x + 12} y={p.y + 22} fontSize={14} fontWeight={600} fill={theme.mutedForeground} fontFamily={font}>
                  {n.label}
                </text>
              </g>
            );
          })}
          {edges.map((e) => {
            const path = edgePath(e);
            if (!path) return null;
            const lit = !selectedId || e.from === selectedId || e.to === selectedId;
            const faded = byId.get(e.from)?.dim || byId.get(e.to)?.dim;
            return (
              <g key={e.id} data-edge={e.id} opacity={lit ? (faded ? 0.35 : 1) : 0.18}>
                <path d={path.d} fill="none" stroke="transparent" strokeWidth={Math.max(16, e.width * 6)} />
                <path
                  d={path.d}
                  fill="none"
                  stroke={e.color}
                  strokeWidth={e.width}
                  strokeDasharray={e.dashed ? "5 5" : undefined}
                  markerEnd={e.arrow ? `url(#${markerId(e.color)})` : undefined}
                />
                {!!e.label && (zoomedIn || e.from === selectedId || e.to === selectedId) && (
                  <g>
                    <rect x={path.mid.x - e.label.length * 3.4 - 7} y={path.mid.y - 10} width={e.label.length * 6.8 + 14} height={20} rx={10} fill={theme.background} stroke={e.color} strokeWidth={1} />
                    <text x={path.mid.x} y={path.mid.y + 4} textAnchor="middle" fontSize={11} fill={theme.foreground} fontFamily={font}>
                      {e.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          {others.map((n) => {
            const p = at(n.id)!;
            const selected = n.id === selectedId;
            const lit = !selectedId || selected || neighbours.has(n.id);
            const opacity = (n.dim ? 0.35 : 1) * (lit ? 1 : 0.3);
            if (n.shape === "dot") {
              const r = n.w / 2;
              const showLabel = selected || neighbours.has(n.id) || zoomedIn || fewNodes;
              return (
                <g key={n.id} data-node={n.id} opacity={opacity} role="button" aria-label={n.description ?? n.label}>
                  {/* A bigger target than the dot, for fingers. */}
                  <circle cx={p.x + r} cy={p.y + r} r={Math.max(r, 14)} fill="transparent" />
                  <circle cx={p.x + r} cy={p.y + r} r={r} fill={n.color} stroke={selected ? theme.ember : theme.background} strokeWidth={selected ? 3 : 1.5} />
                  {showLabel && (
                    <text x={p.x + n.w + 5} y={p.y + r + 4} fontSize={selected ? 14 : 12} fontWeight={selected ? 600 : 400} fill={theme.foreground} fontFamily={font} stroke={theme.background} strokeWidth={3} paintOrder="stroke">
                      {n.label.length > 40 ? `${n.label.slice(0, 39)}…` : n.label}
                    </text>
                  )}
                </g>
              );
            }
            if (n.shape === "pill") {
              return (
                <g key={n.id} data-node={n.id} opacity={opacity} role="button" aria-label={n.description ?? n.label}>
                  <rect x={p.x} y={p.y} width={n.w} height={n.h} rx={n.h / 2} fill={theme.card} stroke={selected ? theme.ember : theme.border} strokeWidth={selected ? 3 : 1} />
                  <circle cx={p.x + n.h / 2} cy={p.y + n.h / 2} r={n.h / 2 - 6} fill={n.color} fillOpacity={0.18} />
                  <text x={p.x + n.h / 2} y={p.y + n.h / 2 + 6} textAnchor="middle" fontSize={17} fill={n.color} fontFamily="Georgia, serif">
                    {n.label.slice(0, 1).toUpperCase()}
                  </text>
                  <text x={p.x + n.h + 2} y={p.y + (n.body ? n.h / 2 - 2 : n.h / 2 + 5)} fontSize={14} fontWeight={600} fill={theme.foreground} fontFamily={font}>
                    {n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label}
                  </text>
                  {!!n.body && (
                    <text x={p.x + n.h + 2} y={p.y + n.h / 2 + 14} fontSize={11} fill={theme.mutedForeground} fontFamily={font}>
                      {n.body}
                    </text>
                  )}
                </g>
              );
            }
            // A board card: its text inside, wrapped.
            return (
              <g key={n.id} data-node={n.id} opacity={opacity} role="button" aria-label={n.description ?? n.label}>
                <rect x={p.x} y={p.y} width={n.w} height={n.h} rx={10} fill={theme.card} stroke={selected ? theme.ember : theme.border} strokeWidth={selected ? 3 : 1} />
                <rect x={p.x} y={p.y} width={6} height={n.h} rx={3} fill={n.color} />
                <foreignObject x={p.x + 10} y={p.y + 6} width={Math.max(10, n.w - 18)} height={Math.max(10, n.h - 12)}>
                  <div style={{ fontFamily: font, color: theme.foreground, overflow: "hidden", height: "100%", pointerEvents: "none" }}>
                    {!!n.label && <div style={{ fontSize: 14, fontWeight: 600, lineHeight: "18px", marginBottom: 4 }}>{n.label}</div>}
                    {!!n.body && <div style={{ fontSize: 12, lineHeight: "16px", color: n.label ? theme.mutedForeground : theme.foreground, whiteSpace: "pre-wrap" }}>{n.body}</div>}
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
