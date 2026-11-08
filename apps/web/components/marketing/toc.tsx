"use client";

import { useEffect, useState } from "react";
import { Icon } from "@plotra/icons";
import { cn } from "@/lib/cn";

export type TocItem = { id: string; label: string };

/**
 * The sections of a long page, for jumping between them. Give it `items`, or
 * leave them out and it lists the `h2[id]`s inside the element `#{from}`.
 */
function useItems(items: TocItem[] | undefined, from: string | undefined) {
  const [found, setFound] = useState<TocItem[]>([]);
  useEffect(() => {
    if (items || !from) return;
    // Read once the page has painted: the headings are the page's, not React state.
    const frame = requestAnimationFrame(() => {
      const root = document.getElementById(from);
      if (!root) return;
      setFound(
        [...root.querySelectorAll<HTMLHeadingElement>("h2[id]")].map((h) => ({ id: h.id, label: h.textContent?.trim() ?? "" })),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [items, from]);
  return items ?? found;
}

/** The section the reader is in: the last heading that has passed the top third of the screen. */
function useActive(items: TocItem[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!items.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      let current: string | null = null;
      for (const { id } of items) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.33) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items]);
  return active;
}

/** A sidebar that stays in view as the page scrolls, with the current section marked. */
export function TocSidebar({ items: given, from, className }: { items?: TocItem[]; from?: string; className?: string }) {
  const items = useItems(given, from);
  const active = useActive(items);
  if (!items.length) return null;

  return (
    <nav aria-label="On this page" className={cn("sticky top-28 max-h-[calc(100vh-9rem)] overflow-y-auto pb-6", className)}>
      <p className="text-[11px] uppercase tracking-[0.2em] text-gray">On this page</p>
      <ol className="mt-4 border-l border-hairline">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? "location" : undefined}
              className={cn(
                "-ml-px block border-l py-1.5 pl-4 text-[13.5px] leading-snug text-pretty transition-colors",
                active === item.id ? "border-ember text-black" : "border-transparent text-gray hover:border-black/20 hover:text-black",
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="group mt-6 inline-flex items-center gap-1.5 text-[13px] text-gray transition-colors hover:text-black"
      >
        <Icon name="arrow-up-linear" className="transition-transform group-hover:-translate-y-0.5" />
        Back to top
      </button>
    </nav>
  );
}

/** The same list folded into one line, for a screen too narrow for the sidebar. */
export function TocInline({ items, className }: { items: TocItem[]; className?: string }) {
  if (!items.length) return null;
  return (
    <details className={cn("group rounded-2xl border border-hairline bg-canvas font-sans", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[14px] text-black [&::-webkit-details-marker]:hidden">
        <span>
          On this page <span className="text-gray">· {items.length} sections</span>
        </span>
        <Icon name="alt-arrow-down-linear" className="text-gray transition-transform group-open:rotate-180" />
      </summary>
      <ol className="list-none space-y-0.5 border-t border-hairline px-2 py-2">
        {items.map((item, i) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="flex gap-3 rounded-xl px-3 py-2 text-[14px] leading-snug text-fg/85 transition-colors hover:bg-black/[0.04] hover:text-black"
            >
              <span aria-hidden className="w-4 shrink-0 text-right tabular-nums text-faint">
                {i + 1}
              </span>
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </details>
  );
}
