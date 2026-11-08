"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Registers the service worker (public/sw.js) that lets Plotra start and move
// between pages offline, and asks it to keep a copy of each page you open,
// with the files that page loaded. Only in production builds: in development
// files change under the same names, and a worker would serve old ones.

const PAGE_COPIES = "plotra-pages-v1";

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

function register() {
  if (process.env.NODE_ENV !== "production" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  registration ??= navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .then(() => navigator.serviceWorker.ready)
    .catch(() => null);
  return registration;
}

/** Keeps the page you're on, and the app files it loaded, for when you're offline. */
export function ServiceWorker() {
  const pathname = usePathname();
  useEffect(() => {
    const ready = register();
    if (!ready) return;
    // After the page has settled, so the copy doesn't compete with it for the network.
    const timer = window.setTimeout(() => {
      void ready.then((worker) => {
        const assets = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => url.startsWith(`${location.origin}/_next/static/`));
        worker?.active?.postMessage({ type: "keep", page: location.href, assets });
      });
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [pathname]);
  return null;
}

/**
 * Deletes this browser's copies of the pages you opened, which hold what the
 * server showed you. Called when you sign out, and when anyone signs in.
 * The app's own files stay: they're the same for everyone.
 */
export async function forgetPageCopies() {
  try {
    if (typeof caches !== "undefined") await caches.delete(PAGE_COPIES);
  } catch {
    // No cache storage (a private window): there was nothing kept.
  }
}
