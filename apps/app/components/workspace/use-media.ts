"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a media query matches. The server (and the first client render)
 * assume `fallback`, so markup that depends on it should also carry the
 * matching responsive class, or it will flash on a phone.
 */
export function useMedia(query: string, fallback = true): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}

// The shell's breakpoints (Tailwind's md and lg): below the first the binder is
// a drawer and the ribbon becomes a top bar; below the second the inspector is a drawer.
export const WIDE_ENOUGH_FOR_BINDER = "(min-width: 768px)";
export const WIDE_ENOUGH_FOR_INSPECTOR = "(min-width: 1024px)";
