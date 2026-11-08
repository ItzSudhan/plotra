/**
 * Alt text on a picture in the editor (`alt` on an `img` node). What a writer
 * types is tidied before it is stored: line breaks and runs of spaces become
 * one space, the ends are trimmed, and it is cut to `ALT_MAX` characters.
 * Nothing left means the picture has no alt text.
 */
export const ALT_MAX = 500;

export function cleanAlt(raw: string): string | undefined {
  const alt = raw.replace(/\s+/g, " ").trim().slice(0, ALT_MAX).trim();
  return alt || undefined;
}

/** The change to make to a picture node: set `alt`, remove it, or nothing when it is already so. */
export function altChange(current: unknown, raw: string): { set: string } | { unset: true } | null {
  const next = cleanAlt(raw);
  const now = typeof current === "string" && current !== "" ? current : undefined;
  if (next === now) return null;
  return next === undefined ? { unset: true } : { set: next };
}
