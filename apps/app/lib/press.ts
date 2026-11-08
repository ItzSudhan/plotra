import { motionOn } from "./motion";

// Press feedback for every button in the app, in the browser only: whatever
// is pressed gives under the pointer, and springs back when let go, as
// controls do on iOS. Installed once on the document (components/motion.tsx),
// so the app's few hundred buttons need nothing of their own.
//
// It animates the individual `scale` property with the Web Animations API, so
// it never fights a button's own transitions, its `transform`, or the
// `translate` that positions it. Emil Kowalski's numbers: about 0.97 for an
// ordinary button, quick in, and let go on a spring.

const PRESSABLE = 'button, [role="button"], [role="tab"], [role="switch"], a[href], summary, [data-press="on"]';
// Rows of a list highlight instead, as a Mac's do: a whole row shrinking reads as a wobble.
const ROW = '[role^="menuitem"], [role="option"], [role="treeitem"], [role="row"], [role="gridcell"]';

/** How far down the press goes: further for small things, less for big ones, about 2.5px either way. */
function depth(width: number, height: number) {
  return 1 - Math.min(0.05, Math.max(0.015, 2.5 / Math.max(width, height)));
}

function pressable(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>(PRESSABLE);
  if (!el || el.closest('[data-press="off"]') || el.closest(ROW)) return null;
  if (el.matches(":disabled, [aria-disabled='true']") || el.isContentEditable) return null;
  const style = getComputedStyle(el);
  // Links in running text, and anything with a scale of its own.
  if (style.display === "inline" || (style.scale !== "none" && !pressing.has(el))) return null;
  const { width, height } = el.getBoundingClientRect();
  // Nothing tiny, and nothing the size of a panel (a backdrop is a button too).
  if (width < 8 || height < 8 || width > 560 || height > 320) return null;
  return el;
}

/** The scale an element is drawn at this moment, mid-animation included. */
function scaleNow(el: HTMLElement) {
  const value = getComputedStyle(el).scale;
  return value === "none" ? 1 : parseFloat(value) || 1;
}

const pressing = new Map<HTMLElement, Animation>();

function animateScale(el: HTMLElement, to: number, options: KeyframeAnimationOptions) {
  const from = scaleNow(el);
  pressing.get(el)?.cancel();
  const animation = el.animate({ scale: [String(from), String(to)] }, options);
  pressing.set(el, animation);
  animation.onfinish = () => {
    if (to === 1 && pressing.get(el) === animation) pressing.delete(el);
  };
  animation.oncancel = animation.onfinish;
}

/** The highlight of a segmented control goes down with the segment it sits behind (@plotra/ui/components/pill). */
function withPill(el: HTMLElement): HTMLElement[] {
  const chosen = el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-pressed") === "true";
  const pill = chosen ? el.parentElement?.querySelector<HTMLElement>(':scope > [data-slot="pill"]') : null;
  return pill ? [el, pill] : [el];
}

type Press = { els: HTMLElement[]; started: number; scale: number; timer?: number; down: boolean };

export function installPress(): () => void {
  const css = getComputedStyle(document.documentElement);
  const springs = typeof CSS !== "undefined" && CSS.supports("transition-timing-function", "linear(0, 1)");
  const easeOut = css.getPropertyValue("--ease-out").trim() || "cubic-bezier(0.23, 1, 0.32, 1)";
  const release = (springs && css.getPropertyValue("--ease-spring-bouncy").trim()) || easeOut;
  const releaseMs = release === easeOut ? 260 : 700;

  let current: Press | null = null;

  const pressIn = (press: Press) => {
    press.started = performance.now();
    press.down = true;
    for (const el of press.els) animateScale(el, press.scale, { duration: 130, easing: easeOut, fill: "forwards" });
  };

  const letGo = () => {
    const press = current;
    if (!press) return;
    current = null;
    window.clearTimeout(press.timer);
    // A tap shorter than the press itself still shows it.
    if (!press.down) pressIn(press);
    const wait = Math.max(0, 90 - (performance.now() - press.started));
    window.setTimeout(() => {
      for (const el of press.els) animateScale(el, 1, { duration: releaseMs, easing: release });
    }, wait);
  };

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || !motionOn()) return;
    const el = pressable(event.target);
    if (!el) return;
    letGo();
    const { width, height } = el.getBoundingClientRect();
    const press: Press = { els: withPill(el), started: performance.now(), scale: depth(width, height), down: false };
    current = press;
    // A finger may be starting a scroll: wait a moment, as iOS does, before anything moves.
    if (event.pointerType === "touch") press.timer = window.setTimeout(() => current === press && pressIn(press), 60);
    else pressIn(press);
  };

  // A pointer that slides off what it pressed lets it go, and presses it again
  // if it slides back while still held, as on iOS. (A finger is captured by
  // what it touched, so this is the mouse and the pen.)
  let left: Press | null = null;
  const onOut = (event: PointerEvent) => {
    const el = current?.els[0];
    if (!current?.down || !el || el.contains(event.relatedTarget as Node | null)) return;
    left = current;
    letGo();
  };
  const onOver = (event: PointerEvent) => {
    if (!left || !(event.buttons & 1) || !left.els[0].contains(event.target as Node)) return;
    current = { ...left, down: false };
    left = null;
    pressIn(current);
  };
  const onUp = () => {
    left = null;
    letGo();
  };
  const onCancel = () => {
    // The browser took the touch over for a scroll: nothing was pressed.
    const press = current;
    if (!press) return;
    current = null;
    window.clearTimeout(press.timer);
    if (press.down) for (const el of press.els) animateScale(el, 1, { duration: releaseMs, easing: release });
  };

  document.addEventListener("pointerdown", onDown, { capture: true, passive: true });
  document.addEventListener("pointerout", onOut, { capture: true, passive: true });
  document.addEventListener("pointerover", onOver, { capture: true, passive: true });
  window.addEventListener("pointerup", onUp, { capture: true, passive: true });
  window.addEventListener("pointercancel", onCancel, { capture: true, passive: true });
  window.addEventListener("dragstart", letGo, { capture: true, passive: true });
  window.addEventListener("blur", letGo);
  return () => {
    document.removeEventListener("pointerdown", onDown, { capture: true });
    document.removeEventListener("pointerout", onOut, { capture: true });
    document.removeEventListener("pointerover", onOver, { capture: true });
    window.removeEventListener("pointerup", onUp, { capture: true });
    window.removeEventListener("pointercancel", onCancel, { capture: true });
    window.removeEventListener("dragstart", letGo, { capture: true });
    window.removeEventListener("blur", letGo);
  };
}
