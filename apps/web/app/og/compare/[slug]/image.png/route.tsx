import { comparisons, getComparison } from "@/lib/compare";
import { pageCard } from "@/lib/og";

// The link card of a /compare page. Drawn at build time, like the /for cards.

export const generateStaticParams = () => comparisons.map((c) => ({ slug: c.slug }));
export const dynamicParams = false;

export async function GET(_req: Request, { params }: RouteContext<"/og/compare/[slug]/image.png">) {
  const c = getComparison((await params).slug)!;
  return pageCard({
    section: `Plotra vs ${c.name}`,
    title: c.headline.join(" "),
    description: c.summary,
    footer: "Every feature on the Free plan. No card needed.",
  });
}
