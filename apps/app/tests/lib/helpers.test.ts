import { describe, expect, test } from "bun:test";
import { errorFromBody, errorText, expose, publicMessage, UserError } from "@/lib/errors";
import { decode, encode } from "@/lib/read-codec";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  test("folds accents and lowercases", () => {
    expect(slugify("Café Noir")).toBe("cafe-noir");
    expect(slugify("Ångström Über Señor")).toBe("angstrom-uber-senor");
  });

  test("punctuation and spaces become single dashes, never at the ends", () => {
    expect(slugify("  The Ninth Bell: Part 2!  ")).toBe("the-ninth-bell-part-2");
    expect(slugify("Romeo & Juliet -- a draft")).toBe("romeo-juliet-a-draft");
    expect(slugify("...")).toBe("");
  });

  test("stops at 48 characters", () => {
    const slug = slugify("a".repeat(60));
    expect(slug).toBe("a".repeat(48));
    expect(slugify("word ".repeat(20)).length).toBeLessThanOrEqual(48);
  });

  test("text in a non-Latin script gives an empty string, so callers fall back to a default", () => {
    expect(slugify("物語の部屋")).toBe("");
    expect(slugify("Мастерская")).toBe("");
  });
});

describe("read codec", () => {
  test("a round trip keeps nested dates, arrays and null", () => {
    const value = {
      title: "The Ninth Bell",
      updatedAt: new Date("2026-10-20T12:34:56.789Z"),
      nothing: null,
      scenes: [{ id: "a", at: new Date("1820-06-01T00:00:00.000Z"), tags: ["x", "y"] }, null, 3],
    };
    const back = decode<typeof value>(encode(value));
    expect(back).toEqual(value);
    expect(back.updatedAt).toBeInstanceOf(Date);
    expect((back.scenes[0] as { at: Date }).at).toBeInstanceOf(Date);
  });

  test("a bare date round-trips", () => {
    const date = new Date("2000-01-01T00:00:00.000Z");
    expect(decode<Date>(encode(date))).toEqual(date);
  });

  test("an object with a $date key next to other keys stays an object", () => {
    const value = { $date: "2026-10-20T00:00:00.000Z", note: "not a date" };
    expect(decode(encode(value))).toEqual(value);
    expect(decode(JSON.stringify({ $date: 42 }))).toEqual({ $date: 42 });
  });
});

describe("user-facing errors", () => {
  test("a UserError's message is read back by errorText, even after Next replaces the message", () => {
    const error = new UserError("Give your project a title.");
    expect(errorText(error)).toBe("Give your project a title.");
    // What a production client receives: a generic message and the digest.
    const onClient = Object.assign(new Error("An error occurred in the Server Components render."), { digest: error.digest });
    expect(errorText(onClient)).toBe("Give your project a title.");
  });

  test("a plain Error passed through expose keeps its message in publicMessage", () => {
    expect(publicMessage(expose(new Error("That folder is in the trash.")))).toBe("That folder is in the trash.");
    expect(publicMessage(new Error("That folder is in the trash."))).toBe("That folder is in the trash.");
  });

  test("subclasses and errors with a cause give the fallback", () => {
    class DatabaseError extends Error {}
    expect(publicMessage(new DatabaseError('relation "node" does not exist'))).toBe("Something went wrong. Try again in a moment.");
    expect(publicMessage(new Error("Failed query: select ...", { cause: new Error("connection refused") }))).toBe("Something went wrong. Try again in a moment.");
    expect(publicMessage(new TypeError("x is undefined"), "Couldn't save.")).toBe("Couldn't save.");
    expect(publicMessage("a string")).toBe("Something went wrong. Try again in a moment.");
  });

  test("errorText hides Next's 'omitted in production' stand-in", () => {
    const stand = new Error("An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details.");
    expect(errorText(stand)).toBe("Something went wrong. Try again in a moment.");
    expect(errorText(stand, "Couldn't load.")).toBe("Couldn't load.");
    expect(errorText(new Error("Network down"))).toBe("Network down");
    expect(errorText(null)).toBe("Something went wrong. Try again in a moment.");
  });

  test("a malformed digest is ignored", () => {
    const error = Object.assign(new Error("Plain"), { digest: "PLOTRA:{not json" });
    expect(errorText(error)).toBe("Plain");
    expect(publicMessage(error)).toBe("Something went wrong. Try again in a moment.");
  });

  test("errorFromBody rebuilds a UserError, with the fallback for an empty body", () => {
    const error = errorFromBody("Name taken.");
    expect(error).toBeInstanceOf(UserError);
    expect(errorText(error)).toBe("Name taken.");
    expect(errorText(errorFromBody("", "Couldn't rename."))).toBe("Couldn't rename.");
  });
});
