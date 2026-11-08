import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { createHash, randomBytes } from "node:crypto";
import * as z from "zod";

// Signing the desktop app in to Plotra Cloud (apps/desktop/src/sign-in.ts).
// The app opens the person's browser, where they sign in as they would on the
// web (Google won't sign anyone in inside an app's own window). The browser
// then hands a one-time code to the app, on a port of its own at 127.0.0.1,
// and the app's window swaps the code for a session of its own.
//
// The code is useless without the verifier only the app holds (as in OAuth's
// PKCE): the app sends its SHA-256 (the challenge) when it opens the browser.
// Both endpoints are server-only: the app reaches them through
// apps/app/app/desktop/sign-in (the code) and apps/app/app/api/desktop/exchange
// (the session), which do the checks a page and a route need.

/** How long a code waits for the app to swap it. */
const CODE_TTL_MS = 5 * 60 * 1000;
const identifier = (code: string) => `desktop-sign-in:${code}`;

/** Base64url of 32 random bytes: what the app's verifier and challenge both look like. */
export const isDesktopKey = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);

const challengeOf = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

const expiredError = () => new APIError("UNAUTHORIZED", { message: "That sign-in has expired. Sign in again from the app." });

type Verifications = { consumeVerificationValue(identifier: string): Promise<{ value: string } | null> };

/** Uses up a code, if it's still good and the verifier matches: whose it was. */
async function redeem(adapter: Verifications, { code, verifier }: { code: string; verifier: string }): Promise<string> {
  if (!isDesktopKey(code) || !isDesktopKey(verifier)) throw expiredError();
  const row = await adapter.consumeVerificationValue(identifier(code));
  if (!row) throw expiredError();
  let stored: { userId?: string; challenge?: string };
  try {
    stored = JSON.parse(row.value);
  } catch {
    throw expiredError();
  }
  if (!stored.userId || stored.challenge !== challengeOf(verifier)) throw expiredError();
  return stored.userId;
}

export const desktopSignIn = () =>
  ({
    id: "desktop-sign-in",
    endpoints: {
      /** A one-time code for the signed-in person, bound to the app's challenge. */
      createDesktopCode: createAuthEndpoint(
        "/desktop/code",
        { method: "POST", body: z.object({ challenge: z.string() }), use: [sessionMiddleware], metadata: { SERVER_ONLY: true } },
        async (ctx) => {
          const { challenge } = ctx.body;
          if (!isDesktopKey(challenge)) throw new APIError("BAD_REQUEST", { message: "The app's sign-in link is incomplete." });
          const code = randomBytes(32).toString("base64url");
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: identifier(code),
            value: JSON.stringify({ userId: ctx.context.session.user.id, challenge }),
            expiresAt: new Date(Date.now() + CODE_TTL_MS),
          });
          return ctx.json({ code });
        },
      ),
      /**
       * The phone app's half (apps/mobile): swaps a code and its verifier for
       * whose it is, once. The app gets an API token for them, not a cookie
       * (apps/app/app/api/mobile/token).
       */
      redeemAppCode: createAuthEndpoint(
        "/desktop/redeem",
        { method: "POST", body: z.object({ code: z.string(), verifier: z.string() }), metadata: { SERVER_ONLY: true } },
        async (ctx) => {
          return ctx.json({ userId: await redeem(ctx.context.internalAdapter, ctx.body) });
        },
      ),
      /** Swaps a code (once, while it lasts) and its verifier for a session, set as the usual cookie. */
      exchangeDesktopCode: createAuthEndpoint(
        "/desktop/exchange",
        { method: "POST", body: z.object({ code: z.string(), verifier: z.string() }), metadata: { SERVER_ONLY: true } },
        async (ctx) => {
          const user = await ctx.context.internalAdapter.findUserById(await redeem(ctx.context.internalAdapter, ctx.body));
          if (!user) throw expiredError();
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ ok: true });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
