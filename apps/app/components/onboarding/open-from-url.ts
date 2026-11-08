// A project link can name the note to open: `?open=<note id>`. A new project
// uses it to land on its first scene with the cursor already in the text
// (plan.md Phase 8 "Onboarding"), and a sample on its first scene.
// `&caret=end` puts the cursor at the end of that note instead of the start:
// a project from the Cold Open opens on text that is already there.

export type OpenParam = { id: string; atEnd: boolean };

// What was last taken from the address bar. In development React mounts the
// panes twice, and the second mount would otherwise find the address already clean.
let taken: (OpenParam & { path: string; at: number }) | null = null;

/** Reads the note to open from the address bar and removes it, so a reload doesn't open it again. */
export function takeOpenParam(): OpenParam | null {
  const url = new URL(window.location.href);
  const id = url.searchParams.get("open");
  if (!id) return taken && taken.path === url.pathname && Date.now() - taken.at < 3000 ? taken : null;
  taken = { id, atEnd: url.searchParams.get("caret") === "end", path: url.pathname, at: Date.now() };
  url.searchParams.delete("open");
  url.searchParams.delete("caret");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return taken;
}

/**
 * Puts the cursor in an editor that may still be mounting: its handle exists
 * as soon as the document has synced, a moment before the text is on screen.
 * Gives up after about a second, or as soon as the writer has focused
 * something themselves.
 */
export function focusWhenMounted(focus: () => void) {
  const before = document.activeElement;
  let tries = 0;
  const attempt = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest("[data-slate-editor]")) return;
    // Don't take the cursor away from wherever they've clicked meanwhile.
    if (active !== before && active !== document.body) return;
    try {
      focus();
    } catch {
      // Not mounted yet.
    }
    if (++tries < 12) setTimeout(attempt, 90);
  };
  setTimeout(attempt, 0);
}
