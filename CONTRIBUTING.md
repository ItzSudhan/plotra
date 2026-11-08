# Contributing to Plotra

Thanks for looking. Plotra is early and maintained by one person, so the most useful contributions right now are, in this order:

1. **Bug reports from real use.** Most features have only been tested by the developer. If you try something and it breaks, that is worth an issue.
2. **Small fixes** for those bugs.
3. **Docs**: anything that confused you when you set it up.
4. **Features**, after an issue where we agree on the shape. Please don't open a large pull request without one. It is hard to review, and you may build something the plan is about to change.

Questions, and ideas you want to talk through before opening an issue, go to [the Discord](https://discord.gg/PxXr7Y4QrU).

By taking part you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md). Security problems go through [SECURITY.md](./SECURITY.md), not public issues.

## Setup

You need [Bun](https://bun.sh) (the version in the root `package.json` under `packageManager`), Git, and a Postgres database. A free [Neon](https://neon.com) project works, and so does a local Postgres.

```bash
git clone https://github.com/ItzSudhan/plotra.git
cd plotra
bun install

cp apps/app/.env.example apps/app/.env.local
cp apps/collab/.dev.vars.example apps/collab/.dev.vars
```

Fill in:

- `DATABASE_URL` in `apps/app/.env.local`. The role must own the database and be allowed to create roles: one migration creates the `plotra_app` role that user requests run as.
- `BETTER_AUTH_SECRET` in `apps/app/.env.local`: `openssl rand -base64 32`.
- `COLLAB_SECRET`: another random value, the same in `apps/app/.env.local` and `apps/collab/.dev.vars`.

```bash
bun run db:migrate   # apply the migrations in packages/db/drizzle
bun dev              # every app, through Turborepo
```

| App | URL |
| --- | --- |
| `apps/app`, the product | http://localhost:3000 |
| `apps/web`, the public site | http://localhost:3001 |
| `apps/docs`, the docs | http://localhost:3002 |
| `apps/collab`, the collab server (`wrangler dev`) | http://localhost:8787 |

`bun dev:app` runs only the app and the collab server; `bun dev:web` and `bun dev:docs` run one each.

Optional services stay optional. With their variables unset, invitation and share emails are printed to the terminal, version snapshots and attachments go to Postgres instead of R2, and the Google button is hidden. A change must not make one of these required.

## How the repository is laid out

One repository, Bun workspaces and Turborepo.

```
apps/
  app/       the product (Next.js): workspaces, projects, the editor and every view
  collab/    the real-time server (Cloudflare Worker, one Durable Object per document)
  web/       the public site (Next.js)
  docs/      the docs (Next.js + Fumadocs); content is in content/docs
  desktop/   the desktop app (Electron): Plotra Cloud in a window, or the app run locally on PGlite
packages/
  db/        Drizzle schema, migrations, the database client and row-level security helpers
  auth/      Better Auth configuration, server and client
  ui/        shared components (shadcn/ui on Radix) and the Tailwind theme
  icons/     the Solar icon component and the subset of icons we ship
  config/    shared tsconfig
scripts/     repository scripts (the licence check)
plan.md      the project plan: what is done and what is left
```

Rules that keep it simple:

- Apps never import from other apps, only from `packages/*`.
- Internal packages ship TypeScript source. Their `exports` point at `src/`, and each Next.js app lists them in `transpilePackages`. There is no build step for packages.
- Environment variables live with the app that uses them (`apps/app/.env.local`, `apps/collab/.dev.vars`), never at the root.

Inside `apps/app`:

```
app/                    routes: (auth), w/[workspace]/p/[project], share, shared, api
components/workspace/   the shell: binder, panes, inspector, command palette, view registry
components/editor/      the Plate editor and its plugins
components/views/       one file per view (timeline, graph, plot grid, ...)
lib/*-actions.ts        server actions
lib/access/             who may do what
lib/                    everything else; pure logic lives here without React
```

Next.js here is version 16, and some of it differs from older versions (`proxy.ts` instead of `middleware.ts`, for one). The docs that match the installed version are in `apps/app/node_modules/next/dist/docs/`. Read the relevant page before you use an API you are unsure about.

## How the app's server side works

Three things to know before you touch `apps/app/lib`.

### Server actions are public endpoints

Files named `lib/*-actions.ts` start with `"use server"`. Every function exported from one can be called by anyone who can reach the app, with any arguments. So each one:

1. **checks access itself**, first thing, and
2. **runs its body inside `transaction(async () => …)` or `readOnly(async () => …)`** from `lib/request-cache.ts`.

```ts
export async function renameThing(projectId: string, title: string): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    const clean = title.trim();
    if (!clean) throw new Error("Give it a title.");
    await userDb((tx) => tx.update(thing).set({ title: clean }).where(eq(thing.projectId, projectId)));
  });
}
```

A helper that is not meant to be an endpoint does not belong in an `-actions.ts` file. Put it in a plain module.

Reads that the client polls (presence, hover cards) go through `lib/reads.ts` and `read("name", …)` from `lib/read.ts` instead. Server actions queue behind each other; reads don't, so a poll never blocks an edit.

### Access is one check

Access is set per workspace and per project, like sharing a document. There are no per-note permissions.

- Workspace members can read and edit every project in the workspace. Owners and admins can also manage it.
- A project can be shared with anyone by email as viewer, commenter or editor.

The rules are pure functions in `lib/access/policy.ts`. The code that enforces them is in `lib/access/index.ts`:

- `can(action, projectId)` returns a boolean.
- `requireProjectAccess(projectId, action)` returns the project or throws.
- `requireNodeAccess(projectId, nodeId, action)` does the same for one note.
- `requireAdmin(workspaceSlug)` in `lib/workspace.ts` is for workspace settings.

The actions are `read`, `comment`, `edit`, `delete` and `manage`. Use these helpers. Do not write a second way to decide who may do something.

There are two database connections, and which one you use matters:

- `userDb((tx) => …)` from `lib/db.ts` runs as the signed-in user under Postgres row-level security. Everything done for a user request uses it. If the access check above had a bug, row-level security is the second wall.
- `db` from `@plotra/db` is the server's own connection, with no row-level security. It is for trusted system work only: auth, the collab server's callbacks, quotas, rate limits, usage events. If you reach for it in a user request, do your own access check first and say why in a comment.

### Errors

Next.js replaces the message of anything thrown on the server with a generic one in production. `lib/errors.ts` lets deliberate messages through.

- For an expected failure, throw a plain `new Error("Message for the user.")`. Inside `transaction` or `readOnly` it reaches the client as written, in production too. Write it as a sentence a writer would understand.
- On the client, never read `error.message`. Use `errorText(error)` from `@/lib/errors`, usually as `toast.error(errorText(error))`.
- Route handlers use `publicMessage(error)`.

Database errors, network errors and bugs are not plain `Error`s, so their details stay on the server.

## The database: no migrations without discussion

**Do not add or edit a migration, or change a table definition, in a pull request that hasn't been agreed in an issue first.**

Why this is a hard rule:

- Migrations are applied to a database that holds people's manuscripts. A bad one is the kind of mistake a writing tool doesn't recover from.
- Migration files are numbered in order. Two pull requests that each add `0009_…` conflict, and the fix is not a simple merge.
- Every table needs row-level security policies to match, and those are easy to get wrong.

If your change needs a column or a table, open an issue and describe it. Once it is agreed:

```bash
bun run db:generate   # writes a new SQL file to packages/db/drizzle
bun run db:migrate    # applies it to your database
```

Never edit a migration that is already on `master`. Add a new one.

## Icons

Plotra uses [Solar icons](https://icon-sets.iconify.design/solar/) through `@plotra/icons`, and ships only the ones listed in `packages/icons/src/registry.ts`. To use a new one, add its name there (keep the list sorted) and run `bun run icons` from the root. Don't add another icon library.

## Dependencies and licences

Plotra is AGPL-3.0-or-later, so every dependency has to be under a licence that can be distributed with it. Avoid adding dependencies when a few lines of code will do. When you do add one:

```bash
bun scripts/check-licenses.ts          # production dependencies of every workspace
bun scripts/check-licenses.ts --all    # development dependencies too
bun scripts/check-licenses.ts --list   # every package with its licence
```

The script reads the `license` field of every installed package, all the way down the tree, and exits with an error if one is incompatible with AGPL-3.0, unrecognised or missing. If it flags your new dependency, say so in the pull request. Assets count too: an icon set, a font or a dataset needs a licence that allows redistribution, and a line in `CREDITS.md` if it asks for attribution.

## Code style

- TypeScript, strict. Two spaces, double quotes, semicolons, trailing commas. There is no formatter config; match the file you are in.
- ESLint is the check: `bun run lint`.
- Comments explain why, in plain sentences. Don't narrate what the next line does.
- Keep logic that doesn't need React or the database in a pure module under `lib/`, so it can be tested with a small script.
- Text in the interface is short and direct. No marketing voice, no exclamation marks. "Give the project a title." is the tone.
- No feature is gated by plan. The hosted version has a Free and a Pro plan (see "How it is funded" in the README); Pro only raises limits and adds hosted AI. Billing lives in `apps/app/lib/billing/` and must do nothing when `CREEM_API_KEY` is unset: a self-hosted Plotra has no plans, and no text there may mention upgrading.
- The AI agent runs on the user's own key or a local model. The one code path where the project pays for a model call is hosted AI for Pro workspaces, metered in credits. Don't add another.

## Before you open a pull request

From the repository root:

```bash
bun run lint
bun run typecheck
bun run build
(cd apps/app && bun test tests)
```

Then:

- Try your change in a browser. If it touches collaboration, try it in two browsers with two accounts. Say in the pull request what you tested and what you didn't. "Not click-tested" is a fine thing to write; pretending is not.
- Keep the pull request to one thing.
- If you changed what a feature does, update the docs page for it in `apps/docs/content/docs`. The docs have four tabs, one folder each: `(guides)`, `(reference)`, `(developers)` and `(hosting)`. If you move or rename a page or a heading, update every link to it and run `cd apps/docs && bun test tests`: it checks every link to the docs, from the docs and from the website.
- `AGENTS.md` is rewritten by `next dev` and `turbo`. If it shows up changed in your diff, commit it as it is.

Unit tests live in `apps/app/tests` and run with `cd apps/app && bun test tests`. Add one when you change pure logic. There are no end-to-end tests yet.

## Licence of contributions

Plotra is licensed under [AGPL-3.0-or-later](./LICENSE). By contributing, you agree that your contribution is licensed under the same terms. There is no contributor licence agreement to sign.

### Sign off your commits

Every commit in a pull request needs a `Signed-off-by` line, which says you agree to the [Developer Certificate of Origin](https://developercertificate.org): in short, that you wrote the change or have the right to submit it under the project's licence. Git adds the line for you:

```bash
git commit -s -m "Fix the word count in the status bar"
```

It uses the name and email from your Git settings, and it must match the commit's author. A check on each pull request looks for it. If you forgot, `git rebase --signoff master` and a force-push fix every commit at once.
