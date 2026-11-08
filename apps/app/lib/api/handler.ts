import "server-only";
import { runAsApiUser } from "../data";
import { publicMessage } from "../errors";
import { checkRateLimit } from "../rate-limit";
import { readOnly } from "../request-cache";
import { authenticate, type ApiCaller } from "./auth";
import { mcpChallenge } from "./oauth";

// Every API route and the MCP endpoint go through `withApi` (beat-the-competitors.md
// step 9): the token says who, the scope says whether they may change things,
// and from there it's the app's own code and access checks, as that person.

export const API_LIMIT = { limit: 300, windowSeconds: 60 };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const json = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...extra } });

const problem = (status: number, message: string, extra: HeadersInit = {}) => json({ error: message }, status, extra);

/** What an error thrown while handling a request means to the caller: a status and a message fit to show. */
export function describeError(error: unknown): { status: number; message: string } {
  if (error instanceof ApiError) return { status: error.status, message: error.message };
  // Next's notFound() and redirect() carry what they are in their digest.
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string") {
    // notFound() from an access check: not there, or not theirs to see. Same answer either way.
    if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return { status: 404, message: "Not found." };
    if (digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;")) return { status: 403, message: "Not allowed." };
    if (digest.startsWith("NEXT_REDIRECT")) return { status: 401, message: "Not signed in." };
  }
  const message = publicMessage(error, "");
  if (message) return { status: /permission/i.test(message) ? 403 : 400, message };
  console.error(error);
  return { status: 500, message: "Something went wrong." };
}

type Need = "read" | "write";

/**
 * Authenticates the request, checks the token's scope and limit, and runs `fn`
 * as the token's owner. `mcp` is for the MCP endpoint: the only one an app
 * connected through OAuth may call, and whose 401 tells a client where to sign in.
 */
export async function withApi(request: Request, need: Need, fn: (caller: ApiCaller) => Promise<Response>, { mcp = false } = {}): Promise<Response> {
  const caller = await authenticate(request);
  if (!caller) {
    const sent = request.headers.has("authorization");
    return problem(401, mcp ? "Connect to Plotra, or send an API token: Authorization: Bearer plt_…" : "Send a valid API token: Authorization: Bearer plt_…", {
      "www-authenticate": mcp ? mcpChallenge(sent ? "invalid_token" : undefined) : 'Bearer realm="plotra"',
    });
  }
  if (caller.clientId && !mcp) return problem(403, "This connection is for Plotra's MCP server only. Make an API token in Settings → API tokens for the API.");
  if (need === "write" && caller.scope !== "write") return problem(403, "This token can only read. Make one that can write in Settings → API tokens.");
  const { ok, retryAfterSeconds } = await checkRateLimit("api", caller.tokenId, API_LIMIT);
  if (!ok) return problem(429, "Too many requests. Slow down a little.", { "retry-after": String(retryAfterSeconds) });
  try {
    return await runAsApiUser(caller.session, () => fn(caller));
  } catch (error) {
    const { status, message } = describeError(error);
    return problem(status, message);
  }
}

/** Runs a read as the caller, in one shared transaction. */
export const read = <T>(fn: () => Promise<T>) => readOnly(fn);

/** A JSON body, or a 400. */
export async function body<T = Record<string, unknown>>(request: Request): Promise<T> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ApiError(415, "Send JSON (content-type: application/json).");
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as T;
  } catch {
    throw new ApiError(400, "The body isn't a JSON object.");
  }
}
