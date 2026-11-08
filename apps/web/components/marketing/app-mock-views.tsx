"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@plotra/icons";
import { cn } from "@/lib/cn";
import { pointerSpring } from "@/lib/motion";

// The three panes the film in app-mock.tsx visits, each drawn the way the app
// draws it (apps/app/components/views), with the sample project's own notes.

const faint = "text-[#6c6761]";

/* Editor */

function WikiLink({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[2px] font-medium text-ember underline decoration-ember/35 decoration-dotted underline-offset-4">
      {children}
    </span>
  );
}

/** Text that arrives a keystroke at a time. Keyed by `typing` where it is used, so each run starts from nothing. */
export function Typed({ text, typing }: { text: string; typing: boolean }) {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!typing || reduce) return;
    const started = performance.now();
    const id = setInterval(
      () => setCount(Math.floor((performance.now() - started) / 46)),
      23,
    );
    return () => clearInterval(id);
  }, [typing, reduce]);
  return <>{typing && !reduce ? text.slice(0, count) : text}</>;
}

const suggestions: { icon: IconName; title: string; trail: string }[] = [
  { icon: "user-rounded-linear", title: "Juliet Capulet", trail: "Characters" },
  { icon: "document-text-linear", title: "Juliet's ring", trail: "World" },
  {
    icon: "clapperboard-text-linear",
    title: "Juliet Alone",
    trail: "Star-Crossed",
  },
];

/** How far the last line has got: its first words, the [[ link being picked, the rest, or all of it. */
export type WritePhase = "a" | "pick" | "b" | "done";

