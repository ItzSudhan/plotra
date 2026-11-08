// Builds the app's local server for the desktop app (local-mode-plan.md,
// phase 4): apps/app in local mode, as a standalone Next.js server, copied into
// build/server with its static files, plus the migrations into build/migrations.
// electron-builder then puts both beside the app (electron-builder.yml).
//
//   bun scripts/bundle-server.ts
//
// Builds into apps/app/.next-desktop, so a developer's own .next is untouched.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const desktop = path.resolve(__dirname, "..");
const repo = path.resolve(desktop, "../..");
const appDir = path.join(repo, "apps/app");
const distDir = ".next-desktop";
const out = path.join(desktop, "build");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

console.log("Building the app in local mode…");
execFileSync("bun", ["run", "build"], {
  cwd: appDir,
  stdio: "inherit",
  env: {
    ...process.env,
    PLOTRA_LOCAL: "1",
    NEXT_OUTPUT: "standalone",
    NEXT_DIST_DIR: distDir,
    NEXT_TELEMETRY_DISABLED: "1",
    // Only to quiet Better Auth while routes are collected: the real ones come from the library at run time.
    BETTER_AUTH_SECRET: "build-time-placeholder-not-used-at-run-time",
    BETTER_AUTH_URL: "http://127.0.0.1:3000",
    // No collab server, analytics or error reporting in local mode.
    NEXT_PUBLIC_COLLAB_URL: "",
    NEXT_PUBLIC_POSTHOG_KEY: "",
    SENTRY_DSN: "",
  },
});

const standalone = path.join(appDir, distDir, "standalone");
const server = path.join(out, "server");
// Symlinks (Bun's module store) become plain files: the app's resources must stand on their own.
cpSync(standalone, server, { recursive: true, dereference: true });
cpSync(path.join(appDir, distDir, "static"), path.join(server, "apps/app", distDir, "static"), { recursive: true });
cpSync(path.join(appDir, "public"), path.join(server, "apps/app/public"), { recursive: true });

// PGlite loads its WebAssembly and data files from beside its code, which
// tracing may not follow: copy the whole package where the server finds it.
const fromDb = createRequire(path.join(repo, "packages/db/package.json"));
const pglite = path.dirname(realpathSync(fromDb.resolve("@electric-sql/pglite/package.json")));
const target = path.join(server, "node_modules/@electric-sql/pglite");
rmSync(target, { recursive: true, force: true });
cpSync(pglite, target, { recursive: true, dereference: true });

cpSync(path.join(repo, "packages/db/drizzle"), path.join(out, "migrations"), { recursive: true });

if (!existsSync(path.join(server, "apps/app/server.js"))) throw new Error("The build has no apps/app/server.js.");
console.log(`Local server ready in ${path.relative(repo, out)}.`);
