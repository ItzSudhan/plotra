// Themes (beat-the-competitors.md step 7): a palette for the app's surfaces,
// an accent colour, and CSS of the person's own, each with a light and a dark
// version where it matters. A palette is one of the app's own, one the person
// made (`own`), or one a plugin gives (`plotra.registerTheme`, kept as a copy
// in `plugin` once picked, so it holds on every page, plugins running or not).
// Theirs alone, like the rest of Customize (ShellPrefs.theme). Turned into one
// stylesheet here; the shell puts it in the page and keeps a copy so every
// page has it before it paints (components/workspace/shell-prefs.ts
// `useThemeSync`, app/layout.tsx). Pure.

type Vars = Record<string, string>;

export type Palette = { label: string; light: Vars; dark: Vars; /** Swatches for the picker: background, card, text. */ swatch: [string, string, string] };

const written: Record<string, Palette> = {
  paper: { label: "Paper", light: {}, dark: {}, swatch: ["#f7f6f3", "#ffffff", "#161412"] },
  sepia: {
    label: "Sepia",
    swatch: ["#f4ecd8", "#fbf5e6", "#3b2f22"],
    light: {
      background: "#f4ecd8",
      foreground: "#3b2f22",
      card: "#fbf5e6",
      "card-foreground": "#3b2f22",
      popover: "#fbf5e6",
      "popover-foreground": "#3b2f22",
      primary: "#3b2f22",
      "primary-foreground": "#f4ecd8",
      secondary: "#ebe0c6",
      muted: "#ebe0c6",
      "muted-foreground": "#65543d",
      faint: "#6f5e46",
      accent: "#e4d6b5",
      border: "rgb(59 47 34 / 0.14)",
      input: "rgb(59 47 34 / 0.2)",
      sidebar: "#ede3cb",
      "sidebar-accent": "#e4d6b5",
      "sidebar-foreground": "#3b2f22",
    },
    dark: {
      background: "#1e1913",
      foreground: "#e8dcc4",
      card: "#241e17",
      "card-foreground": "#e8dcc4",
      popover: "#2a231b",
      "popover-foreground": "#e8dcc4",
      primary: "#e8dcc4",
      "primary-foreground": "#1e1913",
      secondary: "#2e261d",
      muted: "#2e261d",
      "muted-foreground": "#b8a888",
      faint: "#a8987a",
      accent: "#362d22",
      sidebar: "#1b1611",
      "sidebar-accent": "#2e261d",
      "sidebar-foreground": "#e8dcc4",
    },
  },
  slate: {
    label: "Slate",
    swatch: ["#f5f7fa", "#ffffff", "#111827"],
    light: {
      background: "#f5f7fa",
      foreground: "#111827",
      card: "#ffffff",
      "card-foreground": "#111827",
      popover: "#ffffff",
      "popover-foreground": "#111827",
      primary: "#111827",
      "primary-foreground": "#f5f7fa",
      secondary: "#eef1f5",
      muted: "#eef1f5",
      "muted-foreground": "#4b5563",
      faint: "#5b6472",
      accent: "#e5e9f0",
      border: "rgb(17 24 39 / 0.1)",
      input: "rgb(17 24 39 / 0.15)",
      sidebar: "#eef1f5",
      "sidebar-accent": "#e2e7ee",
      "sidebar-foreground": "#111827",
    },
    dark: {
      background: "#0f141b",
      foreground: "#e6eaf0",
      card: "#151b23",
      "card-foreground": "#e6eaf0",
      popover: "#19202a",
      "popover-foreground": "#e6eaf0",
      primary: "#e6eaf0",
      "primary-foreground": "#0f141b",
      secondary: "#1c242f",
      muted: "#1c242f",
      "muted-foreground": "#a3aebd",
      faint: "#94a0b0",
      accent: "#232c38",
      sidebar: "#0c1117",
      "sidebar-accent": "#1c242f",
      "sidebar-foreground": "#e6eaf0",
    },
  },
  forest: {
    label: "Forest",
    swatch: ["#f3f6f1", "#fbfdf9", "#142018"],
    light: {
      background: "#f3f6f1",
      foreground: "#142018",
      card: "#fbfdf9",
      "card-foreground": "#142018",
      popover: "#fbfdf9",
      "popover-foreground": "#142018",
      primary: "#142018",
      "primary-foreground": "#f3f6f1",
      secondary: "#e8eee4",
      muted: "#e8eee4",
      "muted-foreground": "#4b5a4e",
      faint: "#56665a",
      accent: "#dfe8da",
      border: "rgb(20 32 24 / 0.1)",
      input: "rgb(20 32 24 / 0.15)",
      sidebar: "#e9efe5",
      "sidebar-accent": "#dfe8da",
      "sidebar-foreground": "#142018",
    },
    dark: {
      background: "#111813",
      foreground: "#e3ebe2",
      card: "#172019",
      "card-foreground": "#e3ebe2",
      popover: "#1b251d",
      "popover-foreground": "#e3ebe2",
      primary: "#e3ebe2",
      "primary-foreground": "#111813",
      secondary: "#1f2a21",
      muted: "#1f2a21",
      "muted-foreground": "#a5b5a6",
      faint: "#95a797",
      accent: "#26332a",
      sidebar: "#0e140f",
      "sidebar-accent": "#1f2a21",
      "sidebar-foreground": "#e3ebe2",
    },
  },
  pure: {
    label: "Pure",
    swatch: ["#ffffff", "#ffffff", "#0a0a0a"],
    light: {
      background: "#ffffff",
      foreground: "#0a0a0a",
      card: "#ffffff",
      popover: "#ffffff",
      secondary: "#f4f4f5",
      muted: "#f4f4f5",
      accent: "#ececee",
      sidebar: "#f7f7f8",
      "sidebar-accent": "#ececee",
    },
    dark: {
      background: "#000000",
      foreground: "#f2f2f2",
      card: "#0b0b0b",
      popover: "#111111",
      secondary: "#151515",
      muted: "#151515",
      accent: "#1c1c1c",
      sidebar: "#050505",
      "sidebar-accent": "#151515",
    },
  },
  contrast: {
    label: "High contrast",
    swatch: ["#ffffff", "#ffffff", "#000000"],
    light: {
      background: "#ffffff",
      foreground: "#000000",
      card: "#ffffff",
      "card-foreground": "#000000",
      popover: "#ffffff",
      "popover-foreground": "#000000",
      "muted-foreground": "#1f1f1f",
      faint: "#2e2e2e",
      accent: "#e6e6e6",
      border: "rgb(0 0 0 / 0.5)",
      input: "rgb(0 0 0 / 0.65)",
      sidebar: "#ffffff",
      "sidebar-border": "rgb(0 0 0 / 0.5)",
    },
    dark: {
      background: "#000000",
      foreground: "#ffffff",
      card: "#000000",
      "card-foreground": "#ffffff",
      popover: "#0a0a0a",
      "popover-foreground": "#ffffff",
      "muted-foreground": "#e3e3e3",
      faint: "#d0d0d0",
      accent: "#262626",
      border: "rgb(255 255 255 / 0.55)",
      input: "rgb(255 255 255 / 0.65)",
      sidebar: "#000000",
      "sidebar-border": "rgb(255 255 255 / 0.55)",
    },
  },
};


