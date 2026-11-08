import { describe, expect, test } from "bun:test";
import { clampZoom, fitZoom, MAX_ZOOM, MIN_ZOOM, parseZoom, stepZoom, zoomLabel } from "@/lib/read-zoom";

// The Read view's zoom (lib/read-zoom.ts).

describe("read view zoom", () => {
  test("steps in and out, and stays within the limits", () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });

  test("steps from a zoom between steps to the next one", () => {
    expect(stepZoom(1.03, 1)).toBe(1.1);
    expect(stepZoom(1.03, -1)).toBe(1);
  });

  test("fits the page to the width, within the limits", () => {
    expect(fitZoom(880, 880)).toBe(1);
    expect(fitZoom(1320, 880)).toBe(1.5);
    expect(fitZoom(100, 880)).toBe(MIN_ZOOM);
    expect(fitZoom(0, 880)).toBe(1);
  });

  test("reads back what was stored, or 100%", () => {
    expect(parseZoom("1.25")).toBe(1.25);
    expect(parseZoom("9")).toBe(MAX_ZOOM);
    expect(parseZoom("nope")).toBe(1);
    expect(parseZoom(null)).toBe(1);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(zoomLabel(0.67)).toBe("67%");
  });
});
