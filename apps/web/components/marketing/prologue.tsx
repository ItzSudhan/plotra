"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "motion/react";
import Image from "next/image";
import { useRef, useState } from "react";
import napkin from "@/public/marketing/napkin-map.webp";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";
import { AppMock, type SceneId } from "./app-mock";
import { useFinePointer } from "./interactions";

type Fragment = {
  /** Scatter offset from the centre, in vw / vh. */
  x: number;
  y: number;
  rotate: number;
  node: React.ReactNode;
  desktopOnly?: boolean;
};

const paper = "border border-black/[0.07] bg-white";
const wave = [30, 55, 80, 45, 95, 60, 35, 70, 100, 50, 25, 65, 85, 40, 60, 90, 35, 55, 75, 30, 50, 80, 45, 25, 60, 40, 20, 35];

// The places a story actually lives before Plotra, each drawn as the thing it
// is: a page, a spreadsheet, a notebook, a chat, an email, a sticky, a memo, a photo.
// Scroll-linked opacity ranges below always span 0→1: Motion accelerates them
// with native scroll timelines, which drift outside a partial input range.
const fragments: Fragment[] = [
  {
    x: -34,
    y: -29,
    rotate: -6,
    node: (
      <div className={cn(paper, "overflow-hidden rounded-lg")}>
        <p className="truncate bg-[#2b579a] px-3 py-1.5 text-[11px] font-medium text-white">Draft_v7_FINAL_real.docx</p>
        <div className="px-4 pt-3 pb-3.5 font-prose text-[12.5px] leading-snug text-black/75">
          <p className="text-center text-[10px] tracking-[0.14em] text-black/50 uppercase">Chapter 12</p>
          <p className="mt-1.5">
            Romeo climbed the <del className="text-red-500">garden</del>{" "}
            <ins className="text-red-500 decoration-red-500/50">orchard</ins> wall that night, and
          </p>
          <p className="mt-2.5 border-l-2 border-red-400 pl-2 font-sans text-[11px] text-black/60">
            rewrite after Ana&apos;s notes? Or was that ch. 11…
          </p>
        </div>
      </div>
    ),
  },
  {
    x: 33,
    y: -30,
    rotate: 5,
    node: (
      <div className={cn(paper, "overflow-hidden rounded-lg")}>
        <p className="truncate bg-[#1d7a46] px-3 py-1.5 text-[11px] font-medium text-white">timeline (old).xlsx</p>
        <div className="grid grid-cols-[1.75rem_3rem_1fr] font-mono text-[11px] text-black/75 [&>span]:border-r [&>span]:border-b [&>span]:border-black/[0.08] [&>span]:px-1.5 [&>span]:py-1">
          <span className="bg-well" />
          <span className="bg-well text-center text-gray">A</span>
          <span className="bg-well text-center text-gray">B</span>
          <span className="bg-well text-center text-gray">1</span>
          <span>Sun</span>
          <span>Capulet feast</span>
          <span className="bg-well text-center text-gray">2</span>
          <span>Mon</span>
          <span className="bg-red-50 text-red-500">??? check part 2</span>
          <span className="bg-well text-center text-gray">3</span>
          <span>&nbsp;</span>
          <span />
        </div>
      </div>
    ),
  },
  {
    x: -38,
    y: 9,
    rotate: 4,
    desktopOnly: true,
    node: (
      <div
        className={cn(paper, "relative rounded-md py-[11px] pr-4 pl-10 text-[12.5px] leading-[22px]")}
        style={{
          backgroundImage: "repeating-linear-gradient(transparent 0 21px, rgb(42 134 209 / 0.2) 21px 22px)",
          backgroundPosition: "0 11px",
        }}
      >
        <span aria-hidden className="absolute inset-y-0 left-7 w-px bg-rose/40" />
        <p className="font-semibold text-black">Juliet</p>
        <p className="text-black/70">Thirteen or fourteen?? Changed in part 1, ch. 4. Fix everywhere.</p>
        <p>&nbsp;</p>
      </div>
    ),
  },
  {
    x: 37,
    y: 5,
    rotate: -4,
    desktopOnly: true,
    node: (
      <div className={cn(paper, "rounded-2xl p-3 text-[12.5px] leading-snug text-black/80")}>
        <p className="text-[10.5px] font-medium text-gray">#writers-room</p>
        <p className="mt-2 w-fit max-w-[92%] rounded-2xl rounded-bl-sm bg-well-strong px-3 py-1.5">
          wait, does Romeo know about the potion yet?
        </p>
        <p className="mt-1 w-fit max-w-[92%] rounded-2xl rounded-tl-sm bg-well-strong px-3 py-1.5">
          I just wrote him reading the letter 😬
        </p>
      </div>
    ),
  },
  {
    x: -24,
    y: 33,
    rotate: 3,
    node: (
      <div className={cn(paper, "rounded-lg")}>
        <div className="flex items-center gap-2 border-b border-black/[0.07] px-3 py-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-violet/15 text-[10px] font-semibold text-violet">
            A
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-medium text-black">Re: Re: Fwd: notes on ch. 12 (v3)</p>
            <p className="text-[10.5px] text-gray">Ana · Fri</p>
          </div>
        </div>
        <p className="px-3 pt-2.5 text-[12.5px] leading-snug text-gray">
          Attached is the latest. Ignore the one from Tuesday, and Thursday&apos;s.
        </p>
        <p className="m-3 mt-2 w-fit rounded-md bg-well px-2 py-1 font-mono text-[10px] text-muted">notes_v3_final.docx</p>
      </div>
    ),
  },
  {
    x: 25,
    y: 33,
    rotate: -7,
    node: (
      <div className="relative mx-auto w-[170px] bg-[#ffe97a] px-4 pt-6 pb-5">
        <span aria-hidden className="absolute -top-2 left-1/2 h-4 w-14 -translate-x-1/2 -rotate-2 bg-white/70" />
        <p className="text-[13px] font-bold tracking-wide text-black">DON&apos;T FORGET</p>
        <p className="mt-1 text-[13px] leading-snug font-medium text-black/75">
          Do NOT reveal the potion before Part 3!!
        </p>
      </div>
    ),
  },
  {
    x: -6,
    y: -36,
    rotate: 2,
    desktopOnly: true,
    node: (
      <div className="rounded-2xl bg-fg p-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ember">
            <svg viewBox="0 0 10 10" aria-hidden className="ml-0.5 size-2.5 fill-white">
              <path d="M2 1l7 4-7 4z" />
            </svg>
          </span>
          <span aria-hidden className="flex h-7 flex-1 items-center gap-[2px]">
            {wave.map((h, i) => (
              <span key={i} className={cn("w-[2px] rounded-full", i < 10 ? "bg-white" : "bg-white/30")} style={{ height: `${h}%` }} />
            ))}
          </span>
          <span className="font-mono text-[10px] text-white/60">0:47</span>
        </div>
        <p className="mt-2.5 font-mono text-[10px] text-white/50">idea_2am.m4a</p>
        <p className="mt-1 text-[12.5px] leading-snug text-white/85">
          “what if the letter never gets to Mantua…”
        </p>
      </div>
    ),
  },
  {
    x: 4,
    y: 31,
    rotate: -3,
    desktopOnly: true,
    node: (
      <div className={cn(paper, "rounded-sm p-2.5 pb-3")}>
        <Image src={napkin} alt="" sizes="230px" draggable={false} className="w-full select-none" />
        <p className="mt-2 truncate font-mono text-[10px] text-gray">map_sketch_napkin.jpg</p>
        <p className="text-[12px] leading-snug text-black/70">Drawn on a napkin. The only copy.</p>
      </div>
    ),
  },
];

