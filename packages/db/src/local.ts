import { PGlite, type Transaction } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

/**
 * The PGlite driver (local-mode-plan.md, phase 1): real Postgres compiled to
 * WebAssembly, running inside the app's own process and stored as a folder.
 * Local mode (the desktop app's "On this computer") runs on it; so can
 * development and the tests.
 *
 * PGlite is one connection. The other drivers hand each transaction its own
 * connection, so a query made outside a transaction (Better Auth's, an
 * analytics count) never waits for one. Here it would: PGlite holds every
 * other query back until the open transaction ends, and if that transaction
 * is itself waiting for the query, nothing moves again. So a query made while
 * a transaction is open in the same async context runs inside that
 * transaction instead, as whoever it would have run as: the owner for `db`,
 * the user for `withUser`. Each statement switches the role first if the one
 * before it ran as someone else, and the statements of one transaction go out
 * one at a time, so a switch can't land between another statement's switch
 * and its query.
 */

type QueryOptions = Parameters<PGlite["query"]>[2];
type Results = Awaited<ReturnType<PGlite["query"]>>;

/** Who a statement runs as: the owner (no role set) or a user under row-level security. */
type Identity = { userId: string } | null;

/** One open transaction, and who its last statement ran as. */
type Open = {
  tx: Transaction;
  as: Identity;
  /** The statements of this transaction, one after another. */
  queue: Promise<unknown>;
  savepoints: number;
};

const open = new AsyncLocalStorage<Open>();

const sameIdentity = (a: Identity, b: Identity) => (a === null ? b === null : b !== null && a.userId === b.userId);

/** Runs `run` on `state`'s transaction after every statement queued before it, as `as`. */
function inOrder<T>(state: Open, as: Identity, run: (tx: Transaction) => Promise<T>): Promise<T> {
  const next = state.queue.then(async () => {
    if (!sameIdentity(state.as, as)) {
      // set_config(…, true) is `set local`: it ends with the transaction. A role of
      // "none" is the session's own (the owner); an empty user id matches no rows.
      await state.tx.query("select set_config('plotra.user_id', $1, true), set_config('role', $2, true)", [
        as?.userId ?? "",
        as ? "plotra_app" : "none",
      ]);
      state.as = as;
    }
    return run(state.tx);
  });
  // A failed statement mustn't stop the ones after it from running (and failing on their own).
  state.queue = next.catch(() => {});
  return next;
}

/**
 * What Drizzle sees as its client: `query` and `transaction`, the two calls its
 * PGlite session makes. One acts as `as` on the open transaction, if any, and
 * on the database itself otherwise.
 */
function clientFor(database: () => Promise<PGlite>, as: Identity, state?: Open) {
  const client = {
    async query(sql: string, params?: unknown[], options?: QueryOptions): Promise<Results> {
      const current = state ?? open.getStore();
      if (current) return inOrder(current, as, (tx) => tx.query(sql, params, options));
      if (as) throw new Error("A query as a user must run in a transaction (withUser).");
      return (await database()).query(sql, params, options);
    },
    async transaction<T>(fn: (client: unknown) => Promise<T>): Promise<T> {
      const current = state ?? open.getStore();
      if (current) {
        // Already in one: a savepoint stands in for the nested transaction.
        const name = `local_sp${++current.savepoints}`;
        await inOrder(current, as, (tx) => tx.query(`savepoint ${name}`));
        try {
          const result = await fn(clientFor(database, as, current));
          await inOrder(current, as, (tx) => tx.query(`release savepoint ${name}`));
          return result;
        } catch (error) {
          await inOrder(current, as, (tx) => tx.query(`rollback to savepoint ${name}`));
          throw error;
        }
      }
      return (await database()).transaction((tx) => {
        const state: Open = { tx, as: null, queue: Promise.resolve(), savepoints: 0 };
        return open.run(state, () => fn(clientFor(database, as, state)));
      });
    },
  };
  return client;
}

/**
 * Where the database lives, from `DATABASE_URL`: `pglite:<folder>` for one on
 * disk (a relative folder is taken from the working directory) and
 * `pglite:memory` for one that is gone when the process ends.
 */
