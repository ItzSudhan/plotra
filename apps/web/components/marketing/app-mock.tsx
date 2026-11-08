"use client";

import { AnimatePresence, motion, useInView, useReducedMotion, useSpring } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@plotra/icons";
import { cn } from "@/lib/cn";
import { pointerSpring } from "@/lib/motion";
import { MockEditor, MockGraph, MockTimeline, type WritePhase } from "./app-mock-views";
import { Window } from "./window";

// The product itself, drawn at the size it is used at (the shell in
// apps/app/components/workspace). The page picks a scene as it scrolls
// (prologue.tsx); here a camera moves to what that scene is about and a
// pointer acts it out, on a short loop.

/** The canvas the shell is laid out on. Its height follows the room the page gives it, so the whole app fills the frame. */
const W = 1280;
const H = 800;
/** On a phone: short enough that the frame, about square there, shows a full line of prose. */
const COMPACT_H = 700;
const MIN_H = 620;
const MAX_H = 900;
/** Closer than this and the interface stops reading as an app. */
const MAX_ZOOM = 2.3;

export type MockView = "editor" | "graph" | "timeline";

type Beat = {
  ms: number;
  /** What the camera frames (`data-t`): it moves in until that box, plus `pad` canvas pixels around it, fills the frame. */
  frame: string;
  pad?: number;
  /** Where the pointer rests during the beat. */
  pointer: string;
  /** The pointer clicks as the beat begins, or holds the button down through it. */
  click?: boolean;
  press?: boolean;
  /** Editor: how much of the last line is written, and whether a co-writer is in the scene. */
  write?: WritePhase;
  together?: boolean;
  /** Graph: the pointer is on a note. Timeline: the card has been dragged. */
  hover?: boolean;
  dragged?: boolean;
};

/** A feature the page stops on: the pane it is shown in, and the beats that act it out, looping. */
type Scene = { view: MockView; beats: readonly Beat[]; /** The beat shown to someone who asked for less motion. */ still: number };

export const scenes = {
  overview: { view: "editor", still: 0, beats: [{ ms: 0, frame: "shell", pointer: "rest" }] },
  link: {
    view: "editor",
    still: 3,
    beats: [
      { ms: 2400, frame: "write", pointer: "rest", write: "a" },
      { ms: 2200, frame: "write", pointer: "rest", write: "pick" },
      { ms: 3000, frame: "write", pointer: "rest", write: "b" },
      { ms: 2200, frame: "write", pointer: "rest" },
    ],
  },
  together: {
    view: "editor",
    still: 0,
    beats: [{ ms: 0, frame: "write", pointer: "rest", together: true }],
  },
  graph: {
    view: "graph",
    still: 1,
    beats: [
      { ms: 2600, frame: "pane", pointer: "graph-button", click: true },
      { ms: 3600, frame: "hood", pad: 36, pointer: "romeo", hover: true },
    ],
  },
  timeline: {
    view: "timeline",
    still: 0,
    beats: [
      { ms: 2400, frame: "lanes", pad: 28, pointer: "timeline-row", click: true },
      { ms: 1300, frame: "lanes", pad: 28, pointer: "card" },
      { ms: 2600, frame: "lanes", pad: 28, pointer: "drop", press: true, dragged: true },
    ],
  },
} as const satisfies Record<string, Scene>;
export type SceneId = keyof typeof scenes;

