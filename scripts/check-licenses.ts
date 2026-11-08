#!/usr/bin/env bun
// Licence check (plan.md Phase 8 "Open-source readiness").
//
// Plotra is distributed under AGPL-3.0-or-later, so everything it ships has to
// be under a licence that allows that. This walks the installed production
// dependencies of every workspace (and their dependencies, all the way down),
// reads each package's `license` field and reports anything that is not known
// to be compatible, or that states no licence at all.
//
//   bun scripts/check-licenses.ts            production dependencies
//   bun scripts/check-licenses.ts --all      development dependencies too
//   bun scripts/check-licenses.ts --json     machine-readable output
//   bun scripts/check-licenses.ts --list     print every package and its licence
//
// Exits with 1 when something needs a look, so it can run in CI.
//
// It reads package.json files only. That is a first pass, not legal advice: a
// package can state one licence and bundle code under another.

import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const args = new Set(process.argv.slice(2));
const includeDev = args.has("--all");
const asJson = args.has("--json");
const listAll = args.has("--list");

// Licences that can be combined into and distributed with an AGPL-3.0 work.
// Permissive licences, weak copyleft that allows it (LGPL, MPL-2.0), and the
// GPL-3.0 family. Creative Commons licences are for assets and data (icons,
// fonts, datasets), not code; CC BY needs attribution, which CREDITS.md
// gives.
const compatible = new Set(
  [
    "0BSD",
    "AFL-2.1",
    "AGPL-3.0",
    "AGPL-3.0-only",
    "AGPL-3.0-or-later",
    "Apache-2.0",
    "Artistic-2.0",
    "BlueOak-1.0.0",
    "BSD",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "BSD-3-Clause-Clear",
    "BSL-1.0",
    "CC-BY-3.0",
    "CC-BY-4.0",
    "CC0-1.0",
    "GPL-3.0",
    "GPL-3.0-only",
    "GPL-3.0-or-later",
    "ISC",
    "LGPL-2.1",
    "LGPL-2.1-only",
    "LGPL-2.1-or-later",
    "LGPL-3.0",
    "LGPL-3.0-only",
    "LGPL-3.0-or-later",
    "MIT",
    "MIT-0",
    "MPL-2.0",
    "OFL-1.1",
    "PostgreSQL",
    "Python-2.0",
    "Unicode-3.0",
    "Unicode-DFS-2016",
    "Unlicense",
    "W3C",
    "W3C-20150513",
    "WTFPL",
    "Zlib",
  ].map((id) => id.toLowerCase()),
);

// Known not to fit. Anything else that isn't in `compatible` is reported as
// "not recognised" instead, for a person to read.
const incompatible = [
  /^gpl-2\.0(-only)?$/i, // GPL-2.0 without "or later" can't be combined with AGPL-3.0
  /^lgpl-2\.0(-only)?$/i,
  /^sspl/i,
  /^busl/i,
  /^elastic/i,
  /^cc-by-nc/i,
  /^cc-by-nd/i,
  /^commons-clause/i,
  /^unlicensed$/i,
  /^proprietary$/i,
  /^see license/i,
];

// Packages that state no licence in package.json, read by hand. Keyed by name;
// the entry is dropped from the report as long as the version's major matches.
const reviewed: Record<string, { major: string; license: string; why: string }> = {
  "@platejs/diff": {
    major: "53",
    license: "MIT AND Apache-2.0",
    why: "its LICENSE file: MIT, with the parts taken from slate-diff under Apache-2.0",
  },
};

// Packages whose content ends up in what we ship although the workspace lists
// them under devDependencies. The Solar icon data is copied into
// packages/icons/src/solar-subset.json at build time.
const shippedDevDependencies: Record<string, string[]> = {
  "packages/icons": ["@iconify-json/solar"],
};

type Manifest = {
  name?: string;
  version?: string;
  private?: boolean;
  license?: unknown;
  licenses?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
};

type Verdict = "ok" | "incompatible" | "unrecognised" | "unknown";

type Found = {
  name: string;
  version: string;
  license: string;
  verdict: Verdict;
  note?: string;
  /** Workspaces that pull this package in. */
  usedBy: Set<string>;
};

const readManifest = (dir: string): Manifest | null => {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Manifest;
  } catch {
    return null;
  }
};

