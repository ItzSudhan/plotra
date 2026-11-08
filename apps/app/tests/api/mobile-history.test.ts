import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { restoreUpdate, toMobileVersions } from "@/lib/api/mobile-history";
import { valueToYdoc, ydocToValue } from "@/lib/collab/ydoc";
import type { VersionRow } from "@/lib/workflow-actions";

// A note's version history for the phone app (app/api/mobile/history).

const at = new Date("2026-10-01T10:00:00Z");
const row = (over: Partial<VersionRow>): VersionRow => ({ id: "v1", name: null, auto: true, wordCount: 10, size: 100, createdById: "ana", createdAt: at, ...over });
const people = [{ id: "ana", name: "Ana Lima", image: null, guest: false }];

describe("versions for the phone", () => {
  test("name who saved them, and let only them or a manager delete", () => {
    const rows = [row({ id: "v1", createdById: "ana" }), row({ id: "v2", createdById: "ben", name: "Draft two", auto: false }), row({ id: "v3", createdById: null })];
    const asBen = toMobileVersions(rows, people, { id: "ben", name: "Ben" }, { edit: true, manage: false });
    expect(asBen.map((v) => [v.id, v.authorName, v.canDelete])).toEqual([
      ["v1", "Ana Lima", false],
      ["v2", "Ben", true],
      ["v3", null, false],
    ]);
    expect(toMobileVersions(rows, people, { id: "ben", name: "Ben" }, { edit: true, manage: true }).every((v) => v.canDelete)).toBe(true);
    // Reading only: nothing to delete.
    expect(toMobileVersions(rows, people, { id: "ana", name: "Ana" }, { edit: false, manage: false }).some((v) => v.canDelete)).toBe(false);
  });
});

describe("restoring a version", () => {
  const p = (id: string, text: string) => ({ type: "p", id, children: [{ text }] });

  test("turns the live document back into the version", () => {
    const state = valueToYdoc([p("a", "Kept."), p("b", "Written since.")]);
    const update = restoreUpdate(state, [p("a", "Kept."), p("c", "As it was.")]);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, state);
    Y.applyUpdate(doc, update);
    expect(ydocToValue(Y.encodeStateAsUpdate(doc)).map((b) => (b.children as { text: string }[])[0].text)).toEqual(["Kept.", "As it was."]);
    doc.destroy();
  });

  test("sends nothing when the note already reads that way", () => {
    const value = [p("a", "Same.")];
    expect(restoreUpdate(valueToYdoc(value), value).length).toBe(0);
  });
});