/** The box of a `data-t` element, in canvas pixels. Offsets, not rects, so the camera's own transform doesn't count. */
function boxOf(root: HTMLElement, id: string) {
  const el = id === "shell" ? root : root.querySelector<HTMLElement>(`[data-t="${id}"]`);
  if (!el) return { x: 0, y: 0, w: root.offsetWidth, h: root.offsetHeight };
  let x = 0;
  let y = 0;
  for (let n: HTMLElement | null = el; n && n !== root; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** The beat a scene is on: it starts at the first when the scene changes, and loops while the mock is on screen. */
function useBeat(id: SceneId, ref: React.RefObject<HTMLElement | null>) {
  const scene: Scene = scenes[id];
  const inView = useInView(ref);
  const reduce = useReducedMotion();
  const [at, setAt] = useState({ id, i: 0 });
  const i = reduce ? scene.still : at.id === id ? at.i : 0;
  useEffect(() => {
    if (!inView || reduce || scene.beats.length < 2) return;
    const t = setTimeout(() => setAt({ id, i: (i + 1) % scene.beats.length }), scene.beats[i].ms);
    return () => clearTimeout(t);
  }, [inView, reduce, scene, id, i]);
  return { scene, beat: scene.beats[i], key: `${id}${i}` };
}

const cameraSpring = { stiffness: 70, damping: 20 };

export function AppMock({ scene: id = "overview" }: { scene?: SceneId }) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scene, beat, key } = useBeat(id, frame);
  // Springs, so the camera keeps its line when the page resizes the frame under it mid-move.
  const x = useSpring(0, cameraSpring);
  const y = useSpring(0, cameraSpring);
  const scale = useSpring(1, cameraSpring);
  const px = useSpring(0, pointerSpring);
  const py = useSpring(0, pointerSpring);
  const placed = useRef(false);

  const place = useCallback(() => {
    const f = frame.current;
    const c = canvas.current;
    if (!f || !c || !f.clientWidth) return;
    const { clientWidth: vw, clientHeight: vh } = f;
    // On a wide frame the shell is as tall as the frame, so the whole app is in shot. A phone
    // can't show it all at a size anyone can read: there the camera stays close and pans.
    const compact = vw < 560;
    // A frame too short for the shell at this width gets a wider shell, like a wider window,
    // rather than one cut off under the title bar or at the status bar.
    const width = compact ? W : Math.max(W, (vw * MIN_H) / vh);
    const fit = vw / width;
    const height = compact ? COMPACT_H : clamp(vh / fit, MIN_H, MAX_H);
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
    const whole = Math.max(1, vh / height / fit);
    const box = boxOf(c, beat.frame);
    const pad = (beat.pad ?? 0) * (compact ? 0.4 : 1);
    const zoom = clamp(Math.min(width / (box.w + pad * 2), vh / fit / (box.h + pad * 2)), whole, Math.max(whole, MAX_ZOOM));
    const s = fit * zoom;
    const to = boxOf(c, beat.pointer);
    const at = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
    // When the box can't all be in shot, follow the pointer: that is where the action is.
    const fits = box.w * s <= vw + 1 && box.h * s <= vh + 1;
    const centre = fits ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : at;
    const instant = reduce || !placed.current;
    placed.current = true;
    const move = (value: typeof x, v: number) => (instant ? value.jump(v) : value.set(v));
    move(x, clamp(vw / 2 - centre.x * s, vw - width * s, 0));
    move(y, clamp(vh / 2 - centre.y * s, vh - height * s, 0));
    move(scale, s);
    move(px, at.x);
    move(py, at.y);
  }, [beat, reduce, x, y, scale, px, py]);

  useLayoutEffect(place, [place]);
  useEffect(() => {
    const f = frame.current;
    if (!f) return;
    const observer = new ResizeObserver(place);
    observer.observe(f);
    return () => observer.disconnect();
  }, [place]);

  return (
    <Window title="Plotra · Romeo and Juliet" className="flex h-full flex-col">
      <div ref={frame} aria-hidden className="relative min-h-0 flex-1 overflow-hidden bg-canvas text-left">
        <motion.div ref={canvas} className="absolute top-0 left-0 origin-top-left text-fg" style={{ width: W, height: H, x, y, scale }}>
          <Shell view={scene.view} beat={beat} />
          <motion.div style={{ x: px, y: py }} className="pointer-events-none absolute top-0 left-0 z-50">
            <AnimatePresence>
              {beat.click && !reduce && (
                <motion.span
                  key={key}
                  initial={{ scale: 0.2, opacity: 0.5 }}
                  animate={{ scale: 1, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, delay: 0.5, ease: "easeOut" }}
                  className="absolute -top-5 -left-5 size-10 rounded-full bg-ember"
                />
              )}
            </AnimatePresence>
            <motion.svg
              width="22"
              height="22"
              viewBox="0 0 22 22"
              animate={{ scale: beat.press ? 0.86 : 1 }}
              transition={{ duration: 0.2 }}
              className="-mt-0.5 -ml-1 origin-top-left drop-shadow-[0_2px_3px_rgb(0_0_0/0.3)]"
            >
              <path d="M4 2.5v15.2l4.1-3.6 2.7 6.1 2.6-1.1-2.7-6.1 5.4-.4L4 2.5Z" fill="#161412" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
            </motion.svg>
          </motion.div>
        </motion.div>
      </div>
    </Window>
  );
}

const ribbonViews: { icon: IconName; text: string; t?: string }[] = [
  { icon: "documents-linear", text: "Draft" },
  { icon: "checklist-minimalistic-linear", text: "Outline" },
  { icon: "library-linear", text: "Codex" },
  { icon: "graph-new-linear", text: "Graph", t: "graph-button" },
  { icon: "book-linear", text: "Read" },
  { icon: "widget-linear", text: "More" },
];

