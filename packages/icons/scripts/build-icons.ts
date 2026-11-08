// Generates src/solar-subset.json with only the Solar icons listed
// in src/registry.ts, so the full icon set never reaches the bundle.
// Run: bun run icons
import { writeFileSync } from "node:fs";
import { getIcons } from "@iconify/utils";
import solar from "@iconify-json/solar/icons.json";
import { iconNames } from "../src/registry";

const subset = getIcons(solar, [...iconNames]);
const missing = iconNames.filter((name) => !subset?.icons[name] && !subset?.aliases?.[name]);
if (!subset || missing.length) {
  console.error(`Unknown Solar icons: ${missing.join(", ")}`);
  process.exit(1);
}

writeFileSync(new URL("../src/solar-subset.json", import.meta.url), JSON.stringify(subset));
console.log(`Wrote ${iconNames.length} Solar icons`);
