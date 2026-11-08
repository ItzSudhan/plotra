import { audiencePath, audiences } from "@/lib/audiences";
import { comparePath, comparisons } from "@/lib/compare";
import { contactEmail, discordUrl, docsUrl, repoUrl, signInUrl, signUpUrl, sponsorUrl } from "@/lib/links";
import { Logo } from "./logo";
import { SiteLink } from "./site-link";

const columns: { title: string; links: [string, string][] }[] = [
  {
    title: "Plotra",
    links: [
      ["The story", "/#prologue"],
      ["Views", "/#studio"],
      ["Story worlds", "/#worlds"],
      ["Sharing", "/#sharing"],
      ["Who it's for", "/for"],
      ["Compare", "/compare"],
      ["Blog", "/blog"],
      ["Docs", docsUrl],
    ],
  },
  {
    title: "Made for",
    links: audiences.map((a): [string, string] => [a.name, audiencePath(a)]),
  },
  {
    title: "Compare",
    links: comparisons.map((c): [string, string] => [`vs ${c.name}`, comparePath(c)]),
  },
  {
    title: "Project",
    links: [
      ["GitHub", repoUrl],
      ["Discord", discordUrl],
      ["Sponsor", sponsorUrl],
      ["Press kit", "/press"],
    ],
  },
  {
    title: "Get started",
    links: [
      ["Sign in", signInUrl],
      ["Start writing", signUpUrl],
      ["Pricing", "/pricing"],
      ["Download", "/download"],
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
      ["Refunds", "/refunds"],
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-hairline px-6 pt-16">
      <div className="mx-auto grid max-w-6xl gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr]">
        <div>
          <Logo className="text-black" />
          <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-gray">
            Where novelists and worldbuilders write the story and keep the world straight. Free to start.
          </p>
          <p className="mt-4 text-[14px] text-gray">
            Made by{" "}
            <a
              href="https://itzsudhan.com"
              target="_blank"
              rel="noreferrer"
              className="text-black/80 underline decoration-black/20 underline-offset-4 transition-colors hover:text-black"
            >
              Sudhan
            </a>
          </p>
          <p className="mt-2 text-[14px] text-gray">
            Support:{" "}
            <a
              href={`mailto:${contactEmail}`}
              className="text-black/80 underline decoration-black/20 underline-offset-4 transition-colors hover:text-black"
            >
              {contactEmail}
            </a>
          </p>
        </div>
        {columns.map((c) => (
          <div key={c.title}>
            <p className="text-[11px] uppercase tracking-[0.2em] text-gray">{c.title}</p>
            <ul className="mt-4 space-y-2.5 text-[14px]">
              {c.links.map(([label, href]) => (
                <li key={label}>
                  <SiteLink
                    href={href}
                    className="relative text-black/80 transition-colors after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-ember after:transition-[scale] after:duration-300 after:ease-out hover:text-black hover:after:scale-x-100"
                  >
                    {label}
                  </SiteLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {/* The page signs off as a suggested edit: its last line struck, and the reader's first put in its place. */}
      <p
        aria-hidden
        className="mx-auto mt-20 max-w-6xl pb-16 font-display text-[clamp(2.75rem,7.4vw,7.25rem)] leading-[1.05] tracking-[-0.03em] select-none sm:pb-24"
      >
        <del className="text-black/20 decoration-ember/70 decoration-[0.045em]">The end.</del>{" "}
        <span className="inline-block whitespace-nowrap">
          <ins className="bg-ember/10 text-black no-underline">Chapter One.</ins>
          <span className="relative inline-block h-[0.95em] w-0 align-baseline">
            <span className="absolute inset-y-0 left-[0.04em] w-[0.035em] translate-y-[0.12em] animate-blink bg-ember" />
            <span className="absolute -top-[0.1em] left-[0.04em] -translate-y-full rounded-[3px] bg-ember px-1.5 py-0.5 font-sans text-[11px] leading-none font-medium tracking-normal whitespace-nowrap text-white sm:text-[13px]">
              You
            </span>
          </span>
        </span>
      </p>
    </footer>
  );
}
