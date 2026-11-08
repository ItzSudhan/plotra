import { describe, expect, test } from "bun:test";
import { staysInWindow } from "../src/navigation";

describe("where the window may go", () => {
  const cloud = "https://app.plotra.ink/w/mine";
  const local = "http://127.0.0.1:51234/";

  test("the app's own pages stay", () => {
    expect(staysInWindow("https://app.plotra.ink/settings", cloud, "cloud")).toBe(true);
    expect(staysInWindow("http://127.0.0.1:51234/w/x", local, "local")).toBe(true);
  });

  test("the website opens in the browser, not the app", () => {
    expect(staysInWindow("https://plotra.ink/", cloud, "cloud")).toBe(false);
    expect(staysInWindow("https://www.plotra.ink/pricing", cloud, "cloud")).toBe(false);
    expect(staysInWindow("https://docs.plotra.ink/docs", cloud, "cloud")).toBe(false);
    expect(staysInWindow("https://www.plotra.ink/", local, "local")).toBe(false);
  });

  test("the cloud may sign in through Google; a library never leaves this computer", () => {
    expect(staysInWindow("https://accounts.google.com/o/oauth2/auth", cloud, "cloud")).toBe(true);
    expect(staysInWindow("https://accounts.google.com/o/oauth2/auth", local, "local")).toBe(false);
  });

  test("a lookalike host isn't the website", () => {
    expect(staysInWindow("https://notplotra.ink/", cloud, "cloud")).toBe(true);
  });
});
