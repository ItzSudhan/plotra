import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@plotra/icons";
import { PostCard } from "@/components/blog/post-card";
import { AppShot, AudienceCard, Points } from "@/components/marketing/audience";
import { Chapter } from "@/components/marketing/chapter";
import { CompareCard, CompareTable } from "@/components/marketing/compare";
import { DocTable } from "@/components/marketing/doc-page";
import { Film } from "@/components/marketing/film";
import { FinalCta } from "@/components/marketing/final-cta";
import { Cta } from "@/components/marketing/interactions";
import { PageTransition } from "@/components/marketing/page-transition";
import { Faq } from "@/components/marketing/pricing/faq";
import { Principles } from "@/components/marketing/principles";
import { Reveal } from "@/components/marketing/reveal";
import { getAudience } from "@/lib/audiences";
import { formatDate, getPost } from "@/lib/blog";
import { cn } from "@/lib/cn";
import { compareCard, comparePath, comparisons, compareTitle, getComparison } from "@/lib/compare";
import { JsonLd } from "@/lib/json-ld";
import { issuesUrl, signUpUrl } from "@/lib/links";
import { cardSize, cardType } from "@/lib/og";
import { siteName, siteUrl } from "@/lib/site";

export const generateStaticParams = () => comparisons.map((c) => ({ slug: c.slug }));
export const dynamicParams = false;

async function load(params: PageProps<"/compare/[slug]">["params"]) {
  const c = getComparison((await params).slug);
  if (!c) notFound();
  return c;
}

export async function generateMetadata({ params }: PageProps<"/compare/[slug]">): Promise<Metadata> {
  const c = await load(params);
  const path = comparePath(c);
  return {
    title: c.title,
    description: c.description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      siteName,
      locale: "en_US",
      url: path,
      title: c.title,
      description: c.description,
      modifiedTime: c.checked,
      images: [{ url: compareCard(c), ...cardSize, type: cardType, alt: `Plotra vs ${c.name}` }],
    },
  };
}

const link = "text-black underline decoration-ember/50 underline-offset-4 hover:decoration-ember";

