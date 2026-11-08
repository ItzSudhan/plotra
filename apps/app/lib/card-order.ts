import { generateKeyBetween } from "fractional-indexing";

/**
 * The new position for an item moved one place left (-1) or right (1) among
 * its siblings, which are in order; null when it's already at that end. Pure.
 */
export function stepPosition(siblings: ReadonlyArray<{ id: string; position: string }>, id: string, step: -1 | 1): string | null {
  const at = siblings.findIndex((s) => s.id === id);
  if (at < 0) return null;
  const to = at + step;
  if (to < 0 || to >= siblings.length) return null;
  // Between the neighbour it jumps over and the one beyond that.
  const [before, after] = step < 0 ? [siblings[to - 1], siblings[to]] : [siblings[to], siblings[to + 1]];
  try {
    return generateKeyBetween(before?.position ?? null, after?.position ?? null);
  } catch {
    // Two siblings share a position, so there's no key between them.
    return null;
  }
}
