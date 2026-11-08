"use client";

import { useEffect } from "react";
import { Store, useStore } from "@/components/workspace/stores";

// "Export as PDF" (plan.md 2.7) is the Read view's print path: the browser's
// print dialog saves a PDF, so no PDF library and no paid service. The export
// dialog opens the Read view on a folder and leaves a request here; the view
// prints once its pages are laid out.

/** The folder (null: the whole project) whose Read view should print, and when that was asked. */
const request = new Store<{ nodeId: string | null; at: number } | null>(null);

// A request nobody could honour (nothing to print there) mustn't fire when the view is opened again later.
const EXPIRES_MS = 20_000;

export function requestPrint(nodeId: string | null) {
  request.set({ nodeId, at: Date.now() });
}

/** Calls `print` once when this view (showing `nodeId`) has been asked to print and is `ready`. */
export function usePrintRequest(nodeId: string | null, ready: boolean, print: () => void) {
  const pending = useStore(request);
  useEffect(() => {
    if (!pending || !ready || pending.nodeId !== nodeId) return;
    request.set(null);
    if (Date.now() - pending.at < EXPIRES_MS) print();
    // `print` is a fresh function every render; the request changing is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, ready, nodeId]);
}
