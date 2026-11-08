"use client";

import { Icon, type IconName } from "@plotra/icons";
import { useState, useSyncExternalStore } from "react";
import { motionOn } from "@/lib/motion";
import { updateGettingStarted } from "@/lib/notify-actions";
import { cn } from "@plotra/ui/lib/utils";

/** ⌘ on a Mac, Ctrl elsewhere; Ctrl until the page is in the app. */
const useMac = () =>
  useSyncExternalStore(
    () => () => {},
    () => /Mac/i.test(navigator.platform),
    () => false,
  );

/**
 * "Plotra on your desktop": shown once,
 * on the projects page, to someone signed in to Plotra Cloud in the desktop
 * app. What the app does that the website doesn't, and that a private library
 * is one menu away. Closing it is saved with their settings, so it stays closed
 * on every computer.
 */
export function DesktopWelcome({ email }: { email: string }) {
  const [closed, setClosed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const mac = useMac();
  if (closed) return null;

  const close = () => {
    // It folds away before it's gone.
    setLeaving(true);
    setTimeout(() => setClosed(true), motionOn() ? 200 : 0);
    // Not saved (offline): it comes back next time, which is no harm.
    void updateGettingStarted({ dismissedDesktop: true }).catch(() => {});
  };

  const tips: { icon: IconName; text: React.ReactNode }[] = [
    { icon: "cloud-check-linear", text: <>The same projects as at app.plotra.ink, kept in step as you write.</> },
    {
      icon: "monitor-linear",
      text: (
        <>
          Another window with <kbd className="rounded border px-1 font-mono text-xs">{mac ? "⌘⇧N" : "Ctrl+Shift+N"}</kbd>. Links to other sites open in your browser.
        </>
      ),
    },
    { icon: "folder-open-linear", text: <>Something just for you? File → New Library… keeps it in a folder on this computer, apart from the cloud.</> },
  ];

  return (
    <section
      aria-labelledby="desktop-welcome-heading"
      className={cn(
        "mb-8 rounded-xl border bg-card p-5",
        leaving ? "pointer-events-none animate-out fade-out-0 slide-out-to-top-1 zoom-out-95 fill-mode-forwards duration-200" : "motion-safe:animate-rise",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="desktop-welcome-heading" className="font-medium">
            Plotra on your desktop
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Signed in to Plotra Cloud as <span className="break-all text-foreground">{email}</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close “Plotra on your desktop”"
          className="group grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Icon name="close-linear" className="size-3.5 transition-transform duration-200 group-hover:rotate-90" />
        </button>
      </div>
      <ul className="mt-4 grid gap-2.5 text-sm text-muted-foreground sm:grid-cols-3 sm:gap-4">
        {tips.map((tip, i) => (
          <li key={tip.icon} className="group/tip flex items-start gap-2.5 motion-safe:animate-rise" style={{ animationDelay: `${180 + i * 90}ms` }}>
            <Icon name={tip.icon} className="mt-0.5 size-4 shrink-0 text-ember-ink transition-transform duration-300 group-hover/tip:-translate-y-0.5 group-hover/tip:scale-110" />
            <span className="min-w-0">{tip.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
