import type { KeyboardEvent } from "react";

// The keyboard half of the WAI-ARIA tabs pattern: Left / Right move along a
// row of tabs and wrap at its ends, Home and End go to the first and last.
// Only one tab of a row is in the Tab order (a roving tabindex).

/** The tab a key moves to from `current` in a row of `count`, or null when the key isn't one of the row's. */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  const from = current < 0 || current >= count ? 0 : current;
  switch (key) {
    case "ArrowRight":
      return (from + 1) % count;
    case "ArrowLeft":
      return (from - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** Whether a tab is the one of its row in the Tab order: the selected one, or the first while none is. */
export function rovingTabIndex(index: number, selected: number): 0 | -1 {
  return index === (selected < 0 ? 0 : selected) ? 0 : -1;
}

/**
 * A tablist's onKeyDown: moves focus to the tab the key names and selects it
 * straight away (automatic activation), as a click would.
 */
export function onTabKeyDown(event: KeyboardEvent<HTMLElement>, select: (index: number) => void) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const tabs = [...event.currentTarget.querySelectorAll<HTMLElement>(':scope > [role="tab"]')];
  const current = tabs.indexOf(event.target as HTMLElement);
  if (current < 0) return;
  const next = nextTabIndex(event.key, current, tabs.length);
  if (next === null) return;
  event.preventDefault();
  tabs[next].focus();
  if (next !== current) select(next);
}
