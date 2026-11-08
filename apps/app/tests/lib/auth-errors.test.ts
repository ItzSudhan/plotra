import { describe, expect, test } from "bun:test";
import { authErrorText, isExistingAccount } from "@/lib/auth-errors";

// Better Auth's errors reach people in plain words (sign-in, settings, invitations).

describe("authErrorText", () => {
  test("maps codes first", () => {
    expect(authErrorText({ code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" })).toMatch(/don't match/);
    expect(authErrorText({ code: "ORGANIZATION_SLUG_ALREADY_TAKEN" })).toMatch(/web address is taken/);
    expect(authErrorText({ body: { code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER" } })).toMatch(/only owner/);
  });

  test("uses the status when there is no known code", () => {
    expect(authErrorText({ status: 429, message: "Too many requests" })).toMatch(/Wait a minute/);
    expect(authErrorText({ status: 0 })).toMatch(/Couldn't reach Plotra/);
  });

  test("keeps sentences written for people, and hides code-like messages", () => {
    expect(authErrorText({ message: "You're the only owner of Ink Club. Make someone else an owner first." })).toMatch(/^You're the only owner of Ink Club/);
    expect(authErrorText({ message: "TypeError: undefined is not a function" }, "Fallback.")).toBe("Fallback.");
    expect(authErrorText(null, "Fallback.")).toBe("Fallback.");
  });

  test("recognises an email that already has an account", () => {
    expect(isExistingAccount({ code: "USER_ALREADY_EXISTS" })).toBe(true);
    expect(isExistingAccount({ code: "INVALID_EMAIL" })).toBe(false);
  });
});
