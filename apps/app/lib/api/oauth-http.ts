import "server-only";
import { checkRateLimit, clientIp, type Limit } from "../rate-limit";
import { oauthCors } from "./oauth";
import { OAuthError } from "./oauth-server";

// What the OAuth endpoints (app/api/oauth, app/.well-known) answer with:
// JSON, never cached, readable by browser-based MCP clients, and errors in
// OAuth's shape ({ error, error_description }).

export const oauthJson = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", pragma: "no-cache", ...oauthCors, ...extra } });

export const preflight = () => new Response(null, { status: 204, headers: oauthCors });

/** Runs an OAuth endpoint: limited per address, and every failure in OAuth's own words. */
export async function oauthEndpoint(what: string, limit: Limit, fn: () => Promise<Response>): Promise<Response> {
  const { ok, retryAfterSeconds } = await checkRateLimit(`oauth-${what}`, await clientIp(), limit);
  if (!ok) return oauthJson({ error: "temporarily_unavailable", error_description: "Too many requests. Slow down a little." }, 429, { "retry-after": String(retryAfterSeconds) });
  try {
    return await fn();
  } catch (error) {
    if (error instanceof OAuthError) {
      return oauthJson({ error: error.code, error_description: error.message }, error.status, error.status === 401 ? { "www-authenticate": 'Basic realm="plotra"' } : {});
    }
    console.error(error);
    return oauthJson({ error: "server_error", error_description: "Something went wrong." }, 500);
  }
}

/** A token or revocation request's form: urlencoded as OAuth says, or JSON, which some clients send. */
export async function readForm(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") throw new OAuthError("invalid_request", "The body isn't a JSON object.");
    return new URLSearchParams(Object.entries(body).filter((e): e is [string, string] => typeof e[1] === "string"));
  }
  return new URLSearchParams(await request.text());
}
