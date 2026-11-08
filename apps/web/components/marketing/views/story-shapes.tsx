"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useSteps } from "../use-steps";
import { backdrops } from "./backdrops";
import { faces } from "./faces";
import { boxesOf, type Size, type ViewId } from "./layouts";
import { scenes } from "./story";

// The same five scenes in every view. Each is one element that stays on the
// page: a view only says where it goes and what it looks like there, so
// changing view moves the scenes instead of swapping one picture for another.

const shapeSpring = { type: "spring", stiffness: 150, damping: 24 } as const;
/** Each scene is picked out in turn, unless the pointer is on one. */
const turns = scenes.map(() => 3200);
/** The Secret Wedding: the scene shown picked to someone who asked for less motion. */
const STILL = 2;

export function StoryShapes({ view }: { view: ViewId }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const { step } = useSteps(ref, turns, STILL);
  const [held, setHeld] = useState<number | null>(null);
  const picked = held ?? step;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setSize({ w: el.clientWidth, h: el.clientHeight, compact: el.clientWidth < 520 }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const Backdrop = backdrops[view];
  const Face = faces[view];
  return (
    <div ref={ref} aria-hidden className="relative size-full text-left text-fg" onPointerLeave={() => setHeld(null)}>
      {size && (
        <>
          <AnimatePresence initial={false}>
            {Backdrop && (
              <motion.div
                key={view}
                className="pointer-events-none absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.5, delay: 0.3 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
              >
                <Backdrop size={size} picked={picked} />
              </motion.div>
            )}
          </AnimatePresence>
          {boxesOf[view](size).map((box, i) => (
            <motion.div
              key={i}
              className="absolute top-0 left-0"
              style={{ zIndex: i === picked ? 2 : 1 }}
              initial={false}
              animate={{ x: box.x, y: box.y, width: box.w, height: box.h, rotate: box.tilt ?? 0 }}
              transition={{ ...shapeSpring, delay: i * 0.035 }}
              onPointerEnter={() => setHeld(i)}
            >
              <AnimatePresence initial={false}>
                <motion.div
                  key={view}
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: 0.35, delay: 0.12 } }}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                >
                  <Face scene={scenes[i]} i={i} picked={i === picked} compact={size.compact} />
                </motion.div>
              </AnimatePresence>
            </motion.div>
          ))}
        </>
      )}
    </div>
  );
}
