import { cardSize, cardType, drawCard, plainCard } from "@/lib/og-card";
import { noteCard } from "@/lib/public-card";
import { loadPublicNote, openPublicLink } from "@/lib/public-read";

// The card one note of a read-only link unfurls into: its kind, title and
// opening lines, and its first picture when it has one (lib/og-card.tsx).

export const alt = "A note shared from Plotra";
export const size = cardSize;
export const contentType = cardType;

export default async function Image({ params }: { params: Promise<{ token: string; nodeId: string }> }) {
  const { token, nodeId } = await params;
  const link = await openPublicLink(token);
  const note = link.status === "ok" ? await loadPublicNote(link, nodeId) : null;
  return link.status === "ok" && note ? drawCard(await noteCard(link, note)) : plainCard();
}
