import { auth } from "@plotra/auth";
import { authenticate } from "@/lib/api/auth";
import { describeError, json } from "@/lib/api/handler";
import { issueMobileToken, revokeMobileToken } from "@/lib/api/mobile";
import { isLocalMode } from "@/lib/local-mode";
import { mobileTokenName } from "@/lib/mobile-sign-in";
import { checkRateLimit } from "@/lib/rate-limit";

// POST   /api/mobile/token { code, verifier, device }: the phone app swaps the
//        one-time code from /mobile/sign-in for an API token (lib/api/mobile.ts).
// DELETE /api/mobile/token, with the token: signing out of the app revokes it.

export async function POST(request: Request) {
  if (isLocalMode) return json({ error: "Not found." }, 404);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { ok, retryAfterSeconds } = await checkRateLimit("mobile-token", ip, { limit: 30, windowSeconds: 600 });
  if (!ok) return json({ error: "Too many tries. Wait a little and sign in again." }, 429, { "retry-after": String(retryAfterSeconds) });
  let input: { code?: unknown; verifier?: unknown; device?: unknown };
  try {
    input = (await request.json()) as typeof input;
  } catch {
    return json({ error: "The body isn't a JSON object." }, 400);
  }
  try {
    const { userId } = await auth.api.redeemAppCode({ body: { code: String(input.code ?? ""), verifier: String(input.verifier ?? "") } });
    const token = await issueMobileToken(userId, mobileTokenName(input.device));
    return json({ token });
  } catch (error) {
    const status = (error as { statusCode?: unknown }).statusCode;
    if (status === 401) return json({ error: "That sign-in has expired. Sign in again." }, 401);
    const described = describeError(error);
    return json({ error: described.message }, described.status);
  }
}

export async function DELETE(request: Request) {
  const caller = await authenticate(request);
  if (!caller || caller.clientId) return json({ error: "Not signed in." }, 401);
  await revokeMobileToken(caller.tokenId);
  return new Response(null, { status: 204 });
}
