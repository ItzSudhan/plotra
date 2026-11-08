"use client";

// Very large map pictures (beat-the-competitors.md, step 5): one picture of
// 16,000 pixels a side takes a gigabyte of memory to show at once, and most of
// the time the map is zoomed out. Above OVERVIEW pixels on a side, the browser
// cuts the picture once, when it's chosen: a smaller overview, and full-size
// tiles, each uploaded as a file of the map. The map shows the overview until
// it's zoomed in past what the overview can show, then only the tiles on screen.

/** The largest side shown as one picture. */
export const OVERVIEW = 4096;
/** Tiles of this size, or larger when that would make too many (a note holds 100 files). */
const TILE_SIZES = [2048, 4096, 8192];
const MAX_TILES = 80;

export type Cut = {
  overview: { blob: Blob; width: number; height: number };
  size: number;
  cols: number;
  rows: number;
  /** Row by row. */
  tiles: () => AsyncGenerator<Blob>;
};

/** Whether a picture of this size is cut into tiles. */
export const needsTiles = (width: number, height: number) => Math.max(width, height) > OVERVIEW;

export function tileSize(width: number, height: number): number {
  return TILE_SIZES.find((size) => Math.ceil(width / size) * Math.ceil(height / size) <= MAX_TILES) ?? TILE_SIZES.at(-1)!;
}

async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  // A browser that can't write WebP hands back a PNG instead: JPEG is smaller.
  if (webp?.type === "image/webp") return webp;
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  if (!jpeg) throw new Error("This browser couldn't cut the picture.");
  return jpeg;
}

/** Cuts a large picture into an overview and tiles. Throws when the browser can't open a picture that large. */
export async function cutPicture(file: File, width: number, height: number): Promise<Cut> {
  const bitmap = await createImageBitmap(file);
  const scale = OVERVIEW / Math.max(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser couldn't cut the picture.");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const overview = { blob: await encode(canvas), width: canvas.width, height: canvas.height };

  const size = tileSize(width, height);
  const cols = Math.ceil(width / size);
  const rows = Math.ceil(height / size);
  return {
    overview,
    size,
    cols,
    rows,
    tiles: async function* () {
      try {
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const w = Math.min(size, width - col * size);
            const h = Math.min(size, height - row * size);
            const tile = document.createElement("canvas");
            tile.width = w;
            tile.height = h;
            tile.getContext("2d")!.drawImage(bitmap, col * size, row * size, w, h, 0, 0, w, h);
            yield await encode(tile);
          }
        }
      } finally {
        bitmap.close();
      }
    },
  };
}

/** The tiles that cross the part of the picture on screen, as [col, row]. */
export function visibleTiles(
  view: { left: number; top: number; right: number; bottom: number },
  tiles: { size: number; cols: number; rows: number },
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const c0 = Math.max(0, Math.floor(view.left / tiles.size));
  const c1 = Math.min(tiles.cols - 1, Math.floor(view.right / tiles.size));
  const r0 = Math.max(0, Math.floor(view.top / tiles.size));
  const r1 = Math.min(tiles.rows - 1, Math.floor(view.bottom / tiles.size));
  for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) out.push([col, row]);
  return out;
}
