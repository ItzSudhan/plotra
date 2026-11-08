import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@plotra/icons";
import { PostCard } from "@/components/blog/post-card";
import { AppShot, AudienceCard, HeroShot, Points, Terminal } from "@/components/marketing/audience";
import { Chapter } from "@/components/marketing/chapter";
import { DocTable } from "@/components/marketing/doc-page";
import { Film } from "@/components/marketing/film";
import { FinalCta } from "@/components/marketing/final-cta";
import { Cta } from "@/components/marketing/interactions";
import { PageTransition } from "@/components/marketing/page-transition";
import { Faq } from "@/components/marketing/pricing/faq";
import { Principles } from "@/components/marketing/principles";
import { Reveal } from "@/components/marketing/reveal";
import { audienceCard, audiencePath, audiences, forTitle, getAudience } from "@/lib/audiences";
import { getPost } from "@/lib/blog";
import { cn } from "@/lib/cn";
import { JsonLd } from "@/lib/json-ld";
import { docsUrl, signUpUrl } from "@/lib/links";
import { cardSize, cardType } from "@/lib/og";
import { siteName, siteUrl } from "@/lib/site";

export const generateStaticParams = () => audiences.map((a) => ({ audience: a.slug }));
export const dynamicParams = false;

async function load(params: PageProps<"/for/[audience]">["params"]) {
  const audience = getAudience((await params).audience);
  if (!audience) notFound();
  return audience;
}

export async function generateMetadata({ params }: PageProps<"/for/[audience]">): Promise<Metadata> {
  const a = await load(params);
  const path = audiencePath(a);
  return {
    title: a.title,
    description: a.description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName,
      locale: "en_US",
      url: path,
      title: a.title,
      description: a.description,
      images: [{ url: audienceCard(a), ...cardSize, type: cardType, alt: a.headline.join(" ") }],
    },
  };
}

