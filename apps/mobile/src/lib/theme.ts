import { Platform, useColorScheme } from "react-native";
import { useAppearance } from "./appearance";

// Plotra's colours (packages/ui/src/styles/globals.css): warm paper, near-black ink, ember.

const light = {
  background: "#f7f6f3",
  foreground: "#161412",
  card: "#ffffff",
  muted: "#f3f1ec",
  mutedForeground: "#5e5a54",
  accent: "#ebe8e1",
  border: "rgba(22,20,18,0.1)",
  ember: "#e2602a",
  emberInk: "#b5461a",
  emberSoft: "rgba(226,96,42,0.12)",
  highlight: "rgba(250,204,21,0.35)",
  destructive: "#c8322b",
  teal: "#1f7a72",
};

export type Palette = typeof light;

const dark: Palette = {
  background: "#141311",
  foreground: "#ece9e3",
  card: "#1b1a17",
  muted: "#23211e",
  mutedForeground: "#a39e95",
  accent: "#2a2824",
  border: "rgba(255,255,255,0.08)",
  ember: "#f07a48",
  emberInk: "#f07a48",
  emberSoft: "rgba(240,122,72,0.16)",
  highlight: "rgba(250,204,21,0.25)",
  destructive: "#e5564e",
  teal: "#4fb3a9",
};

export const palettes = { light, dark };

/** The palette in use: the person's choice in Account, or the phone's. */
export function useColors(): Palette {
  return palettes[useScheme()];
}

export function useScheme(): "light" | "dark" {
  const system = useColorScheme();
  const { appearance } = useAppearance();
  if (appearance === "light" || appearance === "dark") return appearance;
  return system === "dark" ? "dark" : "light";
}

export const fonts = {
  serif: Platform.select({ ios: "New York", android: "serif", default: "serif" }),
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
