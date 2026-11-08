import { cardSize, cardType, pageCard } from "@/lib/og";

export const alt = "Who Plotra is for: novelists, worldbuilders, co-writers, game masters and more";
export const size = cardSize;
export const contentType = cardType;

export default function Image() {
  return pageCard({
    section: "Who it's for",
    title: "Made for people who build worlds.",
    description: "Novelists, worldbuilders, co-writers, game masters, web-serial writers, Obsidian users and self-hosters.",
    footer: "Every feature on the Free plan. No card needed.",
  });
}
