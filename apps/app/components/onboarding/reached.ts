"use client";

import { useEffect } from "react";
import { Store } from "@/components/workspace/stores";
import type { StepId } from "@/lib/onboarding/steps";

// How a view tells the "Getting started" checklist that one of its steps was
// just done (onboarding-plan.md 2.3). Kept apart from the card
// (./getting-started.tsx) so anything can report a step without importing the shell.

/** Steps done in this tab, shown at once; the saved copy catches up. */
export const reachedHere = new Store<ReadonlySet<StepId>>(new Set());

/** Reports that a step of the checklist was just done. Safe to call anywhere, any number of times. */
export function reached(step: StepId) {
  if (!reachedHere.get().has(step)) reachedHere.set((before) => new Set(before).add(step));
}

/** Reports a step as done when the component that calls it is shown: opening the view is the step. */
export function useReached(step: StepId) {
  useEffect(() => {
    reached(step);
  }, [step]);
}
