"use server";

import { schema } from "@plotra/db";
import { apiTokenScopes, type ApiTokenScope } from "@plotra/db/schema";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { isApiRequest, requireSession } from "../data";
import { userDb } from "../db";
import { rateLimit } from "../rate-limit";
import { readOnly, transaction } from "../request-cache";
import { hashToken, MAX_TOKENS, newToken, TOKEN_EXPIRY_DAYS, tokenPrefix } from "./token";

// Settings → API tokens (beat-the-competitors.md step 9). A person's tokens
// are theirs alone (row-level security: api_token_own). The token itself is
// returned once, from createApiToken, and never kept.

const { apiToken } = schema;

export type ApiTokenRow = { id: string; name: string; prefix: string; scope: ApiTokenScope; createdAt: Date; lastUsedAt: Date | null; expiresAt: Date | null };

const columns = { id: apiToken.id, name: apiToken.name, prefix: apiToken.prefix, scope: apiToken.scope, createdAt: apiToken.createdAt, lastUsedAt: apiToken.lastUsedAt, expiresAt: apiToken.expiresAt };

/** A token can't make or see tokens: only the person, signed in, can. */
function assertSignedIn() {
  if (isApiRequest()) throw new Error("Tokens are managed in Settings, not through the API.");
}

/** The tokens the person made themselves. */
export async function listApiTokens(): Promise<ApiTokenRow[]> {
  return readOnly(async () => {
    assertSignedIn();
    const { user } = await requireSession();
    return userDb((tx) => tx.select(columns).from(apiToken).where(and(eq(apiToken.userId, user.id), isNull(apiToken.clientId))).orderBy(desc(apiToken.createdAt)));
  });
}

/** An app connected through OAuth (lib/api/oauth-server.ts): Claude, say. Disconnected with revokeApiToken. */
export type ConnectedAppRow = { id: string; name: string; scope: ApiTokenScope; createdAt: Date; lastUsedAt: Date | null; refreshExpiresAt: Date | null };

export async function listConnectedApps(): Promise<ConnectedAppRow[]> {
  return readOnly(async () => {
    assertSignedIn();
    const { user } = await requireSession();
    return userDb((tx) =>
      tx
        .select({ id: apiToken.id, name: apiToken.name, scope: apiToken.scope, createdAt: apiToken.createdAt, lastUsedAt: apiToken.lastUsedAt, refreshExpiresAt: apiToken.refreshExpiresAt })
        .from(apiToken)
        .where(and(eq(apiToken.userId, user.id), isNotNull(apiToken.clientId)))
        .orderBy(desc(apiToken.createdAt)),
    );
  });
}

export async function createApiToken(name: string, scope: ApiTokenScope, expiresInDays: number | null): Promise<{ token: string; row: ApiTokenRow }> {
  return transaction(async () => {
    assertSignedIn();
    const { user } = await requireSession();
    await rateLimit("api-token", user.id, { limit: 20, windowSeconds: 3600 });
    const clean = typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    if (!clean) throw new Error("Give the token a name, so you know what it's for.");
    if (!apiTokenScopes.includes(scope)) throw new Error("Unknown scope.");
    if (!(TOKEN_EXPIRY_DAYS as readonly (number | null)[]).includes(expiresInDays)) throw new Error("Unknown expiry.");
    const existing = await userDb((tx) => tx.select({ id: apiToken.id }).from(apiToken).where(and(eq(apiToken.userId, user.id), isNull(apiToken.clientId))));
    if (existing.length >= MAX_TOKENS) throw new Error(`You have ${MAX_TOKENS} tokens already. Revoke one you don't use first.`);
    const token = newToken();
    const [row] = await userDb(async (tx) =>
      tx
        .insert(apiToken)
        .values({
          userId: user.id,
          name: clean,
          tokenHash: await hashToken(token),
          prefix: tokenPrefix(token),
          scope,
          expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null,
        })
        .returning(columns),
    );
    return { token, row };
  });
}

export async function revokeApiToken(id: string): Promise<void> {
  return transaction(async () => {
    assertSignedIn();
    // Row-level security keeps this to the person's own tokens.
    await userDb((tx) => tx.delete(apiToken).where(eq(apiToken.id, id)));
  });
}
