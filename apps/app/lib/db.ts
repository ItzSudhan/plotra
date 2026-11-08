import "server-only";
import { driver } from "@plotra/db";
import { withUser, type Tx } from "@plotra/db/rls";
import { requireSession } from "./data";
import { currentScope } from "./request-cache";

export type { Tx };

const SHARED_TX = Symbol("shared transaction");

/**
 * Runs queries as the signed-in user, under Postgres row-level security.
 * Every read or write made for a user request goes through here; only Better
 * Auth and the collab server's trusted callbacks use the owner connection.
 *
 * Inside a `readOnly` or `transaction` scope every call shares one
 * transaction, opened on first use and committed (or rolled back) when the
 * scope ends: each transaction costs extra round trips, and a request makes
 * many calls.
 */
export async function userDb<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const { user } = await requireSession();
  const scope = currentScope();
  // PGlite (local mode) is one connection: a transaction held open for the
  // whole request would make every other query wait until it ends, its own
  // included. Each call gets a short one instead.
  if (!scope || driver === "pglite") return withUser(user.id, fn);

  // Work still running after the scope ended (the losers of a rejected
  // Promise.all) gets its own transaction: the shared one is committed and its
  // connection back in the pool, and a new shared one would never be committed.
  if (scope.ended) return withUser(user.id, fn);

  let shared = scope.slots.get(SHARED_TX) as Promise<Tx> | undefined;
  if (!shared) {
    let finish!: (ok: boolean) => void;
    const finished = new Promise<void>((resolve, reject) => (finish = (ok) => (ok ? resolve() : reject(new Error("rolled back")))));
    // Rejection is how the transaction learns to roll back; it's not an error here.
    finished.catch(() => {});
    let committed!: Promise<void>;
    shared = new Promise<Tx>((resolve, reject) => {
      committed = withUser(user.id, (tx) => {
        resolve(tx);
        return finished;
      });
      committed.catch(reject);
    });
    scope.slots.set(SHARED_TX, shared);
    scope.onEnd.push((ok) => {
      finish(ok);
      return ok ? committed : committed.catch(() => {});
    });
  }
  return fn(await shared);
}
