# @plotra/app

The product: a Next.js app with sign-in, workspaces, projects, the binder, the editor and every view. It is what runs at app.plotra.ink, in the desktop app and in a self-hosted Plotra. Real-time editing goes through the collab server in [`apps/collab`](../collab/README.md); the database is [`packages/db`](../../packages/db/README.md).

## Run it

From the repository root:

```bash
bun dev:app        # this app on http://localhost:3000, and the collab server on :8787
```

It needs Postgres and a few variables in `.env.local` (copy `.env.example`, which explains each one; `DATABASE_URL`, `BETTER_AUTH_SECRET` and `COLLAB_SECRET` are the required ones). Every other service is optional. Setup, step by step, is in [CONTRIBUTING.md](../../CONTRIBUTING.md#setup).

From this folder:

```bash
bun run dev         # next dev on port 3000, without the collab server
bun run test        # the unit tests in tests/, no database needed
bun run typecheck
bun run lint
bun run eval        # the AI agent's eval set; needs a model (Ollama or a key), see evals/README.md
```

## Where things are

```
app/                    routes: (auth), w/[workspace]/p/[project], share, shared, api, settings, ...
components/workspace/   the shell: binder, panes, inspector, command palette, view registry
components/editor/      the Plate editor and its plugins
components/views/       one file per view (timeline, graph, plot grid, ...)
lib/*-actions.ts        server actions
lib/access/             who may do what
lib/                    everything else; pure logic lives here without React
tests/                  unit tests (bun test), one folder per area
evals/                  the AI agent's eval set (evals/README.md)
proxy.ts                what Next.js 16 calls middleware
```

Before you change anything under `lib/`, read ["How the app's server side works"](../../CONTRIBUTING.md#how-the-apps-server-side-works) in CONTRIBUTING.md: server actions are public endpoints, and every user request runs under row-level security.

The Next.js here is version 16. The docs that match it are in `node_modules/next/dist/docs/`.
