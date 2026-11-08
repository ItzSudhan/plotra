import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MDXContent } from "mdx/types";
import type { ArtName } from "@/components/blog/art";

// The blog. A post is one MDX file in content/blog: its file name is its
// address, and it opens with `export const meta = { ... }`. Adding a file adds
// the post to the index, the sitemap and the feed.

export type PostMeta = {
  /** The headline and the tab title. 60 characters or fewer. */
  title: string;
  /** What the reader will be able to do, for search results and link cards. 140 to 160 characters. */
  description: string;
  /** The day it was published, as YYYY-MM-DD. */
  date: string;
  /** The day it was last changed, if it has been. */
  updated?: string;
  tag: string;
  /** Which drawing heads the post (components/blog/art.tsx). */
  art: ArtName;
  /** Questions printed under the post and given to search engines as structured data. Plain text. */
  faq?: { q: string; a: string }[];
};

export type Post = PostMeta & {
  slug: string;
  /** The path on this site, such as /blog/how-to-outline-a-novel. */
  path: string;
  /** The path of its link card, the image a link to it unfurls into. */
  card: string;
  minutes: number;
  /** The post's sections, its "## " headings, for the list beside it. */
  headings: { id: string; label: string }[];
};

const dir = join(process.cwd(), "content/blog");

export const blogTitle = "The Plotra blog";
export const blogDescription =
  "Practical guides for novelists, series writers and game masters: outlining, story bibles, timelines, continuity, co-writing and beta readers.";

export const postSlugs = () =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.slice(0, -4));

const source = (slug: string) => readFileSync(join(dir, `${slug}.mdx`), "utf8").replace(/export const meta = \{[\s\S]*?\n\};/, "");

/** How long the post takes to read, at 230 words a minute. */
const minutes = (text: string) => Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 230));

/**
 * The "## " headings and the ids rehype-slug gives them: lower case, punctuation
 * dropped, spaces turned to hyphens, and a number added to a repeat.
 */
function headings(text: string) {
  const seen = new Map<string, number>();
  return [...text.matchAll(/^## (.+)$/gm)].map(([, raw]) => {
    const label = raw.replace(/[*_`]/g, "").trim();
    const base = label.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { id: n ? `${base}-${n}` : base, label };
  });
}

export async function getPost(slug: string): Promise<Post & { Content: MDXContent }> {
  const post = (await import(`@/content/blog/${slug}.mdx`)) as { default: MDXContent; meta: PostMeta };
  const text = source(slug);
  return {
    ...post.meta,
    slug,
    path: `/blog/${slug}`,
    card: `/og/blog/${slug}/image.png`,
    minutes: minutes(text),
    headings: headings(text),
    Content: post.default,
  };
}

/** Every post, newest first. */
export async function getPosts(): Promise<Post[]> {
  const posts: Post[] = await Promise.all(postSlugs().map(getPost));
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

/** A date as the site writes it: 5 October 2026. */
export const formatDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
