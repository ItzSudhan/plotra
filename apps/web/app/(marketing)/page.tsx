import { Bento } from "@/components/marketing/bento";
import { Chapter, Interlude, Stage } from "@/components/marketing/chapter";
import { FinalCta } from "@/components/marketing/final-cta";
import { Tour } from "@/components/marketing/film";
import { Hero } from "@/components/marketing/hero";
import { PageTransition } from "@/components/marketing/page-transition";
import { Principles } from "@/components/marketing/principles";
import { Prologue } from "@/components/marketing/prologue";
import { ShapingMarquee } from "@/components/marketing/shaping-marquee";
import { Sharing } from "@/components/marketing/sharing";
import { SpoilerHorizon } from "@/components/marketing/spoiler-horizon";
import { ViewsShowcase } from "@/components/marketing/views-showcase";
import { JsonLd } from "@/lib/json-ld";
import { contactEmail, repoUrl } from "@/lib/links";
import { siteDescription, siteName, siteUrl } from "@/lib/site";

// Structured data, so a search result can show Plotra as an app with a free
// plan, and knows who makes it and what the site is called.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: siteName,
      url: siteUrl,
      logo: `${siteUrl}/logo.png`,
      email: contactEmail,
      sameAs: [repoUrl],
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      name: siteName,
      url: siteUrl,
      description: siteDescription,
      publisher: { "@id": `${siteUrl}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      name: siteName,
      url: siteUrl,
      image: `${siteUrl}/opengraph-image`,
      description: siteDescription,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": `${siteUrl}/#organization` },
    },
  ],
};

// The page is told as a story: the scattered draft (prologue), the one place
// that gathers it, with the full tour on film (I), the people who write it (II), the shapes it can take
// (III), the canon that keeps it true (IV), who gets to see it (V), how it is
// made one's own, and an invitation to begin (epilogue).
export default function HomePage() {
  return (
    <PageTransition>
      <JsonLd data={jsonLd} />
      <Hero />
      <Prologue />
      <Tour className="mt-24 sm:mt-32" />

      <Chapter
        className="mt-32 sm:mt-44"
        title={
          <>
            Everyone at the <em className="wikilink">same desk.</em>
          </>
        }
      >
        No more merging three copies of the same chapter. Co-writers and editors work in the same scene at the same
        moment, with named cursors, comments, suggestions and a version history you can restore from.
      </Chapter>
      <Stage>
        <Bento />
      </Stage>

      <Chapter
        id="studio"
        title={
          <>
            One story, <em className="wikilink">every shape.</em>
          </>
        }
        className="mt-40 sm:mt-56"
      >
        Stuck in the prose? Look at the same story as a timeline, a plot grid or a storyboard, and see what the page
        was hiding. Every view is the same project, side by side in split panes.
      </Chapter>
      <Stage>
        <ViewsShowcase />
      </Stage>

      <Interlude cta="Start writing for free">
        Your notes already know how your story fits together. <em className="wikilink">Let them show you.</em>
      </Interlude>

      <Chapter
        id="worlds"
        title={
          <>
            Reveal your world <em className="wikilink">one release at a time.</em>
          </>
        }
      >
        Never spoil your own series. Tag a note, or a single paragraph, with the book, season or session that reveals
        it, then see your world as your audience does at that point, so the recap for Book II doesn&apos;t give away
        Book IV.
      </Chapter>
      <Stage>
        <SpoilerHorizon />
      </Stage>

      <Interlude cta="Start writing for free">
        Readers notice every slip. <em className="wikilink">Catch it before they do.</em>
      </Interlude>

      <Chapter
        id="sharing"
        title={
          <>
            Share a project <em className="wikilink">like a document.</em>
          </>
        }
      >
        Get feedback without sending a file. Add one person to one project by email, as a viewer, a commenter or an
        editor, or invite your co-writers to the whole workspace.
      </Chapter>
      <Stage>
        <Sharing />
      </Stage>

      <Chapter
        title={
          <>
            Made for novels and campaigns, <em className="wikilink">yours to shape.</em>
          </>
        }
        className="mt-40 sm:mt-56"
      >
        A project starts with a binder, an editor and five views. Switch on the tools its story needs, and arrange
        the ribbon, the inspector, the labels and the words to suit how you work.
      </Chapter>
      <ShapingMarquee />
      <Principles />

      <FinalCta />
    </PageTransition>
  );
}