export function localDataDir(url = process.env.DATABASE_URL): string | undefined {
  const rest = url?.replace(/^pglite:(\/\/)?/, "").trim();
  if (!rest || rest === "memory") return undefined;
  return path.resolve(/*turbopackIgnore: true*/ rest);
}

/** The migrations, wherever the server runs from: set by the desktop app, else found from the working directory. */
function migrationsFolder(): string {
  const given = process.env.PLOTRA_MIGRATIONS_DIR;
  if (given) return given;
  const candidates = ["packages/db/drizzle", "../../packages/db/drizzle", "../packages/db/drizzle", "drizzle"].map((p) => path.resolve(/*turbopackIgnore: true*/ p));
  const found = candidates.find((dir) => existsSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ dir, "meta", "_journal.json")));
  if (!found) throw new Error("Couldn't find the database migrations. Set PLOTRA_MIGRATIONS_DIR to packages/db/drizzle.");
  return found;
}

/**
 * Opens (or creates) the database and brings it up to date. The migrations are
 * the same ones every Postgres gets, `plotra_app` and row-level security included.
 */
export async function openLocalDatabase(dataDir: string | undefined, folder = migrationsFolder()): Promise<PGlite> {
  // Restoring a snapshot (the desktop app's File menu): it moves the database
  // aside and names the snapshot here, and an empty folder is filled from it.
  const restore = process.env.PLOTRA_RESTORE_SNAPSHOT;
  const empty = !dataDir || !existsSync(/*turbopackIgnore: true*/ dataDir) || readdirSync(/*turbopackIgnore: true*/ dataDir).length === 0;
  if (dataDir) mkdirSync(/*turbopackIgnore: true*/ dataDir, { recursive: true });
  const loadDataDir = restore && empty ? new Blob([readFileSync(/*turbopackIgnore: true*/ restore)]) : undefined;
  const database = await PGlite.create(dataDir, loadDataDir ? { loadDataDir } : {});
  await migrate(drizzlePglite({ client: database }), { migrationsFolder: folder });
  return database;
}

// One database per folder per process, across hot reloads: two PGlite
// instances writing to one folder would damage it.
const globalForLocal = globalThis as unknown as { plotraLocal?: Map<string, Promise<PGlite>> };

export function localDatabase(dataDir = localDataDir()): () => Promise<PGlite> {
  const key = dataDir ?? ":memory:";
  const all = (globalForLocal.plotraLocal ??= new Map());
  return () => {
    let database = all.get(key);
    if (!database) {
      database = openLocalDatabase(dataDir);
      // A failed open (a migration that didn't apply) is tried again on the next query.
      database.catch(() => all.get(key) === database && all.delete(key));
      all.set(key, database);
    }
    return database;
  };
}

/** A Drizzle instance on the local database for the owner (`as` null) or a user. */
export function drizzleLocal(database: () => Promise<PGlite>, as: Identity = null) {
  return drizzlePglite({ client: clientFor(database, as) as unknown as PGlite, schema });
}

/**
 * `withUser` for the local database: one transaction in which every statement
 * of `fn` runs as `userId` under row-level security. Owner queries made inside
 * it (through `db`) join it as the owner; a nested `withUser` joins it too.
 */
export async function withUserLocal<T, D>(database: () => Promise<PGlite>, userId: string, fn: (tx: D) => Promise<T>): Promise<T> {
  const as = { userId };
  const current = open.getStore();
  if (current) return fn(drizzleLocal(database, as) as unknown as D);
  return (await database()).transaction((tx) => {
    const state: Open = { tx, as: null, queue: Promise.resolve(), savepoints: 0 };
    return open.run(state, () => fn(drizzlePglite({ client: clientFor(database, as, state) as unknown as PGlite, schema }) as unknown as D));
  });
}

/** The open local database, for things that work on the whole of it (snapshots, the library's Markdown copy). */
export async function localDatabaseHandle(): Promise<PGlite> {
  return localDatabase()();
}
