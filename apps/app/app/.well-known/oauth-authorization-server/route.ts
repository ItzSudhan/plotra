import { authorizationServerMetadata } from "@/lib/api/oauth";
import { oauthJson, preflight } from "@/lib/api/oauth-http";

// OAuth authorization server metadata (RFC 8414): where an MCP client signs in.
export function GET() {
  return oauthJson(authorizationServerMetadata(), 200, { "cache-control": "public, max-age=3600" });
}

export const OPTIONS = preflight;
