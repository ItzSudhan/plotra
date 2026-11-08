import { describe, expect, test } from "bun:test";
import { propertyTypes } from "@plotra/db/schema";
import { beatSheetGroups, beatSheets, cleanOwnSheets, cleanSheet, sheetFrom } from "@/lib/beat-sheets";
import { entityGallery, galleryFor } from "@/lib/entity-gallery";
import { cleanShell } from "@/lib/shell-prefs";
import { indexNodes, type BinderNode } from "@/lib/tree";
import { defaultEntityTypes, entityIcons } from "@/lib/world";

// Story structures and worldbuilding types (beat-the-competitors.md, step 4).

describe("the built-in beat sheets", () => {
  test("each has a unique id, a group, acts with beats, and places that only move forward", () => {
    expect(new Set(beatSheets.map((s) => s.id)).size).toBe(beatSheets.length);
    expect(beatSheets.length).toBeGreaterThanOrEqual(17);
    for (const sheet of beatSheets) {
      expect(sheet.group && sheet.group !== "yours" && sheet.group in beatSheetGroups).toBe(true);
      const beats = sheet.acts.flatMap((act) => act.beats);
      expect(beats.length).toBeGreaterThan(0);
      for (const b of beats) {
        expect(b.title.trim()).toBe(b.title);
        expect(b.synopsis.length).toBeGreaterThan(5);
        expect(b.at).toBeGreaterThanOrEqual(0);
        expect(b.at).toBeLessThanOrEqual(100);
      }
      const places = beats.map((b) => b.at);
      expect(places).toEqual([...places].sort((a, b) => a - b));
      // A built-in sheet survives the cleaning a sheet of your own gets.
      expect(cleanSheet({ ...sheet, id: undefined })?.acts).toEqual(sheet.acts);
    }
  });

  test("every group but yours has some", () => {
    for (const group of Object.keys(beatSheetGroups).filter((g) => g !== "yours")) expect(beatSheets.some((s) => s.group === group)).toBe(true);
  });
});

const node = (id: string, parentId: string | null, kind: string, title: string, position: string, synopsis: string | null = null, deleted = false) =>
  ({ id, parentId, kind, title, position, synopsis, deletedAt: deleted ? new Date() : null }) as unknown as BinderNode;

describe("a folder saved as a beat sheet", () => {
  const nodes = [
    node("f", null, "folder", "My heist", "a", "Four acts of a job going wrong."),
    node("p", "f", "scene", "Prologue", "a", "The vault, years before."),
    node("c1", "f", "chapter", "The crew", "b"),
    node("s1", "c1", "scene", "The ask", "a", "Someone needs a thing stolen. (≈12% in)"),
    node("s2", "c1", "scene", "Recruiting", "b"),
    node("trash", "c1", "scene", "Cut", "c", null, true),
    node("c2", "f", "chapter", "The job", "c"),
    node("sub", "c2", "folder", "Inside", "a"),
    node("s3", "sub", "scene", "The vault", "a"),
  ];

  test("chapters are acts, notes are beats, loose notes make an act of their own; places are spread evenly", () => {
    const sheet = sheetFrom(indexNodes(nodes), "f")!;
    expect(sheet.title).toBe("My heist");
    expect(sheet.description).toBe("Four acts of a job going wrong.");
    expect(sheet.group).toBe("yours");
    expect(sheet.id).toMatch(/^own-/);
    expect(sheet.acts.map((a) => [a.title, a.beats.map((b) => [b.title, b.at])])).toEqual([
      ["My heist", [["Prologue", 0]]],
      ["The crew", [["The ask", 33], ["Recruiting", 67]]],
      ["The job", [["The vault", 100]]],
    ]);
    // The place a sheet adds to each synopsis isn't saved with it.
    expect(sheet.acts[1].beats[0].synopsis).toBe("Someone needs a thing stolen.");
  });

  test("a chapter is one act; an empty folder or a note is nothing", () => {
    expect(sheetFrom(indexNodes(nodes), "c1")!.acts.map((a) => a.title)).toEqual(["The crew"]);
    expect(sheetFrom(indexNodes([node("e", null, "folder", "Empty", "a")]), "e")).toBeNull();
    expect(sheetFrom(indexNodes(nodes), "s1")).toBeNull();
  });

  test("they're kept with the person's settings, cleaned and capped", () => {
    const sheet = sheetFrom(indexNodes(nodes), "f")!;
    const kept = cleanShell({ beatSheets: [sheet, { title: "Nothing in it", acts: [] }, "junk"] }).beatSheets!;
    expect(kept).toHaveLength(1);
    expect(kept[0]).toEqual({ id: sheet.id, title: sheet.title, description: sheet.description, acts: sheet.acts });
    expect(cleanOwnSheets(Array.from({ length: 20 }, () => sheet))).toHaveLength(12);
    const huge = cleanSheet({ title: "x".repeat(500), acts: [{ title: "A", beats: Array.from({ length: 500 }, (_, i) => ({ title: `B${i}`, synopsis: "y".repeat(5000), at: 999 })) }] })!;
    expect(huge.title).toHaveLength(80);
    expect(huge.acts[0].beats).toHaveLength(120);
    expect(huge.acts[0].beats[0].synopsis).toHaveLength(500);
    expect(huge.acts[0].beats[0].at).toBe(100);
  });
});

describe("the entry-type gallery", () => {
  test("every type would pass the server's checks", () => {
    expect(new Set(entityGallery.map((t) => t.name)).size).toBe(entityGallery.length);
    for (const type of entityGallery) {
      expect(entityIcons).toContain(type.icon);
      expect(type.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(type.name.length).toBeLessThanOrEqual(80);
      expect(type.plural.length).toBeLessThanOrEqual(80);
      expect(type.schema.length).toBeGreaterThan(0);
      expect(type.schema.length).toBeLessThanOrEqual(40);
      expect(new Set(type.schema.map((f) => f.key)).size).toBe(type.schema.length);
      for (const field of type.schema) {
        expect(field.key).toMatch(/^[a-z0-9][a-z0-9-]{0,59}$/);
        expect(propertyTypes).toContain(field.type);
        expect(field.label.length).toBeLessThanOrEqual(60);
      }
    }
  });

  test("offers only what the project hasn't got", () => {
    const names = galleryFor(["deity", " Spell ", ...defaultEntityTypes.map((t) => t.name)]).map((t) => t.name);
    expect(names).not.toContain("Deity");
    expect(names).not.toContain("Spell");
    expect(names).not.toContain("Language");
    expect(names).toContain("Artifact");
  });
});
