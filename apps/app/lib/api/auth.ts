import "server-only";
import { db, schema } from "@plotra/db";
import type { ApiTokenScope } from "@plotra/db/schema";
import { eq } from "drizzle-orm";
import type { Session } from "../data";
import { bearerToken, hashToken, isTokenShaped } from "./token";

// Who an API request is (beat-the-competitors.md step 9). The token is looked
// up with the owner connection: nobody is signed in yet, which is the point.
// Everything after this runs as the token's owner, under row-level security,
// through the same access checks as the app (lib/api/handler.ts).

const { apiToken, user } = schema;

/** `clientId` is set for an app that connected through OAuth (lib/api/oauth-server.ts): its tokens are for the MCP endpoint only. */
export type ApiCaller = { session: Session; scope: ApiTokenScope; tokenId: string; clientId: string | null };

// When a token was last used is for the list in Settings: a minute is precise enough.
const TOUCH_EVERY_MS = 60_000;

export async function authenticate(request: Request): Promise<ApiCaller | null> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token || !isTokenShaped(token)) return null;
  const tokenHash = await hashToken(token);
  const [row] = await db
    .select({ token: apiToken, user })
    .from(apiToken)
    .innerJoin(user, eq(apiToken.userId, user.id))
    .where(eq(apiToken.tokenHash, tokenHash))
    .limit(1);
  if (!row) return null;
  const now = new Date();
  if (row.token.expiresAt && row.token.expiresAt <= now) return null;
  if (!row.token.lastUsedAt || now.getTime() - row.token.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    void db.update(apiToken).set({ lastUsedAt: now }).where(eq(apiToken.id, row.token.id)).catch(() => {});
  }
  // A session in the shape Better Auth hands out, so the rest of the app can't tell the difference.
  const session = {
    user: row.user,
    session: {
      id: `api:${row.token.id}`,
      token: "",
      userId: row.user.id,
      createdAt: row.token.createdAt,
      updatedAt: now,
      expiresAt: row.token.expiresAt ?? new Date(now.getTime() + 3600_000),
      ipAddress: null,
      userAgent: request.headers.get("user-agent"),
      activeOrganizationId: null,
    },
  } as unknown as Session;
  return { session, scope: row.token.scope, tokenId: row.token.id, clientId: row.token.clientId };
}
