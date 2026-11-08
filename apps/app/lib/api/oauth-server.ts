import "server-only";
import { db, schema } from "@plotra/db";
import type { ApiTokenScope } from "@plotra/db/schema";
import { and, eq, gt, lt } from "drizzle-orm";
import {
  ACCESS_TOKEN_SECONDS,
  CLIENT_PREFIX,
  CODE_PREFIX,
  CODE_SECONDS,
  isAllowedRedirectUri,
  isChallenge,
  isOurResource,
  isVerifier,
  parseScope,
  randomSecret,
  REFRESH_PREFIX,
  REFRESH_TOKEN_DAYS,
  s256,
  scopeString,
  SECRET_PREFIX,
  type OAuthErrorCode,
} from "./oauth";
import { hashToken, newToken, tokenPrefix } from "./token";

// The OAuth server's state (lib/api/oauth.ts has the rules). Nobody is signed
// in when an app registers or swaps a code for tokens, so this uses the
// server's own connection, the way a token is checked (lib/api/auth.ts). The
// one step that needs a person, approving an app, is lib/api/oauth-actions.ts.
//
// A connection is one row of api_token, per person and app: an hour's access
// token, and a refresh token that's replaced each time it's used. So a
// connected app shows in Settings next to the person's tokens, can be
// disconnected there, and is held to the same checks as any token.

const { apiToken, oauthClient, oauthCode } = schema;

