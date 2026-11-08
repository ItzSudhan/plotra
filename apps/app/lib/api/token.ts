// API tokens (beat-the-competitors.md step 9): what one looks like and how
// it's kept. Pure, so it can be tested; lib/api/auth.ts looks them up.

export const TOKEN_PREFIX = "plt_";

/** A new token: `plt_` and 32 random bytes, URL-safe. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return TOKEN_PREFIX + Buffer.from(bytes).toString("base64url");
}

/** What's kept instead of the token: its SHA-256, hex. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Buffer.from(digest).toString("hex");
}

/** The part of a token shown in a list, to tell them apart. */
export const tokenPrefix = (token: string) => token.slice(0, TOKEN_PREFIX.length + 6);

/** Looks like one of ours: anything else is turned away before the database is asked. */
export const isTokenShaped = (token: string) => token.startsWith(TOKEN_PREFIX) && /^[A-Za-z0-9_-]{40,60}$/.test(token.slice(TOKEN_PREFIX.length));

/** The token in an `Authorization: Bearer …` header, if there is one. */
export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)\s*$/i);
  return match ? match[1] : null;
}

export const MAX_TOKENS = 20;
export const TOKEN_EXPIRY_DAYS = [null, 30, 90, 365] as const;
