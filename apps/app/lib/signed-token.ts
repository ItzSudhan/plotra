import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Short-lived tokens this server signs and later takes back: a JSON body and an
// HMAC of it, `<body>.<mac>`, both base64url. Used by direct uploads, where the
// first request checks what may be sent and the second trusts what it checked
// (app/api/files/store.ts, lib/io/plotra-upload.ts). `purpose` goes into the
// MAC, so a token made for one thing can't be spent on another.

function secret(): string {
  const value = [process.env.BETTER_AUTH_SECRET, process.env.AI_KEY_SECRET].find((candidate) => (candidate ?? "").length >= 16);
  if (!value) throw new Error("This server has no secret to sign uploads with (BETTER_AUTH_SECRET).");
  return value;
}

const mac = (purpose: string, body: string) => createHmac("sha256", secret()).update(`plotra/${purpose}/v1:${body}`).digest("base64url");

/** Signs `claims`, which must carry `exp` (seconds since the epoch). */
export function signToken(purpose: string, claims: { exp: number }): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${mac(purpose, body)}`;
}

/** What a token says, if this server signed it for `purpose` and it hasn't run out (with `graceSeconds` to spare). */
export function readToken<T extends { exp: number }>(purpose: string, token: string, graceSeconds = 0): T | null {
  const [body, given, extra] = token.split(".");
  if (!body || !given || extra !== undefined) return null;
  const expected = Buffer.from(mac(purpose, body));
  const received = Buffer.from(given);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    return typeof claims?.exp === "number" && claims.exp + graceSeconds > Date.now() / 1000 ? claims : null;
  } catch {
    return null;
  }
}
