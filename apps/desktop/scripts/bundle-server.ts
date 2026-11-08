// Builds the app's local server for the desktop app (local-mode-plan.md,
// phase 4): apps/app in local mode, as a standalone Next.js server, copied into
// build/server with its static files, plus the migrations into build/migrations.
// electron-builder then puts both beside the app (electron-builder.yml).
//
//   bun scripts/bundle-server.ts
//
// Builds into apps/app/.next-desktop, so a developer's own .next is untouched.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync } from "node:fs";
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
const appOut = path.join(server, "apps/app");
// The app's own files, without its node_modules: those are rebuilt below.
cpSync(path.join(standalone, "apps/app"), appOut, {
  recursive: true,
  dereference: true,
  filter: (src) => src !== path.join(standalone, "apps/app/node_modules"),
});
cpSync(path.join(appDir, distDir, "static"), path.join(appOut, distDir, "static"), { recursive: true });
cpSync(path.join(appDir, "public"), path.join(appOut, "public"), { recursive: true });

// The traced packages come in Bun's layout (node_modules/.bun/<name>@<version>/node_modules/…,
// linked together), where a package finds its dependencies beside its real path. Copied
// as plain files, that breaks (Next can't find @swc/helpers), and electron-builder drops
// a node_modules folder at the top of a resource. So they become one plain node_modules
// beside server.js: one version of each package, and a package that needs another
// version of a dependency gets it in its own node_modules.
const modules = path.join(appOut, "node_modules");
bundleModules(path.join(standalone, "node_modules/.bun"), modules);

// PGlite loads its WebAssembly and data files from beside its code, which
// tracing may not follow: copy the whole package where the server finds it.
const fromDb = createRequire(path.join(repo, "packages/db/package.json"));
const pglite = path.dirname(realpathSync(fromDb.resolve("@electric-sql/pglite/package.json")));
const target = path.join(modules, "@electric-sql/pglite");
rmSync(target, { recursive: true, force: true });
cpSync(pglite, target, { recursive: true, dereference: true });

cpSync(path.join(repo, "packages/db/drizzle"), path.join(out, "migrations"), { recursive: true });

if (!existsSync(path.join(server, "apps/app/server.js"))) throw new Error("The build has no apps/app/server.js.");
console.log(`Local server ready in ${path.relative(repo, out)}.`);

/** Package names in a node_modules folder, scoped ones as "@scope/name". */
function packagesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.startsWith("."))
    .flatMap((name) => (name.startsWith("@") ? readdirSync(path.join(dir, name)).map((sub) => `${name}/${sub}`) : [name]));
}

/** "@swc+helpers@0.5.23" → "@swc/helpers", "next@16.3.8+6e79…" → "next". */
function storeEntryName(entry: string): string {
  const name = entry.slice(0, entry.indexOf("@", 1));
  return name.startsWith("@") ? name.replace("+", "/") : name;
}

function bundleModules(store: string, into: string) {
  // The version each package gets at the top: Bun's hoisted choice, else the first one found.
  const chosen = new Map<string, string>();
  for (const name of packagesIn(path.join(store, "node_modules"))) {
    chosen.set(name, realpathSync(path.join(store, "node_modules", name)));
  }
  const entries = readdirSync(store).filter((entry) => entry !== "node_modules" && !entry.startsWith("."));
  for (const entry of entries.sort()) {
    const name = storeEntryName(entry);
    const real = path.join(store, entry, "node_modules", name);
    if (!chosen.has(name) && existsSync(real)) chosen.set(name, realpathSync(real));
  }
  for (const [name, real] of chosen) cpSync(real, path.join(into, name), { recursive: true, dereference: true });

  // A package at the top whose dependency is another version than the top's gets its own copy.
  for (const entry of entries) {
    const name = storeEntryName(entry);
    const deps = path.join(store, entry, "node_modules");
    if (!existsSync(path.join(deps, name)) || chosen.get(name) !== realpathSync(path.join(deps, name))) continue;
    for (const dep of packagesIn(deps)) {
      if (dep === name) continue;
      const real = realpathSync(path.join(deps, dep));
      if (chosen.get(dep) === real) continue;
      cpSync(real, path.join(into, name, "node_modules", dep), { recursive: true, dereference: true });
    }
  }
}
