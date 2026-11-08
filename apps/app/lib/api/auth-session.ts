import "server-only";
import { auth } from "@plotra/auth";
import { isApiRequest, requireSession } from "../data";

// Better Auth's own API (workspaces: members, invitations, roles) reads who is
// asking from the session cookie, and runs its own rules and hooks from there
// (the invitation email, "an owner can't be removed", …). A request from the
// phone app carries an API token instead (lib/api/handler.ts), so for one call
// this makes a session for the same person that lasts two minutes, sends its
// cookie, and deletes it straight after. The person is whoever the token
// already acts as: nothing is reachable this way that the token couldn't do
// through the app's own checks, which run first.

const LIFETIME_MS = 2 * 60 * 1000;

/** How Better Auth signs a cookie's value (better-call's signCookieValue): HMAC-SHA256, base64, then URL-encoded. */
export async function signCookieValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return encodeURIComponent(`${value}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`);
}

/** Runs `fn` with headers Better Auth accepts as the signed-in person's: the request's own, or a brief session for an API request. */
export async function withAuthHeaders<T>(requestHeaders: Headers, fn: (h: Headers) => Promise<T>): Promise<T> {
  if (!isApiRequest()) return fn(requestHeaders);
  const { user } = await requireSession();
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(user.id, true, { expiresAt: new Date(Date.now() + LIFETIME_MS) }, true);
  try {
    const cookie = `${ctx.authCookies.sessionToken.name}=${await signCookieValue(session.token, ctx.secret)}`;
    return await fn(new Headers({ cookie }));
  } finally {
    await ctx.internalAdapter.deleteSession(session.token).catch(() => {});
  }
}
