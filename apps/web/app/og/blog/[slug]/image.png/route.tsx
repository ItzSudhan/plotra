import { formatDate, getPost, postSlugs } from "@/lib/blog";
import { pageCard } from "@/lib/og";

// A post's link card: its title beside its drawing. Drawn at build time. It is
// a route of its own, not an opengraph-image file, so that its address is one
// the sitemap and the structured data can name.

export const generateStaticParams = () => postSlugs().map((slug) => ({ slug }));
export const dynamicParams = false;

export async function GET(_req: Request, { params }: RouteContext<"/og/blog/[slug]/image.png">) {
  const post = await getPost((await params).slug);
  return pageCard({
    section: "Blog",
    title: post.title,
    footer: `${post.tag} · ${formatDate(post.date)} · ${post.minutes} min read`,
    art: post.art,
  });
}
