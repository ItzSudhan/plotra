import { ApiError, body, json, withApi } from "@/lib/api/handler";
import { isLocalMode } from "@/lib/local-mode";
import { getPushPreference, registerDevice, setPushPreference, unregisterDevice } from "@/lib/push";
import { isExpoToken } from "@/lib/push-message";

// Push notifications on the phone app (lib/push.ts).
// GET    /api/mobile/push: { enabled } — whether you want pushes on your phones at all.
// POST   /api/mobile/push { expoToken, platform: "ios" | "android" }: this phone wants them.
// PATCH  /api/mobile/push { enabled: boolean }: phone notifications on or off, for all your phones.
// DELETE /api/mobile/push { expoToken? }: this phone stops getting them (signing out does this too).
// All with the phone's own token: a phone is tied to the token it registered with.

const notHere = () => json({ error: "Phone notifications need Plotra Cloud or a self-hosted server." }, 404);

export function GET(request: Request) {
  if (isLocalMode) return notHere();
  return withApi(request, "read", async (caller) => json({ enabled: await getPushPreference(caller.session.user.id) }));
}

export function POST(request: Request) {
  if (isLocalMode) return notHere();
  return withApi(request, "write", async (caller) => {
    const { expoToken, platform } = await body<{ expoToken?: unknown; platform?: unknown }>(request);
    if (!isExpoToken(expoToken)) throw new ApiError(400, "Send this phone's Expo push token as expoToken.");
    if (platform !== "ios" && platform !== "android") throw new ApiError(400, 'platform must be "ios" or "android".');
    await registerDevice(caller.session.user.id, caller.tokenId, expoToken, platform);
    return json({ ok: true, enabled: await getPushPreference(caller.session.user.id) });
  });
}

export function PATCH(request: Request) {
  if (isLocalMode) return notHere();
  return withApi(request, "write", async (caller) => {
    const { enabled } = await body<{ enabled?: unknown }>(request);
    if (typeof enabled !== "boolean") throw new ApiError(400, "Send enabled: true or false.");
    await setPushPreference(caller.session.user.id, enabled);
    return json({ ok: true, enabled });
  });
}

export function DELETE(request: Request) {
  if (isLocalMode) return notHere();
  return withApi(request, "read", async (caller) => {
    // The body is optional: without a token, every phone signed in with this one is forgotten.
    let expoToken: unknown = null;
    if (request.headers.get("content-type")?.includes("application/json")) expoToken = (await body<{ expoToken?: unknown }>(request)).expoToken;
    await unregisterDevice(caller.session.user.id, caller.tokenId, isExpoToken(expoToken) ? expoToken : null);
    return new Response(null, { status: 204 });
  });
}
