import { describe, expect, test } from "bun:test";
import { pathOf, resolveLink, totalWords, visibleRows } from "../src/lib/tree";
import type { Note } from "../src/lib/types";

const note = (id: string, parentId: string | null, extra: Partial<Note> = {}): Note => ({
  id,
  parentId,
  kind: "scene",
  title: id,
  synopsis: null,
  tags: [],
  aliases: [],
  status: null,
  wordCount: 10,
  updatedAt: "2026-01-01T00:00:00.000Z",
  canEdit: true,
  ...extra,
});

const notes = [note("Part", null, { kind: "folder", wordCount: 0 }), note("Ch1", "Part", { kind: "chapter" }), note("S1", "Ch1"), note("S2", "Ch1"), note("Lone", "gone"), note("Juliet", null, { kind: "character", aliases: ["Jules"] })];

describe("binder rows", () => {
  test("closed folders hide what's inside", () => {
    expect(visibleRows(notes, new Set()).map((r) => r.note.id)).toEqual(["Part", "Lone", "Juliet"]);
  });

  test("open ones show it, indented", () => {
    const rows = visibleRows(notes, new Set(["Part", "Ch1"]));
    expect(rows.map((r) => [r.note.id, r.depth])).toEqual([["Part", 0], ["Ch1", 1], ["S1", 2], ["S2", 2], ["Lone", 0], ["Juliet", 0]]);
    expect(rows[0]).toMatchObject({ hasChildren: true, open: true });
    expect(rows[2]).toMatchObject({ hasChildren: false, open: false });
  });

  test("words, paths and links", () => {
    expect(totalWords(notes, "Part")).toBe(30);
    expect(totalWords(notes, null)).toBe(50);
    expect(pathOf(notes, "S2")).toEqual(["Part", "Ch1"]);
    expect(resolveLink(notes, "juliet")?.id).toBe("Juliet");
    expect(resolveLink(notes, "JULES")?.id).toBe("Juliet");
    expect(resolveLink(notes, "Nobody")).toBeUndefined();
  });
});
