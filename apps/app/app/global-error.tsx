"use client";

import { useEffect } from "react";
import { primaryAction, secondaryAction, StatusPage } from "@/components/public/status-page";
import "./globals.css";

// When the root layout itself breaks. It replaces that layout, so it brings its
// own <html>, <body> and styles, and leans on none of the app's providers.

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    // next-themes isn't here to set the theme: follow the person's choice, or the system's.
    try {
      const chosen = localStorage.getItem("theme");
      const dark = chosen === "dark" || (chosen !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    } catch {}
  }, [error]);

  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col font-sans">
        <title>Something went wrong · Plotra</title>
        <StatusPage
          title="Something went wrong on our side"
          actions={
            <>
              <button type="button" onClick={() => retry()} className={primaryAction}>
                Try again
              </button>
              {/* A full page load: the app around this page has broken, so its router may have too. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className={secondaryAction}>
                Go to your projects
              </a>
            </>
          }
        >
          <p>Your writing is saved. Try again, and if it keeps happening, reload the page.</p>
        </StatusPage>
      </body>
    </html>
  );
}
