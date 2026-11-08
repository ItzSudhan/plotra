import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Env vars live with the app that uses them (see plan.md, section 6). A
// DATABASE_URL already in the environment wins over the file, which is how the
// self-hosting migrate job passes it (docker/migrate.Dockerfile).
config({ path: "../../apps/app/.env.local", quiet: true });

// `generate` only diffs the schema; every other command needs a database.
const needsDb = !process.argv.includes("generate");
if (needsDb && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Add it to apps/app/.env.local, or pass it in the environment.");
}

// drizzle-kit connects with node-postgres (`pg`) over TCP whenever that package
// is installed, which it is here. That reaches a plain Postgres and Neon alike,
// so there is no driver to choose. The role it connects as must own the
// database and be allowed to create roles: migration 0003_rls creates
// `plotra_app`.
// A local-mode library's database (`pglite:<folder>`) is migrated in place
// through PGlite. The app does this itself when it opens one; this is for by hand.
const url = process.env.DATABASE_URL ?? "";
const pglite = url.startsWith("pglite:");

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  ...(pglite && { driver: "pglite" as const }),
  dbCredentials: { url: pglite ? url.replace(/^pglite:(\/\/)?/, "") : url },
  casing: "snake_case",
});
