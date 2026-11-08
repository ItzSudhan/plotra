import { oauthEndpoint, oauthJson, preflight } from "@/lib/api/oauth-http";
import { OAuthError, registerClient } from "@/lib/api/oauth-server";

// POST /api/oauth/register: dynamic client registration (RFC 7591), how
// Claude's connectors and other MCP clients introduce themselves. A
// registered app can only ask: a signed-in person still has to approve it.
export async function POST(request: Request) {
  return oauthEndpoint("register", { limit: 20, windowSeconds: 3600 }, async () => {
    const metadata = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new OAuthError("invalid_client_metadata", "Send the client's metadata as a JSON object.");
    return oauthJson(await registerClient(metadata), 201);
  });
}

export const OPTIONS = preflight;
