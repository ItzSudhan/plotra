import type { Instrumentation } from "next";
import { OBJECT_STORE_WARNING, objectStoreMissing, reportRequestError } from "./lib/monitoring";

// Runs once when a server instance starts (plan.md Phase 8 "Production, on
// free tiers").
export function register() {
  // Loud, not fatal: the app works without an object store, and a self-hosted
  // instance may run that way on purpose. On the hosted version it means the
  // database is filling up, so say it in the logs and in /api/health.
  if (objectStoreMissing()) console.error(`[plotra] WARNING: ${OBJECT_STORE_WARNING}`);
  // Local mode: the library's Markdown copy and daily snapshots (lib/library.ts).
  if (process.env.NEXT_PUBLIC_PLOTRA_LOCAL === "1" && process.env.NEXT_RUNTIME === "nodejs") {
    void import("./lib/library").then(({ startLibraryJobs }) => startLibraryJobs());
  }
}

// Server errors go to Sentry when SENTRY_DSN is set (lib/monitoring.ts).
// Awaited, as Next asks: a serverless instance may freeze as soon as the
// response is out.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  await reportRequestError(error, request, context);
};
