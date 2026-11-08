import { clientException, monitoringEnabled, pathOnly, sendReport } from "@/lib/monitoring";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

const MAX_BYTES = 16 * 1024;

const done = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

// POST /api/monitoring: a browser error from instrumentation-client.ts, passed
// on to Sentry (lib/monitoring.ts). The browser never talks to Sentry itself,
// so the DSN stays one server-side setting and ad blockers don't eat reports.
// Always answers 204: the page has nothing to do with the outcome.
export async function POST(request: Request) {
  if (!monitoringEnabled()) return done();
  // The header files and reads carry too: another site can't send it without a preflight we never grant.
  if (request.headers.get("x-plotra-request") !== "1") return done();
  const declared = Number(request.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(declared) || declared > MAX_BYTES) return done();

  // No sign-in needed (the sign-in page can break too), so the limit is per
  // address. It protects Sentry's free quota from one broken or hostile client.
  const rate = await checkRateLimit("client-error", await clientIp(), { limit: 30, windowSeconds: 3600 }).catch(() => ({ ok: false }));
  if (!rate.ok) return done();

  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > MAX_BYTES) return done();
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return done();
    body = parsed as Record<string, unknown>;
  } catch {
    return done();
  }

  const path = typeof body.path === "string" ? pathOnly(body.path) : "/";
  await sendReport({
    platform: "javascript",
    exceptions: [clientException(body)],
    transaction: path,
    request: { url: path },
    tags: { side: "client", kind: body.kind === "unhandledrejection" ? "unhandledrejection" : "error" },
  });
  return done();
}
