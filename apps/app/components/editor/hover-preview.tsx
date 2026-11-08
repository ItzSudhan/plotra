"use client";

import { Icon } from "@plotra/icons";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NodePreview } from "@/lib/knowledge-actions";
import { read } from "@/lib/read";
import { nodeKindMeta } from "@/lib/tree";

// Hover a link to peek at the note it points to (plan.md 2.4 "Hover preview").

const cache = new Map<string, Promise<NodePreview | null>>();
const OPEN_DELAY = 350;
const CLOSE_DELAY = 150;

function load(projectId: string, nodeId: string, heading?: string) {
  const key = `${nodeId}#${heading ?? ""}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = read("getNodePreview", projectId, nodeId, heading).catch(() => null);
    cache.set(key, entry);
    // Previews go stale as people write; keep them for a short while only.
    setTimeout(() => cache.delete(key), 30_000);
  }
  return entry;
}

/** Wraps an inline trigger; shows a preview card below it after a short hover, or when it takes keyboard focus. */
export function HoverPreview({
  projectId,
  nodeId,
  heading,
  children,
}: {
  projectId: string;
  nodeId: string;
  heading?: string;
  children: React.ReactNode;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [preview, setPreview] = useState<NodePreview | null | undefined>(undefined);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const schedule = (fn: () => void, delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, delay);
  };

  const show = () =>
    schedule(() => {
      if (!anchor.current) return;
      setRect(anchor.current.getBoundingClientRect());
      void load(projectId, nodeId, heading).then(setPreview);
    }, OPEN_DELAY);
  const hide = () => schedule(() => setRect(null), CLOSE_DELAY);

  // Escape closes an open preview, wherever focus is.
  const open = rect !== null;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (timer.current) clearTimeout(timer.current);
      setRect(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const top = rect ? Math.min(rect.bottom + 6, window.innerHeight - 240) : 0;
  const left = rect ? Math.min(Math.max(8, rect.left), window.innerWidth - 368) : 0;

  return (
    <span ref={anchor} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {rect &&
        createPortal(
          <div
            role="tooltip"
            onMouseEnter={() => timer.current && clearTimeout(timer.current)}
            onMouseLeave={hide}
            style={{ top, left }}
            className="fixed z-[600] w-[360px] rounded-lg border bg-popover p-4 font-sans text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
          >
            {preview === undefined ? (
              <div className="space-y-2" aria-busy>
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
              </div>
            ) : preview === null ? (
              <p className="text-sm text-muted-foreground">This note isn&apos;t available.</p>
            ) : (
              <>
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon name={nodeKindMeta[preview.kind].icon} className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{preview.title}</span>
                  {preview.heading && <span className="truncate text-muted-foreground">› {preview.heading}</span>}
                </p>
                {preview.synopsis && <p className="mt-1.5 text-xs text-muted-foreground italic">{preview.synopsis}</p>}
                <p className="mt-2 line-clamp-[8] font-prose text-ui-sm leading-relaxed whitespace-pre-line text-foreground/85">
                  {preview.excerpt || <span className="text-faint">Empty note.</span>}
                </p>
              </>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
