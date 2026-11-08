import { motion } from "motion/react";
import { Icon } from "@plotra/icons";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";
import { GraphNode } from "./faces";
import { AXIS_H, graph, grid, manuscript, storyboard, timeline, type Box, type Size, type ViewId } from "./layouts";
import { chapters, events, kinds, noteLinks, notes, scenes, threads, type NoteId } from "./story";

// Everything in a view that isn't one of the five scenes: the chapter headings
// they sit under, the lanes they sit in, the notes they link to.

type BackdropProps = { size: Size; picked: number };

const place = (b: Box) => ({ left: b.x, top: b.y, width: b.w, height: b.h || undefined });

function Manuscript({ size }: BackdropProps) {
  return manuscript(size).headings.map((b, c) => (
    <div key={c} className="absolute flex items-end gap-3 pb-2 pl-[18px] text-[12.5px] text-muted" style={place(b)}>
      <span className="flex shrink-0 items-center gap-1.5">
        <Icon name="book-bookmark-linear" className="size-3.5 text-ember" />
        {chapters[c]}
      </span>
      <span className="mb-[7px] h-px flex-1 bg-fg/10" />
    </div>
  ));
}

function Grid({ size, picked }: BackdropProps) {
  const g = grid(size);
  const header = "absolute flex items-center border-r border-b border-fg/10 bg-well px-3";
  return (
    <>
      <div
        className={cn(header, "border-t text-[11px] font-medium tracking-wider text-muted uppercase")}
        style={{ left: 0, top: g.top, width: g.sceneW, height: g.head }}
      >
        Scene
      </div>
      {threads.map((t, j) => (
        <div
          key={t.name}
          className={cn(header, "text-[13px] font-medium")}
          style={{ left: g.sceneW + j * g.threadW, top: g.top, width: g.threadW, height: g.head, borderTop: `3px solid ${t.color}` }}
        >
          <span className="truncate">{t.name}</span>
        </div>
      ))}
      {scenes.map((s, i) =>
        threads.map((t, j) => (
          <div
            key={`${i}${j}`}
            className={cn(
              "absolute overflow-hidden border-r border-b border-fg/10 px-3 py-2 leading-snug text-fg/80 transition-colors duration-500",
              size.compact ? "text-[11px]" : "text-[12.5px]",
            )}
            style={{
              left: g.sceneW + j * g.threadW,
              top: g.top + g.head + i * g.rowH,
              width: g.threadW,
              height: g.rowH,
              // A thread's colour fills the scenes it runs through, so the ones it skips show.
              backgroundColor: s.threads[j] ? `color-mix(in oklab, ${t.color} ${i === picked ? 16 : 7}%, transparent)` : undefined,
            }}
          >
            <span className="line-clamp-3">{s.threads[j]}</span>
          </div>
        )),
      )}
      <span className="absolute left-0 w-px bg-fg/10" style={{ top: g.top, height: g.head + scenes.length * g.rowH }} />
    </>
  );
}

function Timeline({ size }: BackdropProps) {
  const t = timeline(size);
  return (
    <>
      <div className="absolute inset-x-0 border-b border-fg/10 text-[11px] text-muted" style={{ top: t.top, height: AXIS_H }}>
        {t.labelW > 0 && (
          <span className="absolute top-1.5 left-3 flex items-center gap-1">
            By place <Icon name="alt-arrow-down-linear" className="size-3 text-faint" />
          </span>
        )}
        {t.ticks.map((tick) => (
          <span key={tick.day} className="absolute top-1.5 pl-1.5 whitespace-nowrap" style={{ left: tick.x }}>
            {tick.label}
          </span>
        ))}
      </div>
      {t.rails.map((rail) => (
        <div key={rail.name ?? "none"} className="absolute inset-x-0 border-b border-fg/10" style={{ top: rail.y, height: rail.h }}>
          <div
            className={cn(
              "flex items-center gap-2 text-[12.5px]",
              t.labelW ? "h-full border-r border-fg/10 bg-well px-3" : "px-1 pt-1.5 text-[11px] text-muted",
              !rail.name && "text-muted italic",
            )}
            style={{ width: t.labelW || undefined }}
          >
            {rail.name && <Icon name="map-point-linear" className="size-3.5 shrink-0 text-teal" />}
            <span className="truncate">{rail.name ?? "No place"}</span>
          </div>
        </div>
      ))}
      {t.ticks.map((tick) => (
        <span
          key={tick.day}
          className="absolute w-px bg-fg/[0.06]"
          style={{ left: tick.x, top: t.top + AXIS_H, height: t.bottom - t.top - AXIS_H }}
        />
      ))}
      {events.map((e, i) => (
        <div
          key={e.title}
          className="absolute flex items-center gap-1.5 rounded-md border border-fg/15 bg-card px-1.5 text-xs"
          style={place(t.eventBoxes[i])}
        >
          <span className="h-4 w-1 shrink-0 rounded-full bg-[#8a8f98]" />
          <Icon name="flag-linear" className="size-3.5 shrink-0 opacity-70" />
          <span className="truncate">{e.title}</span>
        </div>
      ))}
    </>
  );
}

