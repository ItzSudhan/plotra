// Themes (beat-the-competitors.md step 7): a palette for the app's surfaces,
// an accent colour, and CSS of the person's own, each with a light and a dark
// version where it matters. Theirs alone, like the rest of Customize
// (ShellPrefs.theme). Turned into one stylesheet here; the workspace puts it
// in the page and keeps a copy so every page has it before it paints
// (components/workspace/theme.tsx, app/layout.tsx). Pure.

type Vars = Record<string, string>;

export type Palette = { label: string; light: Vars; dark: Vars; /** Swatches for the picker: background, card, text. */ swatch: [string, string, string] };

export const palettes: Record<string, Palette> = {
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

export type Theme = { palette?: string; accent?: string; css?: string };

export const MAX_CSS = 20_000;

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

export function cleanTheme(input: unknown): Theme | undefined {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const theme: Theme = {};
  if (typeof raw.palette === "string" && raw.palette !== "paper" && Object.hasOwn(palettes, raw.palette)) theme.palette = raw.palette;
  if (typeof raw.accent === "string" && raw.accent !== "ember" && Object.hasOwn(accents, raw.accent)) theme.accent = raw.accent;
  const css = cleanCss(raw.css).trim();
  if (css) theme.css = css;
  return Object.keys(theme).length ? theme : undefined;
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
  const palette = palettes[theme.palette ?? "paper"] ?? palettes.paper;
  const accent = theme.accent ? accents[theme.accent] : undefined;
  const light = { ...palette.light, ...(accent && { ember: accent.light, "ember-ink": accent.ink, ring: `color-mix(in oklab, ${accent.light} 55%, transparent)` }) };
  const dark = { ...palette.dark, ...(accent && { ember: accent.dark, "ember-ink": accent.dark, ring: `color-mix(in oklab, ${accent.dark} 60%, transparent)` }) };
  return [block("html:root", light), block("html.dark", dark), theme.css ? cleanCss(theme.css) : ""].filter(Boolean).join("\n");
}

/** This device's copy of the theme's stylesheet, so every page has it before it paints. */
export const THEME_KEY = "plotra:theme-css";
export const THEME_STYLE_ID = "plotra-theme";

/** Puts the kept stylesheet in the page before the first paint (app/layout.tsx), as text, never as markup. */
export const themeScript = `try{var c=localStorage.getItem("${THEME_KEY}");if(c){var s=document.createElement("style");s.id="${THEME_STYLE_ID}";s.textContent=c;document.head.appendChild(s)}}catch(e){}`;
