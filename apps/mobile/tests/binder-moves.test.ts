import { describe, expect, test } from "bun:test";
import { applyMove, canStep, moveTargets, subtreeOf } from "../src/lib/tree";
import type { Note } from "../src/lib/types";

// Moving notes on the phone: what "Move to…" offers, and the binder shown while the server moves it.

const note = (id: string, parentId: string | null, kind: Note["kind"] = "scene"): Note => ({
  id,
  parentId,
  kind,
  title: id,
  synopsis: null,
  tags: [],
  aliases: [],
  status: null,
  wordCount: 0,
  updatedAt: "2026-01-01T00:00:00.000Z",
  canEdit: true,
  revealReleaseId: null,
});

// Part (Ch1 (S1, S2), Ch2), Loose
const notes = [note("Part", null, "folder"), note("Ch1", "Part", "chapter"), note("S1", "Ch1"), note("S2", "Ch1"), note("Ch2", "Part", "chapter"), note("Loose", null)];
const order = (list: Note[] | null) => list?.map((n) => `${n.id}<${n.parentId ?? "top"}`);

describe("moving notes", () => {
  test("Move to… offers folders and chapters outside the note", () => {
    expect(moveTargets(notes, "S1").map((t) => [t.note.id, t.depth])).toEqual([["Part", 0], ["Ch1", 1], ["Ch2", 1]]);
    expect(moveTargets(notes, "Ch1").map((t) => t.note.id)).toEqual(["Part", "Ch2"]);
    expect([...subtreeOf(notes, "Ch1")]).toEqual(["Ch1", "S1", "S2"]);
  });

  test("steps", () => {
    expect(canStep(notes, "S1", "up")).toBe(false);
    expect(canStep(notes, "S1", "out")).toBe(true);
    expect(canStep(notes, "Loose", "out")).toBe(false);
    expect(order(applyMove(notes, "S2", { step: "up" }))).toEqual(order([notes[0], notes[1], notes[3], notes[2], notes[4], notes[5]]));
    // A chapter moves with what's inside it.
    expect(order(applyMove(notes, "Ch1", { step: "down" }))).toEqual(["Part<top", "Ch2<Part", "Ch1<Part", "S1<Ch1", "S2<Ch1", "Loose<top"]);
    expect(order(applyMove(notes, "Ch2", { step: "in" }))).toEqual(["Part<top", "Ch1<Part", "S1<Ch1", "S2<Ch1", "Ch2<Ch1", "Loose<top"]);
    expect(order(applyMove(notes, "S1", { step: "out" }))).toEqual(["Part<top", "Ch1<Part", "S2<Ch1", "S1<Part", "Ch2<Part", "Loose<top"]);
  });

  test("into a folder, or next to a note", () => {
    expect(order(applyMove(notes, "Loose", { parentId: "Ch2" }))).toEqual(["Part<top", "Ch1<Part", "S1<Ch1", "S2<Ch1", "Ch2<Part", "Loose<Ch2"]);
    expect(order(applyMove(notes, "S1", { parentId: null }))).toEqual(["Part<top", "Ch1<Part", "S2<Ch1", "Ch2<Part", "Loose<top", "S1<top"]);
    expect(order(applyMove(notes, "Loose", { before: "S1" }))).toEqual(["Part<top", "Ch1<Part", "Loose<Ch1", "S1<Ch1", "S2<Ch1", "Ch2<Part"]);
    expect(order(applyMove(notes, "Loose", { after: "Ch1" }))).toEqual(["Part<top", "Ch1<Part", "S1<Ch1", "S2<Ch1", "Loose<Part", "Ch2<Part"]);
  });

  test("never into itself", () => {
    expect(applyMove(notes, "Ch1", { parentId: "S1" })).toBeNull();
    expect(applyMove(notes, "Part", { before: "Ch2" })).toBeNull();
  });
});
