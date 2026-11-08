/** The most a project title holds (lib/actions.ts, `createProject`). */
const MAX_TITLE = 120;

/**
 * The title of a project's duplicate: "Hamlet (copy)". A long title is cut,
 * not the "(copy)", so it still reads as the copy it is.
 */
export function duplicateTitle(title: string): string {
  const suffix = " (copy)";
  const base = (title.trim() || "Untitled").slice(0, MAX_TITLE - suffix.length).trimEnd();
  return `${base}${suffix}`;
}