export function MockEditor({ write, together }: { write: WritePhase; together: boolean }) {
  const writing = write !== "done";
  return (
    <div className="mx-auto h-full w-full max-w-[44rem]">
      <div className="px-12 pt-10 pb-2">
        <p className={cn("mb-3 flex items-center gap-1.5 text-xs", faint)}>
          <Icon name="clapperboard-text-linear" className="size-3.5" />
          <span>Part One: The Masque /</span>
          <span>Two Households /</span>
          <span>Scene</span>
        </p>
        <h3
          className="text-4xl leading-tight tracking-tight"
          style={{ fontFamily: "var(--font-instrument-serif), Georgia, serif" }}
        >
          The Balcony
        </h3>
      </div>
      <div className="relative space-y-4 px-12 pt-2 font-prose text-[1.0625rem] leading-[1.75]">
        {/* What the camera frames while the line is written: the page from its title to the link picker. */}
        <span
          data-t="write"
          className="pointer-events-none absolute inset-x-5 -top-28 -bottom-40"
        />
        <p>
          The orchard wall was high, and Romeo went over it anyway. He landed
          among the pear trees and stood very still, because every window of{" "}
          <WikiLink>Capulet&apos;s house</WikiLink> belonged to someone who
          would kill him.
        </p>
        <p>
          Then one of them opened. She came out onto the balcony with her hair
          down and leaned on the stone,{" "}
          <span
            className={cn(
              "transition-colors duration-500",
              together && "bg-teal/25",
            )}
          >
            as if the night had been waiting for her
          </span>
          <AnimatePresence>
            {together && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="relative inline-block h-[1.2em] w-0 align-text-bottom"
              >
                <span className="absolute inset-y-0 left-0 w-0.5 bg-teal" />
                <span className="absolute -top-4 left-0 rounded-sm bg-teal px-1 py-px font-sans text-[10px] leading-tight font-medium whitespace-nowrap text-white">
                  Tobias
                </span>
              </motion.span>
            )}
          </AnimatePresence>
          .
        </p>
        <p data-t="line" className="relative">
          <Typed
            key={`a${write === "a"}`}
            text="“O Romeo, Romeo,” said "
            typing={write === "a"}
          />
          {write === "pick" && (
            <span className="relative">
              <span className="rounded-sm bg-ember/10 px-0.5 text-ember">
                [[
                <Typed text="Ju" typing />
              </span>
              <motion.span
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  delay: 0.25,
                  duration: 0.25,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="absolute top-full left-0 z-30 mt-1.5 block w-[320px] origin-top-left rounded-md border border-fg/10 bg-card py-1 font-sans text-sm leading-normal shadow-md"
              >
                <span className="block px-3 py-1.5 text-xs font-medium text-muted">
                  Link to a note
                </span>
                {suggestions.map((s, i) => (
                  <span
                    key={s.title}
                    className={cn(
                      "mx-1 flex h-8 items-center gap-2 rounded-sm px-2",
                      i === 0 && "bg-well-strong",
                    )}
                  >
                    <Icon
                      name={s.icon}
                      className="size-4 shrink-0 text-muted"
                    />
                    <span className="truncate">{s.title}</span>
                    <span
                      className={cn("ml-auto truncate pl-2 text-xs", faint)}
                    >
                      {s.trail}
                    </span>
                  </span>
                ))}
              </motion.span>
            </span>
          )}
          {(write === "b" || write === "done") && (
            <>
              <WikiLink>Juliet</WikiLink>
              <Typed
                key={`b${write === "b"}`}
                text=" to the dark. “Wherefore art thou Romeo?”"
                typing={write === "b"}
              />
            </>
          )}
          {writing && (
            <span className="ml-px inline-block h-[1.15em] w-0.5 animate-blink bg-ember align-text-bottom" />
          )}
        </p>
        <span data-t="rest" className="ml-auto block size-px translate-y-6" />
      </div>
    </div>
  );
}

/* Graph */

const kinds = {
  scene: "#e2602a",
  note: "#4a8be0",
  character: "#d5467f",
  location: "#109a82",
  world: "#7556d6",
} as const;

// Laid out as a project of this size settles in the app (public/press/plotra-graph.png).
const nodes: {
  id: string;
  label: string;
  kind: keyof typeof kinds;
  at: [number, number];
  r?: number;
}[] = [
  { id: "square", label: "The market square", kind: "location", at: [938, 190] },
  {
    id: "decree",
    label: "The Prince's decree",
    kind: "note",
    at: [1074, 227],
  },
  { id: "verona", label: "Verona", kind: "location", at: [858, 343], r: 9 },
  {
    id: "married",
    label: "Married in secret",
    kind: "note",
    at: [1198, 408],
    r: 9,
  },
  { id: "feud", label: "The feud", kind: "world", at: [702, 434] },
  { id: "vault", label: "", kind: "location", at: [588, 449] },
  { id: "duel", label: "The Duel", kind: "scene", at: [1034, 460], r: 9 },
  {
    id: "cell",
    label: "Friar Laurence's cell",
    kind: "location",
    at: [1380, 488],
  },
  { id: "feast", label: "The Capulet Feast", kind: "scene", at: [871, 571], r: 9 },
  { id: "orchard", label: "Capulet's orchard", kind: "location", at: [995, 596] },
  { id: "start", label: "Start here", kind: "note", at: [1253, 615], r: 9 },
  {
    id: "tybalt",
    label: "Tybalt",
    kind: "character",
    at: [701, 676],
    r: 9,
  },
  { id: "montagues", label: "The Montagues", kind: "world", at: [1400, 681] },
  {
    id: "romeo",
    label: "Romeo Montague",
    kind: "character",
    at: [1062, 720],
    r: 10,
  },
  { id: "mercutio", label: "Mercutio", kind: "character", at: [823, 785] },
  { id: "wedding", label: "The Secret Wedding", kind: "scene", at: [1352, 823], r: 9 },
  { id: "balcony", label: "The Balcony", kind: "scene", at: [1199, 855], r: 9 },
  { id: "tomb", label: "The Tomb", kind: "scene", at: [649, 865] },
  {
    id: "curse",
    label: "A plague on both your houses",
    kind: "note",
    at: [700, 945],
  },
  {
    id: "juliet",
    label: "Juliet Capulet",
    kind: "character",
    at: [1040, 925],
    r: 10,
  },
];
const edges =
  "verona-square verona-decree decree-duel verona-feud verona-vault feud-vault verona-duel verona-orchard square-duel married-duel married-cell married-start married-romeo duel-feast duel-start duel-mercutio feud-feast feud-tybalt feast-tybalt feast-romeo feast-juliet orchard-romeo orchard-juliet cell-romeo start-romeo start-wedding start-montagues montagues-romeo montagues-wedding montagues-balcony cell-wedding tybalt-romeo tybalt-mercutio tybalt-tomb tybalt-curse romeo-wedding romeo-balcony romeo-juliet romeo-curse mercutio-romeo mercutio-curse tomb-juliet tomb-curse juliet-balcony balcony-wedding vault-tomb"
    .split(" ")
    .map((e) => e.split("-") as [string, string]);

const spot = ([x, y]: [number, number]) =>
  [(x - 428) * 0.56 + 14, (y - 50) * 0.5 + 4] as const;
const position = Object.fromEntries(nodes.map((n) => [n.id, spot(n.at)]));
const near = new Set(
  edges
    .flatMap(([a, b]) => (a === "romeo" ? [b] : b === "romeo" ? [a] : []))
    .concat("romeo"),
);
/** The box around Romeo and everything linked to him, labels included: what the camera frames when he is hovered. */
const hood = (() => {
  const points = [...near].map((id) => position[id]);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const left = Math.min(...xs) - 12;
  const top = Math.min(...ys) - 12;
  return {
    left,
    top,
    width: Math.max(...xs) + 96 - left,
    height: Math.max(...ys) + 12 - top,
  };
})();

const legend: [string, string, number][] = [
  ["Chapter", "#b98021", 3],
  ["Scene", kinds.scene, 5],
  ["Note", kinds.note, 5],
  ["Character", kinds.character, 4],
  ["Location", kinds.location, 5],
  ["World entry", kinds.world, 3],
];

const chip = "flex h-7 items-center gap-1.5 rounded-md px-2";

export function MockGraph({
  active,
  hover,
}: {
  active: boolean;
  hover: boolean;
}) {
  return (
    <div className="relative h-full">
      <motion.svg
        className="absolute inset-0 size-full"
        initial={false}
        animate={active ? "in" : "out"}
      >
        {edges.map(([a, b], i) => {
          const lit = hover && (a === "romeo" || b === "romeo");
          return (
            <motion.line
              key={`${a}-${b}`}
              x1={position[a][0]}
              y1={position[a][1]}
              x2={position[b][0]}
              y2={position[b][1]}
              stroke="#161412"
              strokeWidth={lit ? 1.4 : 1}
              style={{ transition: "stroke-opacity 0.4s" }}
              strokeOpacity={lit ? 0.55 : hover ? 0.06 : 0.18}
              variants={{
                out: { pathLength: 0, transition: { duration: 0, delay: 0.3 } },
                in: {
                  pathLength: 1,
                  transition: {
                    duration: 0.9,
                    delay: 0.25 + i * 0.012,
                    ease: [0.16, 1, 0.3, 1],
                  },
                },
              }}
            />
          );
        })}
      </motion.svg>
      <span
        data-t="hood"
        className="pointer-events-none absolute"
        style={hood}
      />
      {nodes.map((n, i) => {
        const r = n.r ?? 7;
        return (
          <motion.div
            key={n.id}
            data-t={n.id === "romeo" ? "romeo" : undefined}
            initial={false}
            animate={
              active
                ? { scale: 1, opacity: hover && !near.has(n.id) ? 0.22 : 1 }
                : { scale: 0, opacity: 0 }
            }
            transition={
              active
                ? {
                    type: "spring",
                    stiffness: 380,
                    damping: 22,
                    delay: hover ? 0 : 0.1 + i * 0.035,
                  }
                : { duration: 0, delay: 0.3 }
            }
            className="absolute"
            style={{
              left: position[n.id][0] - r,
              top: position[n.id][1] - r,
              width: r * 2,
              height: r * 2,
            }}
          >
            <motion.span
              className="block size-full rounded-full"
              style={{ backgroundColor: kinds[n.kind] }}
              animate={{ scale: hover && n.id === "romeo" ? 1.35 : 1 }}
            />
            <span className="absolute top-1/2 left-full ml-1 -translate-y-1/2 text-[11px] font-medium whitespace-nowrap">
              {n.label}
            </span>
          </motion.div>
        );
      })}

      <div className="absolute top-2 left-2 flex items-center gap-2">
        <span className="flex items-center gap-0.5 rounded-lg border border-fg/10 bg-card p-1 shadow-sm">
          <span className={cn(chip, "bg-well-strong")}>Global</span>
          <span className={cn(chip, "text-muted")}>Local</span>
        </span>
        <span className="flex h-9 w-44 items-center gap-2 rounded-lg border border-fg/10 bg-card px-2.5 text-muted shadow-sm">
          <Icon name="magnifer-linear" className="size-4" /> Search graph
        </span>
        <span className="flex items-center gap-1 rounded-lg border border-fg/10 bg-card p-1 shadow-sm">
          <span className={chip}>
            All tags{" "}
            <Icon
              name="alt-arrow-down-linear"
              className={cn("ml-3 size-3.5", faint)}
            />
          </span>
          <span className={cn(chip, "bg-well")}>
            <Icon name="eye-linear" className="size-3.5" /> Orphans
          </span>
        </span>
      </div>
      <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-fg/10 bg-card px-3 py-2 text-xs text-muted shadow-sm">
        {legend.map(([label, color, count]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            {label} <span className={faint}>{count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* Timeline */

const LABEL_W = 150;
const ROW = 32;
/** How far "The Tomb" is dragged: one day along. */
const DRAG = 100;

type Card = {
  title: string;
  x: number;
  row: number;
  scene?: boolean;
  drag?: boolean;
};
const lanes: { label: string; color?: string; cards: Card[] }[] = [
  {
    label: "The feud",
    color: "#e2602a",
    cards: [
      { title: "Street brawl", x: 20, row: 0 },
      { title: "The Duel", x: 176, row: 0, scene: true },
      { title: "The truce", x: 436, row: 0 },
      { title: "The Capulet Feast", x: 84, row: 1, scene: true },
      { title: "Romeo banished", x: 200, row: 1 },
    ],
  },
  {
    label: "Romeo and Juliet",
    color: "#2a6fd1",
    cards: [
      { title: "The Capulet Feast", x: 84, row: 0, scene: true },
      { title: "The Tomb", x: 330, row: 0, scene: true, drag: true },
      { title: "The Balcony", x: 108, row: 1, scene: true },
      { title: "Juliet's potion", x: 286, row: 1 },
      { title: "The Secret Wedding", x: 168, row: 2, scene: true },
    ],
  },
  {
    label: "No thread",
    cards: [
      { title: "Paris proposes", x: 40, row: 0 },
      { title: "The lost letter", x: 350, row: 0 },
    ],
  },
];
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const laneHeight = (cards: Card[]) =>
  20 + (Math.max(...cards.map((c) => c.row)) + 1) * ROW;
const select =
  "flex h-8 items-center gap-3 rounded-md border border-fg/15 bg-card px-2.5";

export function MockTimeline({
  active,
  dragged,
}: {
  active: boolean;
  dragged: boolean;
}) {
  let n = 0;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-fg/10 px-3">
        <span className="text-muted">Calendar</span>
        <span className={select}>
          Days of the week{" "}
          <Icon
            name="alt-arrow-down-linear"
            className={cn("size-3.5", faint)}
          />
        </span>
        <span className="ml-1 text-muted">Lanes</span>
        <span className={select}>
          Plot threads{" "}
          <Icon
            name="alt-arrow-down-linear"
            className={cn("size-3.5", faint)}
          />
        </span>
        <span className="ml-1 flex items-center gap-0.5 rounded-md border border-fg/10 p-0.5">
          <span className="flex h-6 items-center rounded bg-well-strong px-2 text-xs">
            Chronological
          </span>
          <span className="flex h-6 items-center px-2 text-xs text-muted">
            Narrative
          </span>
        </span>
      </div>
      <div className="flex h-7 shrink-0 border-b border-fg/10 text-[11px] text-muted">
        <div
          style={{ width: LABEL_W }}
          className="shrink-0 border-r border-fg/10"
        />
        <div className="relative flex-1">
          {days.map((d, i) => (
            <span
              key={d}
              className="absolute top-1.5 pl-1"
              style={{ left: 14 + i * 100 }}
            >
              {d}
            </span>
          ))}
        </div>
      </div>
      <div data-t="lanes">
        {lanes.map((lane) => (
          <div
            key={lane.label}
            className="flex shrink-0 border-b border-fg/10"
            style={{ height: laneHeight(lane.cards) }}
          >
            <div
              style={{ width: LABEL_W }}
              className="flex shrink-0 items-start gap-2 border-r border-fg/10 bg-well px-3 pt-3"
            >
              {lane.color && (
                <span
                  className="mt-1 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: lane.color }}
                />
              )}
              <span
                className={cn("truncate", !lane.color && "text-muted italic")}
              >
                {lane.label}
              </span>
            </div>
            <div className="relative flex-1">
              {days.map((d, i) => (
                <span
                  key={d}
                  className="absolute inset-y-0 w-px bg-fg/[0.06]"
                  style={{ left: 14 + i * 100 }}
                />
              ))}
              {lane.cards.map((card) => {
                const i = n++;
                const lifted = card.drag && dragged;
                return (
                  <div
                    key={card.title}
                    className="absolute"
                    style={{ left: card.x, top: 10 + card.row * ROW }}
                  >
                    {card.drag && (
                      <>
                        <span
                          data-t="drop"
                          className="absolute top-0 h-7 w-[104px]"
                          style={{ left: DRAG }}
                        />
                        <span
                          data-t="drag"
                          className="absolute top-0 left-0 h-7"
                          style={{ width: 104 + DRAG }}
                        />
                      </>
                    )}
                    <motion.div
                      initial={false}
                      animate={
                        active ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }
                      }
                      transition={
                        active
                          ? {
                              duration: 0.5,
                              delay: 0.15 + i * 0.05,
                              ease: [0.16, 1, 0.3, 1],
                            }
                          : { duration: 0, delay: 0.3 }
                      }
                    >
                      <motion.div
                        data-t={card.drag ? "card" : undefined}
                        initial={false}
                        animate={{ x: lifted ? DRAG : 0 }}
                        transition={
                          active ? pointerSpring : { duration: 0, delay: 0.3 }
                        }
                        className={cn(
                          "flex h-7 w-[104px] items-center gap-1.5 rounded-md border px-1.5 text-xs transition-shadow duration-200",
                          card.scene
                            ? "border-ember/40 bg-[#fbe1d6]"
                            : "border-fg/15 bg-card",
                          lifted && "z-10 shadow-lg",
                        )}
                      >
                        <span
                          className={cn(
                            "h-4 w-1 shrink-0 rounded-full",
                            card.scene ? "bg-ember" : "bg-[#8a8f98]",
                          )}
                        />
                        <Icon
                          name={
                            card.scene
                              ? "clapperboard-text-linear"
                              : "flag-linear"
                          }
                          className="size-3.5 shrink-0 opacity-70"
                        />
                        <span className="truncate">{card.title}</span>
                      </motion.div>
                    </motion.div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