// A landing page for one kind of writer: what goes wrong for them now, what
// Plotra does about it (shown in the app), a route through it, how it sits
// beside what they use today, their questions, and where to read next.
export default async function AudiencePage({ params }: PageProps<"/for/[audience]">) {
  const a = await load(params);
  const url = `${siteUrl}${audiencePath(a)}`;
  const guides = await Promise.all(a.guides.map(getPost));
  const others = audiences.filter((o) => o.slug !== a.slug);
  const faq = a.faq.map(({ q, a: answer }, i) => ({ id: `q${i + 1}`, q, a: <p>{answer}</p> }));

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
              name: a.title,
              description: a.description,
              image: `${siteUrl}${audienceCard(a)}`,
              isPartOf: { "@id": `${siteUrl}/#website` },
              audience: { "@type": "Audience", audienceType: a.name },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: siteName, item: siteUrl },
                { "@type": "ListItem", position: 2, name: forTitle, item: `${siteUrl}/for` },
                { "@type": "ListItem", position: 3, name: a.name, item: url },
              ],
            },
            {
              "@type": "FAQPage",
              mainEntity: a.faq.map(({ q, a: answer }) => ({
                "@type": "Question",
                name: q,
                acceptedAnswer: { "@type": "Answer", text: answer },
              })),
            },
          ],
        }}
      />

      <div className="px-6 pt-36 sm:pt-44">
        <header className="mx-auto max-w-4xl text-center">
          <nav aria-label="Breadcrumb" className="animate-fade-rise text-[11px] uppercase tracking-[0.2em] text-gray">
            <Link href="/for" className="transition-colors hover:text-black">
              Plotra for
            </Link>{" "}
            · {a.name}
          </nav>
          <h1
            className="mt-4 animate-fade-rise font-display text-[clamp(2.75rem,6.4vw,5rem)] font-normal text-black text-balance"
            style={{ lineHeight: 0.98, letterSpacing: "-0.03em" }}
          >
            {a.headline[0]} <em className="wikilink">{a.headline[1]}</em>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl animate-fade-rise-delay text-lg leading-relaxed text-gray text-pretty">
            {a.intro}
          </p>
          <div className="mt-10 flex animate-fade-rise-delay-2 flex-col items-center justify-center gap-3 sm:flex-row">
            <Cta href={signUpUrl} className="px-8 py-3.5 text-sm">
              Start writing for free
            </Cta>
            <a
              href={`${docsUrl}${a.docs.path}`}
              className="group inline-flex items-center gap-1.5 rounded-full px-5 py-3.5 text-sm text-black transition-colors hover:bg-black/5"
            >
              {a.docs.label}
              <Icon name="arrow-right-linear" className="transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
          <p className="mt-4 animate-fade-rise-delay-2 text-[13px] text-gray">Every feature on the Free plan. No card needed.</p>
        </header>

        <HeroShot shot={a.hero} />
      </div>

      <Film name={`for-${a.slug}`} label={`A 30-second film: Plotra for ${a.name.toLowerCase()}`} />

      <Chapter title="Sound familiar?" className="mt-32 sm:mt-40" />
      <section aria-label="What goes wrong now" className="px-4 pt-12">
        <div className="mx-auto grid max-w-6xl gap-px overflow-hidden rounded-[28px] border border-hairline bg-hairline md:grid-cols-3">
          {a.pains.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.06} className="bg-white p-7 sm:p-8">
              <h3 className="font-display text-[26px] leading-tight text-black">{p.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-gray">{p.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <div className="mx-auto mt-32 max-w-6xl space-y-28 px-6 sm:mt-44 sm:space-y-40">
        {a.features.map((f, i) => (
          <section
            key={f.title}
            aria-label={f.title}
            className={cn(
              "grid items-center gap-10 lg:gap-16",
              i % 2 ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
            )}
          >
            <Reveal className={cn(i % 2 === 1 && "lg:order-2")}>
              <h2
                className="font-display text-[clamp(2rem,3.4vw,2.85rem)] font-normal text-black text-balance"
                style={{ lineHeight: 1.04, letterSpacing: "-0.02em" }}
              >
                {f.title}
              </h2>
              <p className="mt-5 text-[17px] leading-relaxed text-gray text-pretty">{f.body}</p>
              <Points points={f.points} />
            </Reveal>
            <Reveal delay={0.08}>
              {f.shot && <AppShot shot={f.shot} />}
              {f.code && <Terminal code={f.code} />}
            </Reveal>
          </section>
        ))}
      </div>

      {a.table && (
        <section aria-labelledby="side-by-side" className="mx-auto mt-36 max-w-4xl px-6">
          <Reveal>
            <h2 id="side-by-side" className="scroll-mt-28 font-display text-4xl text-black text-balance">
              {a.table.title}
            </h2>
            <DocTable head={a.table.head} rows={a.table.rows} />
            {a.table.note && <p className="mt-4 text-[14px] leading-relaxed text-gray">{a.table.note}</p>}
          </Reveal>
        </section>
      )}

      <Chapter title="How it goes" className="mt-36 sm:mt-48" />
      <ol className="mx-auto mt-14 grid max-w-6xl gap-x-10 gap-y-12 px-6 sm:grid-cols-2 lg:grid-cols-3">
        {a.steps.map((s, i) => (
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

      {a.tools.length > 0 && (
        <>
          <Chapter title="Coming from another tool?" className="mt-36 sm:mt-48">
            Plenty of writers keep the tool they know beside Plotra. Here is what each does well, and what Plotra adds.
          </Chapter>
          <div
            className={cn(
              "mx-auto mt-14 grid max-w-6xl gap-5 px-6",
              a.tools.length > 1 && "md:grid-cols-2",
              a.tools.length > 2 && "lg:grid-cols-3",
              a.tools.length === 1 && "max-w-2xl",
            )}
          >
            {a.tools.map((t, i) => (
              <Reveal key={t.name} delay={i * 0.06} className="rounded-[24px] border border-hairline bg-canvas p-7">
                <h3 className="font-display text-[26px] leading-tight text-black">{t.name}</h3>
                <p className="mt-5 text-[11px] uppercase tracking-[0.2em] text-gray">Good at</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-fg/85">{t.good}</p>
                <p className="mt-5 text-[11px] uppercase tracking-[0.2em] text-ember">Plotra adds</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-fg/85">{t.adds}</p>
              </Reveal>
            ))}
          </div>
        </>
      )}

      <div className="mt-28 sm:mt-36">
        <Principles />
      </div>

      <section aria-labelledby="questions" className="mx-auto mt-20 max-w-3xl px-6">
        <Reveal>
          <h2 id="questions" className="scroll-mt-28 font-display text-4xl text-black">
            Questions
          </h2>
          <Faq items={faq} />
          <p className="mt-6 text-[14px] leading-relaxed text-gray">
            More in the{" "}
            <a href={`${docsUrl}${a.docs.path}`} className="text-black underline decoration-ember/50 underline-offset-4 hover:decoration-ember">
              docs
            </a>
            , and on the{" "}
            <Link href="/pricing" className="text-black underline decoration-ember/50 underline-offset-4 hover:decoration-ember">
              pricing page
            </Link>
            .
          </p>
        </Reveal>
      </section>

      {guides.length > 0 && (
        <section aria-labelledby="guides" className="mx-auto mt-28 max-w-6xl px-6">
          <div className="flex items-baseline justify-between gap-6">
            <h2 id="guides" className="font-display text-4xl text-black">
              Guides to read next
            </h2>
            <Link href="/blog" className="shrink-0 text-[14px] text-black underline decoration-ember/50 underline-offset-4 hover:decoration-ember">
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

      <section aria-labelledby="also" className="mx-auto mt-28 max-w-6xl px-6">
        <div className="flex items-baseline justify-between gap-6">
          <h2 id="also" className="font-display text-4xl text-black">
            Plotra is also for
          </h2>
          <Link href="/for" className="shrink-0 text-[14px] text-black underline decoration-ember/50 underline-offset-4 hover:decoration-ember">
            Everyone it&apos;s for
          </Link>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((o) => (
            <AudienceCard key={o.slug} audience={o} />
          ))}
        </div>
      </section>

      <FinalCta />
    </PageTransition>
  );
}
