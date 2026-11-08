import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { signCookieValue } from "@/lib/api/auth-session";

// The phone's brief Better Auth session (lib/api/auth-session.ts) is only
// accepted if its cookie is signed exactly as Better Auth signs its own.

const require_ = createRequire(require.resolve("better-auth"));
const betterCall = require_("better-call") as { serializeSignedCookie: (key: string, value: string, secret: string) => Promise<string> };

describe("session cookie", () => {
  test("is signed as better-call signs cookies", async () => {
    for (const [value, secret] of [
      ["abc123", "a-secret"],
      ["x".repeat(32), "another secret with spaces / and +"],
    ]) {
      expect(`k=${await signCookieValue(value, secret)}`).toBe(await betterCall.serializeSignedCookie("k", value, secret));
    }
  });
});
