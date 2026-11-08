import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { officialPlugins } from "@/lib/official-plugins";
import { accents, cleanPluginTheme, expandColours, palettes } from "@/lib/themes";

// Every palette, light and dark, stays readable (issue #19): text at 4.5:1
// (WCAG 1.4.3) and every accent at 3:1 against the background, since accents
// draw focus rings, the active tab and links (WCAG 1.4.11).

// A palette only lists what it changes; the rest comes from the app's defaults,
// `:root` (light) and `.dark` in packages/ui/src/styles/globals.css.
const globals = readFileSync(join(import.meta.dir, "../../../../packages/ui/src/styles/globals.css"), "utf8");

function defaults(selector: string): Record<string, string> {
  const start = globals.search(new RegExp(`^${selector.replace(".", "\\.")}\\s*\\{`, "m"));
  if (start < 0) throw new Error(`${selector} not found in globals.css`);
  const body = globals.slice(start, globals.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}

const base = { light: defaults(":root"), dark: defaults(".dark") };

// WCAG 2 relative luminance and contrast ratio.
const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Only plain `#rrggbb` is checked. Values like borders' `rgb(… / 0.5)` are
// translucent, so their contrast depends on what's underneath; they're skipped.
const isHex = (value: string | undefined): value is string => !!value && /^#[0-9a-f]{6}$/i.test(value);

const TEXT = ["foreground", "muted-foreground", "faint"];
const SURFACES = ["background", "card"];

for (const [id, palette] of Object.entries(palettes)) {
  for (const mode of ["light", "dark"] as const) {
    const vars = { ...base[mode], ...palette[mode] };
    describe(`${palette.label} (${mode})`, () => {
      for (const text of TEXT) {
        for (const surface of SURFACES) {
          const [fg, bg] = [vars[text], vars[surface]];
          if (!isHex(fg) || !isHex(bg)) continue;
          test(`${text} on ${surface} is 4.5:1 or more`, () => {
            expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
          });
        }
      }

      // A palette's own accent, when it brings one.
      if (isHex(palette[mode].ember) && isHex(vars.background)) {
        test("its own accent on background is 3:1 or more", () => {
          expect(contrast(palette[mode].ember, vars.background)).toBeGreaterThanOrEqual(3);
        });
      }
      if (mode === "light" && isHex(palette.light["ember-ink"]) && isHex(vars.background)) {
        test("its own accent as text is 4.5:1 or more", () => {
          expect(contrast(palette.light["ember-ink"], vars.background)).toBeGreaterThanOrEqual(4.5);
        });
      }

      for (const [accentId, accent] of Object.entries(accents)) {
        const [fg, bg] = [accent[mode], vars.background];
        if (!isHex(fg) || !isHex(bg)) continue;
        test(`${accent.label} accent on background is 3:1 or more`, () => {
          const ratio = contrast(fg, bg);
          if (ratio < 3) console.error(`${id}/${mode}/${accentId}: ${ratio.toFixed(2)}:1`);
          expect(ratio).toBeGreaterThanOrEqual(3);
        });
      }
    });
  }
}

test("the defaults were found", () => {
  for (const mode of ["light", "dark"] as const) for (const name of [...TEXT, ...SURFACES]) expect(isHex(base[mode][name])).toBe(true);
});

// The themes Plotra's own plugins add (lib/official-plugins) are held to the same.
describe("Plotra's theme plugins", () => {
  const themes: Array<{ slug: string; id: string; light: Record<string, string>; dark: Record<string, string> }> = [];
  for (const plugin of officialPlugins.filter((p) => p.category === "themes")) {
    new Function("plotra", plugin.code)({
      registerTheme: (spec: { id: string; light: unknown; dark: unknown }) => {
        const clean = cleanPluginTheme(spec);
        if (clean) themes.push({ slug: plugin.slug, id: spec.id, ...clean });
      },
    });
  }

  test("there are some", () => {
    expect(themes.length).toBeGreaterThanOrEqual(5);
  });

  for (const theme of themes) {
    for (const mode of ["light", "dark"] as const) {
      const vars = { ...base[mode], ...expandColours(theme[mode], mode) };
      test(`${theme.slug}/${theme.id} (${mode}) is readable`, () => {
        for (const text of TEXT) for (const surface of SURFACES) expect([text, surface, contrast(vars[text], vars[surface]) >= 4.5]).toEqual([text, surface, true]);
        expect(contrast(vars.ember, vars.background)).toBeGreaterThanOrEqual(3);
        if (mode === "light") expect(contrast(vars["ember-ink"], vars.background)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
