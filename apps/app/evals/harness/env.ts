import { mock } from "bun:test";

// Imported first by everything in evals/. Bun reads `.env.local` on its own,
// which holds the address of a real database: the eval must never reach it.
// Every query the agent's tools make is answered from memory
// (./stubs.ts), and the address is replaced with one nothing listens on, so
// anything the stubs miss fails loudly instead of touching real data.
process.env.DATABASE_URL = "postgres://eval:eval@127.0.0.1:1/eval";

// "server-only" throws outside a React server bundle (as in tests/setup.ts).
mock.module("server-only", () => ({}));