// Plotra beside one other tool: the short answer, what the other tool does
// well, the side-by-side, what Plotra adds (shown in the app), the prices, how
// to move over or use both, questions, and where each fact came from.
export default async function ComparePage({ params }: PageProps<"/compare/[slug]">) {
  const c = await load(params);
  const url = `${siteUrl}${comparePath(c)}`;
  const guides = await Promise.all(c.guides.map(getPost));
  const audiences = c.audiences.map(getAudience).filter((a) => a !== undefined);
  const others = comparisons.filter((o) => o.slug !== c.slug).slice(0, 3);
  const faq = c.faq.map(({ q, a }, i) => ({ id: `q${i + 1}`, q, a: <p>{a}</p> }));

  return (
    <PageTransition>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              "@id": url,
              url,
              name: c.title,
              description: c.description,
              dateModified: c.checked,
              image: `${siteUrl}${compareCard(c)}`,
              isPartOf: { "@id": `${siteUrl}/#website` },
              about: [
                { "@type": "SoftwareApplication", name: "Plotra", applicationCategory: "WritingApplication", url: siteUrl },
                { "@type": "SoftwareApplication", name: c.name, url: c.sources[0]?.url },
              ],
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: siteName, item: siteUrl },
                { "@type": "ListItem", position: 2, name: compareTitle, item: `${siteUrl}/compare` },
                { "@type": "ListItem", position: 3, name: `Plotra vs ${c.name}`, item: url },
              ],
            },
            {
              "@type": "FAQPage",
              mainEntity: c.faq.map(({ q, a }) => ({
                "@type": "Question",
                name: q,
                acceptedAnswer: { "@type": "Answer", text: a },
              })),
            },
          ],
        }}
      />

      <div className="px-6 pt-36 sm:pt-44">
        <header className="mx-auto max-w-4xl text-center">
          <nav aria-label="Breadcrumb" className="animate-fade-rise text-[11px] uppercase tracking-[0.2em] text-gray">
            <Link href="/compare" className="transition-colors hover:text-black">
              Compare
            </Link>{" "}
            · Plotra vs {c.name}
          </nav>
          <h1
            className="mt-4 animate-fade-rise font-display text-[clamp(2.75rem,6.4vw,5rem)] font-normal text-black text-balance"
            style={{ lineHeight: 0.98, letterSpacing: "-0.03em" }}
          >
            {c.headline[0]} <em className="wikilink">{c.headline[1]}</em>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl animate-fade-rise-delay text-lg leading-relaxed text-gray text-pretty">
            {c.intro}
          </p>
          <div className="mt-10 flex animate-fade-rise-delay-2 flex-col items-center justify-center gap-3 sm:flex-row">
            <Cta href={signUpUrl} className="px-8 py-3.5 text-sm">
              Try Plotra for free
            </Cta>
            <a
              href="#side-by-side"
              className="group inline-flex items-center gap-1.5 rounded-full px-5 py-3.5 text-sm text-black transition-colors hover:bg-black/5"
            >
              See the side-by-side
              <Icon name="arrow-down-linear" className="transition-transform group-hover:translate-y-0.5" />
            </a>
          </div>
          <p className="mt-4 animate-fade-rise-delay-2 text-[13px] text-gray">
            Facts about {c.name} checked on {formatDate(c.checked)}, with <a href="#sources" className={link}>sources</a>.
          </p>
        </header>

        <div className="mx-auto mt-16 max-w-5xl overflow-hidden rounded-[28px] border border-hairline bg-canvas sm:mt-20 sm:rounded-[36px]">
          <Image
            src={c.art.src}
            alt={c.art.alt}
            sizes="(max-width: 1024px) 100vw, 1024px"
            placeholder="blur"
            loading="eager"
            fetchPriority="high"
            className="block aspect-[16/9] w-full object-cover"
          />
        </div>
      </div>

      <Film name={`vs-${c.slug}`} label={`A 30-second film: Plotra for people who use ${c.name}`} />

      <Chapter title="The short answer" className="mt-28 sm:mt-36" />
      <section aria-label="Which to choose" className="mx-auto mt-12 grid max-w-5xl gap-5 px-6 md:grid-cols-2">
        <Reveal className="h-full rounded-[28px] border border-hairline bg-canvas p-7 sm:p-9">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gray">Choose {c.name} if</p>
          <ul className="mt-5 space-y-3">
            {c.verdict.them.map((v) => (
              <li key={v} className="flex gap-3 text-[15.5px] leading-snug text-fg/85">
                <Icon name="arrow-right-linear" className="mt-0.5 shrink-0 text-gray" />
                {v}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={0.06} className="h-full rounded-[28px] border border-black bg-black p-7 text-white sm:p-9">
          <p className="text-[11px] uppercase tracking-[0.2em] text-ember">Choose Plotra if</p>
          <ul className="mt-5 space-y-3">
            {c.verdict.plotra.map((v) => (
              <li key={v} className="flex gap-3 text-[15.5px] leading-snug text-white/90">
                <Icon name="check-circle-linear" className="mt-0.5 shrink-0 text-ember" />
                {v}
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      <Chapter title={`What ${c.name} does well`} className="mt-32 sm:mt-40">
        Plenty of writers love it, and many keep it beside Plotra. Credit where it&apos;s due.
      </Chapter>
      <section aria-label={`What ${c.name} does well`} className="px-4 pt-12">
        <div
          className={cn(
            "mx-auto grid max-w-6xl gap-px overflow-hidden rounded-[28px] border border-hairline bg-hairline",
            c.strengths.length % 3 === 0 ? "md:grid-cols-3" : "md:grid-cols-2",
          )}
        >
          {c.strengths.map((s, i) => (
            <Reveal key={s.title} delay={(i % 3) * 0.06} className="bg-white p-7 sm:p-8">
              <h3 className="font-display text-[24px] leading-tight text-black">{s.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-gray">{s.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section aria-labelledby="side-by-side" className="mx-auto mt-32 max-w-5xl px-6 sm:mt-40">
        <Reveal>
          <h2
            id="side-by-side"
            className="scroll-mt-28 text-center font-display text-[clamp(2.25rem,4.6vw,3.75rem)] font-normal text-black text-balance"
            style={{ lineHeight: 1.02, letterSpacing: "-0.025em" }}
          >
            Side by side
          </h2>
          <p className="mx-auto mt-5 mb-12 max-w-2xl text-center text-base leading-relaxed text-gray text-pretty sm:text-lg">
            What each one does out of the box, on its own site, as of {formatDate(c.checked)}. Plugins and workarounds
            not counted.
          </p>
          <CompareTable c={c} />
        </Reveal>
      </section>

      <Chapter title="What Plotra adds" className="mt-36 sm:mt-48" />
      <div className="mx-auto mt-16 max-w-6xl space-y-28 px-6 sm:mt-24 sm:space-y-40">
        {c.features.map((f, i) => (
          <section
            key={f.title}
            aria-label={f.title}
            className={cn(
              "grid items-center gap-10 lg:gap-16",
              i % 2 ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
            )}
          >
            <Reveal className={cn(i % 2 === 1 && "lg:order-2")}>
              <h3
                className="font-display text-[clamp(2rem,3.4vw,2.85rem)] font-normal text-black text-balance"
                style={{ lineHeight: 1.04, letterSpacing: "-0.02em" }}
              >
                {f.title}
              </h3>
              <p className="mt-5 text-[17px] leading-relaxed text-gray text-pretty">{f.body}</p>
              <Points points={f.points} />
            </Reveal>
            <Reveal delay={0.08}>
              <AppShot shot={f.shot} />
            </Reveal>
          </section>
        ))}
      </div>

      <section aria-labelledby="pricing" className="mx-auto mt-36 max-w-4xl px-6">
        <Reveal>
          <h2 id="pricing" className="scroll-mt-28 font-display text-4xl text-black text-balance">
            What each costs
          </h2>
          <DocTable head={["", "Plotra", c.name]} rows={c.pricing.rows} />
          <p className="mt-4 text-[14px] leading-relaxed text-gray">
            {c.pricing.note ? `${c.pricing.note} ` : ""}
            {c.name}&apos;s prices as listed on its site on {formatDate(c.checked)}; they may have changed since. Plotra&apos;s
            are on the{" "}
            <Link href="/pricing" className={link}>
              pricing page
            </Link>
            .
          </p>
        </Reveal>
      </section>

      {c.voices && c.voices.length > 0 && (
        <section aria-labelledby="voices" className="mx-auto mt-32 max-w-6xl px-6">
          <Reveal>
            <h2 id="voices" className="text-center font-display text-4xl text-black text-balance">
              What {c.name} users ask for
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-[15px] leading-relaxed text-gray text-pretty">
              In their own words, on public forums and review sites. Follow each link to read the whole thread.
            </p>
          </Reveal>
          <div
            className={cn(
              "mt-12 grid gap-5",
              c.voices.length > 1 && "md:grid-cols-2",
              c.voices.length > 2 && "lg:grid-cols-3",
            )}
          >
            {c.voices.map((v, i) => (
              <Reveal key={v.url} delay={i * 0.06} className="h-full">
                <figure className="flex h-full flex-col rounded-[24px] border border-hairline bg-canvas p-7">
                  <blockquote className="flex-1 font-display text-[21px] leading-snug text-black text-pretty">
                    &ldquo;{v.quote}&rdquo;
                  </blockquote>
                  <figcaption className="mt-5 text-[13px] text-gray">
                    <a href={v.url} target="_blank" rel="noopener nofollow" className={link}>
                      {v.who}
                    </a>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <Chapter title={c.switching.title} className="mt-36 sm:mt-48">
        {c.switching.intro}
      </Chapter>
      <ol className="mx-auto mt-14 grid max-w-6xl gap-x-10 gap-y-12 px-6 sm:grid-cols-2 lg:grid-cols-3">
        {c.switching.steps.map((s, i) => (
          <li key={s.title}>
            <Reveal delay={(i % 3) * 0.06} className="border-t border-hairline pt-6">
              <span aria-hidden className="font-display text-[44px] leading-none text-ember/80">
                {i + 1}
              </span>
              <h3 className="mt-4 text-[18px] font-medium text-black">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-gray text-pretty">{s.body}</p>
            </Reveal>
          </li>
        ))}
      </ol>

      <div className="mt-28 sm:mt-36">
        <Principles />
      </div>

      <section aria-labelledby="questions" className="mx-auto mt-20 max-w-3xl px-6">
        <Reveal>
          <h2 id="questions" className="scroll-mt-28 font-display text-4xl text-black">
            Questions
          </h2>
          <Faq items={faq} />
        </Reveal>
      </section>

      <section aria-labelledby="sources" className="mx-auto mt-20 max-w-3xl px-6">
        <Reveal className="rounded-[24px] border border-hairline bg-canvas p-7">
          <h2 id="sources" className="scroll-mt-28 font-display text-2xl text-black">
            Sources
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-gray text-pretty">
            Everything this page says about {c.name} comes from these pages, checked on {formatDate(c.checked)}. If
            something has changed or we got it wrong, tell us on{" "}
            <a href={issuesUrl} className={link}>
              GitHub
            </a>{" "}
            and we&apos;ll fix it.
          </p>
          <ul className="mt-4 space-y-2 text-[14px]">
            {c.sources.map((s) => (
              <li key={s.url} className="flex gap-2">
                <Icon name="link-linear" className="mt-0.5 shrink-0 text-gray" />
                <a href={s.url} target="_blank" rel="noopener nofollow" className={link}>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[12.5px] leading-relaxed text-gray">
            {c.name} is a trademark of its owner. Plotra is not affiliated with or endorsed by it.
          </p>
        </Reveal>
      </section>

      {audiences.length > 0 && (
        <section aria-labelledby="for" className="mx-auto mt-28 max-w-6xl px-6">
          <h2 id="for" className="font-display text-4xl text-black">
            Plotra for you
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {audiences.map((a) => (
              <AudienceCard key={a.slug} audience={a} />
            ))}
          </div>
        </section>
      )}

      {guides.length > 0 && (
        <section aria-labelledby="guides" className="mx-auto mt-28 max-w-6xl px-6">
          <div className="flex items-baseline justify-between gap-6">
            <h2 id="guides" className="font-display text-4xl text-black">
              Guides to read next
            </h2>
            <Link href="/blog" className={cn("shrink-0 text-[14px]", link)}>
              All posts
            </Link>
          </div>
          <div className="mt-10 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {guides.map((post) => (
              <PostCard key={post.slug} post={post} heading="h3" />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="more" className="mx-auto mt-28 max-w-6xl px-6">
        <div className="flex items-baseline justify-between gap-6">
          <h2 id="more" className="font-display text-4xl text-black">
            More comparisons
          </h2>
          <Link href="/compare" className={cn("shrink-0 text-[14px]", link)}>
            All of them
          </Link>
        </div>
        <div className="mt-10 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((o) => (
            <CompareCard key={o.slug} c={o} />
          ))}
        </div>
      </section>

      <FinalCta />
    </PageTransition>
  );
}
