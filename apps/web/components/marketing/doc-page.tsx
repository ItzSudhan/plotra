import { cn } from "@/lib/cn";
import { PageTransition } from "./page-transition";
import { TocSidebar } from "./toc";

/**
 * The plain pages (Privacy, Terms, Refunds): a title, an optional
 * draft notice and readable text. No motion beyond the turn of the page
 * itself: these are for reading and printing. Text elements are styled from here so the pages stay plain JSX.
 * On a wide screen the page's sections are listed in the margin, read from its `h2[id]`s.
 */
export function DocPage({
  eyebrow,
  title,
  intro,
  updated,
  draft,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  /** When the text was last changed, as written on the page. */
  updated?: string;
  /** Shows a notice that the page is a draft the maintainer still has to review. */
  draft?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <PageTransition>
      <div className="px-6 pt-36 pb-28 sm:pt-44 xl:grid xl:grid-cols-[13rem_minmax(0,45rem)_13rem] xl:justify-center xl:gap-12">
        <aside className="hidden print:hidden xl:block">
          <TocSidebar from="doc-body" />
        </aside>
        <article className="mx-auto max-w-[45rem]">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gray">{eyebrow}</p>
          <h1
            className="mt-4 font-display text-5xl font-normal text-black text-balance sm:text-6xl"
            style={{ lineHeight: 1, letterSpacing: "-0.03em" }}
          >
            {title}
          </h1>
          {intro && <p className="mt-6 text-lg leading-relaxed text-gray text-pretty">{intro}</p>}
          {updated && <p className="mt-4 text-[13px] text-gray">Last updated {updated}.</p>}
          {draft && (
            <div role="note" className="mt-8 rounded-2xl border border-ember/40 bg-ember/[0.06] px-5 py-4 text-[14.5px] leading-relaxed text-fg">
              <p className="font-medium">Draft</p>
              <div className="mt-1 text-muted">{draft}</div>
            </div>
          )}
          <div
            id="doc-body"
            className={cn(
              "mt-12 text-[16px] leading-[1.7] text-fg/85",
              "[&_h2]:mt-14 [&_h2]:scroll-mt-28 [&_h2]:font-display [&_h2]:text-3xl [&_h2]:leading-tight [&_h2]:text-black",
              "[&_h3]:mt-8 [&_h3]:text-[17px] [&_h3]:font-medium [&_h3]:text-black",
              "[&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5",
              "[&_a]:text-black [&_a]:underline [&_a]:underline-offset-4 [&_strong]:font-medium [&_strong]:text-black",
              "[&_code]:rounded [&_code]:bg-well [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13.5px]",
            )}
          >
            {children}
          </div>
        </article>
      </div>
    </PageTransition>
  );
}

/** A table that scrolls sideways on a phone instead of squeezing its columns. */
export function DocTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-hairline">
      <table className="w-full min-w-[560px] border-collapse text-left text-[14px] leading-snug">
        <thead>
          <tr className="bg-canvas text-[12px] tracking-wide text-gray uppercase">
            {head.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-hairline align-top">
              {row.map((cell, j) => (
                <td key={j} className={cn("px-4 py-3", j === 0 ? "text-black" : "text-fg/80")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