const binder: { title: string; depth: number; icon: IconName; open?: boolean; leaf?: boolean; container?: boolean; id?: string }[] = [
  { title: "Start here", depth: 0, icon: "document-text-linear", leaf: true },
  { title: "Part One: The Masque", depth: 0, icon: "folder-open-linear", open: true, container: true },
  { title: "Two Households", depth: 1, icon: "book-bookmark-linear", open: true, container: true },
  { title: "The Capulet Feast", depth: 2, icon: "clapperboard-text-linear", leaf: true },
  { title: "The Balcony", depth: 2, icon: "clapperboard-text-linear", leaf: true, id: "editor" },
  { title: "Part Two: The Vow", depth: 0, icon: "folder-linear", container: true },
  { title: "Part Three: The Tomb", depth: 0, icon: "folder-linear", container: true },
  { title: "Characters", depth: 0, icon: "folder-linear", container: true },
  { title: "Places", depth: 0, icon: "folder-linear", container: true },
  { title: "World", depth: 0, icon: "folder-linear", container: true },
  { title: "Secrets", depth: 0, icon: "folder-linear", container: true },
  { title: "Five days in Verona", depth: 0, icon: "calendar-mark-linear", leaf: true, id: "timeline" },
];

const tabs: { view: MockView; title: string; icon: IconName }[] = [
  { view: "editor", title: "The Balcony", icon: "clapperboard-text-linear" },
  { view: "graph", title: "Graph", icon: "graph-new-linear" },
  { view: "timeline", title: "Five days in Verona", icon: "calendar-mark-linear" },
];

const iconButton = "grid size-8 shrink-0 place-items-center rounded-md text-muted";
const fieldLabel = "text-[11px] font-medium tracking-wider text-muted uppercase";

