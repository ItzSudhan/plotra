import { signUpUrl } from "@/lib/links";
import { FadingVideo, storyVideos } from "./fading-video";
import { Cta } from "./interactions";
import { Reveal } from "./reveal";

export function FinalCta() {
  return (
    <section className="relative isolate overflow-hidden px-6 pt-32 pb-48 sm:pt-44">
      <FadingVideo sources={storyVideos} className="absolute -z-10 h-full w-full" style={{ inset: "200px 0 0 0" }} />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-transparent to-background" />

      <Reveal className="mx-auto flex max-w-4xl flex-col items-center text-center">
        <h2
          className="font-display text-4xl font-normal text-black sm:text-6xl md:text-7xl"
          style={{ lineHeight: 0.95, letterSpacing: "-2.46px" }}
        >
          Your world is <em className="wikilink">waiting.</em>
        </h2>
        <p className="mt-8 max-w-xl text-base leading-relaxed text-gray sm:text-lg">
          Start with a blank page or a sample project, and bring your co-writers when you&apos;re ready. Every feature
          is on the Free plan, and no card is needed.
        </p>
        <Cta href={signUpUrl} className="mt-12 px-14 py-5 text-base">
          Start writing for free
        </Cta>
      </Reveal>
    </section>
  );
}