// Colours, as text a stylesheet can hold.

const HEX = /^#[0-9a-f]{6}$/i;
const FUNCTION = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[-+\d.%\sa-z,/]*\)$/i;

/** A colour a theme may set: `#hex` or a colour function, nothing that could load anything. Null when it isn't one. */
export function cleanColour(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (value.length > 60) return null;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(value);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  if (HEX.test(value) || /^#[0-9a-f]{8}$/.test(value)) return value;
  return FUNCTION.test(value) && !/url|image|expression/.test(value) ? value : null;
}

const rgb = (hex: string) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
const hex = (channels: number[]) => `#${channels.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;

/** `a` moved `t` of the way to `b`: worked out when both are #hex, else left to the browser. */
export function mix(a: string, b: string, t: number): string {
  if (HEX.test(a) && HEX.test(b)) {
    const [x, y] = [rgb(a), rgb(b)];
    return hex(x.map((c, i) => c + (y[i] - c) * t));
  }
  return `color-mix(in oklab, ${b} ${Math.round(t * 100)}%, ${a})`;
}

const alpha = (colour: string, a: number) => (HEX.test(colour) ? `rgb(${rgb(colour).join(" ")} / ${a})` : `color-mix(in oklab, ${colour} ${Math.round(a * 100)}%, transparent)`);

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (colour: string) => {
  const [r, g, b] = rgb(colour);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** WCAG 2 contrast between two #hex colours; null when either isn't one. */
export function contrast(a: string | undefined, b: string | undefined): number | null {
  if (!a || !b || !HEX.test(a) || !HEX.test(b)) return null;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The accent as text on paper: moved toward the text colour until it reads at 4.5:1. */
function inkFor(accent: string, background: string, foreground: string): string {
  if (!HEX.test(accent) || !HEX.test(background) || !HEX.test(foreground)) return mix(accent, foreground, 0.3);
  for (let t = 0; t <= 1; t += 0.05) {
    const ink = mix(accent, foreground, t);
    if ((contrast(ink, background) ?? 0) >= 4.5) return ink;
  }
  return foreground;
}

/** Every variable a theme may set (packages/ui/src/styles/globals.css). */
export const themeVars = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "faint",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "ember",
  "gold",
  "rose",
  "violet",
  "teal",
  "ember-ink",
  "gold-ink",
  "rose-ink",
  "violet-ink",
  "teal-ink",
  "sidebar",
  "sidebar-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
] as const;
const isThemeVar = (name: string) => (themeVars as readonly string[]).includes(name);

/** The colours someone picks for a theme of their own. The rest follow from them (`expandColours`). */
export const baseColours = [
  { id: "background", label: "Background" },
  { id: "card", label: "Pages and cards" },
  { id: "sidebar", label: "Sidebar" },
  { id: "foreground", label: "Text" },
  { id: "muted-foreground", label: "Quieter text" },
  { id: "ember", label: "Accent" },
] as const;
export type BaseColour = (typeof baseColours)[number]["id"];
export type Mode = "light" | "dark";

/** The app's own base colours (globals.css `:root` and `.dark`), for a new theme to start from. */
export const defaultBase: Record<Mode, Record<BaseColour, string>> = {
  light: { background: "#f7f6f3", card: "#ffffff", sidebar: "#f3f1ec", foreground: "#161412", "muted-foreground": "#5e5a54", ember: "#e2602a" },
  dark: { background: "#141311", card: "#1b1a17", sidebar: "#181715", foreground: "#ece9e3", "muted-foreground": "#a39e95", ember: "#f07a48" },
};

/** Theme colours as they may be kept: known variables, real colours, nothing else. */
export function cleanColours(raw: unknown): Vars {
  const out: Vars = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    const colour = isThemeVar(name) ? cleanColour(value) : null;
    if (colour) out[name] = colour;
  }
  return out;
}

/**
 * A theme's colours with everything it didn't say filled in from what it did:
 * from a background and a text colour come the cards, menus, borders, hover
 * and quieter text; from an accent, its focus ring and its colour as text.
 * What's still missing is the app's own.
 */
export function expandColours(given: Vars, mode: Mode): Vars {
  const v: Vars = { ...given };
  const fill = (name: string, value: string | undefined) => {
    if (v[name] === undefined && value) v[name] = value;
  };
  const dark = mode === "dark";
  const { background: bg, foreground: fg } = v;
  if (bg && fg) {
    fill("card", dark ? mix(bg, fg, 0.03) : mix(bg, "#ffffff", 0.6));
    fill("sidebar", mix(bg, fg, dark ? 0.02 : 0.025));
    fill("muted-foreground", mix(fg, bg, 0.38));
    fill("faint", mix(v["muted-foreground"], bg, 0.12));
    for (const name of ["card-foreground", "popover-foreground", "secondary-foreground", "accent-foreground", "sidebar-foreground", "sidebar-accent-foreground", "primary"]) fill(name, fg);
    fill("popover", v.card);
    fill("primary-foreground", bg);
    fill("secondary", mix(bg, fg, dark ? 0.07 : 0.04));
    fill("muted", v.secondary);
    fill("accent", mix(bg, fg, dark ? 0.1 : 0.07));
    fill("sidebar-accent", mix(v.sidebar, fg, dark ? 0.1 : 0.09));
    fill("border", alpha(fg, dark ? 0.09 : 0.1));
    fill("input", alpha(fg, 0.14));
    fill("sidebar-border", alpha(fg, 0.07));
  }
  if (v.ember) {
    fill("ring", `color-mix(in oklab, ${v.ember} ${dark ? 60 : 55}%, transparent)`);
    fill("ember-ink", dark ? v.ember : inkFor(v.ember, bg ?? defaultBase.light.background, fg ?? defaultBase.light.foreground));
  }
  return v;
}

/** A palette made from base colours, with the swatch the picker draws. */
const fromBase = (label: string, light: Partial<Record<BaseColour, string>>, dark: Partial<Record<BaseColour, string>>): Palette => {
  const full = { light: expandColours(light, "light"), dark: expandColours(dark, "dark") };
  return { label, ...full, swatch: [full.light.background, full.light.card, full.light.foreground] };
};

/** The app's own themes. Some bring an accent of their own, which the Accent choice can still change. */
export const palettes: Record<string, Palette> = {
  ...written,
  dusk: fromBase(
    "Dusk",
    { background: "#f6f4fa", card: "#fdfcff", sidebar: "#efecf6", foreground: "#1d1830", "muted-foreground": "#575070", ember: "#7556d6" },
    { background: "#15131d", card: "#1c1926", sidebar: "#120f19", foreground: "#e7e3f2", "muted-foreground": "#a9a2bd", ember: "#9b83ec" },
  ),
  fjord: fromBase(
    "Fjord",
    { background: "#f1f5f7", card: "#fbfdfe", sidebar: "#e9eff2", foreground: "#13222c", "muted-foreground": "#4a5c68", ember: "#1971c2" },
    { background: "#0f1a20", card: "#15222a", sidebar: "#0c151a", foreground: "#dfe9ee", "muted-foreground": "#9fb2bd", ember: "#4d9be6" },
  ),
  rosewood: fromBase(
    "Rosewood",
    { background: "#faf3f2", card: "#fffafa", sidebar: "#f3e9e7", foreground: "#2b1716", "muted-foreground": "#6b4f4c", ember: "#c2255c" },
    { background: "#1b1211", card: "#231817", sidebar: "#170f0e", foreground: "#f0e2df", "muted-foreground": "#bea6a2", ember: "#e8689b" },
  ),
  mocha: fromBase(
    "Mocha",
    { background: "#f4efe9", card: "#fbf8f4", sidebar: "#ece4da", foreground: "#2a1f18", "muted-foreground": "#66574b", ember: "#a8701a" },
    { background: "#1c1613", card: "#241d19", sidebar: "#18120f", foreground: "#ede2d8", "muted-foreground": "#b6a596", ember: "#d6a24a" },
  ),
};

/** Accent colours: buttons, focus rings, the active tab, links in the editor. Light and dark. */
// `ink` is the light-mode colour for text in that accent, dark enough for 4.5:1 on paper.
export const accents: Record<string, { label: string; light: string; dark: string; ink: string }> = {
  ember: { label: "Ember", light: "#e2602a", dark: "#f07a48", ink: "#b5461a" },
  gold: { label: "Gold", light: "#b57d20", dark: "#d6a24a", ink: "#8a5e12" },
  green: { label: "Green", light: "#2b8a3e", dark: "#4fb465", ink: "#237a33" },
  teal: { label: "Teal", light: "#109981", dark: "#3cbfa5", ink: "#0b7a67" },
  blue: { label: "Blue", light: "#1971c2", dark: "#4d9be6", ink: "#1864ab" },
  violet: { label: "Violet", light: "#7556d6", dark: "#9b83ec", ink: "#6447c4" },
  rose: { label: "Rose", light: "#c2255c", dark: "#e8689b", ink: "#a61e4d" },
};

/** A theme someone made in Customize → Look, from base colours (`baseColours`). */
export type OwnTheme = { id: string; label: string; light: Vars; dark: Vars };
/** The plugin theme in use: a copy of what the plugin registered, so it holds where plugins don't run. */
export type PluginThemeCopy = { pluginId: string; id: string; label: string; from: string; light: Vars; dark: Vars; css?: string };

export type Theme = {
  /** One of `palettes`, `own:<id>` for one of `own`, or `plugin` for `plugin`. Paper when unset. */
  palette?: string;
  /** One of `accents`. Unset: the palette's own accent, else ember. */
  accent?: string;
  css?: string;
  own?: OwnTheme[];
  plugin?: PluginThemeCopy;
};

export const MAX_CSS = 20_000;
export const MAX_OWN_THEMES = 12;
const OWN_PREFIX = "own:";
export const ownPalette = (id: string) => `${OWN_PREFIX}${id}`;

/**
 * CSS of the person's own, made safe to keep and to apply: nothing that loads
 * from elsewhere (`url(…)`, `@import`, `image-set`), so a setup file from
 * someone else can't use CSS to send what's on the screen to a server; and no
 * backslashes, which could spell those out in escapes.
 */
export function cleanCss(css: unknown): string {
  if (typeof css !== "string") return "";
  return css
    .slice(0, MAX_CSS)
    .replace(/\\/g, "")
    .replace(/@import[^;]*;?/gi, "")
    .replace(/(url|image-set|image|src|expression|-moz-binding)\s*\(/gi, "blocked(")
    .replace(/behavior\s*:/gi, "blocked:")
    .replace(/<\/?\s*style/gi, "");
}

const cleanLabel = (raw: unknown, fallback: string) =>
  (typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]+/g, " ").trim() : "").slice(0, 40) || fallback;

function cleanOwn(raw: unknown): OwnTheme[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: OwnTheme[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { id, label, light, dark } = item as Record<string, unknown>;
    if (typeof id !== "string" || !/^[a-z0-9-]{1,40}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: cleanLabel(label, "My theme"), light: cleanColours(light), dark: cleanColours(dark) });
    if (out.length >= MAX_OWN_THEMES) break;
  }
  return out;
}

/** What a plugin hands over for a theme (`plotra.registerTheme`), as the app may use it. Null when there's nothing to use. */
export function cleanPluginTheme(raw: unknown): { light: Vars; dark: Vars; css?: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const { light, dark, css } = raw as Record<string, unknown>;
  const theme = { light: cleanColours(light), dark: cleanColours(dark), css: cleanCss(css).trim() };
  if (!Object.keys(theme.light).length && !Object.keys(theme.dark).length && !theme.css) return null;
  return { light: theme.light, dark: theme.dark, ...(theme.css && { css: theme.css }) };
}

function cleanPluginCopy(raw: unknown): PluginThemeCopy | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { pluginId, id, label, from } = raw as Record<string, unknown>;
  const theme = cleanPluginTheme(raw);
  if (!theme || typeof pluginId !== "string" || !/^[\w-]{1,64}$/.test(pluginId) || typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]{0,59}$/.test(id)) return undefined;
  return { pluginId, id, label: cleanLabel(label, "Plugin theme"), from: cleanLabel(from, "A plugin"), ...theme };
}

export function cleanTheme(input: unknown): Theme | undefined {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const theme: Theme = {};
  const own = cleanOwn(raw.own);
  const plugin = cleanPluginCopy(raw.plugin);
  if (own.length) theme.own = own;
  if (plugin) theme.plugin = plugin;
  const palette = raw.palette;
  if (typeof palette === "string") {
    if (palette.startsWith(OWN_PREFIX) ? own.some((t) => ownPalette(t.id) === palette) : palette === "plugin" ? Boolean(plugin) : palette !== "paper" && Object.hasOwn(palettes, palette)) theme.palette = palette;
  }
  // The plugin's copy is only kept while it's the one in use.
  if (theme.palette !== "plugin") delete theme.plugin;
  if (typeof raw.accent === "string" && Object.hasOwn(accents, raw.accent)) theme.accent = raw.accent;
  // Ember is every palette's accent unless it brings its own: no need to say so.
  if (theme.accent === "ember" && !paletteOf(theme).light.ember) delete theme.accent;
  const css = cleanCss(raw.css).trim();
  if (css) theme.css = css;
  return Object.keys(theme).length ? theme : undefined;
}

/** The palette a theme uses, expanded: the person's own or a plugin's, else one of the app's. */
export function paletteOf(theme: Theme | undefined): Palette & { css?: string } {
  const palette = theme?.palette;
  const made = (label: string, light: Vars, dark: Vars, css?: string) => {
    const full = { light: expandColours(light, "light"), dark: expandColours(dark, "dark") };
    return { label, ...full, swatch: [full.light.background ?? defaultBase.light.background, full.light.card ?? defaultBase.light.card, full.light.foreground ?? defaultBase.light.foreground] as [string, string, string], ...(css && { css }) };
  };
  if (palette?.startsWith(OWN_PREFIX)) {
    const own = theme?.own?.find((t) => ownPalette(t.id) === palette);
    if (own) return made(own.label, own.light, own.dark);
  }
  if (palette === "plugin" && theme?.plugin) return made(theme.plugin.label, theme.plugin.light, theme.plugin.dark, theme.plugin.css);
  return palettes[palette ?? "paper"] ?? palettes.paper;
}

/** An own theme's swatch, for the picker. */
export const swatchOf = (own: Pick<OwnTheme, "light" | "dark">, mode: Mode = "light"): [string, string, string, string] => {
  const full = expandColours(own[mode], mode);
  const base = defaultBase[mode];
  return [full.background ?? base.background, full.card ?? base.card, full.foreground ?? base.foreground, full.ember ?? base.ember];
};

/** The base colours a new theme starts from: the palette in use, as far as it says, then the app's own. */
export function baseOf(theme: Theme | undefined): Record<Mode, Record<BaseColour, string>> {
  const palette = paletteOf(theme);
  const accent = theme?.accent ? accents[theme.accent] : undefined;
  const pick = (mode: Mode) => {
    const out = { ...defaultBase[mode] };
    for (const { id } of baseColours) {
      const value = palette[mode][id];
      if (value && HEX.test(value)) out[id] = value;
    }
    if (accent) out.ember = accent[mode];
    return out;
  };
  return { light: pick("light"), dark: pick("dark") };
}

const block = (selector: string, vars: Vars) => {
  const lines = Object.entries(vars).map(([name, value]) => `--${name}: ${value};`);
  return lines.length ? `${selector} { ${lines.join(" ")} }` : "";
};

/**
 * The stylesheet for a theme. `html:root` and `html.dark` outrank the app's own
 * `:root` and `.dark`, wherever in the page this ends up.
 */
export function themeCss(theme: Theme | undefined): string {
  if (!theme) return "";
  const palette = paletteOf(theme);
  const accent = theme.accent ? accents[theme.accent] : undefined;
  const light = { ...palette.light, ...(accent && { ember: accent.light, "ember-ink": accent.ink, ring: `color-mix(in oklab, ${accent.light} 55%, transparent)` }) };
  const dark = { ...palette.dark, ...(accent && { ember: accent.dark, "ember-ink": accent.dark, ring: `color-mix(in oklab, ${accent.dark} 60%, transparent)` }) };
  return [block("html:root", light), block("html.dark", dark), palette.css ? cleanCss(palette.css) : "", theme.css ? cleanCss(theme.css) : ""].filter(Boolean).join("\n");
}

/** A theme a plugin registered in the open project (components/plugins/plugin-registry.ts). */
export type PluginThemePart = { pluginId: string; pluginName: string; name: string; title: string; theme?: { light: Vars; dark: Vars; css?: string } };

/** One theme to pick: the app's, the person's own, or a plugin's. */
export type ThemeChoice = {
  key: string;
  label: string;
  source: "app" | "own" | "plugin";
  /** The plugin's name, for a plugin's theme. */
  from?: string;
  /** Background, card, text and accent, for the picker, in light and dark. */
  swatch: Record<Mode, [string, string, string, string]>;
};

const pluginKey = (pluginId: string, id: string) => `plugin:${pluginId}:${id}`;

function swatchFor(light: Vars, dark: Vars): Record<Mode, [string, string, string, string]> {
  return { light: swatchOf({ light, dark }, "light"), dark: swatchOf({ light, dark }, "dark") };
}

/** Which choice a theme is on. */
export function chosenKey(theme: Theme | undefined): string {
  const palette = theme?.palette;
  if (palette === "plugin" && theme?.plugin) return pluginKey(theme.plugin.pluginId, theme.plugin.id);
  if (palette?.startsWith(OWN_PREFIX) && theme?.own?.some((t) => ownPalette(t.id) === palette)) return palette;
  return palette && Object.hasOwn(palettes, palette) ? palette : "paper";
}

/**
 * Every theme there is to pick: the app's, then the plugins' (with the one in
 * use kept even when its plugin isn't running here), then the person's own.
 */
export function themeChoices(theme: Theme | undefined, parts: readonly PluginThemePart[] = []): ThemeChoice[] {
  const out: ThemeChoice[] = Object.entries(palettes).map(([key, p]) => ({ key, label: p.label, source: "app", swatch: swatchFor(p.light, p.dark) }));
  const seen = new Set<string>();
  for (const part of parts) {
    const key = pluginKey(part.pluginId, part.name);
    if (!part.theme || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: part.title, source: "plugin", from: part.pluginName, swatch: swatchFor(part.theme.light, part.theme.dark) });
  }
  const copy = theme?.palette === "plugin" ? theme.plugin : undefined;
  if (copy && !seen.has(pluginKey(copy.pluginId, copy.id))) out.push({ key: pluginKey(copy.pluginId, copy.id), label: copy.label, source: "plugin", from: copy.from, swatch: swatchFor(copy.light, copy.dark) });
  for (const own of theme?.own ?? []) out.push({ key: ownPalette(own.id), label: own.label, source: "own", swatch: swatchFor(own.light, own.dark) });
  return out;
}

/** The theme with another choice in use. The accent, CSS and the person's own themes stay. Unchanged when there's no such choice. */
export function chooseTheme(theme: Theme | undefined, key: string, parts: readonly PluginThemePart[] = []): Theme | undefined {
  const base: Theme = { ...theme };
  delete base.plugin;
  if (key.startsWith("plugin:")) {
    const part = parts.find((p) => p.theme && pluginKey(p.pluginId, p.name) === key);
    if (part?.theme) return cleanTheme({ ...base, palette: "plugin", plugin: { pluginId: part.pluginId, id: part.name, label: part.title, from: part.pluginName, ...part.theme } });
    // Its plugin isn't running here: the copy in use is all there is.
    return theme;
  }
  if (key.startsWith(OWN_PREFIX) ? !theme?.own?.some((t) => ownPalette(t.id) === key) : !Object.hasOwn(palettes, key)) return theme;
  return cleanTheme({ ...base, palette: key === "paper" ? undefined : key });
}

/** The copy of the plugin theme in use, brought up to date with what its plugin registers now; null when nothing changed. */
export function refreshedPluginTheme(theme: Theme | undefined, parts: readonly PluginThemePart[]): Theme | undefined | null {
  const copy = theme?.palette === "plugin" ? theme.plugin : undefined;
  if (!copy) return null;
  const part = parts.find((p) => p.theme && p.pluginId === copy.pluginId && p.name === copy.id);
  if (!part?.theme) return null;
  const next = chooseTheme(theme, pluginKey(part.pluginId, part.name), parts);
  return JSON.stringify(next?.plugin) === JSON.stringify(copy) ? null : next;
}

/** A theme of the person's own, made from the one in use, and put in use. Unchanged when they have as many as they may. */
export function addOwnTheme(theme: Theme | undefined, label?: string): { theme: Theme | undefined; id: string | null } {
  const own = theme?.own ?? [];
  if (own.length >= MAX_OWN_THEMES) return { theme, id: null };
  const id = Math.random().toString(36).slice(2, 10) || "theme";
  const base = baseOf(theme);
  const current = paletteOf(theme).label;
  const name = label ?? (theme?.palette ? `${current} (mine)` : `My theme ${own.length + 1}`);
  const next = cleanTheme({ ...theme, palette: ownPalette(id), plugin: undefined, accent: undefined, own: [...own, { id, label: name, light: base.light, dark: base.dark }] });
  return { theme: next, id };
}

/** The theme with one of the person's own changed. */
export function updateOwnTheme(theme: Theme | undefined, id: string, patch: Partial<Omit<OwnTheme, "id">>): Theme | undefined {
  return cleanTheme({ ...theme, own: (theme?.own ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)) });
}

/** The theme without one of the person's own; back to Paper if it was in use. */
export function removeOwnTheme(theme: Theme | undefined, id: string): Theme | undefined {
  const palette = theme?.palette === ownPalette(id) ? undefined : theme?.palette;
  return cleanTheme({ ...theme, palette, own: (theme?.own ?? []).filter((t) => t.id !== id) });
}

/** A theme as a plugin of its own (lib/plugins.ts): to keep, share or publish in the store. */
export function themePlugin(theme: { label: string; light: Vars; dark: Vars; css?: string }): string {
  const label = cleanLabel(theme.label, "My theme");
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "theme";
  const spec = { id, title: label, light: cleanColours(theme.light), dark: cleanColours(theme.dark), ...(theme.css && { css: cleanCss(theme.css) }) };
  return [
    "// ==Plotra plugin==",
    `// @name        ${label} theme`,
    "// @description A colour theme for Plotra, in light and dark",
    "// @version     1.0",
    "// @access      read",
    "// ==/Plotra plugin==",
    "",
    "// Pick it in Customize → Look → Colours once this plugin is on.",
    `plotra.registerTheme(${JSON.stringify(spec, null, 2)});`,
    "",
  ].join("\n");
}

/** This device's copy of the theme's stylesheet, so every page has it before it paints. */
export const THEME_KEY = "plotra:theme-css";
export const THEME_STYLE_ID = "plotra-theme";

/** Puts the kept stylesheet in the page before the first paint (app/layout.tsx), as text, never as markup. */
export const themeScript = `try{var c=localStorage.getItem("${THEME_KEY}");if(c){var s=document.createElement("style");s.id="${THEME_STYLE_ID}";s.textContent=c;document.head.appendChild(s)}}catch(e){}`;
