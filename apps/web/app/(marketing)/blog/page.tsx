import type { Metadata } from "next";
import { FeaturedPost, PostCard } from "@/components/blog/post-card";
import { PostIndex } from "@/components/blog/post-index";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageTransition } from "@/components/marketing/page-transition";
import { blogDescription, blogTitle, getPosts } from "@/lib/blog";
import { JsonLd } from "@/lib/json-ld";
import { siteName, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Blog: guides for novelists and worldbuilders",
  description: blogDescription,
  alternates: {
    canonical: "/blog",
    types: { "application/rss+xml": [{ url: "/blog/rss.xml", title: blogTitle }] },
  },
};

export default async function BlogPage() {
  const posts = await getPosts();

  return (
    <PageTransition>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Blog",
          name: blogTitle,
          description: blogDescription,
          url: `${siteUrl}/blog`,
          publisher: { "@type": "Organization", name: siteName, url: siteUrl },
          blogPost: posts.map((p) => ({
            "@type": "BlogPosting",
            headline: p.title,
            url: `${siteUrl}${p.path}`,
            datePublished: p.date,
          })),
        }}
      />
      <div className="px-6 pt-36 sm:pt-44">
        <header className="mx-auto max-w-3xl text-center">
          <p className="animate-fade-rise text-[11px] uppercase tracking-[0.2em] text-gray">Blog</p>
          <h1
            className="mt-4 animate-fade-rise font-display text-5xl font-normal text-black text-balance sm:text-7xl"
            style={{ lineHeight: 0.98, letterSpacing: "-0.03em" }}
          >
            Guides for writers <em className="wikilink">who build worlds.</em>
          </h1>
          <p className="mx-auto mt-6 max-w-xl animate-fade-rise-delay text-lg leading-relaxed text-gray text-pretty">
            How to outline, keep a story bible, hold a timeline together, catch your own plot holes, and write with
            other people. Each one works with whatever you write in.
          </p>
          <p className="mt-5 animate-fade-rise-delay text-[13px] text-gray">
            New guides by{" "}
            <a href="/blog/rss.xml" className="text-black underline decoration-ember/50 underline-offset-4 hover:decoration-ember">
              RSS
            </a>
          </p>
        </header>

        <PostIndex
          entries={posts.map((post, i) => ({
            slug: post.slug,
            tag: post.tag,
            card: <PostCard post={post} />,
            feature: i === 0 ? <FeaturedPost post={post} /> : undefined,
          }))}
        />
      </div>

      <FinalCta />
    </PageTransition>
  );
}
