import { describe, expect, test } from "bun:test";
import { errorText, OFFLINE, statusText } from "@/lib/errors";
import { readableOn } from "@/lib/colors";

describe("friendly errors", () => {
  test("network failures become a sentence about the connection", () => {
    expect(errorText(new TypeError("Failed to fetch"))).toBe(OFFLINE);
    expect(errorText(new TypeError("NetworkError when attempting to fetch resource."))).toBe(OFFLINE);
  });

  test("auth library messages are translated", () => {
    expect(errorText(new Error("User already exists. Use another email."))).toContain("Sign in instead");
    expect(errorText(new Error("Invalid email or password"))).toContain("reset your password");
  });

  test("code-like messages fall back", () => {
    expect(errorText(new Error("Cannot read properties of undefined (reading 'id')"), "Couldn't save.")).toBe("Couldn't save.");
    expect(errorText(new Error('{"error":"bad"}'), "Couldn't save.")).toBe("Couldn't save.");
    expect(errorText(new RangeError("Invalid array length"), "Couldn't save.")).toBe("Couldn't save.");
  });

  test("our own sentences pass through", () => {
    expect(errorText(new Error("That folder is in the trash."))).toBe("That folder is in the trash.");
  });

  test("statuses have words", () => {
    expect(statusText(413)).toBe("That file is too large.");
    expect(statusText(503)).toContain("try again");
  });
});

describe("readableOn", () => {
  test("picks dark text on light colours and white on dark ones", () => {
    expect(readableOn("#ffd43b")).toBe("#161412");
    expect(readableOn("#1971c2")).toBe("#ffffff");
    expect(readableOn("not a colour")).toBe("#ffffff");
  });
});