function Shell({ view, beat }: { view: MockView; beat: Beat }) {
  const write = beat.write ?? "done";
  // The binder marks the note in front; the graph is a view, not a note, so the scene stays marked under it.
  const activeNote = view === "timeline" ? "timeline" : "editor";
  return (
    <div className="flex h-full flex-col bg-canvas text-[13px]">
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-fg/10 bg-well py-2">
          <span className={cn(iconButton, "mb-1")}>
            <Icon name="arrow-left-linear" className="size-4" />
          </span>
          {(["panel-left-linear", "magnifer-linear", "command-linear"] as const).map((name, i) => (
            <span key={name} className={cn(iconButton, i === 0 && "text-fg")}>
              <Icon name={name} className="size-[18px]" />
            </span>
          ))}
          <div className="my-1 h-px w-8 bg-fg/10" />
          <div className="flex flex-col items-center gap-0.5">
            {ribbonViews.map((v) => (
              <span
                key={v.text}
                data-t={v.t}
                className={cn(
                  "flex w-14 flex-col items-center gap-1 rounded-md px-0.5 py-1.5 text-center text-[10px] leading-none text-muted transition-colors duration-300",
                  v.t && view === "graph" && "bg-well-strong text-fg",
                )}
              >
                <Icon name={v.icon} className="size-[18px] shrink-0" />
                <span className="w-full truncate">{v.text}</span>
              </span>
            ))}
          </div>
          <div className="mt-auto flex flex-col items-center gap-1 pt-1">
            <span className={iconButton}>
              <Icon name="settings-linear" className="size-[18px]" />
            </span>
            <span className={cn(iconButton, "text-fg")}>
              <Icon name="panel-right-linear" className="size-[18px]" />
            </span>
          </div>
        </nav>

        <aside className="flex w-[248px] shrink-0 flex-col border-r border-fg/10 bg-well">
          <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-1.5">
            <span className="flex h-7 items-center gap-1.5 rounded-md bg-well-strong px-2 text-fg">
              <Icon name="folder-linear" className="size-4" /> Binder
            </span>
            <span className="flex h-7 items-center gap-1.5 rounded-md px-2 text-muted">
              <Icon name="hashtag-linear" className="size-4" /> Tags
            </span>
          </div>
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line pr-1.5 pl-3">
            <span className={cn(fieldLabel, "flex-1")}>Binder</span>
            {(["document-add-linear", "add-folder-linear", "add-linear", "sort-vertical-linear"] as const).map((name) => (
              <span key={name} className="grid size-7 place-items-center rounded-md text-muted">
                <Icon name={name} className="size-4" />
              </span>
            ))}
          </div>
          <div className="min-h-0 flex-1 py-1.5">
            {binder.map((n) => {
              const active = n.id === activeNote;
              return (
                <div
                  key={n.title}
                  data-t={n.id === "timeline" ? "timeline-row" : undefined}
                  style={{ paddingLeft: 8 + n.depth * 14 }}
                  className={cn(
                    "mx-1.5 flex h-7 items-center gap-1 rounded-md pr-1.5 transition-colors duration-300",
                    active ? "bg-well-strong font-medium text-fg" : "text-fg/85",
                  )}
                >
                  <span className={cn("grid size-4 shrink-0 place-items-center text-[#6c6761]", n.leaf && "invisible")}>
                    <Icon name="alt-arrow-right-linear" className={cn("size-3", n.open && "rotate-90")} />
                  </span>
                  <Icon name={n.icon} className={cn("size-4 shrink-0", n.container ? "text-ember" : "text-muted")} />
                  <span className="min-w-0 flex-1 truncate pl-1">{n.title}</span>
                </div>
              );
            })}
          </div>
          <div className="flex h-9 shrink-0 items-center gap-2 border-t border-line px-3 text-muted">
            <Icon name="trash-bin-trash-linear" className="size-4" /> Trash
            <Icon name="alt-arrow-down-linear" className="ml-auto size-3.5" />
          </div>
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 border-b border-fg/10 bg-well">
            <AnimatePresence initial={false}>
              {tabs
                .slice(0, tabs.findIndex((t) => t.view === view) + 1)
                .map((t) => (
                  <motion.span
                    key={t.view}
                    data-t={t.view === "editor" ? "editor-tab" : undefined}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className={cn(
                      "flex items-center gap-2 border-r border-line px-3 whitespace-nowrap",
                      t.view === view ? "bg-canvas text-fg shadow-[inset_0_2px_0_var(--color-ember)]" : "text-muted",
                    )}
                  >
                    <Icon name={t.icon} className="size-4 opacity-70" />
                    {t.title}
                    <Icon name="close-linear" className="size-3.5 text-[#6c6761]" />
                  </motion.span>
                ))}
            </AnimatePresence>
          </div>
          <div data-t="pane" className="relative min-h-0 flex-1">
            <Pane active={view === "editor"}>
              <MockEditor write={write} together={!!beat.together} />
            </Pane>
            <Pane active={view === "graph"}>
              <MockGraph active={view === "graph"} hover={!!beat.hover} />
            </Pane>
            <Pane active={view === "timeline"}>
              <MockTimeline active={view === "timeline"} dragged={!!beat.dragged} />
            </Pane>
          </div>
        </main>

        <aside className="flex w-[272px] shrink-0 flex-col border-l border-fg/10 bg-well">
          <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-line px-1.5">
            {["Note", "Links", "Story", "Review"].map((label, i) => (
              <span key={label} className={cn("flex h-7 items-center rounded-md px-2.5", i === 0 ? "bg-well-strong text-fg" : "text-muted")}>
                {label}
              </span>
            ))}
            <span className="ml-auto grid size-7 place-items-center text-[#6c6761]">
              <Icon name="settings-linear" className="size-3.5" />
            </span>
          </div>
          <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line px-4 text-muted">
            <span className="text-fg">Properties</span>
            <span>Outline</span>
          </div>
          <div className="grid gap-5 p-4">
            {(view === "timeline"
              ? [
                  ["Kind", "Timeline"],
                  ["Calendar", "Days of the week"],
                  ["Lanes", "Plot threads"],
                ]
              : [
                  ["Kind", "Scene"],
                  ["Status", "First draft"],
                  ["Point of view", "Romeo Montague"],
                  ["Location", "Capulet's orchard"],
                  ["Story date", "Sunday night"],
                ]
            ).map(([label, value]) => (
              <div key={label} className="grid gap-1.5">
                <span className={fieldLabel}>{label}</span>
                <span className="flex h-8 items-center gap-2 rounded-md border border-fg/15 px-2.5">
                  {label === "Status" && <span className="size-1.5 rounded-full bg-gold" />}
                  {value}
                  <Icon name="alt-arrow-down-linear" className="ml-auto size-3.5 text-[#6c6761]" />
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-fg/10 bg-well px-3 text-xs text-muted tabular-nums">
        <span>Saltmarsh Press / Romeo and Juliet</span>
        <span className="flex-1" />
        <span>{write === "a" ? "1,380" : write === "pick" ? "1,383" : "1,393"} words in project</span>
        {view === "editor" && <span>{write === "a" ? 172 : write === "pick" ? 175 : 185} words</span>}
        <span className="flex items-center gap-1.5">
          <Icon name="cloud-check-linear" className="size-3.5" /> Synced
        </span>
        <span className="flex -space-x-1.5">
          {[
            ["MV", "bg-ember"],
            ["TO", "bg-teal"],
          ].map(([name, color]) => (
            <span key={name} className={cn("grid size-5 place-items-center rounded-full text-[9px] font-semibold text-white ring-2 ring-well", color)}>
              {name}
            </span>
          ))}
        </span>
        <Icon name="bell-linear" className="size-4" />
      </footer>
    </div>
  );
}

function Pane({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: active ? 1 : 0 }}
      transition={{ duration: 0.3 }}
      className={cn("absolute inset-0 overflow-hidden bg-canvas", active && "z-10")}
    >
      {children}
    </motion.div>
  );
}
