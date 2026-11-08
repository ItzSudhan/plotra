import { describe, expect, test } from "bun:test";
import { anchorFrom, toMobileThreads } from "@/lib/api/mobile-comments";
import type { CommentThreadRow } from "@/lib/workflow-actions";

// What the phone app is sent for a note's comments (app/api/mobile/comments).

const at = new Date("2026-10-01T10:00:00Z");
const thread = (over: Partial<CommentThreadRow>): CommentThreadRow => ({
  id: "t1",
  anchor: { start: "AQID", end: "BAUG" },
  quote: "In the spring of 1912",
  reaction: null,
  resolvedAt: null,
  resolvedById: null,
  createdById: "ana",
  createdAt: at,
  comments: [],
  ...over,
});
const people = [{ id: "ana", name: "Ana Lima", image: "https://x/a.png", guest: false }];

describe("comments for the phone", () => {
  test("name their authors, mark the caller's own, and give dates as text", () => {
    const [t] = toMobileThreads(
      [
        thread({
          resolvedAt: at,
          comments: [
            { id: "c1", authorId: "ana", body: "Right year?", createdAt: at, editedAt: at },
            { id: "c2", authorId: "ben", body: "Yes.", createdAt: at, editedAt: null },
            { id: "c3", authorId: null, body: "Gone.", createdAt: at, editedAt: null },
          ],
        }),
      ],
      people,
      "ben",
    );
    expect(t).toMatchObject({ id: "t1", resolved: true, quote: "In the spring of 1912", createdAt: "2026-10-01T10:00:00.000Z" });
    expect(t.comments[0]).toEqual({ id: "c1", body: "Right year?", authorId: "ana", authorName: "Ana Lima", authorImage: "https://x/a.png", createdAt: at.toISOString(), editedAt: at.toISOString(), mine: false });
    expect(t.comments[1]).toMatchObject({ authorName: null, mine: true, editedAt: null });
    // A former member's comment: no name, and never anyone's own.
    expect(t.comments[2]).toMatchObject({ authorId: "", authorName: null, mine: false });
  });

  test("leave out one-click reactions", () => {
    expect(toMobileThreads([thread({ reaction: "❤️" }), thread({ id: "t2" })], people, "ana").map((t) => t.id)).toEqual(["t2"]);
  });

  test("take a position, none, or turn a bad one down", () => {
    expect(anchorFrom({ start: "a", end: "b" })).toEqual({ start: "a", end: "b" });
    expect(anchorFrom(null)).toBeNull();
    expect(anchorFrom(undefined)).toBeNull();
    expect(anchorFrom("a")).toBeUndefined();
    expect(anchorFrom({ start: 1 })).toBeUndefined();
  });
});