/** Where the line from the middle of `b` towards `to` leaves the box, a little clear of its edge. */
function edgeOf(b: Box, to: readonly [number, number]) {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = to[0] - cx;
  const dy = to[1] - cy;
  const t = Math.min(dx ? (b.w / 2 + 7) / Math.abs(dx) : Infinity, dy ? (b.h / 2 + 7) / Math.abs(dy) : Infinity);
  return [cx + dx * t, cy + dy * t] as const;
}
const middle = (b: Box) => [b.x + b.w / 2, b.y + b.h / 2] as const;

function Storyboard({ size }: BackdropProps) {
  const s = storyboard(size);
  return (
    <>
      <div className="absolute -inset-8 dot-grid [mask-image:radial-gradient(closest-side,black_55%,transparent)]" />
      <svg className="absolute inset-0 size-full overflow-visible">
        <defs>
          <marker id="shot-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M1 1.5 8.5 5 1 8.5" fill="none" stroke="#161412" strokeOpacity="0.45" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>
        {s.boxes.slice(1).map((to, i) => {
          const from = s.boxes[i];
          const [x1, y1] = edgeOf(from, middle(to));
          const [x2, y2] = edgeOf(to, middle(from));
          // Bowed a little, like a line drawn by hand.
          const cx = (x1 + x2) / 2 - (y2 - y1) * 0.14;
          const cy = (y1 + y2) / 2 + (x2 - x1) * 0.14;
          return (
            <motion.path
              key={i}
              d={`M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}`}
              fill="none"
              stroke="#161412"
              strokeOpacity={0.3}
              strokeWidth={1.25}
              markerEnd="url(#shot-arrow)"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.6, ease, delay: 0.5 + i * 0.12 }}
            />
          );
        })}
      </svg>
      {s.note && (
        <p
          className="absolute -rotate-2 rounded-lg border border-gold/25 bg-[#fcf1d2] p-3 text-[12.5px] leading-snug text-fg/80 shadow-sm"
          style={place(s.note)}
        >
          Open and close on torchlight: the feast, then the tomb.
        </p>
      )}
    </>
  );
}

const noteIds = Object.keys(notes) as NoteId[];
const legend = (Object.keys(kinds) as (keyof typeof kinds)[]).map((kind) => ({
  ...kinds[kind],
  count: kind === "scene" ? scenes.length : noteIds.filter((id) => notes[id].kind === kind).length,
}));

function Graph({ size, picked }: BackdropProps) {
  const g = graph(size);
  const near = scenes[picked].links as readonly NoteId[];
  const lines = [
    ...scenes.flatMap((s, i) => s.links.map((id) => ({ from: g.scenePoints[i], to: g.points[id], lit: i === picked }))),
    ...noteLinks.map(([a, b]) => ({ from: g.points[a], to: g.points[b], lit: false })),
  ];
  return (
    <>
      <svg className="absolute inset-0 size-full overflow-visible">
        {lines.map((l, i) => (
          <motion.line
            key={i}
            x1={l.from[0]}
            y1={l.from[1]}
            x2={l.to[0]}
            y2={l.to[1]}
            stroke="#161412"
            strokeWidth={l.lit ? 1.4 : 1}
            style={{ transition: "stroke-opacity 0.5s" }}
            strokeOpacity={l.lit ? 0.55 : 0.1}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, ease, delay: 0.35 + i * 0.015 }}
          />
        ))}
      </svg>
      {noteIds.map((id, i) => {
        const n = notes[id];
        const [x, y] = g.points[id];
        return (
          <motion.div
            key={id}
            className="absolute size-3.5"
            style={{ left: x - 7, top: y - 7 }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 22, delay: 0.3 + i * 0.035 }}
          >
            <GraphNode
              // A phone has no room to name every note: only the ones the picked scene links to.
              label={size.compact && !near.includes(id) ? "" : n.label}
              color={kinds[n.kind].color}
              fx={n.at[0]}
              lit={near.includes(id)}
              compact={size.compact}
            />
          </motion.div>
        );
      })}
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {legend.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} />
            {l.label} <span className="text-faint">{l.count}</span>
          </span>
        ))}
      </div>
    </>
  );
}

export const backdrops: Record<ViewId, ((props: BackdropProps) => React.ReactNode) | null> = {
  manuscript: Manuscript,
  corkboard: null,
  grid: Grid,
  timeline: Timeline,
  storyboard: Storyboard,
  graph: Graph,
};
