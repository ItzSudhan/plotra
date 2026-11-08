import { systemPreferences, type BrowserWindow } from "electron";

/**
 * Windows fade in as they open and out as they close, so a window arriving or
 * leaving feels like a page turning rather than a cut. Only where windows can
 * be see-through (macOS and Windows), and not for someone who asked their
 * system for less motion.
 */
function canFade(): boolean {
  if (process.platform === "linux") return false;
  try {
    return !systemPreferences.getAnimationSettings().prefersReducedMotion;
  } catch {
    return true;
  }
}

const fading = new WeakMap<BrowserWindow, ReturnType<typeof setInterval>>();

function fade(win: BrowserWindow, to: number, ms: number, done?: () => void) {
  clearInterval(fading.get(win));
  const from = win.getOpacity();
  const start = Date.now();
  const timer = setInterval(() => {
    if (win.isDestroyed()) return clearInterval(timer);
    const t = Math.min(1, (Date.now() - start) / ms);
    // Ease out: quick at first, settling at the end.
    win.setOpacity(from + (to - from) * (1 - (1 - t) ** 3));
    if (t < 1) return;
    clearInterval(timer);
    fading.delete(win);
    done?.();
  }, 16);
  fading.set(win, timer);
}

/** Shows `win`, fading it in. `inactive` shows it without bringing it to the front. */
export function showGently(win: BrowserWindow, { inactive = false }: { inactive?: boolean } = {}) {
  if (win.isDestroyed()) return;
  const show = () => (inactive ? win.showInactive() : win.show());
  if (!canFade()) return show();
  win.setOpacity(0);
  show();
  fade(win, 1, 220);
}

const closing = new WeakSet<BrowserWindow>();

/** A window fading out on its way to closing: no longer one of the app's open windows. */
export const isClosing = (win: BrowserWindow) => closing.has(win);

/** Closes `win` once it has faded out. */
export function closeGently(win: BrowserWindow) {
  if (win.isDestroyed()) return;
  if (!canFade() || !win.isVisible()) return win.close();
  closing.add(win);
  fade(win, 0, 150, () => !win.isDestroyed() && win.close());
}
