import { describe, expect, test } from "bun:test";
import { kindsFile, readKindsFile } from "@/lib/kinds-file";

// World-bible kinds as a file (lib/kinds-file.ts).

describe("a kinds file", () => {
  const faction = { name: "Faction", plural: "Factions", icon: "flag-linear", color: "#c2255c", schema: [{ key: "leader", label: "Leader", type: "node" as const }] };

  test("reads back what it wrote", () => {
    expect(readKindsFile(kindsFile([faction]))).toEqual([faction]);
  });

  test("fills in a plural, and refuses anything that isn't one", () => {
    expect(readKindsFile(JSON.stringify({ format: "plotra-kinds", version: 1, kinds: [{ name: " Spell " }, { name: "" }, 4] }))).toEqual([
      { name: "Spell", plural: "Spells", icon: "box-linear", color: "#868e96", schema: [] },
    ]);
    expect(() => readKindsFile("{}")).toThrow("isn't a Plotra kinds file");
    expect(() => readKindsFile("not json")).toThrow("isn't a Plotra kinds file");
    expect(() => readKindsFile(JSON.stringify({ format: "plotra-kinds", version: 9, kinds: [] }))).toThrow("newer Plotra");
  });
});
