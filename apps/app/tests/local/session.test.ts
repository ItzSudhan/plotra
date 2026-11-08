import { afterEach, describe, expect, test } from "bun:test";
import { mayOpenLocalSession } from "@/lib/local-person";

// Only the desktop app's own window may sign in as local mode's one person.

const request = (header?: string) => new Request("http://127.0.0.1:4000/api/local/session", { headers: header ? { "x-plotra-local": header } : {} });

afterEach(() => {
  delete process.env.PLOTRA_LOCAL_TOKEN;
});

describe("opening the local session", () => {
  test("is open to any request when the app sets no token (next dev by hand)", () => {
    expect(mayOpenLocalSession(request())).toBe(true);
  });

  test("needs the desktop app's token when it sets one", () => {
    process.env.PLOTRA_LOCAL_TOKEN = "s3cret-token-from-the-app";
    expect(mayOpenLocalSession(request())).toBe(false);
    expect(mayOpenLocalSession(request("wrong"))).toBe(false);
    expect(mayOpenLocalSession(request("s3cret-token-from-the-app"))).toBe(true);
  });
});
