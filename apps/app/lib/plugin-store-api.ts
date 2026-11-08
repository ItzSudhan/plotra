import "server-only";
import { isLocalMode } from "./local-mode";
import { checkRateLimit, clientIp } from "./rate-limit";

// What the store's public JSON routes (app/api/store) share: no sign-in, open
// to any origin (the desktop app reads them from the writer's computer), cached
// briefly at the edge, limited per address, and absent in local mode, which
// has no store of its own.

const NO_STORE = { "cache-control": "no-store" };

export const STORE_CACHE = "public, s-maxage=60, stale-while-revalidate=300";

/** Runs one store route: the body it returns is sent as JSON with `cacheControl`, or a Response as is. */
export async function storeApi(what: string, cacheControl: string, run: () => Promise<unknown>): Promise<Response> {
  if (isLocalMode) return new Response("Not found", { status: 404 });
  try {
    const { ok, retryAfterSeconds } = await checkRateLimit("plugin-store-api", await clientIp(), { limit: 300, windowSeconds: 60 });
    if (!ok) return Response.json({ error: "Too many requests" }, { status: 429, headers: { ...NO_STORE, "retry-after": String(retryAfterSeconds) } });
    const body = await run();
    if (body instanceof Response) return body;
    return Response.json(body, { headers: { "cache-control": cacheControl, "access-control-allow-origin": "*" } });
  } catch (error) {
    console.error(`[plotra] store api: couldn't ${what}:`, error instanceof Error ? error.message : error);
    return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}

/** A 404 for a plugin that isn't in the store. */
export function storeNotFound(): Response {
  return Response.json({ error: "not found" }, { status: 404, headers: { ...NO_STORE, "access-control-allow-origin": "*" } });
}
