import type { MetadataRoute } from "next";
import { audienceCard, audiencePath, audiences } from "@/lib/audiences";
import { getPosts } from "@/lib/blog";
import { compareCard, comparePath, comparisons } from "@/lib/compare";
import { siteUrl } from "@/lib/site";

// Every page of the marketing site. Add a line here when a page is added;
// blog posts, the /for pages and the /compare pages add themselves.
const pages: [path: string, priority: number][] = [
  ["", 1],
  ["/pricing", 0.8],
  ["/download", 0.7],
  ["/press", 0.4],
  ["/for", 0.8],
  ["/compare", 0.8],
  ["/blog", 0.7],
  ["/privacy", 0.2],
  ["/terms", 0.2],
  ["/refunds", 0.2],
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPosts();
  return [
    ...pages.map(([path, priority]) => ({
      url: `${siteUrl}${path}`,
      changeFrequency: path === "" || path === "/blog" ? ("weekly" as const) : ("monthly" as const),
      priority,
    })),
    ...audiences.map((a) => ({
      url: `${siteUrl}${audiencePath(a)}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
      images: [`${siteUrl}${audienceCard(a)}`],
    })),
    ...comparisons.map((c) => ({
      url: `${siteUrl}${comparePath(c)}`,
      lastModified: c.checked,
      changeFrequency: "monthly" as const,
      priority: 0.8,
      images: [`${siteUrl}${compareCard(c)}`],
    })),
    ...posts.map((post) => ({
      url: `${siteUrl}${post.path}`,
      lastModified: post.updated ?? post.date,
      changeFrequency: "monthly" as const,
      priority: 0.6,
      images: [`${siteUrl}${post.card}`],
    })),
  ];
}
