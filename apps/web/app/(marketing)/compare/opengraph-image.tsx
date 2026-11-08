import { cardSize, cardType, pageCard } from "@/lib/og";

export const alt = "Plotra compared with Scrivener, World Anvil, Campfire, Obsidian, Google Docs and more";
export const size = cardSize;
export const contentType = cardType;

export default function Image() {
  return pageCard({
    section: "Compare",
    title: "Plotra, beside the tools you know.",
    description: "Scrivener, World Anvil, Campfire, Obsidian, Google Docs, Plottr, LegendKeeper and Ellipsus: what each does well, and what Plotra adds.",
    footer: "Every feature on the Free plan. No card needed.",
  });
}
