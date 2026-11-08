# syntax=docker/dockerfile:1

# One-shot job: applies the database migrations (packages/db/drizzle) and exits.
# Build context: the repo root. See docker/compose.yaml.
#
# It runs `drizzle-kit migrate`, the same command as `bun run db:migrate` in
# development, over node-postgres. Migrations already applied are skipped, so
# it is safe to run on every start.

ARG NODE_VERSION=24
ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION} AS bun

FROM node:${NODE_VERSION}-bookworm-slim
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /repo

COPY package.json bun.lock ./
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
RUN bun install --frozen-lockfile --filter '@plotra/db'

COPY packages/config packages/config
COPY packages/db packages/db

WORKDIR /repo/packages/db
USER node
# DATABASE_URL comes from the environment.
CMD ["bun", "run", "db:migrate"]
