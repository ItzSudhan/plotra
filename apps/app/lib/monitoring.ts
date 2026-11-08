// Error tracking and startup checks for the hosted version (plan.md Phase 8
// "Production, on free tiers").
//
// Errors go to Sentry when SENTRY_DSN is set, and nowhere when it isn't. This
// talks to Sentry's envelope endpoint directly instead of using @sentry/nextjs:
// that SDK wraps the build and adds a large client bundle, and all we want is
// "what broke, where, with a stack trace". The cost is in what it doesn't do:
// no source maps upload, no breadcrumbs, no tracing, no replays.
//
// A manuscript must never end up in an error report. Nothing here reads a
// request body, cookies or query strings, and messages are scrubbed of the two
// places content could ride along: a failed query's parameters, and long
// quoted values.
//
// Imported by instrumentation.ts, so it has to load in any server runtime:
// no Node-only modules, no `server-only`.

type Dsn = { endpoint: string; publicKey: string };

type Frame = { function?: string; filename?: string; lineno?: number; colno?: number; in_app: boolean };

type ExceptionValue = {
  type: string;
  value: string;
  stacktrace?: { frames: Frame[] };
  mechanism: { type: string; handled: boolean };
};

export type ErrorReport = {
  /** Where it happened: "node" for the server, "javascript" for a browser. */
  platform: "node" | "javascript";
  exceptions: ExceptionValue[];
  /** The route pattern or path, never a query string. */
  transaction?: string;
  request?: { url: string; method?: string };
  tags?: Record<string, string>;
};

const MAX_MESSAGE = 500;
const MAX_FRAMES = 50;

/** `https://<key>@<host>/<project id>` → where to post, and the key to post with. Null when unset or malformed. */
export function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn.trim());
    const parts = url.pathname.split("/").filter(Boolean);
    const projectId = parts.pop();
    if (!url.username || !projectId) return null;
    const prefix = parts.length ? `/${parts.join("/")}` : "";
    return { endpoint: `${url.protocol}//${url.host}${prefix}/api/${projectId}/envelope/`, publicKey: url.username };
  } catch {
    return null;
  }
}

export const monitoringEnabled = () => parseDsn(process.env.SENTRY_DSN) !== null;

/**
 * Keeps what says which error this is and drops what could be someone's
 * writing: Drizzle appends a failed query's parameters to its message, and
 * Postgres quotes offending values.
 */
