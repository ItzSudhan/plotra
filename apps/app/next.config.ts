import path from "node:path";
import type { NextConfig } from "next";

// Self-hosting (docker/app.Dockerfile) builds a standalone server: `.next/standalone`
// holds the app and only the node_modules it uses. Tracing has to start at the
// monorepo root, or the workspace packages and Bun's module store are left out.
// Vercel builds don't set NEXT_OUTPUT, so they are unaffected.
const standalone = process.env.NEXT_OUTPUT === "standalone";

// Sent with every response (plan.md Phase 8 "Production"). No
// Content-Security-Policy here on purpose: one has to be tried against the
// editor and the collab WebSocket first, and the file routes send their own
// (`sandbox`), which a second policy from this list must not replace.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing may frame the app (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Browsers ignore this over plain HTTP, so a self-hosted instance without TLS is unaffected.
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000" }] : []),
];

// PostHog through the app's own address (lib/posthog.ts), only when it is on.
// Its API paths end in a slash, which Next.js would otherwise redirect away.
const posthog = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
const posthogHost = (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com").replace(/\/+$/, "");
// PostHog Cloud serves its scripts and their config from a separate host; a self-hosted PostHog serves them itself.
const posthogAssets = posthogHost.replace(/^https:\/\/(us|eu)\.i\.posthog\.com$/, "https://$1-assets.i.posthog.com");

const nextConfig: NextConfig = {
  transpilePackages: ["@plotra/icons", "@plotra/ui", "@plotra/auth", "@plotra/db"],
  // Bundled, the server would get one copy of Yjs per layer (server actions and
  // the SSR of client components), and Yjs warns when a second copy loads
  // ("Yjs was already imported") because its type checks break across copies.
  // Left to Node, every layer shares the one in node_modules.
  // PGlite (local mode's database) loads its WebAssembly from beside its own files.
  serverExternalPackages: ["yjs", "@electric-sql/pglite"],
  // The faces and logo the read-only links' cards are drawn with (lib/og-card.tsx), read from disk per request.
  outputFileTracingIncludes: { "/p/**": ["./assets/og/*.ttf", "./public/logo.png"] },
  // Lets the browser bundle drop its error reporter when there is no Sentry DSN (instrumentation-client.ts).
  // Local mode (lib/local-mode.ts) is fixed at build time, for the server and the browser alike.
  // The commit goes into bug reports from the account menu (lib/bug-report.ts).
  env: {
    PLOTRA_REPORT_ERRORS: process.env.SENTRY_DSN ? "1" : "",
    NEXT_PUBLIC_PLOTRA_LOCAL: process.env.PLOTRA_LOCAL === "1" ? "1" : "",
    PLOTRA_COMMIT: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
  },
  headers: async () => [
    { source: "/:path*", headers: securityHeaders },
    // The service worker (public/sw.js) is checked for a new version on every visit, never served stale.
    { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
  ],
  // Offline, a server action (a rename, a new note, a move) waits and runs once the connection
  // is back, instead of failing; so does a move to another page. See the "offline support" guide.
  experimental: { useOffline: true },
  rewrites: async () =>
    posthog
      ? [
          { source: "/ingest/static/:path*", destination: `${posthogAssets}/static/:path*` },
          { source: "/ingest/array/:path*", destination: `${posthogAssets}/array/:path*` },
          { source: "/ingest/:path*", destination: `${posthogHost}/:path*` },
        ]
      : [],
  skipTrailingSlashRedirect: posthog,
  ...(standalone && { output: "standalone" as const, outputFileTracingRoot: path.join(__dirname, "../..") }),
  // The desktop app's build of the local server goes elsewhere (apps/desktop/scripts/bundle-server.ts).
  ...(process.env.NEXT_DIST_DIR && { distDir: process.env.NEXT_DIST_DIR }),
};

export default nextConfig;
