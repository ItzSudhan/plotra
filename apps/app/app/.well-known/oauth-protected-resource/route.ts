import { protectedResourceMetadata } from "@/lib/api/oauth";
import { oauthJson, preflight } from "@/lib/api/oauth-http";

// Protected resource metadata (RFC 9728) for the MCP endpoint, at the root for
// clients that look here instead of under /api/mcp.
export function GET() {
  return oauthJson(protectedResourceMetadata(), 200, { "cache-control": "public, max-age=3600" });
}

export const OPTIONS = preflight;
