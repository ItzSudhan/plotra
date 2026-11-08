import { mock } from "bun:test";

// "server-only" throws when it is imported outside a React server bundle,
// which a test run is. The modules under test are still only run on a server.
mock.module("server-only", () => ({}));

// The database package opens no connection until a query is made; it only needs a URL to exist.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
