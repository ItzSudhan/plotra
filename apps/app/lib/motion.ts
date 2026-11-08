// Whether the interface moves. Animations are on unless the person switched
// them off in Your settings (saved with their shell prefs, so the choice
// follows them), or asked their system for less motion. Off is marked on
// <html data-motion="off">, which app/globals.css answers by stopping every
// transition and animation, and the press script (./press.ts) by not running.
// The same early script also puts back the interface size (./ui-size.ts).

import { uiSizeScript } from "./ui-size";

/** This device's copy of the choice, read before the first paint by `motionScript`. */
export const MOTION_KEY = "plotra:motion";

/**
 * Run in <head> as the page is parsed (app/layout.tsx), so someone who turned
 * animations off never sees a page animate in while the app loads.
 */
export const motionScript = `try{if(localStorage.getItem("${MOTION_KEY}")==="off")document.documentElement.dataset.motion="off"}catch(e){}${uiSizeScript}`;

/** Whether things should move right now. */
export function motionOn(): boolean {
  if (typeof window === "undefined") return true;
  return document.documentElement.dataset.motion !== "off" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Applies the choice on this device at once, and remembers it for the next page load. */
export function setMotion(on: boolean) {
  const root = document.documentElement;
  if (on) delete root.dataset.motion;
  else root.dataset.motion = "off";
  try {
    if (on) localStorage.removeItem(MOTION_KEY);
    else localStorage.setItem(MOTION_KEY, "off");
  } catch {
    // Storage blocked: it still holds for this page.
  }
}

/** Puts back what `motionScript` set, if React cleared <html>'s attributes (it does on the dev remount). */
export function restoreMotion() {
  try {
    if (localStorage.getItem(MOTION_KEY) === "off") document.documentElement.dataset.motion = "off";
  } catch {
    // Storage blocked: nothing was stored either.
  }
}

/**
 * How scripted scrolling should move: gliding, unless animations are off.
 * CSS can't cover this one: `scrollIntoView` and friends ignore the
 * reduced-motion media query in most browsers.
 */
export function scrollBehavior(): ScrollBehavior {
  return motionOn() ? "smooth" : "auto";
}
