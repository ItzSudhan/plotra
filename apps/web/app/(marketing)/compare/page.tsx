import type { Metadata } from "next";
import Image from "next/image";
import { CellView, CompareCard } from "@/components/marketing/compare";
import { FinalCta } from "@/components/marketing/final-cta";
import { Cta } from "@/components/marketing/interactions";
import { PageTransition } from "@/components/marketing/page-transition";
import { Principles } from "@/components/marketing/principles";
import { Reveal } from "@/components/marketing/reveal";
import { comparePath, compareDescription, comparisons, compareTitle, glanceRows, plotraGlance } from "@/lib/compare";
import { JsonLd } from "@/lib/json-ld";
import { signUpUrl } from "@/lib/links";
import { siteName, siteUrl } from "@/lib/site";
import art from "@/content/compare/art/index.webp";

export const metadata: Metadata = {
  title: "Plotra vs Scrivener, World Anvil, Campfire and more",
  description: compareDescription,
  alternates: { canonical: "/compare" },
};

export default function CompareIndex() {
  return (
    <PageTransition>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              name: compareTitle,
              description: compareDescription,
              url: `${siteUrl}/compare`,
              isPartOf: { "@id": `${siteUrl}/#website` },
              mainEntity: {
                "@type": "ItemList",
                itemListElement: comparisons.map((c, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  name: `Plotra vs ${c.name}`,
                  url: `${siteUrl}${comparePath(c)}`,
                })),
              },
            },
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: siteName, item: siteUrl },
                { "@type": "ListItem", position: 2, name: compareTitle, item: `${siteUrl}/compare` },
              ],
            },
          ],
        }}
      />

      <div className="px-6 pt-36 sm:pt-44">
        <header className="mx-auto max-w-3xl text-center">
          <p className="animate-fade-rise text-[11px] uppercase tracking-[0.2em] text-gray">Compare</p>
          <h1
            className="mt-4 animate-fade-rise font-display text-5xl font-normal text-black text-balance sm:text-7xl"
            style={{ lineHeight: 0.98, letterSpacing: "-0.03em" }}
          >
            Your book and your world, <em className="wikilink">in one place.</em>
          </h1>
          <p className="mx-auto mt-6 max-w-xl animate-fade-rise-delay text-lg leading-relaxed text-gray text-pretty">
            Most writers keep the draft in one app, the world in another and the co-writer in a third. Here is how
            Plotra sits beside each of them: what they do well, and what it adds. Every fact about another tool is
            linked to its source.
          </p>
          <div className="mt-10 flex animate-fade-rise-delay-2 justify-center">
            <Cta href={signUpUrl} className="px-8 py-3.5 text-sm">
              Try Plotra for free
            </Cta>
          </div>
        </header>

        <div className="mx-auto mt-16 max-w-5xl overflow-hidden rounded-[28px] border border-hairline bg-canvas sm:mt-20 sm:rounded-[36px]">
          <Image
            src={art}
            alt="Notebooks, a binder, index cards, a map and loose pages on a desk, all drawn toward one open notebook in the middle"
            sizes="(max-width: 1024px) 100vw, 1024px"
            placeholder="blur"
            loading="eager"
            fetchPriority="high"
            className="block aspect-[16/9] w-full object-cover"
          />
        </div>

        <section aria-label="Every comparison" className="mx-auto mt-24 grid max-w-6xl gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {comparisons.map((c, i) => (
            <Reveal key={c.slug} delay={(i % 3) * 0.06} className="h-full">
              <CompareCard c={c} heading="h2" />
            </Reveal>
          ))}
        </section>

        <section aria-labelledby="glance" className="mx-auto mt-32 max-w-6xl">
          <Reveal>
            <h2
              id="glance"
              className="text-center font-display text-[clamp(2.25rem,4.6vw,3.75rem)] font-normal text-black text-balance"
              style={{ lineHeight: 1.02, letterSpacing: "-0.025em" }}
            >
              At a glance
            </h2>
            <p className="mx-auto mt-5 mb-12 max-w-2xl text-center text-base leading-relaxed text-gray text-pretty sm:text-lg">
              What each does out of the box, without plugins. Each tool&apos;s own page has the detail and the sources.
            </p>
            <div className="overflow-x-auto rounded-[24px] border border-hairline bg-white">
              <table className="w-full min-w-[960px] border-collapse text-left text-[13.5px] leading-snug">
                <thead>
                  <tr className="border-b border-hairline">
                    <th scope="col" className="px-4 py-4">
                      <span className="sr-only">Tool</span>
                    </th>
                    {glanceRows.map((r) => (
                      <th key={r.key} scope="col" className="px-4 py-4 text-[11px] font-medium tracking-wide text-gray uppercase">
                        {r.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-ember/[0.05] align-top">
                    <th scope="row" className="px-4 py-3.5 font-display text-[19px] font-normal text-black">
                      Plotra
                    </th>
                    {glanceRows.map((r) => (
                      <td key={r.key} className="px-4 py-3.5 text-fg/85">
                        <CellView cell={plotraGlance[r.key]} />
                      </td>
                    ))}
                  </tr>
                  {comparisons.map((c) => (
                    <tr key={c.slug} className="border-t border-hairline align-top">
                      <th scope="row" className="px-4 py-3.5 font-display text-[19px] font-normal">
                        <a href={comparePath(c)} className="text-black transition-colors hover:text-ember">
                          {c.name}
                        </a>
                      </th>
                      {glanceRows.map((r) => (
                        <td key={r.key} className="px-4 py-3.5 text-fg/85">
                          <CellView cell={c.glance[r.key]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </section>
      </div>

      <div className="mt-28">
        <Principles />
      </div>

      <FinalCta />
    </PageTransition>
  );
}
