import { Pool as NeonPool, type PoolClient } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import { drizzleLocal, localDatabase } from "./local";
import * as schema from "./schema";

/**
 * Which Postgres driver to use (plan.md 1 "Self-hosting").
 *
 * - `neon`: Neon's serverless driver, which reaches Neon over WebSockets. It is
 *   what the hosted version runs on, and it cannot talk to a plain Postgres.
 * - `pg`: node-postgres over TCP, for a self-hosted Postgres (or any other).
 * - `pglite`: PGlite, Postgres inside this process, stored in a folder
 *   (local-mode-plan.md). `DATABASE_URL` is `pglite:<folder>` or `pglite:memory`.
 *
 * `DATABASE_DRIVER` decides when it is set. Otherwise a `pglite:` URL gets
 * PGlite, a Neon host gets Neon's driver and every other host gets `pg`. With
 * no URL at all (a build, a typecheck) nothing connects, and Neon's driver
 * stays the default.
 */
export type DatabaseDriver = "neon" | "pg" | "pglite";

function pickDriver(): DatabaseDriver {
  const explicit = process.env.DATABASE_DRIVER?.trim().toLowerCase();
  if (explicit === "neon" || explicit === "pg" || explicit === "pglite") return explicit;
  if (explicit) throw new Error(`DATABASE_DRIVER must be "neon", "pg" or "pglite", not "${explicit}".`);
  const url = process.env.DATABASE_URL;
  if (!url) return "neon";
  if (url.startsWith("pglite:")) return "pglite";
  try {
    return /(^|\.)neon\.(tech|build)$/.test(new URL(url).hostname) ? "neon" : "pg";
  } catch {
    // Not a URL (a libpq keyword string, say): only node-postgres can read it.
    return "pg";
  }
}

export const driver: DatabaseDriver = pickDriver();

// Both pools are node-postgres pools: Neon's is the same class over a
// WebSocket. Typing them as one keeps every caller driver-agnostic.
type Pool = NeonPool;

const globalForDb = globalThis as unknown as { plotraPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (driver === "neon") return new NeonPool({ connectionString });
  const created = new pg.Pool({ connectionString });
  // An idle connection that drops (a database restart) emits an error on the
  // pool; unhandled, it would take the whole server down. The pool has already
  // discarded that connection, so the next query just opens a new one.
  created.on("error", (error) => console.error("[plotra] Postgres connection lost:", error.message));
  return created as unknown as Pool;
}

// Reuse one pool across hot reloads in dev. PGlite has no pool: it is one
// connection inside this process (./local.ts), reached through `localDb`.
const pool = driver === "pglite" ? (undefined as unknown as Pool) : (globalForDb.plotraPool ?? createPool());
if (process.env.NODE_ENV !== "production" && driver !== "pglite") globalForDb.plotraPool = pool;

/** The local database, opened on first use (PGlite only). */
export const localDb = driver === "pglite" ? localDatabase() : null;

/**
 * A Drizzle instance on `client` (the pool, or one connection of it) for the
 * driver in use. The two Drizzle drivers build the same queries and return the
 * same result shapes, so the Neon type stands for both.
 */
export function drizzleOn(client: Pool | PoolClient): NeonDatabase<typeof schema> {
  return driver === "neon"
    ? drizzleNeon({ client, schema })
    : (drizzlePg({ client: client as unknown as pg.Pool, schema }) as unknown as NeonDatabase<typeof schema>);
}

export const db: NeonDatabase<typeof schema> = localDb
  ? (drizzleLocal(localDb) as unknown as NeonDatabase<typeof schema>)
  : drizzleOn(pool);
export type Db = typeof db;
export { pool, schema };
