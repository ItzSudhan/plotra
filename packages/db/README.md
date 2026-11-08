# @plotra/db

The database: the Drizzle schema, the SQL migrations, the database client and the row-level security helper. Only `apps/app` uses it, directly and through `@plotra/auth`.

Like every package here it ships TypeScript source with no build step: `exports` point at `src/`, and the app lists it in `transpilePackages`.

## What's in it

| Import | File | What it is |
| --- | --- | --- |
| `@plotra/db` | `src/index.ts` | `db` (a Drizzle instance), `schema`, `pool`, `driver` |
| `@plotra/db/schema` | `src/schema/` | the tables, one file per area (auth, project, node, knowledge, access, ...) |
| `@plotra/db/rls` | `src/rls.ts` | `withUser(userId, fn)`: runs `fn` in a transaction as the `plotra_app` role, so row-level security limits every query to that user's workspaces |
| `@plotra/db/local` | `src/local.ts` | the PGlite driver, for local mode (the desktop app's "On this computer") |
| `@plotra/db/journal` | `drizzle/meta/_journal.json` | the list of migrations |

Migrations are the numbered SQL files in `drizzle/`.

Anything a user request reads or writes goes through `withUser`. `db` connects as the database owner, so row-level security doesn't apply to it; it is for Better Auth and the few server-side jobs that need it.

## The driver

`DATABASE_URL` (read from `apps/app/.env.local`) picks it:

- a Neon host: Neon's serverless driver;
- `pglite:<folder>` or `pglite:memory`: PGlite, Postgres inside the process;
- anything else: node-postgres over TCP.

`DATABASE_DRIVER=neon|pg|pglite` overrides the guess.

## Scripts

From the repository root:

```bash
bun run db:migrate    # apply the migrations in drizzle/ to DATABASE_URL
bun run db:generate   # write a new migration from changes to src/schema
bun run db:studio     # Drizzle Studio
```

The role in `DATABASE_URL` must own the database and be allowed to create roles: migration `0003_rls` creates `plotra_app`.

From this folder, `bun run test` runs the tests in `tests/` on PGlite, so they need no Postgres. `bun run typecheck` checks the types.

## The rule

Don't add or edit a migration, or change a table, without an issue that agreed it first, and never edit a migration that is already on `master`. Every table also needs matching row-level security policies. The reasons are in [CONTRIBUTING.md, "The database: no migrations without discussion"](../../CONTRIBUTING.md#the-database-no-migrations-without-discussion).
