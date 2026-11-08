import "server-only";
import { auth } from "@plotra/auth";
import { db, schema } from "@plotra/db";
import { eq } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Local mode's one person (local-mode-plan.md, phase 2). They have an account
 * like anyone's, so every part of the app that expects one works unchanged,
 * but they never see a sign-in form: /api/local/session signs them in.
 *
 * The password is derived from the library's own secret (BETTER_AUTH_SECRET,
 * which the desktop app keeps in the library folder), so it is never stored or
 * shown, and a library moved to another computer still opens.
 */

export const LOCAL_EMAIL = "you@plotra.local";

function localPassword(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Local mode needs BETTER_AUTH_SECRET.");
  return createHmac("sha256", secret).update("plotra-local-person").digest("hex");
}

/**
 * Whether a request may sign in as the local person. The desktop app sends a
 * secret header from its own window (PLOTRA_LOCAL_TOKEN), so another browser on
 * this computer that finds the app's port gets nowhere. Without the variable
 * (`next dev` by hand), any request may.
 */
export function mayOpenLocalSession(request: Request): boolean {
  const expected = process.env.PLOTRA_LOCAL_TOKEN;
  if (!expected) return true;
  const given = request.headers.get("x-plotra-local") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Signs the local person in, creating them on the library's first run, and
 * returns the Set-Cookie headers that carry the session.
 */
export async function signInLocalPerson(): Promise<string[]> {
  const password = localPassword();
  const [existing] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, LOCAL_EMAIL));
  const name = process.env.PLOTRA_LOCAL_NAME?.trim() || "You";
  const response = existing
    ? await auth.api.signInEmail({ body: { email: LOCAL_EMAIL, password, rememberMe: true }, asResponse: true })
    : await auth.api.signUpEmail({ body: { email: LOCAL_EMAIL, password, name }, asResponse: true });
  if (!response.ok) throw new Error(`Couldn't open the library (${response.status}): ${await response.text()}`);
  return response.headers.getSetCookie();
}
