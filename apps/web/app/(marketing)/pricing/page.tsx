import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@plotra/icons";
import { DocTable } from "@/components/marketing/doc-page";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageTransition } from "@/components/marketing/page-transition";
import { Faq, type Question } from "@/components/marketing/pricing/faq";
import { Plans } from "@/components/marketing/pricing/plans";
import { Reveal } from "@/components/marketing/reveal";
import { contactEmail, discordUrl, docsUrl, salesEmail } from "@/lib/links";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Plotra has a Free plan with every feature, and Pro at $10 a month per workspace for more room, more collaborators and hosted AI. Enterprise is priced by arrangement.",
};

// The numbers on this page are plan.md 8.2. Keep the two in step, together
// with the "Plans and billing" page in the docs.

const free = [
  "10 projects per workspace",
  "50 MB of storage per workspace",
  "Files up to 10 MB",
  "3 workspace members, counting the owner",
  "5 guests per shared project",
  "Every view, module and feature",
  "AI agent on your own API key or a local model",
];

const pro = [
  "Unlimited projects",
  "50 GB of storage per workspace",
  "Files up to 100 MB",
  "25 workspace members",
  "200 guests per shared project",
  "Every view, module and feature",
  "Hosted AI: 1,500 credits a month, no key needed",
  "Your own key still works, and uses no credits",
];

const compare: React.ReactNode[][] = [
  ["Price", "$0", "$10 a month, or $96 a year, per workspace"],
  ["Projects per workspace", "10", "Unlimited"],
  ["Storage per workspace", "50 MB", "50 GB"],
  ["One uploaded file", "10 MB", "100 MB"],
  ["Workspace members", "3, counting the owner", "25"],
  ["Guests per shared project", "5", "200"],
  ["Views, modules and features", "All of them", "All of them"],
  ["AI agent on your own key or a local model", "Yes", "Yes, and it uses no credits"],
  ["Hosted AI", "No", "1,500 credits a month"],
  ["Export", "Always", "Always"],
];

const Contact = () => <a href={`mailto:${contactEmail}`}>{contactEmail}</a>;

const faq: Question[] = [
  {
    id: "trial",
    q: "Is the Free plan a trial?",
    a: (
      <p>
        No. It has no time limit and asks for no card, and every view, module and feature is on it. The reasons to
        move to Pro are more projects, more storage, more people, or hosted AI.
      </p>
    ),
  },
  {
    id: "credits",
    q: "What is an AI credit?",
    a: (
      <>
        <p>
          One credit is 1,000 input tokens: the text the model reads. Output tokens, the text it writes, count five
          times, so 1,000 output tokens cost 5 credits. A Pro workspace gets 1,500 credits each billing period. They
          are shared by the workspace, reset when the period renews, and don&apos;t roll over.
        </p>
        <p>
          Credits only pay for hosted AI, the model Plotra provides so that nobody needs a key. Runs on your own API
          key or a local model use no credits, on either plan.
        </p>
      </>
    ),
  },
  {
    id: "per-workspace",
    q: "Is Pro priced per person?",
    a: (
      <p>
        No. Pro is per workspace: $10 a month covers the workspace and everyone in it, up to 25 members and 200 guests
        on each shared project. A writing group of five pays $2 each. A guest is someone a single project is shared
        with who is not a member of the workspace, such as a beta reader or an editor.
      </p>
    ),
  },
  {
    id: "ownership",
    q: "Who owns what I write?",
    a: (
      <p>
        You do. We never train AI on your work, and export works on both plans whatever limit you have reached, so
        you can take all of it with you. The details are on the <Link href="/privacy">privacy page</Link>.
      </p>
    ),
  },
  {
    id: "downgrade",
    q: "What happens if a workspace goes back to Free?",
    a: (
      <p>
        It keeps everything: every project, note, file and version. Nothing is deleted and nothing becomes read-only.
        The workspace just can&apos;t add beyond the Free limits until it is back under them, and hosted AI stops.
        Export always works.
      </p>
    ),
  },
  {
    id: "cancel",
    q: "Can I cancel? What about refunds?",
    a: (
      <>
        <p>
          Cancel any time from Workspace settings, under Plan &amp; billing. The subscription stops renewing, and the
          workspace stays on Pro until the end of the period already paid for.
        </p>
        <p>
          Payments are handled by Creem, which is the merchant of record: it charges your card, deals with sales tax
          or VAT, and sends the invoice.
        </p>
        <p>
          A first payment for Pro is refunded in full if you ask within 14 days, and so is a yearly renewal or a
          charge made by mistake. Write to <Contact />. The whole policy is on the{" "}
          <Link href="/refunds">refunds page</Link>.
        </p>
      </>
    ),
  },
  {
    id: "ask",
    q: "I have a question that isn't here.",
    a: (
      <p>
        Ask it on <a href={discordUrl}>the Plotra Discord</a>. For anything about your account or a charge, write to{" "}
        <Contact /> instead.
      </p>
    ),
  },
];

