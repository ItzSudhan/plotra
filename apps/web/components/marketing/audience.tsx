import Image from "next/image";
import Link from "next/link";
import { Icon } from "@plotra/icons";
import { type Audience, type Shot, audiencePath } from "@/lib/audiences";
import { cn } from "@/lib/cn";
import { Window } from "./window";

// The pieces the /for pages are built from (app/(marketing)/for).

/** A screenshot of the app. The app's text is small on a phone, so the picture opens at full size. */
export function AppShot({ shot, className }: { shot: Shot; className?: string }) {
  return (
    <figure className={className}>
      <a href={shot.src.src} target="_blank" rel="noopener" aria-label="Open the screenshot at full size">
        <Image
          src={shot.src}
          alt={shot.alt}
          quality={90}
          sizes="(max-width: 1024px) 100vw, 680px"
          placeholder="blur"
          className="h-auto w-full rounded-2xl border border-hairline shadow-[0_30px_60px_-30px_rgb(0_0_0/0.25)]"
        />
      </a>
      {shot.caption && (
        <figcaption className="mt-3 text-center text-[13px] leading-relaxed text-gray text-pretty">{shot.caption}</figcaption>
      )}
    </figure>
  );
}

/** The page's opening picture, in the frame of a browser window on the app. */
export function HeroShot({ shot }: { shot: Shot }) {
  return (
    <div className="mx-auto mt-16 max-w-6xl sm:mt-20">
      <Window title="app.plotra.ink">
        <a href={shot.src.src} target="_blank" rel="noopener" aria-label="Open the screenshot at full size">
          <Image
            src={shot.src}
            alt={shot.alt}
            quality={90}
            sizes="(max-width: 1152px) 100vw, 1152px"
            placeholder="blur"
            loading="eager"
            fetchPriority="high"
            className="block h-auto w-full"
          />
        </a>
      </Window>
    </div>
  );
}

/** Commands to type, set as a terminal. */
export function Terminal({ code }: { code: string }) {
  return (
    <Window title="Terminal" className="bg-[#161412]">
      <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-[1.75] text-white/85 sm:p-6">
        {code.split("\n").map((line, i) => (
          <span key={i} className={cn("block", line.startsWith("#") && "text-white/45")}>
            {line && !line.startsWith("#") && <span className="text-ember select-none">$ </span>}
            {line || " "}
          </span>
        ))}
      </pre>
    </Window>
  );
}

/** What a feature comes with, as a short list of ticks. */
export function Points({ points }: { points: string[] }) {
  return (
    <ul className="mt-6 space-y-2.5">
      {points.map((p) => (
        <li key={p} className="flex gap-3 text-[15px] leading-snug text-fg/85">
          <Icon name="check-circle-linear" className="mt-px shrink-0 text-[17px] text-ember" />
          {p}
        </li>
      ))}
    </ul>
  );
}

/** A link to another audience's page: its icon, its name and what it gets. */
export function AudienceCard({ audience, heading: Heading = "h3" }: { audience: Audience; heading?: "h2" | "h3" }) {
  return (
    <article className="group relative flex h-full flex-col rounded-[24px] border border-hairline bg-white p-6 transition-[border-color,box-shadow] duration-300 hover:border-black/15 hover:shadow-[0_20px_40px_-24px_rgb(0_0_0/0.25)] sm:p-7">
      <Icon
        name={audience.icon}
        className="origin-bottom-left text-3xl text-black transition-[rotate,scale,color] duration-300 ease-out group-hover:scale-110 group-hover:-rotate-6 group-hover:text-ember"
      />
      <Heading className="mt-4 font-display text-[26px] leading-tight text-black">
        {/* The whole card is the link. */}
        <Link href={audiencePath(audience)} className="after:absolute after:inset-0">
          {audience.name}
        </Link>
      </Heading>
      <p className="mt-2 flex-1 text-[14.5px] leading-relaxed text-gray text-pretty">{audience.summary}</p>
      <p className="mt-5 inline-flex items-center gap-1.5 text-[13px] text-black">
        See what it does
        <Icon name="arrow-right-linear" className="transition-transform group-hover:translate-x-0.5" />
      </p>
    </article>
  );
}