function FragmentCard({ f, progress }: { f: Fragment; progress: MotionValue<number> }) {
  const x = useTransform(progress, [0, 0.3, 0.6], [`${f.x * 0.9}vw`, `${f.x * 1.04}vw`, "0vw"]);
  const y = useTransform(progress, [0, 0.3, 0.6], [`${f.y * 0.9}vh`, `${f.y * 1.04}vh`, "0vh"]);
  const rotate = useTransform(progress, [0, 0.3, 0.6], [f.rotate, f.rotate * 1.3, 0]);
  const scale = useTransform(progress, [0.3, 0.6], [1, 0.35]);
  const opacity = useTransform(progress, [0, 0.5, 0.6, 1], [1, 1, 0, 0]);
  // Loose while they are scattered: once they start to gather they are the page's to move.
  const pointerEvents = useTransform(progress, (v) => (v < 0.32 ? "auto" : "none"));
  const fine = useFinePointer();

  return (
    <motion.div
      style={{ x, y, rotate, scale, opacity, pointerEvents }}
      whileHover={{ zIndex: 5 }}
      className={cn("absolute top-1/2 left-1/2 -mt-14 -ml-[100px] w-[200px] sm:-ml-[115px] sm:w-[230px]", f.desktopOnly && "hidden md:block")}
    >
      {/* Each can be picked up and moved, and goes back to where it was left: the mess doesn't tidy by hand. */}
      <motion.div
        drag={fine}
        dragSnapToOrigin
        dragElastic={0.18}
        dragTransition={{ bounceStiffness: 260, bounceDamping: 18 }}
        whileHover={fine ? { scale: 1.04, rotate: -f.rotate * 0.4 } : undefined}
        whileDrag={{ scale: 1.08, rotate: -f.rotate }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        className={cn(
          "text-left [filter:drop-shadow(0_18px_22px_rgb(0_0_0/0.16))]",
          fine && "cursor-grab select-none active:cursor-grabbing",
        )}
      >
        {f.node}
      </motion.div>
    </motion.div>
  );
}

// The features the mock is walked through once it has arrived, one per stop of the scroll.
const tour: { scene: SceneId; title: React.ReactNode; body: string }[] = [
  {
    scene: "link",
    title: (
      <>
        Never hunt for <em className="wikilink">a detail again.</em>
      </>
    ),
    body: "Type [[ and pick a character, a place or a secret. The name becomes a link, so everything you've written about them is one click from the scene you're in.",
  },
  {
    scene: "together",
    title: (
      <>
        Stop emailing <em className="wikilink">drafts around.</em>
      </>
    ),
    body: "Co-writers and editors are in the scene with you, each with a named cursor, and you see what they type as they type it. There is one draft, and it is always the latest.",
  },
  {
    scene: "graph",
    title: (
      <>
        See how it <em className="wikilink">all connects.</em>
      </>
    ),
    body: "The graph draws every link between scenes, people and places. Point at one note and only what touches it stays lit, so a loose thread or a forgotten character is easy to spot.",
  },
  {
    scene: "timeline",
    title: (
      <>
        Keep story time <em className="wikilink">straight.</em>
      </>
    ),
    body: "Scenes and events sit on your world's own calendar, in lanes by plot thread. Drag a scene to move it in time, and see at a glance who was where, and when.",
  },
];

/** How much of the section's scroll the prologue takes; the tour's stops share the rest. */
const PROLOGUE = 0.4;
const TOUR_FROM = 0.43;

const slide = "transition-[left,top,width,height] duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none";

export function Prologue() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const p = useTransform(scrollYProgress, [0, PROLOGUE], [0, 1]);
  // 0 is the whole app, centred; 1 and up are the tour's stops.
  const [stop, setStop] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setStop(v < TOUR_FROM ? 0 : Math.min(tour.length, 1 + Math.floor(((v - TOUR_FROM) / (1 - TOUR_FROM)) * tour.length)));
  });
  // The mock goes to the right on odd stops and to the left on even ones, and the words take the other side.
  const right = stop % 2 === 1;

  const problemOpacity = useTransform(p, [0, 0.05, 0.3, 0.42, 1], [0, 1, 1, 0, 0]);
  const problemY = useTransform(p, [0.3, 0.42], [0, -40]);
  const problemBlur = useTransform(p, [0.3, 0.42], ["blur(0px)", "blur(10px)"]);

  const turnOpacity = useTransform(p, [0, 0.5, 0.62, 1], [0, 0, 1, 1]);
  const turnY = useTransform(p, [0.5, 0.62], [24, 0]);
  const mockOpacity = useTransform(p, [0, 0.52, 0.66, 1], [0, 0, 1, 1]);
  const mockScale = useTransform(p, [0.52, 0.85], [0.6, 1]);
  const mockY = useTransform(p, [0.52, 0.85], [60, 0]);
  // Until the mock is there, its box mustn't lie over the fragments and take their pointer.
  const mockPointer = useTransform(p, (v) => (v > 0.52 ? "auto" : "none"));

  return (
    <section id="prologue" ref={ref} className="relative h-[700vh] scroll-mt-0">
      <div className="sticky top-0 h-screen overflow-hidden">
        {fragments.map((f, i) => (
          <FragmentCard key={i} f={f} progress={p} />
        ))}

        <motion.div
          style={{ opacity: problemOpacity, y: problemY, filter: problemBlur }}
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
        >
          <h2
            className="max-w-2xl font-display text-[clamp(2rem,4vw,3.25rem)] font-normal text-black text-balance"
            style={{ lineHeight: 1.02, letterSpacing: "-0.025em" }}
          >
            Right now, your story lives in <em className="wikilink">a dozen different places.</em>
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-gray text-pretty">
            The draft in one app, the timeline in a spreadsheet nobody updates, the lore in a group chat. Every
            hour spent hunting for a detail is an hour not writing, and every contradiction is waiting for a reader to
            find it.
          </p>
        </motion.div>

        <div className="pointer-events-none absolute inset-0 px-[3vw]">
          <div className="relative mx-auto h-full max-w-[1560px]">
            <div className={cn("absolute inset-x-0 top-[5.5rem] text-center transition-opacity duration-500", stop > 0 && "opacity-0")}>
              <motion.h2
                style={{ opacity: turnOpacity, y: turnY, lineHeight: 1, letterSpacing: "-0.03em" }}
                className="font-display text-[clamp(1.75rem,3.4vw,2.75rem)] font-normal text-black text-balance"
              >
                So we built <em className="wikilink">one place for all of it.</em>
              </motion.h2>
            </div>

            <motion.div style={{ opacity: mockOpacity, scale: mockScale, y: mockY }} className="absolute inset-0">
              <motion.div
                style={{ pointerEvents: mockPointer }}
                className={cn(
                  "absolute rounded-2xl",
                  slide,
                  stop === 0
                    ? "top-[11.5rem] left-0 h-[min(calc(100svh-13.5rem),108vw)] w-full sm:top-[9.5rem] sm:h-[calc(100svh-11.5rem)]"
                    : "top-[5.25rem] left-0 h-[min(calc(100svh-20rem),100vw)] w-full lg:h-[calc(100svh-7.5rem)] lg:w-[64%]",
                  stop > 0 && right && "lg:left-[36%]",
                )}
              >
                <AppMock scene={stop === 0 ? "overview" : tour[stop - 1].scene} />
              </motion.div>
            </motion.div>

            <AnimatePresence>
              {stop > 0 && (
                <div
                  key={stop}
                  className={cn(
                    "absolute inset-x-1 top-[calc(5.25rem+min(100svh-20rem,100vw)+1.25rem)] lg:inset-x-auto lg:top-1/2 lg:w-[31%] lg:-translate-y-1/2",
                    right ? "lg:left-0" : "lg:right-0",
                  )}
                >
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.6, delay: 0.25, ease } }}
                    exit={{ opacity: 0, y: -12, transition: { duration: 0.25 } }}
                  >
                    <p className="font-mono text-[11px] tracking-[0.16em] text-gray uppercase">
                      0{stop} / 0{tour.length}
                    </p>
                    <h3
                      className="mt-3 font-display text-[clamp(1.5rem,2.6vw,2.5rem)] font-normal text-black text-balance lg:mt-4"
                      style={{ lineHeight: 1.05, letterSpacing: "-0.025em" }}
                    >
                      {tour[stop - 1].title}
                    </h3>
                    <p className="mt-3 max-w-md text-[15px] leading-relaxed text-gray text-pretty lg:mt-5 lg:text-lg">
                      {tour[stop - 1].body}
                    </p>
                    <div className="mt-5 flex w-40 gap-1.5 lg:mt-8">
                      {tour.map((t, i) => (
                        <span key={t.scene} className={cn("h-0.5 flex-1 rounded-full", i < stop ? "bg-ember" : "bg-black/10")} />
                      ))}
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
