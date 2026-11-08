import { cn } from "@/lib/cn";
import { signUpUrl } from "@/lib/links";
import { Cta } from "./interactions";
import { Reveal } from "./reveal";

/** The heading that opens each part of the story, set on the white page. */
export function Chapter({
  id,
  title,
  children,
  className,
}: {
  id?: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header id={id} className={cn("mx-auto max-w-4xl scroll-mt-28 px-6 text-center", className)}>
      <Reveal>
        <h2
          className="font-display text-[clamp(2.25rem,4.6vw,3.75rem)] font-normal text-black text-balance"
          style={{ lineHeight: 1.02, letterSpacing: "-0.025em" }}
        >
          {title}
        </h2>
      </Reveal>
      {children && (
        <Reveal delay={0.08}>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-gray text-pretty sm:text-lg">
            {children}
          </p>
        </Reveal>
      )}
    </header>
  );
}

/** A soft panel inset into the white page, where the product is shown. */
export function Stage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="px-3 sm:px-6">
      <div
        className={cn(
          "stage relative isolate mx-auto mt-16 max-w-[1400px] overflow-clip rounded-[32px] border border-black/[0.05] sm:rounded-[44px]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** A quiet call to action between chapters. */
export function Interlude({ children, cta }: { children: React.ReactNode; cta: string }) {
  return (
    <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center sm:py-32">
      <p
        className="font-display text-2xl text-black text-balance sm:text-3xl"
        style={{ lineHeight: 1.15, letterSpacing: "-0.015em" }}
      >
        {children}
      </p>
      <Cta href={signUpUrl} className="px-8 py-3.5 text-sm">
        {cta}
      </Cta>
    </Reveal>
  );
}
