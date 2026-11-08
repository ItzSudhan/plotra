"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import { useRef, useState } from "react";
import { Icon, type IconName } from "@plotra/icons";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";
import type { ViewId } from "./views/layouts";
import { StoryShapes } from "./views/story-shapes";

/** Each view finishes the sentence "The same five scenes, …". */
const views: { id: ViewId; name: string; icon: IconName; as: string; blurb: string }[] = [
  {
    id: "manuscript",
    name: "Manuscript",
    icon: "documents-linear",
    as: "as a manuscript.",
    blurb: "Every chapter and scene stitched into one continuous page, each still its own note.",
  },
  {
    id: "corkboard",
    name: "Corkboard",
    icon: "sticker-square-linear",
    as: "on a corkboard.",
    blurb: "Index cards you can shuffle. Your binder reorders itself to match.",
  },
  {
    id: "grid",
    name: "Plot grid",
    icon: "widget-2-linear",
    as: "against their threads.",
    blurb: "Scenes against plot threads, so no subplot quietly disappears.",
  },
  {
    id: "timeline",
    name: "Timeline",
    icon: "calendar-mark-linear",
    as: "in their own time.",
    blurb: "Lanes by plot thread, point of view or place, custom calendars, and flashbacks shown as such.",
  },
  {
    id: "storyboard",
    name: "Storyboard",
    icon: "widget-4-linear",
    as: "shot by shot.",
    blurb: "An infinite canvas for scenes, shots and ideas that aren't in order yet.",
  },
  {
    id: "graph",
    name: "Graph",
    icon: "graph-new-linear",
    as: "as a web of links.",
    blurb: "Every link between people, places and events, for the whole project or around one note.",
  },
];

export function ViewsShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [active, setActive] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    setActive(Math.min(views.length - 1, Math.max(0, Math.floor(p * views.length))));
  });

  function jump(i: number) {
    const el = ref.current;
    if (!el) return;
    const top =
      el.getBoundingClientRect().top + window.scrollY + ((i + 0.5) / views.length) * (el.offsetHeight - window.innerHeight);
    window.scrollTo({ top, behavior: "smooth" });
  }

  const view = views[active];

  return (
    <section ref={ref} className="relative" style={{ height: `${views.length * 85}vh` }}>
      <div className="sticky top-0 flex h-screen items-center">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-6 px-5 sm:px-8 lg:grid-cols-[330px_1fr] lg:gap-14">
          <div>
            <h3
              className="font-display text-[26px] text-fg sm:text-[32px] lg:text-[36px]"
              style={{ lineHeight: 1.08, letterSpacing: "-0.02em" }}
            >
              The same five scenes,{" "}
              <span className="block min-h-[1.08em] lg:min-h-[2.16em]">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.em
                    key={view.id}
                    className="wikilink inline-block"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease }}
                  >
                    {view.as}
                  </motion.em>
                </AnimatePresence>
              </span>
            </h3>
            <p className="mt-3 min-h-[3.2em] max-w-md text-[14px] leading-relaxed text-muted lg:mt-5 lg:min-h-[4.9em] lg:text-[15px]">
              {view.blurb}
            </p>

            <div className="mt-8 hidden border-l border-line-strong lg:block">
              {views.map((v, i) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => jump(i)}
                  className={cn(
                    "relative flex w-full items-center gap-2.5 py-1.5 pl-4 text-left text-[15px] transition-colors",
                    i === active ? "text-fg" : "text-faint hover:text-muted",
                  )}
                >
                  {i === active && (
                    <motion.span
                      layoutId="view-active"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="absolute inset-y-1 -left-px w-px bg-ember"
                    />
                  )}
                  <Icon name={v.icon} className="text-lg" />
                  {v.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="h-[min(430px,54vh)] lg:h-[min(560px,72vh)]">
              <StoryShapes view={view.id} />
            </div>
            <div className="mt-5 flex justify-center gap-1 lg:hidden">
              {views.map((v, i) => (
                <button
                  key={v.id}
                  type="button"
                  aria-label={v.name}
                  onClick={() => jump(i)}
                  className={cn(
                    "grid size-9 place-items-center rounded-full text-lg transition-colors",
                    i === active ? "bg-fg text-white" : "text-faint",
                  )}
                >
                  <Icon name={v.icon} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
