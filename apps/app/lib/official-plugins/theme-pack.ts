// One of Plotra's own plugins (./index.ts). Plain JavaScript in a string: no backticks or "${" in it.
export const code = String.raw`// ==Plotra plugin==
// @name        Theme pack
// @description Four colour themes for Plotra, each in light and dark: Typewriter, Nightfall, Meadow and Lilac
// @version     1.0
// @access      read
// ==/Plotra plugin==

// Each theme gives a few base colours; Plotra works out the rest (borders, menus, hover, focus rings).
// Pick them in Customize, Look, Colours, under From your plugins.

plotra.registerTheme({
  id: "typewriter",
  title: "Typewriter",
  light: {"background": "#f8f3e8", "card": "#fffcf5", "sidebar": "#f0e9da", "foreground": "#1f1b16", "muted-foreground": "#5f574b", "ember": "#b8322a"},
  dark: {"background": "#1a1814", "card": "#211e19", "sidebar": "#16140f", "foreground": "#eee6d6", "muted-foreground": "#aea392", "ember": "#e8675d"},
});

plotra.registerTheme({
  id: "nightfall",
  title: "Nightfall",
  light: {"background": "#f3f4f8", "card": "#ffffff", "sidebar": "#eaecf2", "foreground": "#141827", "muted-foreground": "#4e5468", "ember": "#b0640a"},
  dark: {"background": "#0d1120", "card": "#131829", "sidebar": "#0a0d19", "foreground": "#e2e5f0", "muted-foreground": "#9da3b8", "ember": "#f0a541"},
});

plotra.registerTheme({
  id: "meadow",
  title: "Meadow",
  light: {"background": "#f2f6f0", "card": "#fbfdfa", "sidebar": "#e8efe5", "foreground": "#17241b", "muted-foreground": "#4c5d50", "ember": "#14866d"},
  dark: {"background": "#121a15", "card": "#18221c", "sidebar": "#0f1612", "foreground": "#e0eae2", "muted-foreground": "#9fb3a5", "ember": "#4cc2a3"},
});

plotra.registerTheme({
  id: "lilac",
  title: "Lilac",
  light: {"background": "#f8f5fb", "card": "#fefcff", "sidebar": "#f0ebf6", "foreground": "#221a2e", "muted-foreground": "#5c5170", "ember": "#8a3fc0"},
  dark: {"background": "#18131f", "card": "#1f1928", "sidebar": "#140f1a", "foreground": "#ece4f4", "muted-foreground": "#b0a4c2", "ember": "#c08ae8"},
});
`;
