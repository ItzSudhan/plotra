"use client";

import { motion, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

// What the page does in answer to the pointer. All of it is for a mouse or a
// trackpad: a finger gets the page as it was, and so does reduced motion.

const FINE = "(hover: hover) and (pointer: fine)";

function watchFine(notify: () => void) {
  const query = window.matchMedia(FINE);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

/** Whether the reader has a pointer that can hover. False on the server and on touch. */
export function useFinePointer() {
  return useSyncExternalStore(
    watchFine,
    () => window.matchMedia(FINE).matches,
    () => false,
  );
}

/**
 * The page's call to action. Pointed at, it becomes a line the reader is about
 * to write: their caret lands after the last word, named the way a co-writer's is.
 */
export function Cta({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={href}
      className={cn(
        "group inline-flex items-center rounded-full bg-black text-white transition-[scale] duration-200 ease-out active:scale-[0.97]",
        className,
      )}
    >
      {children}
      <span aria-hidden className="relative h-[1.15em] w-0">
        <span className="absolute inset-y-0 left-[0.2em] w-[1.5px] bg-ember opacity-0 group-hover:animate-blink group-hover:opacity-100 group-focus-visible:opacity-100" />
        <span className="absolute bottom-full left-[0.2em] origin-bottom-left translate-y-1 scale-75 rounded-[3px] rounded-bl-none bg-ember px-1.5 py-0.5 text-[10px] leading-none font-medium opacity-0 transition-[opacity,scale,translate] duration-200 ease-out group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:scale-100 group-focus-visible:opacity-100">
          You
        </span>
      </span>
    </a>
  );
}

const flag = { stiffness: 500, damping: 40, mass: 0.5 };

/**
 * Gives the reader's own pointer a name flag inside the element this is put in
 * (which must be positioned), the way a co-writer's cursor is named.
 */
export function PointerFlag({ name, className }: { name: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const x = useSpring(0, flag);
  const y = useSpring(0, flag);
  const [on, setOn] = useState(false);
  const shown = useRef(false);

  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const box = host.getBoundingClientRect();
      const to = [e.clientX - box.left, e.clientY - box.top];
      // It appears where the pointer came in, rather than flying there from the corner.
      if (shown.current && !reduce) {
        x.set(to[0]);
        y.set(to[1]);
      } else {
        x.jump(to[0]);
        y.jump(to[1]);
      }
      shown.current = true;
      setOn(true);
    };
    const leave = () => {
      shown.current = false;
      setOn(false);
    };
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
    };
  }, [x, y, reduce]);

  return (
    <motion.span
      ref={ref}
      aria-hidden
      style={{ x, y }}
      initial={false}
      animate={{ opacity: on ? 1 : 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "pointer-events-none absolute top-0 left-0 z-10 mt-4 ml-3 rounded-[4px] rounded-tl-none px-1.5 py-0.5 font-sans text-[11px] leading-none font-medium whitespace-nowrap text-white",
        className,
      )}
    >
      {name}
    </motion.span>
  );
}
