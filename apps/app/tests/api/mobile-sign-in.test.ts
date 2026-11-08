import { describe, expect, test } from "bun:test";
import { mobileCallback, mobileTokenName, readMobileRequest } from "@/lib/mobile-sign-in";

// The phone app's sign-in through the browser (apps/mobile/lib/sign-in.ts).

const key = (c: string) => c.repeat(43);

describe("mobile sign-in", () => {
  test("takes only a well-formed state and challenge", () => {
    expect(readMobileRequest({ state: key("a"), challenge: key("b") })).toEqual({ state: key("a"), challenge: key("b") });
    expect(readMobileRequest({ state: "short", challenge: key("b") })).toBeNull();
    expect(readMobileRequest({ state: key("a") })).toBeNull();
    expect(readMobileRequest({ state: [key("a")], challenge: key("b") })).toBeNull();
  });

  test("hands the code back to the app's own link, never a web address", () => {
    const url = new URL(mobileCallback({ state: key("s"), challenge: key("c") }, key("x")));
    expect(url.protocol).toBe("plotra:");
    expect(url.searchParams.get("code")).toBe(key("x"));
    expect(url.searchParams.get("state")).toBe(key("s"));
    expect(url.searchParams.has("challenge")).toBe(false);
  });

  test("names the token after the phone, without anything odd in it", () => {
    expect(mobileTokenName("Alex’s iPhone")).toBe("Plotra app on Alex’s iPhone");
    expect(mobileTokenName("<script>\n  Pixel 9")).toBe("Plotra app on script Pixel 9");
    expect(mobileTokenName(undefined)).toBe("Plotra app");
    expect(mobileTokenName("x".repeat(200)).length).toBeLessThanOrEqual(64);
  });
});