export function scrubMessage(raw: string): string {
  let message = raw;
  const params = message.indexOf("\nparams:");
  if (params !== -1) message = message.slice(0, params);
  message = message.replace(/"[^"\n]{41,}"/g, '"[removed]"').replace(/'[^'\n]{41,}'/g, "'[removed]'");
  return message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE)}…` : message;
}

/** Strips the origin, the query string and the fragment: `/w/acme/p/123`. */
export function pathOnly(urlOrPath: string): string {
  try {
    return new URL(urlOrPath, "http://x").pathname.slice(0, 300);
  } catch {
    return "/";
  }
}

const V8_FRAME = /^\s*at (?:(.+?) \()?((?:[^()\s]|\((?!\d))+?):(\d+):(\d+)\)?$/;
const GECKO_FRAME = /^(?:(.*?)@)?(\S+?):(\d+):(\d+)$/;

/** A stack string (V8, or Firefox/Safari) as Sentry frames: oldest call first. */
export function parseStack(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const line of stack.split("\n").slice(0, 200)) {
    const match = V8_FRAME.exec(line) ?? GECKO_FRAME.exec(line.trim());
    if (!match) continue;
    const filename = match[2].slice(0, 300);
    frames.push({
      function: match[1]?.slice(0, 200) || undefined,
      filename,
      lineno: Number(match[3]),
      colno: Number(match[4]),
      in_app: !/node_modules|^node:|\(native\)/.test(filename),
    });
    if (frames.length >= MAX_FRAMES) break;
  }
  return frames.reverse();
}

function exceptionOf(name: string, message: string, stack: string | undefined, handled: boolean): ExceptionValue {
  const frames = parseStack(stack);
  return {
    type: name.slice(0, 100) || "Error",
    value: scrubMessage(message),
    ...(frames.length ? { stacktrace: { frames } } : {}),
    mechanism: { type: "generic", handled },
  };
}

/** An error and its causes (a failed query wraps the database's own error) as Sentry exceptions, innermost first. */
export function exceptionsOf(error: unknown): ExceptionValue[] {
  const chain: ExceptionValue[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current != null; depth++) {
    if (current instanceof Error) {
      chain.push(exceptionOf(current.name, current.message, current.stack, false));
      current = current.cause;
    } else {
      chain.push(exceptionOf("Error", typeof current === "string" ? current : "A value that isn't an Error was thrown.", undefined, false));
      break;
    }
  }
  return chain.reverse();
}

/** An exception described by the browser (app/api/monitoring). */
export function clientException(input: { name?: unknown; message?: unknown; stack?: unknown }): ExceptionValue {
  const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");
  return exceptionOf(text(input.name, 100) || "Error", text(input.message, 2000) || "Unknown error", text(input.stack, 8000) || undefined, false);
}

const eventId = () => crypto.randomUUID().replace(/-/g, "");

/** The envelope Sentry expects: a header line, an item header line, the event. */
export function buildEnvelope(report: ErrorReport, now = new Date()): { id: string; body: string } {
  const id = eventId();
  const event = {
    event_id: id,
    timestamp: now.getTime() / 1000,
    platform: report.platform,
    level: "error",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    ...(process.env.VERCEL_GIT_COMMIT_SHA ? { release: process.env.VERCEL_GIT_COMMIT_SHA } : {}),
    ...(report.transaction ? { transaction: report.transaction } : {}),
    ...(report.request ? { request: report.request } : {}),
    tags: report.tags ?? {},
    exception: { values: report.exceptions },
    sdk: { name: "plotra.monitoring", version: "1" },
  };
  const header = { event_id: id, sent_at: now.toISOString() };
  return { id, body: `${JSON.stringify(header)}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n` };
}

/** Sends a report to Sentry. Never throws, and gives up after two seconds: reporting must not make a failure worse. */
export async function sendReport(report: ErrorReport): Promise<boolean> {
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn || !report.exceptions.length) return false;
  try {
    const response = await fetch(dsn.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=plotra.monitoring/1`,
      },
      body: buildEnvelope(report).body,
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Whether a thrown value is worth a report. Messages written for the user
 * ("Give your project a title.") travel in a `PLOTRA:` digest (lib/errors.ts)
 * and are the app working as intended; Next's redirects and not-founds are
 * control flow.
 */
export function isUnexpected(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string" && /^(PLOTRA:|NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/.test(digest)) return false;
  // What `expose` would mark: a plain Error with a message and no cause is one we threw on purpose.
  if (error instanceof Error && error.constructor === Error && !error.cause && !digest && error.message) return false;
  return true;
}

/** Reports an error Next caught while handling a request (instrumentation.ts `onRequestError`). */
export async function reportRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath?: string; routeType?: string; routerKind?: string; renderSource?: string },
): Promise<void> {
  if (!monitoringEnabled() || !isUnexpected(error)) return;
  await sendReport({
    platform: "node",
    exceptions: exceptionsOf(error),
    transaction: context.routePath || pathOnly(request.path),
    // The path only. Headers carry the session cookie, and the body is never read.
    request: { url: pathOnly(request.path), method: request.method },
    tags: {
      side: "server",
      ...(context.routeType ? { route_type: context.routeType } : {}),
      ...(context.renderSource ? { render_source: context.renderSource } : {}),
    },
  });
}

/**
 * True when this is the hosted kind of deployment (production, on Vercel) and
 * there is no object store. Version snapshots and attachments then go into
 * Postgres, and Neon's free tier has room for very few of them (plan.md 1,
 * "Free-tier caveats"). A self-hosted instance with its own Postgres may run
 * without one, so this is a warning and nothing more.
 */
export function objectStoreMissing(env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV !== "production" || !env.VERCEL) return false;
  return !(env.S3_ENDPOINT?.trim() && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY && env.S3_BUCKET);
}

export const OBJECT_STORE_WARNING =
  "No object store is configured (S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET). " +
  "Version snapshots and attachments are being stored in Postgres, which will fill the database's free tier.";
