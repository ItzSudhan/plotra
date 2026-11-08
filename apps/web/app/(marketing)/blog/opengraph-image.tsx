import { blogDescription } from "@/lib/blog";
import { cardSize, cardType, pageCard } from "@/lib/og";

export const alt = "The Plotra blog: practical guides for novelists and worldbuilders";
export const size = cardSize;
export const contentType = cardType;

export default function Image() {
  return pageCard({
    section: "Blog",
    title: "Guides for writers who build worlds",
    description: blogDescription,
    footer: "plotra.ink/blog",
  });
}
