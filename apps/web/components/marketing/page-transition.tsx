import { ViewTransition } from "react";

/**
 * Wraps a page so that moving between pages is animated: the one being left
 * lifts away and the next rises in (the keyframes are in globals.css). It goes
 * in each page.tsx rather than the layout, because a layout stays mounted
 * across a navigation and so never enters or exits.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
