import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { expose } from "./errors";

type Memo = Map<unknown, Map<string, unknown>>;

/**
 * A `readOnly` or `transaction` scope: memoized results, plus slots other
 * modules use to share per-scope state (lib/db keeps the scope's transaction
 * there) and work to run when the scope ends, told whether it succeeded.
 * `ended` is set once that work has started: anything still running then (the
 * losers of a rejected Promise.all) must not start new per-scope state.
 */
type Scope = {
  memo: Memo;
  slots: Map<unknown, unknown>;
  onEnd: Array<(ok: boolean) => Promise<void>>;
  ended: boolean;
};

const scope = new AsyncLocalStorage<Scope>();

/**
 * React's `cache`, which only memoizes while rendering: inside a server action
 * it calls straight through, so one action would repeat the session lookup and
 * every access query many times over. This also memoizes inside `readOnly`
 * scopes. Arguments must be JSON-serializable.
 */
export function requestCache<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const rendered = cache(fn);
  const memoized = (...args: A): R => {
    const memo = scope.getStore()?.memo;
    if (!memo) return rendered(...args);
    let results = memo.get(memoized);
    if (!results) memo.set(memoized, (results = new Map()));
    const key = JSON.stringify(args);
    if (!results.has(key)) results.set(key, fn(...args));
    return results.get(key) as R;
  };
  return memoized;
}

/** The current scope's slots and end hooks, if there is one. */
export function currentScope(): Pick<Scope, "slots" | "onEnd" | "ended"> | undefined {
  return scope.getStore();
}

function runScope<T>(fn: () => Promise<T>): Promise<T> {
  if (scope.getStore()) return fn();
  const store: Scope = { memo: new Map(), slots: new Map(), onEnd: [], ended: false };
  return scope.run(store, async () => {
    let result: T;
    try {
      result = await fn();
    } catch (error) {
      store.ended = true;
      await Promise.allSettled(store.onEnd.map((end) => end(false)));
      // Messages we threw on purpose reach the client in production too (lib/errors.ts).
      throw expose(error);
    }
    store.ended = true;
    await Promise.all(store.onEnd.map((end) => end(true)));
    return result;
  });
}

/**
 * Runs a read-only server action or route handler with `requestCache`
 * memoization and one shared database transaction (see `userDb`), so a request
 * pays for BEGIN/COMMIT once instead of once per query.
 */
export function readOnly<T>(fn: () => Promise<T>): Promise<T> {
  return runScope(fn);
}

/**
 * Runs a server action that writes the same way, in one transaction that
 * commits when it returns and rolls back if it throws. Memoized access checks
 * reflect the database as it was when first made: after creating or moving
 * nodes, reload access with `loadNodeAccess`/`withActions(…, true)`.
 */
export function transaction<T>(fn: () => Promise<T>): Promise<T> {
  return runScope(fn);
}
