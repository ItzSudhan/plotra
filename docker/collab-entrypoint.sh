#!/bin/sh
# Starts the collab worker under workerd (see docker/collab.Dockerfile).
#
# `wrangler dev` does not read plain environment variables: in local mode a
# worker's vars and secrets come from a `.dev.vars` file next to wrangler.jsonc,
# and that file wins over the `vars` in the config. So the container's
# environment is written there first.
set -eu

: "${APP_URL:?Set APP_URL to the public URL of the app (the same value as BETTER_AUTH_URL).}"
: "${COLLAB_SECRET:?Set COLLAB_SECRET to the same value the app has.}"

# Tokens are checked against APP_URL as their issuer, which is the app's origin
# without a trailing slash.
APP_URL="${APP_URL%/}"
APP_INTERNAL_URL="${APP_INTERNAL_URL:-}"
APP_INTERNAL_URL="${APP_INTERNAL_URL%/}"

umask 077
{
  printf 'APP_URL="%s"\n' "$APP_URL"
  printf 'COLLAB_SECRET="%s"\n' "$COLLAB_SECRET"
  if [ -n "$APP_INTERNAL_URL" ]; then
    printf 'APP_INTERNAL_URL="%s"\n' "$APP_INTERNAL_URL"
  fi
} > .dev.vars

# wrangler's dev server also serves a "local explorer" under /cdn-cgi/ that
# reads and writes Durable Object storage, every note included, without any
# sign-in. It answers only requests addressed to localhost, which a reverse
# proxy can end up sending. This server is reachable from the network, so both
# it and the request tracing behind it are switched off.
export X_LOCAL_EXPLORER=false
export X_LOCAL_OBSERVABILITY=false
export WRANGLER_SEND_METRICS=false

echo "[plotra] collab server: port ${PORT:-8787}, app ${APP_INTERNAL_URL:-$APP_URL} (public ${APP_URL}), state in ${COLLAB_DATA_DIR:-/data}"

exec node_modules/.bin/wrangler dev \
  --ip 0.0.0.0 \
  --port "${PORT:-8787}" \
  --persist-to "${COLLAB_DATA_DIR:-/data}" \
  --show-interactive-dev-session=false \
  --log-level "${COLLAB_LOG_LEVEL:-log}"
