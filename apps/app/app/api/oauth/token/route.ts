import { clientCredentials } from "@/lib/api/oauth";
import { oauthEndpoint, oauthJson, preflight, readForm } from "@/lib/api/oauth-http";
import { exchange } from "@/lib/api/oauth-server";

// POST /api/oauth/token: an approved app swaps its code for tokens, and its
// refresh token for new ones when the hour is up.
export async function POST(request: Request) {
  return oauthEndpoint("token", { limit: 120, windowSeconds: 60 }, async () => {
    const form = await readForm(request);
    return oauthJson(await exchange(form, clientCredentials(request.headers.get("authorization"), form)));
  });
}

export const OPTIONS = preflight;
