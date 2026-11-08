// How big the interface is drawn (Customize → Look → Interface size). Saved
// with the person's shell prefs, so it follows them, and copied to this
// device so the next page is the right size before it paints. Marked on
// <html data-ui-size="…">, which packages/ui's globals.css answers by scaling
// the root font size; "comfortable" is the default and needs no attribute.

export const uiSizes = {
  compact: "Compact",
  comfortable: "Comfortable",
  large: "Large",
  larger: "Larger",
} as const;

export type UiSize = keyof typeof uiSizes;
export const DEFAULT_UI_SIZE: UiSize = "comfortable";

export const isUiSize = (value: unknown): value is UiSize => typeof value === "string" && Object.hasOwn(uiSizes, value);

/** This device's copy of the choice, read before the first paint by `uiSizeScript`. */
export const UI_SIZE_KEY = "plotra:ui-size";

/** Run in <head> as the page is parsed (with lib/motion.ts's script), so the page never jumps size as it loads. */
export const uiSizeScript = `try{var s=localStorage.getItem("${UI_SIZE_KEY}");if(s==="compact"||s==="large"||s==="larger")document.documentElement.dataset.uiSize=s}catch(e){}`;

/** Applies the size on this device at once, and remembers it for the next page load. */
export function setUiSize(size: UiSize) {
  const root = document.documentElement;
  if (size === DEFAULT_UI_SIZE) delete root.dataset.uiSize;
  else root.dataset.uiSize = size;
  try {
    if (size === DEFAULT_UI_SIZE) localStorage.removeItem(UI_SIZE_KEY);
    else localStorage.setItem(UI_SIZE_KEY, size);
  } catch {
    // Storage blocked: it still holds for this page.
  }
}

/** Puts back what `uiSizeScript` set, if React cleared <html>'s attributes. */
export function restoreUiSize() {
  try {
    const size = localStorage.getItem(UI_SIZE_KEY);
    if (isUiSize(size) && size !== DEFAULT_UI_SIZE) document.documentElement.dataset.uiSize = size;
  } catch {
    // Storage blocked: nothing was stored either.
  }
}
