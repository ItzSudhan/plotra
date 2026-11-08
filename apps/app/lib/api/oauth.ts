import type { ApiTokenScope } from "@plotra/db/schema";

// OAuth 2.1 for the MCP server: how Claude's connectors, Claude Code and other
// MCP clients get access without anyone pasting a token. The MCP
// authorization spec, in its smallest form: discovery documents (RFC 8414,
// RFC 9728), dynamic client registration (RFC 7591), the authorization code
// flow with PKCE (S256 only), refresh tokens that rotate, and revocation
// (RFC 7009). Pure, so it can be tested; lib/api/oauth-server.ts keeps the state.

/** The address everything is relative to: the one Better Auth and the emails use. */
export const issuer = () => (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** The MCP endpoint, which is what a token is for. */
export const mcpResource = () => `${issuer()}/api/mcp`;

export const ACCESS_TOKEN_SECONDS = 60 * 60;
export const REFRESH_TOKEN_DAYS = 60;
export const CODE_SECONDS = 10 * 60;
export const REFRESH_PREFIX = "plr_";
export const CODE_PREFIX = "plo_";
export const CLIENT_PREFIX = "plc_";
export const SECRET_PREFIX = "pls_";

export const scopesSupported: ApiTokenScope[] = ["read", "write"];

/** Where the protected resource metadata for the MCP endpoint lives (RFC 9728, path appended). */
export const resourceMetadataUrl = () => `${issuer()}/.well-known/oauth-protected-resource/api/mcp`;

export function authorizationServerMetadata() {
  const base = issuer();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    scopes_supported: scopesSupported,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
    authorization_response_iss_parameter_supported: true,
    service_documentation: "https://docs.plotra.ink/docs/developers/mcp",
  };
}

export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [issuer()],
    scopes_supported: scopesSupported,
    bearer_methods_supported: ["header"],
    resource_name: "Plotra",
    resource_documentation: "https://docs.plotra.ink/docs/developers/mcp",
  };
}

/** What a 401 from the MCP endpoint says, so a client knows where to sign in (RFC 9728 §5.1). */
export const mcpChallenge = (error?: "invalid_token") =>
  `Bearer realm="plotra", resource_metadata="${resourceMetadataUrl()}"${error ? `, error="${error}"` : ""}, scope="${scopesSupported.join(" ")}"`;

/** A random, URL-safe secret with a prefix that says what it is. */
export function randomSecret(prefix: string, bytes = 32): string {
  return prefix + Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");
}

/** The PKCE S256 challenge for a verifier: base64url(SHA-256(verifier)), unpadded. */
export async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(digest).toString("base64url");
}

/** A verifier as RFC 7636 §4.1 allows: 43 to 128 unreserved characters. */
export const isVerifier = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9\-._~]{43,128}$/.test(value);

/** A challenge is a SHA-256, base64url: 43 characters. */
export const isChallenge = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Whether an app may ask to be sent back here: https anywhere, http only to
 * this computer (Claude Code and other local clients, RFC 8252), or an app's
 * own scheme (a desktop app: `cursor://…`). Never with a fragment, never one
 * that runs script.
 */
export function isAllowedRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") return loopbackHosts.has(url.hostname);
  if (["javascript:", "data:", "file:", "blob:", "vbscript:", "about:", "ftp:", "ws:", "wss:"].includes(url.protocol)) return false;
  // A private scheme: reverse-domain or the app's name, like `com.example.app:` or `cursor:`.
  return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol);
}

/** The scope a client asked for, as one of ours: write only when it asked for write. */
export function parseScope(value: unknown): ApiTokenScope {
  if (typeof value !== "string") return "read";
  const asked = value.split(/\s+/).filter(Boolean);
  return asked.includes("write") ? "write" : "read";
}

/** The scope string a token is described with. */
export const scopeString = (scope: ApiTokenScope) => (scope === "write" ? "read write" : "read");

/** A resource indicator (RFC 8707) is ours if it names this server or its MCP endpoint. */
export function isOurResource(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string") return false;
  const clean = value.replace(/\/$/, "");
  return clean === issuer() || clean === mcpResource();
}

/** The host to show a person when an app asks for access, so a stranger's app can't pass for Claude. */
export function redirectHost(uri: string): string {
  try {
    const url = new URL(uri);
    return url.host || url.protocol.replace(/:$/, "");
  } catch {
    return uri;
  }
}

export type OAuthErrorCode = "invalid_request" | "invalid_client" | "invalid_grant" | "unauthorized_client" | "unsupported_grant_type" | "invalid_scope" | "invalid_client_metadata" | "invalid_redirect_uri" | "access_denied" | "server_error" | "temporarily_unavailable";

/** The URL to send someone back to the app with, after they approved or refused. */
export function redirectWith(redirectUri: string, params: Record<string, string | undefined>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, value);
  return url.toString();
}

/** Client credentials from the token request: a Basic header or the form. */
export function clientCredentials(authorization: string | null, form: URLSearchParams): { clientId: string | null; clientSecret: string | null } {
  const match = authorization?.match(/^Basic\s+(\S+)\s*$/i);
  if (match) {
    try {
      const decoded = Buffer.from(match[1], "base64").toString("utf8");
      const colon = decoded.indexOf(":");
      if (colon > 0) return { clientId: decodeURIComponent(decoded.slice(0, colon)), clientSecret: decodeURIComponent(decoded.slice(colon + 1)) };
    } catch {
      // Fall through to the form.
    }
  }
  return { clientId: form.get("client_id"), clientSecret: form.get("client_secret") };
}

/** The CORS headers the discovery documents and the token endpoints answer with: browser-based MCP clients read them too. */
export const oauthCors: HeadersInit = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
  "access-control-max-age": "86400",
};
