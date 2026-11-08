import type { Metadata } from "next";
import Link from "next/link";
import { PostCover } from "@/components/blog/cover";
import { CopyLink } from "@/components/blog/copy-link";
import { PostCard } from "@/components/blog/post-card";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageTransition } from "@/components/marketing/page-transition";
import { TocInline, TocSidebar } from "@/components/marketing/toc";
import { formatDate, getPost, getPosts, postSlugs } from "@/lib/blog";
import { cn } from "@/lib/cn";
import { JsonLd } from "@/lib/json-ld";
import { cardSize, cardType } from "@/lib/og";
import { siteName, siteUrl } from "@/lib/site";

export const generateStaticParams = () => postSlugs().map((slug) => ({ slug }));
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const post = await getPost((await params).slug);
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: post.path },
    openGraph: {
      type: "article",
      siteName,
      locale: "en_US",
      url: post.path,
      title: post.title,
      description: post.description,
      publishedTime: post.date,
      modifiedTime: post.updated ?? post.date,
      authors: [siteName],
      section: post.tag,
      images: [{ url: post.card, ...cardSize, type: cardType, alt: post.title }],
    },
  };
}

export default async function PostPage({ params }: PageProps<"/blog/[slug]">) {
  const { Content, ...post } = await getPost((await params).slug);
  const others = (await getPosts()).filter((p) => p.slug !== post.slug);
  // Up to three more to read: the same subject first, then the rest.
  const more = [...others.filter((p) => p.tag === post.tag), ...others.filter((p) => p.tag !== post.tag)].slice(0, 3);
  const url = `${siteUrl}${post.path}`;
  const toc = [...post.headings, ...(post.faq?.length ? [{ id: "questions", label: "Questions" }] : [])];
  const publisher = {
    "@type": "Organization",
    name: siteName,
    url: siteUrl,
    logo: { "@type": "ImageObject", url: `${siteUrl}/logo.png` },
  };

  return (
    <PageTransition>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BlogPosting",
              headline: post.title,
              description: post.description,
              image: `${siteUrl}${post.card}`,
              datePublished: post.date,
              dateModified: post.updated ?? post.date,
              articleSection: post.tag,
              mainEntityOfPage: url,
              author: publisher,
              publisher,
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: siteName, item: siteUrl },
                { "@type": "ListItem", position: 2, name: "Blog", item: `${siteUrl}/blog` },
                { "@type": "ListItem", position: 3, name: post.title, item: url },
              ],
            },
            ...(post.faq?.length
              ? [
                  {
                    "@type": "FAQPage",
                    mainEntity: post.faq.map(({ q, a }) => ({
                      "@type": "Question",
                      name: q,
                      acceptedAnswer: { "@type": "Answer", text: a },
                    })),
                  },
                ]
              : []),
          ],
        }}
      />

      <article className="px-6 pt-36 sm:pt-44">
        <header className="mx-auto max-w-3xl">
          <nav aria-label="Breadcrumb" className="text-[11px] uppercase tracking-[0.2em] text-gray">
            <Link href="/blog" className="transition-colors hover:text-black">
              Blog
            </Link>{" "}
            · {post.tag}
          </nav>
          <h1
            className="mt-4 font-display text-4xl font-normal text-black text-balance sm:text-6xl"
            style={{ lineHeight: 1.02, letterSpacing: "-0.03em" }}
          >
            {post.title}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-gray text-pretty">{post.description}</p>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-hairline pt-5">
            <p className="text-[13px] text-gray">
              <time dateTime={post.date}>{formatDate(post.date)}</time>
              {post.updated && (
                <>
                  {" "}
                  · Updated <time dateTime={post.updated}>{formatDate(post.updated)}</time>
                </>
              )}{" "}
              · {post.minutes} min read
            </p>
            <CopyLink url={url} />
          </div>
        </header>

        <div className="mx-auto mt-12 max-w-5xl overflow-hidden rounded-[28px] border border-hairline bg-canvas sm:rounded-[36px]">
          <PostCover post={post} sizes="(max-width: 1024px) 100vw, 1024px" priority className="block aspect-[16/9] w-full" />
        </div>

        {/* On a wide screen the sections sit in a column beside the text; on a narrower one they fold up above it. */}
        <div className="mx-auto mt-14 xl:grid xl:max-w-[76rem] xl:grid-cols-[14rem_minmax(0,42rem)_14rem] xl:justify-center xl:gap-12">
          <aside className="hidden xl:block">
            <TocSidebar items={toc} />
          </aside>
          <div className="min-w-0">
            <TocInline items={toc} className="mx-auto mb-12 max-w-[42rem] xl:hidden" />

            {/* Set in the face the editor writes in. Text elements are styled from here so a post stays plain Markdown; a "not-prose" block keeps its own links and paragraphs. */}
            <div
              className={cn(
                "mx-auto max-w-[42rem] font-prose text-[19px] leading-[1.7] text-fg/90",
                "[&_h2]:mt-14 [&_h2]:scroll-mt-28 [&_h2]:font-display [&_h2]:text-[32px] [&_h2]:leading-[1.12] [&_h2]:tracking-[-0.015em] [&_h2]:text-black [&_h2]:text-balance",
                "[&_h3]:mt-9 [&_h3]:scroll-mt-28 [&_h3]:font-sans [&_h3]:text-[18px] [&_h3]:font-medium [&_h3]:text-black",
                "[&_p:not(.not-prose_p)]:mt-5 [&_ul]:mt-5 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ol]:mt-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_li>p]:mt-0 [&_li]:marker:text-faint",
                "[&_a:not(.not-prose_a)]:text-black [&_a:not(.not-prose_a)]:underline [&_a:not(.not-prose_a)]:decoration-ember/50 [&_a:not(.not-prose_a)]:underline-offset-4 [&_a:not(.not-prose_a)]:transition-colors hover:[&_a:not(.not-prose_a)]:decoration-ember",
                "[&_strong]:font-semibold [&_strong]:text-black",
                "[&_code]:rounded [&_code]:bg-well [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8em]",
                "[&_blockquote]:mt-6 [&_blockquote]:border-l-2 [&_blockquote]:border-ember/50 [&_blockquote]:pl-5 [&_blockquote]:text-fg/75",
                "[&_table]:w-full [&_table]:min-w-[520px] [&_table]:border-collapse [&_table]:text-left [&_table]:text-[14px] [&_table]:leading-snug",
                "[&_thead_tr]:bg-canvas [&_th]:px-4 [&_th]:py-3 [&_th]:text-[12px] [&_th]:font-medium [&_th]:tracking-wide [&_th]:text-gray [&_th]:uppercase",
                "[&_td]:border-t [&_td]:border-hairline [&_td]:px-4 [&_td]:py-3 [&_td]:align-top [&_td]:text-fg/85 [&_td:first-child]:text-black",
              )}
            >
              <Content />
            </div>

            {post.faq && post.faq.length > 0 && (
              <section aria-labelledby="questions" className="mx-auto mt-20 max-w-[42rem]">
                <h2 id="questions" className="scroll-mt-28 font-display text-[32px] leading-tight tracking-[-0.015em] text-black">
                  Questions
                </h2>
                <dl className="mt-6 divide-y divide-hairline border-y border-hairline">
                  {post.faq.map(({ q, a }) => (
                    <div key={q} className="py-5">
                      <dt className="text-[17px] font-medium text-black">{q}</dt>
                      <dd className="mt-2 text-[15.5px] leading-[1.7] text-fg/85">{a}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        </div>

        {more.length > 0 && (
          <section aria-labelledby="more" className="mx-auto mt-28 max-w-6xl">
            <div className="flex items-baseline justify-between gap-6">
              <h2 id="more" className="font-display text-4xl text-black">
                Keep reading
              </h2>
              <Link href="/blog" className="text-[14px] text-black underline decoration-ember/50 underline-offset-4 hover:decoration-ember">
                All posts
              </Link>
            </div>
            <div className="mt-10 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {more.map((p) => (
                <PostCard key={p.slug} post={p} heading="h3" />
              ))}
            </div>
          </section>
        )}
      </article>

      <FinalCta />
    </PageTransition>
  );
}
