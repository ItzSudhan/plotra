import { ViewTransition } from "react";

// Moving between pages, with React's <ViewTransition> (app/globals.css draws
// each move). A navigation says which way it goes with one of `nav`'s types,
// on a <Link> as `transitionTypes` or as `router.push(href, { transitionTypes })`;
// one that says nothing (the browser's back button, a redirect) fades across
// in place. React animates these only inside a transition, which every
// navigation is, and a page that merely refreshes doesn't move.

/** Which way a navigation goes, as React transition types. */
export const nav: Record<"forward" | "back" | "open" | "close", string[]> = {
  /** Deeper, or across to a neighbour: the new page comes in from the right. */
  forward: ["nav-forward"],
  /** Back out: the new page comes in from the left. */
  back: ["nav-back"],
  /** Into a project: the page behind swells away as the project rises into place. */
  open: ["nav-open"],
  /** Out of a project: the reverse, back to where it was opened from. */
  close: ["nav-close"],
};

const moves = {
  "nav-forward": "vt-forward",
  "nav-back": "vt-back",
  "nav-open": "vt-open",
  "nav-close": "vt-close",
  default: "vt-fade",
};

/**
 * A page, which leaves and arrives as one. The template.tsx files wrap their
 * segment's pages in it: a template mounts afresh whenever the segment below
 * it changes, so the page that goes exits and the one that comes enters, while
 * the layout around them (a header, the reader's contents) stays still.
 */
export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter={moves} exit={moves} default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * A page's loading skeleton (a loading.tsx), shown the moment a link is
 * clicked. It dissolves off the page once the page itself has arrived beneath it.
 */
export function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition exit="vt-fade" default="none">
      {children}
    </ViewTransition>
  );
}

/** Content that changes in place while the page stays, like a settings tab: whenever `id` changes, the old fades across to the new. */
export function Swap({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <ViewTransition key={id} enter="vt-fade" exit="vt-fade" default="none">
      {children}
    </ViewTransition>
  );
}
