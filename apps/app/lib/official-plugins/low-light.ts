// One of Plotra's own plugins (./index.ts). Plain JavaScript in a string: no backticks or "${" in it.
export const code = String.raw`// ==Plotra plugin==
// @name        Low light
// @description A dim, warm theme for writing at night, with less blue and softer contrast
// @version     1.0
// @access      read
// ==/Plotra plugin==

// Near-black paper and warm, dimmed text in dark; a soft, unbleached page in light.
// Still readable: every text colour keeps 4.5:1 on the surfaces it sits on.
plotra.registerTheme({
  id: "low-light",
  title: "Low light",
  light: {"background": "#efe9df", "card": "#f6f1e8", "sidebar": "#e7e0d4", "foreground": "#2a241c", "muted-foreground": "#5f5649", "ember": "#a35a1c"},
  dark: {"background": "#0f0d0b", "card": "#151310", "sidebar": "#0c0a08", "foreground": "#c9bba5", "muted-foreground": "#9c907c", "ember": "#c98a4b"},
  // Images and the selection dimmed too, so nothing bright breaks the dark.
  css: "html.dark img { filter: brightness(0.85); } html.dark ::selection { background: rgb(201 138 75 / 0.3); }",
});
`;
