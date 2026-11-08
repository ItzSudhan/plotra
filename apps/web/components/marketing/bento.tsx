"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { Icon, type IconName } from "@plotra/icons";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";
import { PointerFlag } from "./interactions";
import { Reveal } from "./reveal";
import { useSteps } from "./use-steps";
import { useTyping } from "./use-typing";

// One tray, seven compartments. The stage is the only box: hairlines divide it,
// each compartment is a single surface, and its mock sits straight on that
// surface and runs off the edge rather than living in a frame of its own.
function Cell({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <Reveal className="flex h-full flex-col p-7 sm:p-10">{children}</Reveal>
    </div>
  );
}

function Copy({
  title,
  children,
  dark,
  className,
}: {
  title: string;
  children: React.ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("max-w-md", className)}>
      <h3
        className={cn("font-display text-[25px] sm:text-[28px]", dark ? "text-white" : "text-fg")}
        style={{ lineHeight: 1.08, letterSpacing: "-0.015em" }}
      >
        {title}
      </h3>
      <p className={cn("mt-3 text-[15px] leading-relaxed text-pretty", dark ? "text-white/60" : "text-muted")}>
        {children}
      </p>
    </div>
  );
}

/* --- Live co-writing --- */
function Caret({ name, className }: { name: string; className: string }) {
  return (
    <span className={cn("relative mx-px inline-block h-[1.15em] w-[1.5px] translate-y-[0.2em]", className)}>
      <span
        className={cn(
          "absolute bottom-full left-0 mb-0.5 rounded-[3px] px-1 py-px font-sans text-[9px] leading-none font-medium whitespace-nowrap text-white",
          className,
        )}
      >
        {name}
      </span>
    </span>
  );
}

const coWritten = "who had struck the first blow";

function CollabVisual() {
  const { count } = useTyping(coWritten.length, { speed: 65, hold: 3200, start: 1200 });
  return (
    <div className="relative -mr-7 -mb-7 min-h-72 flex-1 mask-fade-b sm:-mr-10 sm:-mb-10 sm:min-h-80">
      <div className="absolute inset-y-0 right-7 left-0 space-y-5 sm:right-10 pt-6 font-prose text-[19px] leading-[1.7] text-fg/80 sm:text-[23px] lg:text-[25px]">
        <p>
          Verona had two great houses and one old grudge, and nobody alive could say {coWritten.slice(0, count)}
          <Caret name="Author" className="bg-ember" />
        </p>
        <p>
          On Sunday the servants fought in the street.{" "}
          <span className="bg-fg/[0.06]">By noon their masters had joined in,</span>
          <Caret name="Editor" className="bg-fg" /> and the Prince had promised death to the next{" "}
          <del className="text-faint decoration-ember/60">man</del>{" "}
          <ins className="bg-ember/10 text-fg no-underline">Montague or Capulet</ins> to draw a sword.
        </p>
        <p>That night the Capulets held their feast, as they did every year, and a Montague came to it in a mask.</p>
        <p>
          Romeo had come to look at Rosaline. He looked once across the hall instead, and did not think of Rosaline
          again.
        </p>
        <p>
          He did not ask the girl&apos;s name. He would have had to leave if he had known it, and he was not ready
          to leave a house he should never have walked into.
        </p>
      </div>
    </div>
  );
}

/* --- Wiki links --- */
const suggestions = [
  { label: "Romeo Montague", kind: "Character", icon: "user-circle-linear" as IconName },
  { label: "Road to Mantua", kind: "Place", icon: "map-point-linear" as IconName },
  { label: "Rope ladder", kind: "Object", icon: "key-linear" as IconName },
];
// idle → "[[" → "[[Ro" + menu → linked
const linkSteps = [1100, 450, 2000, 3000] as const;

function LinkVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const { step } = useSteps(ref, linkSteps, 3);
  const linked = step === 3;
  return (
    <div ref={ref} className="mt-8 h-44">
      <p className="font-prose text-[19px] text-fg/80 sm:text-[21px]">
        …and under her window stood{" "}
        {linked ? (
          <span className="text-fg underline decoration-ember/60 decoration-1 underline-offset-4">Romeo Montague</span>
        ) : (
          <>
            <span className="font-mono text-[16px] text-fg">{["", "[[", "[[Ro"][step]}</span>
            <span className="ml-px inline-block h-5 w-[1.5px] translate-y-0.5 animate-blink bg-fg" />
          </>
        )}
      </p>
      <AnimatePresence mode="wait">
        {step === 2 && (
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease }}
            className="mt-3 w-full max-w-60 rounded-xl border border-line-strong bg-card p-1 shadow-[0_8px_24px_-12px_rgb(22_20_18/0.25)]"
          >
            {suggestions.map((s, i) => (
              <div
                key={s.label}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px]",
                  i === 0 ? "bg-fg/[0.05] text-fg" : "text-muted",
                )}
              >
                <Icon name={s.icon} className="text-faint" />
                {s.label}
                <span className="ml-auto text-[10px] text-faint">{s.kind}</span>
              </div>
            ))}
          </motion.div>
        )}
        {linked && (
          <motion.p
            key="backlink"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="mt-4 flex items-center gap-1.5 text-[13px] text-faint"
          >
            <Icon name="link-round-linear" />
            Backlink added to <span className="text-muted">Romeo Montague</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/* --- Graph --- */
const gNodes = [
  { label: "Romeo", x: 180, y: 74 },
  { label: "Juliet", x: 62, y: 36 },
  { label: "Verona", x: 296, y: 34 },
  { label: "Tybalt", x: 306, y: 118 },
  { label: "Mercutio", x: 50, y: 116 },
  { label: "The feud", x: 184, y: 136 },
];
const gEdges = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [3, 5], [4, 5], [0, 5]] as const;
const graphSteps = [2600, 2600, 2600, 2600] as const;
const graphFocus = [0, 3, 1, 5];

function GraphVisual() {
  const ref = useRef<HTMLDivElement>(null);
  // Pointing at a note takes the focus from the loop for as long as the pointer stays.
  const [held, setHeld] = useState<number | null>(null);
  const { step, inView } = useSteps(ref, graphSteps, 0, held !== null);
  const focus = held ?? graphFocus[step];
  const near = (i: number) => i === focus || gEdges.some(([a, b]) => (a === focus && b === i) || (b === focus && a === i));
  return (
    <div ref={ref} className="-mx-4 -mt-3 h-52 sm:h-60">
      <svg viewBox="0 0 360 160" className="h-full w-full" onPointerLeave={() => setHeld(null)}>
        {gEdges.map(([a, b], i) => {
          const lit = a === focus || b === focus;
          return (
            <motion.line
              key={i}
              x1={gNodes[a].x}
              y1={gNodes[a].y}
              x2={gNodes[b].x}
              y2={gNodes[b].y}
              stroke="#161412"
              strokeWidth={0.75}
              initial={{ pathLength: 0, strokeOpacity: 0.12 }}
              animate={{ pathLength: inView ? 1 : 0, strokeOpacity: lit ? 0.45 : 0.12 }}
              transition={{ pathLength: { duration: 0.9, ease, delay: i * 0.05 }, strokeOpacity: { duration: 0.6 } }}
            />
          );
        })}
        {gNodes.map((n, i) => (
          <g key={n.label}>
            <motion.circle
              cx={n.x}
              cy={n.y}
              initial={false}
              animate={{ r: i === focus ? 4 : 2.5, fill: i === focus ? "#E2602A" : near(i) ? "#161412" : "#B5AFA6" }}
              transition={{ duration: held === null ? 0.5 : 0.25, ease }}
            />
            <text
              x={n.x}
              y={n.y + (n.y < 80 ? -9 : 15)}
              textAnchor="middle"
              className={cn("font-sans text-[8.5px] transition-[fill] duration-500", near(i) ? "fill-fg" : "fill-faint")}
            >
              {n.label}
            </text>
            <circle cx={n.x} cy={n.y} r={20} fill="transparent" className="cursor-pointer" onPointerEnter={() => setHeld(i)} />
          </g>
        ))}
      </svg>
    </div>
  );
}

/* --- Timeline --- */
const eras = [
  { name: "The Masque", width: 40 },
  { name: "The Vow", width: 32 },
  { name: "The Tomb", width: 28 },
];
const lanes = [
  { name: "Romeo", bars: [[4, 30], [44, 20], [76, 20]] },
  { name: "Juliet", bars: [[12, 22], [56, 30]] },
  { name: "Friar", bars: [[0, 14], [30, 40], [82, 14]] },
];
const playhead = [22, 60, 88];
const timelineSteps = [2800, 2800, 2800] as const;

function TimelineVisual() {
  const ref = useRef<HTMLDivElement>(null);
  // The playhead follows the pointer across the lanes, and goes back to its rounds when it leaves.
  const [held, setHeld] = useState<number | null>(null);
  const { step, inView } = useSteps(ref, timelineSteps, 0, held !== null);
  const at = held ?? playhead[step];
  const era = eras.findIndex((_, i) => at < eras.slice(0, i + 1).reduce((sum, e) => sum + e.width, 0));
  return (
    <div ref={ref} className="-mr-7 flex h-40 gap-3 sm:-mr-10">
      <div className="w-10 shrink-0 space-y-4 pt-8 text-[12px] text-muted">
        {lanes.map((l) => (
          <div key={l.name} className="flex h-4 items-center">
            {l.name}
          </div>
        ))}
      </div>
      <div
        className="relative flex-1 cursor-ew-resize"
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse") return;
          const box = e.currentTarget.getBoundingClientRect();
          setHeld(Math.min(99, Math.max(0, ((e.clientX - box.left) / box.width) * 100)));
        }}
        onPointerLeave={() => setHeld(null)}
      >
        <div className="flex h-4 font-mono text-[9px] tracking-wider uppercase">
          {eras.map((e, i) => (
            <span
              key={e.name}
              style={{ width: `${e.width}%` }}
              className={cn(
                "truncate border-l border-line-strong pl-1.5 transition-colors duration-500",
                i === era ? "text-fg" : "text-faint",
              )}
            >
              {e.name}
            </span>
          ))}
        </div>
        <div className="mt-4 space-y-4">
          {lanes.map((l, li) => (
            <div key={l.name} className="relative h-4">
              {l.bars.map(([left, width], i) => {
                const lit = at >= left && at <= left + width;
                return (
                  <motion.span
                    key={i}
                    className={cn(
                      "absolute top-1/2 h-2 origin-left -translate-y-1/2 rounded-full transition-colors duration-500",
                      lit ? "bg-fg/75" : "bg-fg/12",
                    )}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: inView ? 1 : 0 }}
                    transition={{ duration: 0.8, ease, delay: li * 0.1 + i * 0.08 }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <motion.span
          className="absolute top-5 bottom-0 w-px bg-ember"
          initial={false}
          animate={{ left: `${at}%` }}
          transition={held === null ? { duration: 0.9, ease } : { duration: 0.08, ease: "linear" }}
        >
          <span className="absolute -top-0.5 -left-[2.5px] size-1.5 rounded-full bg-ember" />
        </motion.span>
      </div>
    </div>
  );
}

/* --- Modules --- */
const modules: { icon: IconName; label: string }[] = [
  { icon: "earth-linear", label: "World bible" },
  { icon: "rocket-linear", label: "Releases & reveals" },
  { icon: "square-academic-cap-linear", label: "Research & sources" },
  { icon: "clapperboard-text-linear", label: "Script formats" },
];
// one step per module switched on, then a hold; the last one is left off
const moduleSteps = [900, 800, 800, 3400] as const;

function ModulesVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const { step } = useSteps(ref, moduleSteps, 3);
  return (
    <div ref={ref} className="flex h-40 flex-col justify-between text-[13.5px]">
      {modules.map((m, i) => {
        const on = i < step;
        return (
          <div key={m.label} className="flex items-center gap-3">
            <Icon name={m.icon} className={cn("text-lg transition-colors duration-300", on ? "text-white" : "text-white/35")} />
            <span className={cn("transition-colors duration-300", on ? "text-white" : "text-white/45")}>{m.label}</span>
            <span
              aria-hidden
              className={cn("ml-auto flex h-[18px] w-8 items-center rounded-full px-0.5 transition-colors duration-300", on ? "bg-ember" : "bg-white/15")}
            >
              <span className={cn("size-3.5 rounded-full bg-white transition-transform duration-300 ease-out", on && "translate-x-3.5")} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* --- Offline --- */
const EDITS = 12;
// one step per local edit, a beat, then the merge
const offlineSteps = [...Array.from({ length: EDITS }, () => 240), 900, 3200] as const;

function OfflineVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const { step } = useSteps(ref, offlineSteps, EDITS + 1);
  const online = step > EDITS;
  const edits = Math.min(step, EDITS);
  return (
    <div ref={ref} className="flex h-40 flex-col justify-center gap-6">
      <div className="flex items-center gap-2.5 text-[14px] text-muted">
        <span
          className={cn(
            "size-1.5 rounded-full transition-colors duration-500",
            online ? "bg-ember" : "bg-transparent ring-1 ring-fg/30",
          )}
        />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={online ? "on" : "off"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {online ? (
              <>
                <span className="text-fg">Synced</span> · merged with 3 collaborators
              </>
            ) : (
              <>
                <span className="text-fg">Offline</span> · {edits} {edits === 1 ? "edit" : "edits"} saved on this device
              </>
            )}
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="flex items-center justify-between">
        {Array.from({ length: EDITS }).map((_, i) => (
          <span
            key={i}
            style={{ transitionDelay: online ? `${i * 50}ms` : "0ms" }}
            className={cn(
              "size-2.5 rounded-full transition-colors duration-300",
              online ? "bg-fg" : i < edits ? "bg-fg/35" : "bg-fg/10",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/* --- History --- */
type Seg = [string, "" | "+" | "-"];
const versions: { name: string; date: string; diff: Seg[] }[] = [
  { name: "First draft", date: "Mar 2", diff: [["Two families hated each other.", ""]] },
  { name: "Beta notes", date: "Mar 19", diff: [["Two families", ""], [" in Verona", "+"], [" hated each other.", ""]] },
  {
    name: "Act II rewrite",
    date: "Apr 4",
    diff: [["Two ", ""], ["families", "-"], ["households", "+"], [" in Verona hated each other.", ""]],
  },
  {
    name: "Editor pass",
    date: "Apr 22",
    diff: [["Two households", ""], [" in Verona hated each other", "-"], [", both alike in dignity, in fair Verona", "+"], [".", ""]],
  },
  { name: "Locked", date: "May 9", diff: [["Two households, both alike in dignity, in fair Verona.", ""]] },
];
const historySteps = [2400, 2400, 2400, 2400, 2400] as const;

function HistoryVisual() {
  const ref = useRef<HTMLDivElement>(null);
  // The versions play through on their own until the reader picks one.
  const [set, setSet] = useState<number | null>(null);
  const { step } = useSteps(ref, historySteps, 3, set !== null);
  const at = set ?? step;
  const v = versions[at];
  return (
    <div ref={ref}>
      <div className="relative grid grid-cols-5">
        <div className="absolute inset-x-[10%] top-1.5 h-px bg-fg/10" />
        <motion.div
          className="absolute top-1.5 left-[10%] h-px bg-fg/40"
          initial={false}
          animate={{ width: `${(at / (versions.length - 1)) * 80}%` }}
          transition={{ duration: 0.6, ease }}
        />
        {versions.map((ver, i) => (
          <button
            key={ver.name}
            type="button"
            onClick={() => setSet(i)}
            aria-label={`Show version ${i + 1}, ${ver.name}`}
            aria-pressed={i === at}
            className="group relative -my-3 flex flex-col items-center gap-3 py-3"
          >
            <span className="grid size-3 place-items-center transition-[scale] duration-300 ease-out group-hover:scale-150 group-active:scale-110">
              <span
                className={cn(
                  "rounded-full transition-all duration-500",
                  i === at ? "size-2.5 bg-ember ring-4 ring-ember/15" : i < at ? "size-1.5 bg-fg" : "size-1.5 bg-fg/20",
                )}
              />
            </span>
            <span
              className={cn(
                "hidden text-center text-[12.5px] transition-colors duration-500 sm:block",
                i === at ? "text-fg" : "text-faint group-hover:text-muted",
              )}
            >
              {ver.name}
              <span className="mt-0.5 block font-mono text-[10px] text-faint">{ver.date}</span>
            </span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={at}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease }}
        >
          <p className="mt-8 min-h-[2.6em] font-prose text-[21px] leading-[1.3] text-fg/80 sm:text-[26px]">
            {v.diff.map(([t, k], i) =>
              k === "+" ? (
                <ins key={i} className="bg-ember/10 text-fg no-underline">
                  {t}
                </ins>
              ) : k === "-" ? (
                <del key={i} className="text-faint decoration-ember/60">
                  {t}
                </del>
              ) : (
                <span key={i}>{t}</span>
              ),
            )}
          </p>
          <div className="mt-4 flex items-baseline justify-between text-[13px] text-faint">
            <span>
              v{at + 1}
              <span className="sm:hidden">
                {" "}
                · {v.name} · {v.date}
              </span>
            </span>
            <span className="flex items-center gap-1 text-muted">
              <Icon name="history-linear" /> Restore
            </span>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function Bento() {
  return (
    <section className="grid grid-cols-1 gap-px bg-line-strong md:grid-cols-2 lg:grid-cols-12">
      <Cell className="bg-card md:col-span-2 lg:col-span-7 lg:row-span-2">
        <Copy title="Write together, live">
          Real-time co-writing with named cursors and presence, so there is one draft instead of five. Comment on a
          passage, or switch to suggesting and let an editor accept or reject each change.
        </Copy>
        <CollabVisual />
        {/* The reader is at the desk too: over this page their pointer is named like everyone else's. */}
        <PointerFlag name="You" className="bg-violet" />
      </Cell>

      <Cell className="bg-canvas lg:col-span-5">
        <Copy title="Link everything">
          Type <span className="font-mono text-fg">[[</span> to link any character, place or scene. Plotra lists the
          backlinks and the mentions you forgot to link, so nothing you wrote about someone goes missing.
        </Copy>
        <LinkVisual />
      </Cell>

      <Cell className="bg-canvas dot-grid lg:col-span-5">
        <GraphVisual />
        <Copy title="See the whole story at once" className="mt-auto pt-4">
          How every note connects, for the whole project or around one note. Filter by kind, and find the orphans
          nothing points to.
        </Copy>
      </Cell>

      <Cell className="bg-canvas lg:col-span-4">
        <TimelineVisual />
        <Copy title="Timelines, any calendar" className="mt-auto pt-8">
          Know who was where, and when. Your world&apos;s own calendar and eras, lanes by plot thread, point of view
          or place, and story order against reading order.
        </Copy>
      </Cell>

      <Cell className="bg-fg lg:col-span-4">
        <ModulesVisual />
        <Copy dark title="Starts small" className="mt-auto pt-8">
          Nothing to set up before you can write. A new project opens with the essentials; the world bible, releases
          and reveals, research and review are modules you switch on when a story needs them.
        </Copy>
      </Cell>

      <Cell className="bg-well md:col-span-2 lg:col-span-4">
        <OfflineVisual />
        <Copy title="Keeps going offline" className="mt-auto pt-8">
          Keep writing when the wifi doesn&apos;t. Your edits stay in the browser and merge with everyone
          else&apos;s when the connection comes back.
        </Copy>
      </Cell>

      <Cell className="bg-card md:col-span-2 lg:col-span-12">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
          <Copy title="Version history">
            Cut the chapter without fear. Name a snapshot when it matters; Plotra also takes one every half hour of
            editing. See what changed since, and restore.
          </Copy>
          <HistoryVisual />
        </div>
      </Cell>
    </section>
  );
}
