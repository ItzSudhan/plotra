# syntax=docker/dockerfile:1

# The Plotra app (apps/app) as a standalone Next.js server.
# Build context: the repo root. See docker/compose.yaml.

ARG NODE_VERSION=24
ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION} AS bun

# Bun installs the workspace, Node runs `next build` and the server.
FROM node:${NODE_VERSION}-bookworm-slim AS base
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /repo

# Dependencies first, from the manifests alone, so this layer is only rebuilt
# when a package.json or the lockfile changes.
FROM base AS deps
COPY package.json bun.lock ./
COPY apps/app/package.json apps/app/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/icons/package.json packages/icons/
COPY packages/ui/package.json packages/ui/
RUN bun install --frozen-lockfile --filter '@plotra/app'

FROM deps AS build
COPY packages packages
COPY apps/app apps/app

# NEXT_PUBLIC_* values are compiled into the browser bundle, so they have to be
# known here, at build time. Changing one means rebuilding this image, except
# for the collab URL: the published image is built with a placeholder for it,
# which docker/app-entrypoint.mjs replaces at start.
ARG NEXT_PUBLIC_COLLAB_URL=http://localhost:8787
ARG NEXT_PUBLIC_SITE_URL=
ARG NEXT_PUBLIC_POSTHOG_KEY=
ARG NEXT_PUBLIC_POSTHOG_HOST=
# Not public, but next.config.ts reads it at build time to decide whether the
# browser bundle carries the error reporter.
ARG SENTRY_DSN=

ENV NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_COLLAB_URL=${NEXT_PUBLIC_COLLAB_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY} \
    NEXT_PUBLIC_POSTHOG_HOST=${NEXT_PUBLIC_POSTHOG_HOST} \
    SENTRY_DSN=${SENTRY_DSN}

# The build loads every route once to collect its config, and Better Auth logs
# a complaint for each when it has no secret or URL. These two exist for this
# command only: they are not in the image, and the real ones come from the
# environment at run time. No database is needed to build.
RUN cd apps/app \
    && BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-run-time \
       BETTER_AUTH_URL=http://localhost:3000 \
       bun run build

FROM node:${NODE_VERSION}-bookworm-slim AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# `.next/standalone` mirrors the monorepo: apps/app/server.js plus the traced
# part of node_modules. Static assets and public/ are not traced, so they are
# copied in beside the server.
COPY --from=build --chown=node:node /repo/apps/app/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/app/.next/static ./apps/app/.next/static
COPY --from=build --chown=node:node /repo/apps/app/public ./apps/app/public
COPY --chown=node:node docker/app-entrypoint.mjs ./entrypoint.mjs

USER node
EXPOSE 3000
CMD ["node", "entrypoint.mjs"]
