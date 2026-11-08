"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * Answers every click on a link within the app at once, before the page it
 * leads to has loaded: the link looks pressed (`data-pending`, styled in
 * app/globals.css) and a thin bar runs along the top of the window until the
 * address changes. Pages that load in a moment never show the bar: it waits a
 * beat before it appears.
 */
/** For moves started from code (router.push from a menu): the bar runs as it does for a link. */
export function showNavPending(href: string) {
  const to = new URL(href, location.href);
  // Already there: nothing will load.
  if (to.pathname === location.pathname && to.search === location.search) return;
  window.dispatchEvent(new Event("plotra:navigating"));
}

export function NavFeedback() {
  return (
    <Suspense>
      <Feedback />
    </Suspense>
  );
}

function Feedback() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  // The link clicked, or true for a move started from code.
  const [link, setLink] = useState<HTMLAnchorElement | true | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Next.js's <Link> cancels the browser's own navigation when it takes a click over,
      // so a cancelled click on a link is a move within the app. Anything else is left alone.
      if (!e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin) return;
      // The same page, or a jump within it: nothing will load.
      if (to.pathname === location.pathname && to.search === location.search) return;
      setLink(a);
    };
    const fromCode = () => setLink(true);
    window.addEventListener("click", onClick);
    window.addEventListener("plotra:navigating", fromCode);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("plotra:navigating", fromCode);
    };
  }, []);

  // Arrived: whatever was clicked is done.
  const [at, setAt] = useState(`${pathname}?${search}`);
  if (at !== `${pathname}?${search}`) {
    setAt(`${pathname}?${search}`);
    setLink(null);
  }

  useEffect(() => {
    if (!link) return;
    if (link !== true) link.setAttribute("data-pending", "");
    // Should the move never finish (a link that's refused, offline), don't leave it pressed.
    const giveUp = setTimeout(() => setLink(null), 15_000);
    return () => {
      clearTimeout(giveUp);
      if (link !== true) link.removeAttribute("data-pending");
    };
  }, [link]);

  return link ? <div aria-hidden className="plotra-nav-bar" /> : null;
}
