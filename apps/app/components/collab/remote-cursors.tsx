"use client";

import { useRemoteCursorOverlayPositions, type CursorOverlayData } from "@slate-yjs/react";
import { useEffect, useRef, useState } from "react";
import { readableOn } from "@/lib/colors";

export type CursorData = { name: string; color: string };

// Other people's carets and selections, drawn over the editor (plan.md 2.6).
// Adapted from Plate UI's remote-cursor-overlay.

function Cursor({ caretPosition, data, selectionRects }: CursorOverlayData<CursorData>) {
  const color = data?.color ?? "#888";
  return (
    <>
      {selectionRects.map((rect, i) => (
        <div
          key={i}
          className="pointer-events-none absolute opacity-25"
          style={{ ...rect, backgroundColor: color }}
        />
      ))}
      {caretPosition && (
        <div className="pointer-events-none absolute w-0.5" style={{ ...caretPosition, backgroundColor: color }}>
          <div
            className="absolute -top-5 left-0 rounded-sm px-1 py-px font-sans text-meta leading-tight font-medium whitespace-nowrap"
            // Dark or light text, whichever reads on the person's colour.
            style={{ backgroundColor: color, color: readableOn(color) }}
          >
            {data?.name}
          </div>
        </div>
      )}
    </>
  );
}

function Overlay({ container }: { container: HTMLElement }) {
  const containerRef = useRef(container);
  const [cursors] = useRemoteCursorOverlayPositions<CursorData, HTMLElement>({
    containerRef,
    refreshOnResize: "debounced",
  });
  return (
    <>
      {cursors.map((cursor) => (
        <Cursor key={cursor.clientId} {...cursor} />
      ))}
    </>
  );
}

/** Render inside the positioned container that holds the editable. */
export function RemoteCursors() {
  const anchor = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setContainer(anchor.current?.parentElement ?? null);
  }, []);
  return (
    <div ref={anchor} className="pointer-events-none absolute inset-0 z-10" aria-hidden>
      {container && <Overlay container={container} />}
    </div>
  );
}
