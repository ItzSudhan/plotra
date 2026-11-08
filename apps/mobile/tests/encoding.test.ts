import { describe, expect, test } from "bun:test";
import { base64url, cleanServer, toBase64url } from "../src/lib/encoding";

describe("encoding", () => {
  test("base64url matches Node's", () => {
    for (const length of [0, 1, 2, 3, 31, 32, 33]) {
      const bytes = crypto.getRandomValues(new Uint8Array(length));
      expect(base64url(bytes)).toBe(Buffer.from(bytes).toString("base64url"));
    }
    expect(base64url(new Uint8Array(32))).toHaveLength(43);
  });

  test("a digest's base64 as base64url", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    expect(toBase64url(Buffer.from(bytes).toString("base64"))).toBe(Buffer.from(bytes).toString("base64url"));
  });

  test("server addresses", () => {
    expect(cleanServer("plotra.example.com")).toBe("https://plotra.example.com");
    expect(cleanServer("http://192.168.1.4:3000/w/home")).toBe("http://192.168.1.4:3000");
    expect(cleanServer("  https://app.plotra.ink/  ")).toBe("https://app.plotra.ink");
    expect(cleanServer("ftp://x")).toBeNull();
    expect(cleanServer("")).toBeNull();
  });
});
