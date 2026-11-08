import { clientCredentials, oauthCors } from "@/lib/api/oauth";
import { oauthEndpoint, preflight, readForm } from "@/lib/api/oauth-http";
import { revoke } from "@/lib/api/oauth-server";

// POST /api/oauth/revoke (RFC 7009): an app disconnects itself.
export async function POST(request: Request) {
  return oauthEndpoint("revoke", { limit: 60, windowSeconds: 60 }, async () => {
    const form = await readForm(request);
    await revoke(form.get("token"), clientCredentials(request.headers.get("authorization"), form));
    return new Response(null, { status: 200, headers: { "cache-control": "no-store", ...oauthCors } });
  });
}

export const OPTIONS = preflight;
