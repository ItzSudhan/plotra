import { customType } from "drizzle-orm/pg-core";

/** Raw bytes (Postgres `bytea`), used for Yjs document snapshots. */
export const bytea = customType<{ data: Uint8Array; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});
