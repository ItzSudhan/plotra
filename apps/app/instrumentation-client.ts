import { posthog, posthogKey, posthogUiHost, scrubUrl } from "@/lib/posthog";

// Browser errors go to Sentry through /api/monitoring when the instance has
// SENTRY_DSN set (lib/monitoring.ts). PLOTRA_REPORT_ERRORS is filled in at
// build time (next.config.ts), so without a DSN this whole block is dropped
// from the bundle.
//
// Only the error's name, message and stack and the page's path are sent: no
// query string, no page content, nothing typed.

if (process.env.PLOTRA_REPORT_ERRORS) {
  const MAX_REPORTS = 5;
  const seen = new Set<string>();

  // Not ours to fix: browser extensions, cross-origin scripts that give no
  // detail, and a layout warning browsers raise as an error.
  const noise = /ResizeObserver loop|^Script error\.?$|extension:\/\//;

  const report = (kind: "error" | "unhandledrejection", reason: unknown) => {
    try {
      const error = reason instanceof Error ? reason : null;
      const message = error ? error.message : typeof reason === "string" ? reason : "";
      const stack = error?.stack ?? "";
      // AbortError is a request cancelled by navigating away.
      if (!message || error?.name === "AbortError" || noise.test(message) || noise.test(stack)) return;
      const key = `${error?.name}:${message}`;
      if (seen.has(key) || seen.size >= MAX_REPORTS) return;
      seen.add(key);
      void fetch("/api/monitoring", {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json", "x-plotra-request": "1" },
        body: JSON.stringify({
          kind,
          name: error?.name ?? "Error",
          message: message.slice(0, 2000),
          stack: stack.slice(0, 8000),
          path: window.location.pathname,
        }),
      }).catch(() => {});
    } catch {
      // Reporting an error must never cause one.
    }
  };

  window.addEventListener("error", (event) => report("error", event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => report("unhandledrejection", event.reason));
}

// Product analytics, when NEXT_PUBLIC_POSTHOG_KEY is set (lib/posthog.ts): page
// views and clicks. Nobody's writing may reach PostHog, so the text and
// attributes of what was clicked are masked, sessions are never recorded,
// errors stay with Sentry, and addresses lose their query string and tokens.
void posthog?.then((ph) =>
  ph.init(posthogKey, {
    api_host: "/ingest",
    ui_host: posthogUiHost,
    defaults: "2026-08-30",
    person_profiles: "identified_only",
    mask_all_text: true,
    mask_all_element_attributes: true,
    disable_session_recording: true,
    capture_exceptions: false,
    before_send: (event) => {
      for (const bag of [event?.properties, event?.$set, event?.$set_once]) {
        if (bag) for (const key of Object.keys(bag)) bag[key] = scrubUrl(bag[key]);
      }
      return event;
    },
  }),
);