/** Node's lookup: `node_modules/<name>` in this directory, then each parent. */
function resolvePackage(name: string, fromDir: string): string | null {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** The `license` field as text. Handles the old object and array forms too. */
function licenseText(manifest: Manifest): string {
  const one = (value: unknown): string => {
    if (typeof value === "string") return value.trim();
    if (value && typeof value === "object" && "type" in value && typeof value.type === "string") return value.type.trim();
    return "";
  };
  const direct = one(manifest.license);
  if (direct) return direct;
  if (Array.isArray(manifest.licenses)) {
    const all = manifest.licenses.map(one).filter(Boolean);
    // The old array form meant "any of these".
    if (all.length) return all.length === 1 ? all[0] : `(${all.join(" OR ")})`;
  }
  return one(manifest.licenses);
}

function judgeId(id: string): Verdict {
  // "Apache-2.0 WITH LLVM-exception": an exception only ever adds permissions.
  const base = id.replace(/\s+WITH\s+.+$/i, "").replace(/\+$/, "").trim();
  if (compatible.has(base.toLowerCase())) return "ok";
  if (incompatible.some((pattern) => pattern.test(base))) return "incompatible";
  return "unrecognised";
}

const worst = (verdicts: Verdict[]): Verdict =>
  verdicts.includes("incompatible") ? "incompatible" : verdicts.includes("unrecognised") ? "unrecognised" : "ok";

/**
 * Judges an SPDX expression. `A OR B` is fine when either side is (we may pick
 * one); `A AND B` needs both. Parentheses nest.
 */
function judge(expression: string): Verdict {
  const text = expression.trim();
  if (!text) return "unknown";
  if (incompatible.some((pattern) => pattern.test(text))) return "incompatible";

  const tokens = text.match(/\(|\)|[^\s()]+/g) ?? [];
  let at = 0;

  const parseOr = (): Verdict => {
    const sides = [parseAnd()];
    while (tokens[at]?.toUpperCase() === "OR") {
      at += 1;
      sides.push(parseAnd());
    }
    return sides.includes("ok") ? "ok" : worst(sides);
  };
  const parseAnd = (): Verdict => {
    const sides = [parseAtom()];
    while (tokens[at]?.toUpperCase() === "AND") {
      at += 1;
      sides.push(parseAtom());
    }
    return worst(sides);
  };
  const parseAtom = (): Verdict => {
    if (tokens[at] === "(") {
      at += 1;
      const inner = parseOr();
      if (tokens[at] === ")") at += 1;
      return inner;
    }
    let id = tokens[at++] ?? "";
    if (tokens[at]?.toUpperCase() === "WITH") {
      id += ` WITH ${tokens[at + 1] ?? ""}`;
      at += 2;
    }
    return judgeId(id);
  };

  const verdict = parseOr();
  // Leftover tokens mean it wasn't an expression we understand.
  return at < tokens.length ? "unrecognised" : verdict;
}

const hasLicenseFile = (dir: string): boolean => {
  try {
    return readdirSync(dir).some((file) => /^(licen[sc]e|copying|unlicense)(\.|$)/i.test(file));
  } catch {
    return false;
  }
};

/** Directories of every workspace named by the root package.json. */
function workspaceDirs(): string[] {
  const manifest = readManifest(root);
  const declared = manifest?.workspaces;
  const patterns = Array.isArray(declared) ? declared : (declared?.packages ?? []);
  const dirs: string[] = [];
  for (const pattern of patterns) {
    if (pattern.endsWith("/*")) {
      const parent = join(root, pattern.slice(0, -2));
      if (!existsSync(parent)) continue;
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        const dir = join(parent, entry.name);
        if (entry.isDirectory() && existsSync(join(dir, "package.json"))) dirs.push(dir);
      }
    } else if (existsSync(join(root, pattern, "package.json"))) {
      dirs.push(join(root, pattern));
    }
  }
  return dirs.sort();
}

const found = new Map<string, Found>();
const missing = new Map<string, Set<string>>();
const workspaces = workspaceDirs();
const workspaceNames = new Set(workspaces.map((dir) => readManifest(dir)?.name).filter(Boolean) as string[]);

function visit(name: string, fromDir: string, workspace: string, optional: boolean, seen: Set<string>) {
  const dir = resolvePackage(name, fromDir);
  if (!dir) {
    // Optional dependencies are often platform builds that aren't installed here.
    if (!optional) {
      if (!missing.has(name)) missing.set(name, new Set());
      missing.get(name)!.add(workspace);
    }
    return;
  }
  if (seen.has(dir)) return;
  seen.add(dir);

  const manifest = readManifest(dir);
  if (!manifest) return;

  // A workspace package is ours (AGPL); only its dependencies need checking.
  const isOurs = workspaceNames.has(manifest.name ?? "") && !relative(root, dir).startsWith("node_modules");
  if (!isOurs) {
    const key = `${manifest.name ?? name}@${manifest.version ?? "?"}`;
    const existing = found.get(key);
    if (existing) {
      existing.usedBy.add(workspace);
    } else {
      let license = licenseText(manifest);
      let verdict = judge(license);
      let note: string | undefined;
      const byHand = reviewed[manifest.name ?? ""];
      if (verdict === "unknown" && byHand && (manifest.version ?? "").split(".")[0] === byHand.major) {
        license = byHand.license;
        verdict = judge(license);
        note = `read by hand: ${byHand.why}`;
      }
      if (verdict === "unknown") note = hasLicenseFile(dir) ? "no license field; a licence file is present, read it" : "no license field and no licence file";
      if (/^cc-by-/i.test(license) && verdict === "ok") note = "needs attribution (see CREDITS.md)";
      found.set(key, { name: manifest.name ?? name, version: manifest.version ?? "?", license: license || "(none)", verdict, note, usedBy: new Set([workspace]) });
    }
  }

  for (const dep of Object.keys(manifest.dependencies ?? {})) visit(dep, dir, workspace, false, seen);
  for (const dep of Object.keys(manifest.optionalDependencies ?? {})) visit(dep, dir, workspace, true, seen);
  // Peers are installed by someone else in the tree; follow them when present.
  for (const dep of Object.keys(manifest.peerDependencies ?? {})) visit(dep, dir, workspace, true, seen);
}

