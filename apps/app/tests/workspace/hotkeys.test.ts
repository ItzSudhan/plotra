import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { browserReserved } from "@/components/workspace/hotkeys";
import { viewMeta } from "@/components/workspace/view-meta";
import { formatShortcuts } from "@/lib/editor-shortcuts";

// Default shortcuts must reach Plotra: the browser takes some combos first (ux-audit.md #13).

// The provider builds its commands inside React, so its defaults are read from the source.
const provider = readFileSync(join(import.meta.dir, "../../components/workspace/workspace-provider.tsx"), "utf8");
const providerKeys = [...provider.matchAll(/hotkey:[^,\n]*/g)].flatMap((m) => [...m[0].matchAll(/"((?:mod|alt|ctrl|shift)\+[^"]+|f\d+)"/g)].map((k) => k[1]));
const viewKeys = (viewMeta as ReadonlyArray<{ id: string; hotkey?: string }>).flatMap((view) => (view.hotkey ? [view.hotkey] : []));

describe("browserReserved", () => {
  test("knows the combos browsers keep", () => {
    for (const keys of ["mod+t", "mod+n", "mod+w", "mod+l", "mod+d", "mod+shift+t", "mod+shift+r", "mod+shift+c", "mod+shift+b", "mod+shift+delete"]) expect(browserReserved(keys)).toBe(true);
    for (const keys of ["mod+p", "mod+o", "mod+alt+shift+t", "mod+shift+f", "alt+w", "f2"]) expect(browserReserved(keys)).toBe(false);
  });
});

describe("default shortcuts", () => {
  test("were found", () => {
    expect(providerKeys.length).toBeGreaterThan(15);
    expect(viewKeys.length).toBeGreaterThan(1);
  });

  test("none is one the browser keeps", () => {
    for (const keys of [...providerKeys, ...viewKeys, ...formatShortcuts.map((s) => s.keys)]) expect(browserReserved(keys)).toBe(false);
  });

  test("no two commands share one", () => {
    const all = [...providerKeys, ...viewKeys];
    expect(new Set(all).size).toBe(all.length);
  });

  test("the moved ones are where they went", () => {
    expect(provider).toContain('hotkey: "mod+alt+shift+t"');
    expect(provider).toContain('hotkey: "mod+alt+shift+b"');
    const byId = Object.fromEntries((viewMeta as ReadonlyArray<{ id: string; hotkey?: string }>).map((view) => [view.id, view.hotkey]));
    expect(byId.codex).toBe("mod+alt+shift+c");
    expect(byId.relationships).toBe("mod+alt+shift+r");
  });
});
