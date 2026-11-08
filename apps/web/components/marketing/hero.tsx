import { signUpUrl } from "@/lib/links";
import { FadingVideo, openingStory, storyVideos } from "./fading-video";
import { Cta } from "./interactions";

export function Hero() {
  return (
    <section id="top" className="relative min-h-screen w-full overflow-hidden">
      <FadingVideo sources={storyVideos} first={openingStory} className="absolute z-0 h-full w-full" style={{ inset: "200px 0 0 0" }} />
      <div aria-hidden className="absolute inset-0 z-0 bg-gradient-to-b from-background via-transparent to-background" />

      <div
        className="relative z-10 flex flex-col items-center justify-center px-6 pb-40 text-center"
        style={{ paddingTop: "calc(8rem - 75px + 72px)" }}
      >
        <h1
          className="max-w-7xl animate-fade-rise font-display text-5xl text-balance font-normal text-black sm:text-7xl md:text-8xl"
          style={{ lineHeight: 0.95, letterSpacing: "-2.46px" }}
        >
          Write your novel. <em className="wikilink">Never lose the plot.</em>
        </h1>

        <p className="mt-8 max-w-2xl animate-fade-rise-delay text-base leading-relaxed text-gray text-pretty sm:text-lg">
          Plotra keeps your manuscript, characters, timeline and lore in one linked project. Stop digging through
          docs, spreadsheets and group chats, and catch the contradictions before a reader does. Write alone, or with
          your co-writers, live.
        </p>

        <Cta href={signUpUrl} className="mt-12 animate-fade-rise-delay-2 px-14 py-5 text-base">
          Start writing for free
        </Cta>
        <p className="mt-4 animate-fade-rise-delay-2 text-[13px] text-gray">
          Every feature is on the Free plan. No card needed.
        </p>
      </div>
    </section>
  );
}
