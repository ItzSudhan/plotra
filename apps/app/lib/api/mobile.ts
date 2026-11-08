import "server-only";
import { db, schema } from "@plotra/db";
import { and, eq, isNull } from "drizzle-orm";
import { ApiError } from "./handler";
import { hashToken, MAX_TOKENS, newToken, tokenPrefix } from "./token";

// The phone app's token (app/api/mobile/token). It's an ordinary API token
// that can write, listed in Settings → API tokens as "Plotra app on …", so it
// can be revoked there like any other. Signing in again on the same phone
// replaces the old one rather than piling them up.

const { apiToken } = schema;

/** A phone stays signed in for a year, then signs in again. */
export const MOBILE_TOKEN_DAYS = 365;

/** Made with the owner connection: the person has no session here, only the code they just redeemed. */
export async function issueMobileToken(userId: string, name: string): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.delete(apiToken).where(and(eq(apiToken.userId, userId), eq(apiToken.name, name), isNull(apiToken.clientId)));
    const existing = await tx.$count(apiToken, and(eq(apiToken.userId, userId), isNull(apiToken.clientId)));
    if (existing >= MAX_TOKENS) throw new ApiError(409, `You have ${MAX_TOKENS} API tokens already. Revoke one you don't use in Settings → API tokens, then sign in again.`);
    const token = newToken();
    await tx.insert(apiToken).values({
      userId,
      name,
      tokenHash: await hashToken(token),
      prefix: tokenPrefix(token),
      scope: "write",
      expiresAt: new Date(Date.now() + MOBILE_TOKEN_DAYS * 86_400_000),
    });
    return token;
  });
}

/** Signing out of the app: its token stops working at once. */
export async function revokeMobileToken(tokenId: string): Promise<void> {
  await db.delete(apiToken).where(eq(apiToken.id, tokenId));
}
