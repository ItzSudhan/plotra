import { cardSize, cardType, drawCard, plainCard } from "@/lib/og-card";
import { projectCard } from "@/lib/public-card";
import { openPublicLink } from "@/lib/public-read";

// The card a read-only link's front page unfurls into: the project's title,
// what it's about and what it holds (lib/og-card.tsx).

export const alt = "A project shared from Plotra";
export const size = cardSize;
export const contentType = cardType;

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const link = await openPublicLink((await params).token);
  return link.status === "ok" ? drawCard(projectCard(link)) : plainCard();
}
