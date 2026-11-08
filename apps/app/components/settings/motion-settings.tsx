"use client";

import { Switch } from "@plotra/ui/components/switch";
import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { setMotion } from "@/lib/motion";
import { updateMotion } from "@/lib/notify-actions";
import { Section } from "./ui";
import { useRun } from "./use-run";

// Settings → Motion: the app's animations, on unless switched off here. The
// choice is saved with the person, and this device's copy (lib/motion.ts)
// changes at once, so the switch is the first thing to stop moving.

const LESS_MOTION = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(LESS_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function MotionSettings({ on: saved }: { on: boolean }) {
  const [on, setOn] = useState(saved);
  const { run } = useRun();
  const systemAsksLess = useSyncExternalStore(subscribe, () => window.matchMedia(LESS_MOTION).matches, () => false);

  // What's saved wins over what this device remembered: the choice follows the person.
  useLayoutEffect(() => {
    setMotion(saved);
  }, [saved]);

  const change = (next: boolean) => {
    setOn(next);
    setMotion(next);
    void run(() => updateMotion(next)).then((saved) => {
      if (saved) return;
      setOn(!next);
      setMotion(!next);
    });
  };

  return (
    <Section title="Motion" description="How the interface moves as you use it.">
      <div className="rounded-lg border bg-card">
        <label className="flex cursor-pointer items-start gap-4 p-4">
          <span className="grid flex-1 gap-0.5">
            <span className="text-sm font-medium">Animations</span>
            <span className="text-ui-sm text-muted-foreground">
              Pages slide and fade into one another, buttons give a little under your pointer and spring back, menus and dialogs open from where you clicked, and tabs slide across. Off, everything changes at once.
            </span>
          </span>
          <Switch checked={on} onCheckedChange={change} aria-label="Animations" className="mt-0.5" />
        </label>
        {systemAsksLess && (
          <p className="border-t px-4 py-3 text-ui-sm text-muted-foreground">
            Your device is set to reduce motion, so Plotra stays still whatever this says.
          </p>
        )}
      </div>
    </Section>
  );
}
