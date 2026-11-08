import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { afterSignIn, browserSignInUrl, exchangeUrl, signInPage, startSignIn } from "../src/sign-in";

const CLOUD = "https://app.plotra.ink";

describe("signInPage", () => {
  test("the cloud's sign-in and sign-up pages", () => {
    expect(signInPage(`${CLOUD}/sign-in?callbackURL=%2Fw%2Fx`, CLOUD)).toBe("sign-in");
    expect(signInPage(`${CLOUD}/sign-up`, CLOUD)).toBe("sign-up");
  });
  test("not other pages, other sites, or nonsense", () => {
    expect(signInPage(`${CLOUD}/forgot-password`, CLOUD)).toBeNull();
    expect(signInPage(`${CLOUD}/`, CLOUD)).toBeNull();
    expect(signInPage("https://evil.example/sign-in", CLOUD)).toBeNull();
    expect(signInPage("not a url", CLOUD)).toBeNull();
  });
});

test("afterSignIn keeps only paths in the app", () => {
  expect(afterSignIn(`${CLOUD}/sign-in?callbackURL=%2Fw%2Fmine`)).toBe("/w/mine");
  expect(afterSignIn(`${CLOUD}/sign-in`)).toBe("/");
  expect(afterSignIn(`${CLOUD}/sign-in?callbackURL=https%3A%2F%2Fevil.example`)).toBe("/");
  expect(afterSignIn(`${CLOUD}/sign-in?callbackURL=%2F%2Fevil.example`)).toBe("/");
});

test("the browser goes to sign-in, coming back to /desktop/sign-in", () => {
  const url = new URL(browserSignInUrl(CLOUD, "sign-up", 51234, "s", "c"));
  expect(url.origin + url.pathname).toBe(`${CLOUD}/sign-up`);
  expect(url.searchParams.get("callbackURL")).toBe("/desktop/sign-in?port=51234&state=s&challenge=c");
});

test("the exchange carries the code, verifier and where to go next", () => {
  const url = new URL(exchangeUrl(CLOUD, "abc", "def", "/w/x"));
  expect(url.pathname).toBe("/api/desktop/exchange");
  expect(Object.fromEntries(url.searchParams)).toEqual({ code: "abc", verifier: "def", next: "/w/x" });
});

describe("startSignIn", () => {
  test("takes one code with the right state, on 127.0.0.1", async () => {
    const flow = await startSignIn(CLOUD, "sign-in");
    const back = new URL(new URL(flow.browserUrl).searchParams.get("callbackURL")!, CLOUD);
    const port = back.searchParams.get("port");
    const state = back.searchParams.get("state");
    expect(back.searchParams.get("challenge")).toBe(createHash("sha256").update(flow.verifier).digest("base64url"));

    expect((await fetch(`http://127.0.0.1:${port}/elsewhere`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${port}/callback?code=x&state=wrong`)).status).toBe(400);
    const ok = await fetch(`http://127.0.0.1:${port}/callback?code=the-code&state=${state}`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("Plotra is opening on your computer");
    expect(await flow.code).toBe("the-code");
  });

  test("gives up when cancelled, or after a while", async () => {
    const cancelled = await startSignIn(CLOUD, "sign-in");
    cancelled.cancel();
    await expect(cancelled.code).rejects.toThrow("Cancelled.");
    const slow = await startSignIn(CLOUD, "sign-in", { timeoutMs: 10 });
    await expect(slow.code).rejects.toThrow("too long");
  });
});
