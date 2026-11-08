import { audiences, getAudience } from "@/lib/audiences";
import { pageCard } from "@/lib/og";

// The link card of a /for page: who it is for, and its promise. Drawn at build
// time. A route of its own, like a post's, so the page's structured data can name it.

export const generateStaticParams = () => audiences.map((a) => ({ audience: a.slug }));
export const dynamicParams = false;

export async function GET(_req: Request, { params }: RouteContext<"/og/for/[audience]/image.png">) {
  const a = getAudience((await params).audience)!;
  return pageCard({
    section: a.name,
    title: a.headline.join(" "),
    description: a.summary,
    footer: "Every feature on the Free plan. No card needed.",
  });
}
