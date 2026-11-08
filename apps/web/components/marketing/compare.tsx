import Image from "next/image";
import Link from "next/link";
import { Icon } from "@plotra/icons";
import { type Cell, type Comparison, comparePath } from "@/lib/compare";
import { cn } from "@/lib/cn";

// The pieces the /compare pages are built from (app/(marketing)/compare).

const marks = {
  yes: { icon: "check-circle-linear", label: "Yes", className: "text-teal" },
  part: { icon: "info-circle-linear", label: "Partly", className: "text-gold" },
  no: { icon: "close-circle-linear", label: "No", className: "text-gray/70" },
} as const;

export function CellView({ cell }: { cell: Cell }) {
  const mark = cell.mark && marks[cell.mark];
  return (
    <span className="flex gap-2.5">
      {mark && <Icon name={mark.icon} className={cn("mt-px shrink-0 text-[17px]", mark.className)} />}
      <span>
        {mark && cell.text && <span className="sr-only">{mark.label}: </span>}
        {cell.text ?? mark?.label}
      </span>
    </span>
  );
}

/** The side-by-side: Plotra's column first, then the other tool's, in groups. */
export function CompareTable({ c }: { c: Comparison }) {
  return (
    <div className="overflow-x-auto rounded-[24px] border border-hairline bg-white">
      <table className="w-full min-w-[640px] border-collapse text-left text-[14.5px] leading-snug">
        <thead>
          <tr className="border-b border-hairline">
            <th scope="col" className="w-[34%] px-5 py-4 text-[12px] font-medium tracking-wide text-gray uppercase">
              <span className="sr-only">Feature</span>
            </th>
            <th scope="col" className="w-[33%] bg-ember/[0.05] px-5 py-4 font-display text-[22px] font-normal text-black">
              Plotra
            </th>
            <th scope="col" className="w-[33%] px-5 py-4 font-display text-[22px] font-normal text-black">
              {c.name}
            </th>
          </tr>
        </thead>
        {c.table.map((g) => (
          <tbody key={g.group}>
            <tr>
              <th
                colSpan={3}
                scope="colgroup"
                className="bg-canvas px-5 pt-5 pb-2 text-[11px] font-medium tracking-[0.2em] text-gray uppercase"
              >
                {g.group}
              </th>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.feature} className="border-t border-hairline align-top">
                <th scope="row" className="px-5 py-3.5 font-normal text-black">
                  {r.feature}
                </th>
                <td className="bg-ember/[0.05] px-5 py-3.5 text-fg/85">
                  <CellView cell={r.plotra} />
                </td>
                <td className="px-5 py-3.5 text-fg/85">
                  <CellView cell={r.them} />
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/** A link to another comparison: its picture, the tool's name and what Plotra adds to it. */
export function CompareCard({ c, heading: Heading = "h3" }: { c: Comparison; heading?: "h2" | "h3" }) {
  return (
    <article className="group relative flex h-full flex-col">
      <div className="overflow-hidden rounded-[24px] border border-hairline bg-canvas">
        <Image
          src={c.art.src}
          alt=""
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
          placeholder="blur"
          className="block aspect-[16/9] w-full object-cover transition-[scale] duration-500 ease-out group-hover:scale-[1.03]"
        />
      </div>
      <p className="mt-5 text-[11px] uppercase tracking-[0.2em] text-gray">Compare</p>
      <Heading className="mt-2 font-display text-[26px] leading-[1.12] tracking-[-0.015em] text-black">
        {/* The whole card is the link. */}
        <Link href={comparePath(c)} className="transition-colors after:absolute after:inset-0 group-hover:text-ember">
          Plotra vs {c.name}
        </Link>
      </Heading>
      <p className="mt-3 flex-1 text-[15px] leading-relaxed text-gray text-pretty">{c.summary}</p>
      <p className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-black">
        Read the comparison
        <Icon name="arrow-right-linear" className="transition-transform group-hover:translate-x-0.5" />
      </p>
    </article>
  );
}
