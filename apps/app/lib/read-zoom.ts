// Zoom for the Read view's pages: steps, limits, and what's remembered on this
// device. Zoom only changes how big the pages look on screen; pagination is
// measured at full size and printing is always at 100%.

export const READ_ZOOM_KEY = "plotra:read-zoom";
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;
const STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

/** A zoom within the limits, rounded to whole percent. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) * 100) / 100;
}

/** The next step in (`dir` 1) or out (-1) from `zoom`, which may sit between steps after Fit width. */
export function stepZoom(zoom: number, dir: 1 | -1): number {
  const next = dir > 0 ? STEPS.find((s) => s > zoom + 0.001) : STEPS.findLast((s) => s < zoom - 0.001);
  return next ?? (dir > 0 ? MAX_ZOOM : MIN_ZOOM);
}

/** The zoom that makes a `pageWidth` page fill `available` pixels. */
export function fitZoom(available: number, pageWidth: number): number {
  if (!(available > 0) || !(pageWidth > 0)) return 1;
  return clampZoom(available / pageWidth);
}

/** A stored zoom, or 100% when there's none or it's nonsense. */
export function parseZoom(stored: string | null | undefined): number {
  const n = Number(stored);
  return stored && Number.isFinite(n) && n > 0 ? clampZoom(n) : 1;
}

export const zoomLabel = (zoom: number) => `${Math.round(zoom * 100)}%`;
