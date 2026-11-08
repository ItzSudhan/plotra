"use client";

// Hotkeys are written like "mod+shift+p": modifiers in a fixed order, then the key.
// `mod` is ⌘ on macOS and Ctrl elsewhere.

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const codeKeys: Record<string, string> = {
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  Space: "space",
};

/** The canonical hotkey for a keyboard event, or null for a bare modifier press. */
export function eventToHotkey(e: KeyboardEvent): string | null {
  if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return null;
  // Use the physical key so Alt/Option combos on macOS don't turn into symbols.
  let key: string;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else key = codeKeys[e.code] ?? e.key.toLowerCase();

  const mac = isMac();
  const parts: string[] = [];
  if (mac ? e.metaKey : e.ctrlKey) parts.push("mod");
  if (mac && e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

const symbols: Record<string, string> = {
  mod: "⌘",
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  arrowleft: "←",
  arrowright: "→",
  arrowup: "↑",
  arrowdown: "↓",
  enter: "↵",
  escape: "Esc",
  backspace: "⌫",
  space: "Space",
};

/** Display form: "⌘⇧P" on macOS, "Ctrl+Shift+P" elsewhere. */
export function formatHotkey(hotkey: string) {
  const mac = isMac();
  const parts = hotkey.split("+").map((part) => {
    if (mac) return symbols[part] ?? part.toUpperCase();
    if (part === "mod" || part === "ctrl") return "Ctrl";
    if (part === "alt") return "Alt";
    if (part === "shift") return "Shift";
    return symbols[part] && part.startsWith("arrow") ? symbols[part] : part.length === 1 ? part.toUpperCase() : part;
  });
  return parts.join(mac ? "" : "+");
}

// Combos the browser keeps for itself (new tab, close window, reload, the
// bookmarks bar, developer tools…): a page never hears them, or shouldn't
// take them. Defaults avoid them, and rebinding to one is refused.
const reserved = new Set([
  "mod+t",
  "mod+n",
  "mod+w",
  "mod+l",
  "mod+d",
  "mod+q",
  "mod+shift+t",
  "mod+shift+n",
  "mod+shift+w",
  "mod+shift+q",
  "mod+shift+j",
  "mod+shift+r",
  "mod+shift+c",
  "mod+shift+b",
  "mod+shift+delete",
  "mod+shift+backspace",
]);

/** Whether the browser takes this combo before the page can. */
export const browserReserved = (hotkey: string) => reserved.has(hotkey.toLowerCase());

// The person's changes to shortcuts, { [commandId]: hotkey | null } where
// null means unbound. They are saved with the rest of their setup
// (ShellPrefs.hotkeys, through ./shell-prefs.ts) so they follow them to every
// device; `livePrefs` there mirrors them for code outside React.

type Overrides = Record<string, string | null>;

/** Where shortcuts were kept before they followed the account; read once, moved, then removed. */
export const LEGACY_STORAGE_KEY = "plotra:hotkeys";

export function legacyOverrides(): Overrides | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.keys(parsed).length ? (parsed as Overrides) : null;
  } catch {
    return null;
  }
}

export function forgetLegacyOverrides() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Private mode: nothing was stored to forget.
  }
}

export function resolveHotkey(commandId: string, fallback: string | undefined, current: Overrides | undefined) {
  return current && commandId in current ? (current[commandId] ?? undefined) : fallback;
}
