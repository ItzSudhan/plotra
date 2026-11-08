import { cardSize, cardType, pageCard } from "@/lib/og";

export const alt = "Plotra pricing: free to write, Pro when you need room";
export const size = cardSize;
export const contentType = cardType;

export default function Image() {
  return pageCard({
    section: "Pricing",
    title: "Free to write. Pro when you need room.",
    description: "Every feature is on the Free plan. Pro is $10 a month for the whole workspace, not per person.",
    footer: "No card needed to start.",
  });
}
