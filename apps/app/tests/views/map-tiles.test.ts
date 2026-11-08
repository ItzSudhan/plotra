import { describe, expect, test } from "bun:test";
import { needsTiles, OVERVIEW, tileSize, visibleTiles } from "@/components/views/map-tiles";

// Very large map pictures (components/views/map-tiles.ts): when a picture is
// cut, how big its tiles are, and which are on screen.

describe("map tiles", () => {
  test("only a picture larger than the overview is cut", () => {
    expect(needsTiles(OVERVIEW, 3000)).toBe(false);
    expect(needsTiles(OVERVIEW + 1, 3000)).toBe(true);
  });

  test("tiles get larger rather than more than a note can hold", () => {
    expect(tileSize(8000, 8000)).toBe(2048);
    expect(tileSize(20000, 20000)).toBe(4096);
    expect(tileSize(40000, 30000)).toBe(4096);
    expect(tileSize(50000, 40000)).toBe(8192);
  });

  test("the tiles crossing what's on screen, and none past the picture's edge", () => {
    const tiles = { size: 2048, cols: 4, rows: 3 };
    expect(visibleTiles({ left: 100, top: 100, right: 1900, bottom: 1900 }, tiles)).toEqual([[0, 0]]);
    expect(visibleTiles({ left: 2100, top: 2100, right: 4200, bottom: 2200 }, tiles)).toEqual([
      [1, 1],
      [2, 1],
    ]);
    expect(visibleTiles({ left: -500, top: -500, right: 99999, bottom: 99999 }, tiles)).toHaveLength(12);
  });
});
