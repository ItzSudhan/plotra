import type { Metadata } from "next";
import { AudienceCard } from "@/components/marketing/audience";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageTransition } from "@/components/marketing/page-transition";
import { Principles } from "@/components/marketing/principles";
import { Reveal } from "@/components/marketing/reveal";
import { audiencePath, audiences, forDescription, forTitle } from "@/lib/audiences";
import { JsonLd } from "@/lib/json-ld";
import { docsUrl } from "@/lib/links";
import { siteName, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "For novelists, worldbuilders, GMs and co-writers",
  description: forDescription,
  alternates: { canonical: "/for" },
};

// Kinds of writing without a page here yet (gtm-plan.md, ring 3); the docs
// have a route for each.
const more: [string, string][] = [
  ["Screenwriters", "/docs/for/screenwriters"],
  ["Game writers", "/docs/for/game-writers"],
  ["Non-fiction and research", "/docs/for/nonfiction"],
  ["Writers' rooms and studios", "/docs/for/teams"],
];

export default function ForPage() {
  return (
    <PageTransition>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              name: forTitle,
              description: forDescription,
              url: `${siteUrl}/for`,
              isPartOf: { "@id": `${siteUrl}/#website` },
              mainEntity: {
                "@type": "ItemList",
                itemListElement: audiences.map((a, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  name: a.name,
                  url: `${siteUrl}${audiencePath(a)}`,
                })),
              },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: siteName, item: siteUrl },
                { "@type": "ListItem", position: 2, name: forTitle, item: `${siteUrl}/for` },
              ],
            },
          ],
        }}
      />

      <div className="px-6 pt-36 sm:pt-44">
        <header className="mx-auto max-w-3xl text-center">
          <p className="animate-fade-rise text-[11px] uppercase tracking-[0.2em] text-gray">Who it&apos;s for</p>
          <h1
            className="mt-4 animate-fade-rise font-display text-5xl font-normal text-black text-balance sm:text-7xl"
            style={{ lineHeight: 0.98, letterSpacing: "-0.03em" }}
          >
            Made for people who <em className="wikilink">build worlds.</em>
          </h1>
          <p className="mx-auto mt-6 max-w-xl animate-fade-rise-delay text-lg leading-relaxed text-gray text-pretty">
            Plotra is one app with many tools, and nobody needs all of them. Find the kind of writing closest to yours
            to see what it does for you, and how to start.
          </p>
        </header>

        <section aria-label="Who Plotra is for" className="mx-auto mt-20 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {audiences.map((a, i) => (
            <Reveal key={a.slug} delay={(i % 3) * 0.06} className="h-full">
              <AudienceCard audience={a} heading="h2" />
            </Reveal>
          ))}
        </section>

        <Reveal className="mx-auto mt-16 max-w-3xl rounded-[24px] border border-hairline bg-canvas p-7 text-center">
          <h2 className="font-display text-2xl text-black">Also in Plotra</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-fg/85 text-pretty">
            Script formats, production breakdowns, branching dialogue and localization are built in, with project
            types made around them. The docs have a route through each:{" "}
            {more.map(([label, path], i) => (
              <span key={path}>
                <a href={`${docsUrl}${path}`} className="text-black underline decoration-ember/50 underline-offset-4 hover:decoration-ember">
                  {label}
                </a>
                {i < more.length - 2 ? ", " : i === more.length - 2 ? " and " : "."}
              </span>
            ))}
          </p>
        </Reveal>
      </div>

      <div className="mt-24">
        <Principles />
      </div>

      <FinalCta />
    </PageTransition>
  );
}
