# syntax=docker/dockerfile:1

# The collab server (apps/collab) for self-hosting: the same Cloudflare Worker
# that the hosted version deploys, run by `workerd` (Cloudflare's open-source
# runtime) through `wrangler dev`. Its Durable Object storage, one SQLite
# database per open note, is kept under /data.
# Build context: the repo root. See docker/compose.yaml.

ARG NODE_VERSION=24
ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION} AS bun

FROM node:${NODE_VERSION}-bookworm-slim
# workerd verifies TLS against the system's certificates when the app is
# reached over https.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /repo

COPY package.json bun.lock ./
COPY apps/collab/package.json apps/collab/
RUN bun install --frozen-lockfile --filter '@plotra/collab'

COPY apps/collab apps/collab
COPY docker/collab-entrypoint.sh /usr/local/bin/collab-entrypoint.sh

# wrangler writes its bundle and the generated .dev.vars into the project
# directory, and the Durable Object databases into /data. Creating /data here,
# owned by `node`, is what gives a fresh named volume the right owner.
RUN chmod 755 /usr/local/bin/collab-entrypoint.sh \
    && mkdir -p /data \
    && chown -R node:node /data /repo/apps/collab

WORKDIR /repo/apps/collab
USER node
ENV HOME=/home/node \
    WRANGLER_SEND_METRICS=false \
    PORT=8787
VOLUME /data
EXPOSE 8787
ENTRYPOINT ["collab-entrypoint.sh"]