for (const dir of workspaces) {
  const manifest = readManifest(dir);
  if (!manifest) continue;
  const label = relative(root, dir);
  const seen = new Set<string>();
  const direct = new Map<string, boolean>();
  for (const dep of Object.keys(manifest.dependencies ?? {})) direct.set(dep, false);
  for (const dep of Object.keys(manifest.optionalDependencies ?? {})) direct.set(dep, true);
  for (const dep of shippedDevDependencies[label] ?? []) direct.set(dep, false);
  if (includeDev) for (const dep of Object.keys(manifest.devDependencies ?? {})) direct.set(dep, false);
  for (const [dep, optional] of direct) visit(dep, dir, label, optional, seen);
}

const all = [...found.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const problems = all.filter((p) => p.verdict !== "ok");
const byLicense = new Map<string, number>();
for (const p of all) byLicense.set(p.license, (byLicense.get(p.license) ?? 0) + 1);
const attribution = all.filter((p) => p.verdict === "ok" && /^cc-by-/i.test(p.license));
const readByHand = all.filter((p) => p.note?.startsWith("read by hand"));

if (asJson) {
  console.log(
    JSON.stringify(
      {
        scope: includeDev ? "all dependencies" : "production dependencies",
        workspaces: workspaces.map((dir) => relative(root, dir)),
        packages: all.length,
        licenses: Object.fromEntries([...byLicense].sort((a, b) => b[1] - a[1])),
        problems: problems.map((p) => ({ ...p, usedBy: [...p.usedBy] })),
        notInstalled: Object.fromEntries([...missing].map(([name, by]) => [name, [...by]])),
        ...(listAll && { all: all.map((p) => ({ ...p, usedBy: [...p.usedBy] })) }),
      },
      null,
      2,
    ),
  );
} else {
  console.log(`Licence check against AGPL-3.0 (${includeDev ? "all" : "production"} dependencies)`);
  console.log(`${workspaces.length} workspaces, ${all.length} packages\n`);

  if (listAll) {
    for (const p of all) console.log(`  ${p.name}@${p.version}  ${p.license}`);
    console.log("");
  }

  console.log("By licence:");
  for (const [license, count] of [...byLicense].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)}  ${license}`);
  }

  if (attribution.length) {
    console.log("\nNeeds attribution (given in CREDITS.md):");
    for (const p of attribution) console.log(`  ${p.name}@${p.version}  ${p.license}`);
  }

  if (readByHand.length) {
    console.log("\nNo license field, read by hand (see `reviewed` in this script):");
    for (const p of readByHand) console.log(`  ${p.name}@${p.version}  ${p.license}`);
  }

  if (missing.size) {
    console.log("\nDeclared but not installed (run `bun install`), so not checked:");
    for (const [name, by] of missing) console.log(`  ${name}  (${[...by].join(", ")})`);
  }

  const heading: Record<Exclude<Verdict, "ok">, string> = {
    incompatible: "Not compatible with AGPL-3.0",
    unrecognised: "Licence not recognised (read it and add it to the list in this script if it fits)",
    unknown: "No licence stated",
  };
  for (const verdict of ["incompatible", "unrecognised", "unknown"] as const) {
    const group = problems.filter((p) => p.verdict === verdict);
    if (!group.length) continue;
    console.log(`\n${heading[verdict]}:`);
    for (const p of group) {
      console.log(`  ${p.name}@${p.version}  ${p.license}${p.note ? `  (${p.note})` : ""}`);
      console.log(`      used by: ${[...p.usedBy].join(", ")}`);
    }
  }

  console.log(problems.length || missing.size ? `\n${problems.length} package(s) need a look.` : "\nNothing to flag.");
}

process.exit(problems.length || missing.size ? 1 : 0);
