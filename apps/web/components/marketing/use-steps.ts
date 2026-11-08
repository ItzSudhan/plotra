"use client";

import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/**
 * Steps through `durations` (ms per step) while `ref` is on screen, looping.
 * Reduced motion parks it on `still`, the most descriptive frame, and `paused`
 * holds it where it is while the reader has taken over.
 */
export function useSteps(
  ref: React.RefObject<HTMLElement | null>,
  durations: readonly number[],
  still = 0,
  paused = false,
) {
  const inView = useInView(ref, { margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!inView || reduce || paused) return;
    const t = setTimeout(() => setStep((s) => (s + 1) % durations.length), durations[step]);
    return () => clearTimeout(t);
  }, [inView, reduce, paused, step, durations]);
  return { step: reduce ? still : step, inView: inView || !!reduce };
}