export default function PricingPage() {
  return (
    <PageTransition>
      <div className="px-6 pt-36 sm:pt-44">
        <header className="mx-auto max-w-3xl text-center">
          <p className="animate-fade-rise text-[11px] uppercase tracking-[0.2em] text-gray">Pricing</p>
          <h1
            className="mt-4 animate-fade-rise font-display text-5xl font-normal text-black text-balance sm:text-7xl"
            style={{ lineHeight: 0.98, letterSpacing: "-0.03em" }}
          >
            Free to write. <em className="wikilink">Pro when you need room.</em>
          </h1>
          <p className="mx-auto mt-6 max-w-xl animate-fade-rise-delay text-lg leading-relaxed text-gray text-pretty">
            Every feature is on the Free plan, with no card and no trial clock. Pro is one price for the whole
            workspace, not per person, and adds room, collaborators and hosted AI.
          </p>
        </header>

        <Plans free={free} pro={pro} />

        <Reveal>
          <section
            aria-labelledby="enterprise"
            className="mx-auto mt-10 flex max-w-4xl flex-col gap-5 rounded-[28px] border border-hairline bg-canvas p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9"
          >
            <div className="max-w-xl">
              <h2 id="enterprise" className="flex items-center gap-2 font-display text-3xl text-black">
                <Icon name="users-group-rounded-linear" className="text-2xl" />
                Enterprise
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-fg/85">
                Custom pricing, for a publisher, a studio or any team that needs more than Pro gives. Tell us what you
                need and we will work out the limits, the terms and the price with you.
              </p>
            </div>
            <a
              href={`mailto:${salesEmail}?subject=${encodeURIComponent("Plotra Enterprise")}`}
              className="group inline-flex h-11 shrink-0 items-center gap-1.5 self-start rounded-full bg-black px-5 text-[14px] text-white transition-[scale] duration-200 ease-out hover:scale-[1.02] active:scale-[0.97] sm:self-center"
            >
              {salesEmail}
              <Icon name="arrow-right-linear" className="transition-transform group-hover:translate-x-0.5" />
            </a>
          </section>
        </Reveal>

        <section aria-labelledby="compare" className="mx-auto mt-24 max-w-4xl">
          <Reveal>
            <h2 id="compare" className="scroll-mt-28 font-display text-4xl text-black">
              Side by side
            </h2>
            <DocTable head={["", "Free", "Pro"]} rows={compare} />
            <p className="mt-4 text-[14px] leading-relaxed text-gray">
              Storage counts uploaded files and version snapshots. Both plans keep the latest 40 automatic versions of
              a note, and every version you name. How limits behave when you reach one is in the{" "}
              <a href={`${docsUrl}/docs/settings/plans`} className="text-black underline underline-offset-4">
                docs
              </a>
              .
            </p>
          </Reveal>
        </section>

        <section aria-labelledby="faq" className="mx-auto mt-24 max-w-3xl">
          <Reveal>
            <h2 id="faq" className="scroll-mt-28 font-display text-4xl text-black">
              Questions
            </h2>
            <Faq items={faq} />
          </Reveal>
        </section>
      </div>

      <FinalCta />
    </PageTransition>
  );
}
