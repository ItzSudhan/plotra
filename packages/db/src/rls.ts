import { db, drizzleOn, localDb, pool } from "./index";
import { withUserLocal } from "./local";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs `fn` in a transaction as `plotra_app` on behalf of `userId`, so Postgres
 * row-level security limits every query to that user's workspaces
 * (migration 0003_rls). Use this for anything a user request reads or writes.
 *
 * Hand-rolled rather than `db.transaction` for two reasons. BEGIN and the role
 * setup go out as one statement, saving a round trip on every transaction. And
 * a connection that fails mid-transaction is thrown away instead of going back
 * to the pool still inside it as `plotra_app`, where the next owner-connection
 * query (Better Auth's) would hit "permission denied".
 *
 * Works the same on Neon and node-postgres (see ./index.ts): each hands out a
 * node-postgres client, and a statement without parameters goes out over the
 * simple query protocol, which is what lets BEGIN and the setup share one.
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  // PGlite is one connection, with its own way of keeping owner queries out of the way (./local.ts).
  if (localDb) return withUserLocal<T, Tx>(localDb, userId, fn);
  const client = await pool.connect();
  let broken = false;
  try {
    // set_config(…, true) is `set local`: it ends with the transaction.
    await client.query(
      `begin; select set_config('plotra.user_id', ${client.escapeLiteral(userId)}, true), set_config('role', 'plotra_app', true)`,
    );
    // Only the query builders are used on a Tx, which this connection-bound instance has too.
    const result = await fn(drizzleOn(client) as unknown as Tx);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken || undefined);
  }
}
