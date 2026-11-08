# @plotra/collab

The real-time server. A Cloudflare Worker with one Durable Object per room, built on [PartyServer](https://www.npmjs.com/package/partyserver) and [y-partyserver](https://www.npmjs.com/package/y-partyserver), that syncs Yjs documents between everyone who has a note open.

It is deliberately simple. It checks tokens, syncs Yjs updates and awareness (cursors, presence), and stores each document's state in the Durable Object's SQLite storage. Everything else (who may read or write, the text, links, word counts) is decided by the Next app in `apps/app`. The server doesn't know what a block is.

All of it is in [`src/index.ts`](src/index.ts).

## How it fits with the app

- A client opens a WebSocket to `/parties/document/<room>?token=<jwt>`. The token is a short-lived JWT the app issues (the Better Auth `jwt` plugin in `packages/auth`). The worker verifies it against the app's `/api/auth/jwks`, checks its issuer is `APP_URL` and that it was issued for this room, and reads the role from it: only `editor` may write. When the token expires the connection is closed and the client reconnects with a fresh one.
- A few seconds after edits stop, the worker saves the document and posts the whole state to the app's `/api/collab/sync`, which updates the text, links and word counts in Postgres.
- The app talks to a room directly over HTTP for AI agent edits and for permission changes (below), authenticated with `COLLAB_SECRET`.

## Run it locally

From the repository root, `bun dev:app` runs the app and this server together; `bun dev` runs every app. Or, from this folder:

```bash
cp .dev.vars.example .dev.vars   # then set COLLAB_SECRET
bun run dev                      # wrangler dev on http://localhost:8787
```

The one secret is `COLLAB_SECRET`. It must be the same value as `COLLAB_SECRET` in `apps/app/.env.local`. Locally it goes in `.dev.vars`; `APP_URL` is already set to `http://localhost:3000` in `wrangler.jsonc`.

`bun run typecheck` checks the types. There are no tests here. `GET http://localhost:8787/health` answers `{"ok":true}` when the worker is configured.

## Variables

From the `Env` type in `src/index.ts`:

| Variable | What it is |
| --- | --- |
| `APP_URL` | The app's public address, without a trailing slash. Tokens are checked against it, so it must equal the app's `BETTER_AUTH_URL`. Set in `wrangler.jsonc`. |
| `APP_INTERNAL_URL` | Optional. Where the worker reaches the app when that isn't `APP_URL`, such as `http://app:3000` inside the self-hosting compose stack. |
| `COLLAB_SECRET` | Shared with the app. The app sends it as `Authorization: Bearer <secret>`, and the worker sends it back when it posts to `/api/collab/sync`. A secret: `.dev.vars` locally, `wrangler secret put` in production. |
| `Document` | The Durable Object binding, declared in `wrangler.jsonc`. |

## Rooms and endpoints

| Room | What it holds |
| --- | --- |
| `node-<id>` | One document (a note, scene or chapter). Stored. |
| `presence-<projectId>` | Awareness only, plus small "binder changed" notices between clients. Never stored. |

| Request | Who | What it does |
| --- | --- | --- |
| WebSocket `/parties/document/<room>?token=<jwt>` | browsers | Yjs sync and awareness |
| `GET /parties/document/<room>` | the app | the document's current state, as a Yjs update |
| `POST /parties/document/<room>` | the app | merges a Yjs update (how the AI agent edits) |
| `POST /parties/document/<room>?awareness` | the app | relays an awareness update (the agent's cursor) |
| `POST /parties/document/<room>?recheck` | the app | closes every editing connection so each reconnects with a fresh token, after access changed |
| `GET /health` | uptime check | `200 {"ok":true}`, or `503` when the secret is missing or a deployed worker still points at a local `APP_URL` |

Requests to a room without the service token get a 404.

## Deploying

`bun run deploy` runs `wrangler deploy --env production`. Never run a plain `wrangler deploy`: it ships the local `APP_URL`, and `/health` then answers 503. The full checklist is in [Deploying the hosted version](https://docs.plotra.ink/docs/deploying) ([source](../docs/content/docs/%28hosting%29/deploying/index.mdx)).

Setup for the whole repository is in [CONTRIBUTING.md](../../CONTRIBUTING.md).