export class OAuthError extends Error {
  constructor(
    public code: OAuthErrorCode,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export type OAuthClient = typeof oauthClient.$inferSelect;

const authMethods = ["none", "client_secret_post", "client_secret_basic"] as const;
type AuthMethod = (typeof authMethods)[number];
const MAX_REDIRECT_URIS = 10;

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Dynamic client registration (RFC 7591). Open to anyone: a client can do nothing until a person approves it. */
export async function registerClient(metadata: Record<string, unknown>) {
  const redirectUris = metadata.redirect_uris;
  if (!Array.isArray(redirectUris) || !redirectUris.length) throw new OAuthError("invalid_redirect_uri", "redirect_uris is required.");
  if (redirectUris.length > MAX_REDIRECT_URIS) throw new OAuthError("invalid_redirect_uri", `At most ${MAX_REDIRECT_URIS} redirect_uris.`);
  for (const uri of redirectUris) if (!isAllowedRedirectUri(uri)) throw new OAuthError("invalid_redirect_uri", `${String(uri).slice(0, 200)} can't be a redirect URI: use https, or http to localhost.`);

  const asked = metadata.token_endpoint_auth_method ?? "none";
  if (!authMethods.includes(asked as AuthMethod)) throw new OAuthError("invalid_client_metadata", "token_endpoint_auth_method must be none, client_secret_post or client_secret_basic.");
  const method = asked as AuthMethod;
  const grantTypes = Array.isArray(metadata.grant_types) ? metadata.grant_types : ["authorization_code", "refresh_token"];
  if (!grantTypes.every((g) => g === "authorization_code" || g === "refresh_token")) throw new OAuthError("invalid_client_metadata", "Only the authorization_code and refresh_token grants are supported.");
  const responseTypes = Array.isArray(metadata.response_types) ? metadata.response_types : ["code"];
  if (!responseTypes.every((r) => r === "code")) throw new OAuthError("invalid_client_metadata", "Only the code response type is supported.");
  const clientUri = typeof metadata.client_uri === "string" && /^https:\/\//.test(metadata.client_uri) ? metadata.client_uri.slice(0, 500) : null;

  const id = randomSecret(CLIENT_PREFIX, 18);
  const secret = method === "none" ? null : randomSecret(SECRET_PREFIX);
  const name = clean(metadata.client_name, 80) || "An MCP app";
  const [row] = await db
    .insert(oauthClient)
    .values({ id, name, redirectUris: redirectUris as string[], clientUri, secretHash: secret ? await hashToken(secret) : null })
    .returning();
  return {
    client_id: row.id,
    client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
    ...(secret && { client_secret: secret, client_secret_expires_at: 0 }),
    client_name: row.name,
    redirect_uris: row.redirectUris,
    ...(clientUri && { client_uri: clientUri }),
    grant_types: grantTypes,
    response_types: ["code"],
    token_endpoint_auth_method: method,
    scope: "read write",
  };
}

export async function getClient(clientId: unknown): Promise<OAuthClient | null> {
  if (typeof clientId !== "string" || !clientId.startsWith(CLIENT_PREFIX) || clientId.length > 80) return null;
  const [row] = await db.select().from(oauthClient).where(eq(oauthClient.id, clientId)).limit(1);
  return row ?? null;
}

/** The client a token request comes from, which must prove itself if it has a secret. */
async function authenticateClient(clientId: string | null, clientSecret: string | null): Promise<OAuthClient> {
  const client = await getClient(clientId);
  if (!client) throw new OAuthError("invalid_client", "Unknown client.", 401);
  if (client.secretHash && (!clientSecret || (await hashToken(clientSecret)) !== client.secretHash)) throw new OAuthError("invalid_client", "Wrong client secret.", 401);
  return client;
}

export type AuthorizeRequest = {
  client: OAuthClient;
  redirectUri: string;
  codeChallenge: string;
  scope: ApiTokenScope;
  state: string | undefined;
  resource: string | undefined;
};

/**
 * Reads an authorization request (the consent page's query, and its form
 * again when the person approves). `fatal` problems mean the app can't be
 * trusted with the answer, so it's shown here; the rest go back to the app.
 */
export async function readAuthorizeRequest(params: Record<string, string | undefined>): Promise<{ ok: true; request: AuthorizeRequest } | { ok: false; fatal: true; message: string } | { ok: false; fatal: false; redirectUri: string; state?: string; error: OAuthErrorCode; message: string }> {
  const client = await getClient(params.client_id);
  if (!client) return { ok: false, fatal: true, message: "The app asking for access isn't registered with Plotra. Try connecting again from the app." };
  // Only the registered addresses: anything else could hand the code to a stranger.
  const redirectUri = params.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) return { ok: false, fatal: true, message: "The app asked to be sent back to an address it didn't register. Try connecting again from the app." };
  const state = params.state;
  const back = (error: OAuthErrorCode, message: string) => ({ ok: false as const, fatal: false as const, redirectUri, state, error, message });
  if (params.response_type !== "code") return back("invalid_request", "response_type must be code.");
  if (params.code_challenge_method !== "S256" || !isChallenge(params.code_challenge)) return back("invalid_request", "PKCE with S256 is required.");
  if (!isOurResource(params.resource)) return back("invalid_request", "That resource isn't this server's.");
  return { ok: true, request: { client, redirectUri, codeChallenge: params.code_challenge, scope: parseScope(params.scope), state, resource: params.resource || undefined } };
}

/** A code for an app the person just approved: good once, for a few minutes. */
export async function createCode(userId: string, request: Omit<AuthorizeRequest, "state" | "client"> & { clientId: string }): Promise<string> {
  const code = randomSecret(CODE_PREFIX);
  await db.insert(oauthCode).values({
    codeHash: await hashToken(code),
    clientId: request.clientId,
    userId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    scope: request.scope,
    resource: request.resource ?? null,
    expiresAt: new Date(Date.now() + CODE_SECONDS * 1000),
  });
  // Codes nobody came back for.
  if (Math.random() < 0.05) void db.delete(oauthCode).where(lt(oauthCode.expiresAt, new Date())).catch(() => {});
  return code;
}

type TokenResponse = { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: string };

async function freshTokens() {
  const access = newToken();
  const refresh = randomSecret(REFRESH_PREFIX);
  const now = Date.now();
  return {
    access,
    refresh,
    row: {
      tokenHash: await hashToken(access),
      prefix: tokenPrefix(access),
      expiresAt: new Date(now + ACCESS_TOKEN_SECONDS * 1000),
      refreshHash: await hashToken(refresh),
      refreshExpiresAt: new Date(now + REFRESH_TOKEN_DAYS * 86_400_000),
    },
  };
}

const respond = (access: string, refresh: string, scope: ApiTokenScope): TokenResponse => ({
  access_token: access,
  token_type: "Bearer",
  expires_in: ACCESS_TOKEN_SECONDS,
  refresh_token: refresh,
  scope: scopeString(scope),
});

/** The token endpoint: a code for tokens, or a refresh token for new ones. */
export async function exchange(form: URLSearchParams, client: { clientId: string | null; clientSecret: string | null }): Promise<TokenResponse> {
  const grant = form.get("grant_type");
  if (grant !== "authorization_code" && grant !== "refresh_token") throw new OAuthError("unsupported_grant_type", "grant_type must be authorization_code or refresh_token.");
  const app = await authenticateClient(client.clientId, client.clientSecret);
  if (!isOurResource(form.get("resource"))) throw new OAuthError("invalid_request", "That resource isn't this server's.");
  return grant === "authorization_code" ? redeemCode(app, form) : refresh(app, form);
}

async function redeemCode(app: OAuthClient, form: URLSearchParams): Promise<TokenResponse> {
  const code = form.get("code");
  const verifier = form.get("code_verifier");
  if (!code || !code.startsWith(CODE_PREFIX)) throw new OAuthError("invalid_grant", "That code isn't valid.");
  if (!isVerifier(verifier)) throw new OAuthError("invalid_request", "code_verifier is required.");
  // Deleting it is what makes it single-use, even when two requests race.
  const [row] = await db.delete(oauthCode).where(eq(oauthCode.codeHash, await hashToken(code))).returning();
  if (!row || row.expiresAt <= new Date()) throw new OAuthError("invalid_grant", "That code has expired or was used already. Connect again.");
  if (row.clientId !== app.id) throw new OAuthError("invalid_grant", "That code was given to another app.");
  const redirectUri = form.get("redirect_uri");
  if (redirectUri !== null && redirectUri !== row.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri doesn't match the one the code was sent to.");
  if ((await s256(verifier)) !== row.codeChallenge) throw new OAuthError("invalid_grant", "The code_verifier doesn't match.");

  const { access, refresh, row: tokens } = await freshTokens();
  const now = new Date();
  await db.transaction(async (tx) => {
    // One connection per person and app: connecting again replaces it. And the long-dead ones go.
    await tx.delete(apiToken).where(and(eq(apiToken.userId, row.userId), eq(apiToken.clientId, app.id)));
    await tx.delete(apiToken).where(and(eq(apiToken.userId, row.userId), lt(apiToken.refreshExpiresAt, now)));
    await tx.insert(apiToken).values({ userId: row.userId, name: app.name, scope: row.scope, clientId: app.id, ...tokens });
  });
  return respond(access, refresh, row.scope);
}

async function refresh(app: OAuthClient, form: URLSearchParams): Promise<TokenResponse> {
  const token = form.get("refresh_token");
  if (!token || !token.startsWith(REFRESH_PREFIX)) throw new OAuthError("invalid_grant", "That refresh token isn't valid.");
  const oldHash = await hashToken(token);
  const { access, refresh: next, row: tokens } = await freshTokens();
  // Replaced only if it's still the current one, so a refresh token works once.
  const [row] = await db
    .update(apiToken)
    .set(tokens)
    .where(and(eq(apiToken.refreshHash, oldHash), eq(apiToken.clientId, app.id), gt(apiToken.refreshExpiresAt, new Date())))
    .returning({ scope: apiToken.scope });
  if (!row) throw new OAuthError("invalid_grant", "That refresh token has expired or was disconnected. Connect again.");
  return respond(access, next, row.scope);
}

/** Token revocation (RFC 7009): disconnects the app, whichever of its tokens it sends. Unknown tokens are fine. */
export async function revoke(token: string | null, client: { clientId: string | null; clientSecret: string | null }): Promise<void> {
  const app = await authenticateClient(client.clientId, client.clientSecret);
  if (!token) throw new OAuthError("invalid_request", "token is required.");
  const hash = await hashToken(token);
  const column = token.startsWith(REFRESH_PREFIX) ? apiToken.refreshHash : apiToken.tokenHash;
  await db.delete(apiToken).where(and(eq(column, hash), eq(apiToken.clientId, app.id)));
}
