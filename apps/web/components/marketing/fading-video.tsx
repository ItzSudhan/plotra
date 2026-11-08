"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/site";

const FADE = 0.5;

/** A story other than `current`, picked at random. */
const another = (sources: readonly string[], current?: string) => {
  const rest = sources.filter((source) => source !== current);
  return rest[Math.floor(Math.random() * rest.length)] ?? sources[0];
};

/**
 * A muted background video that plays one story after another: each fades in
 * over its first 0.5s and out over its last 0.5s, and on `ended` the next one
 * is put in its place, so no cut between them is ever visible. It opens on
 * `first` if given and on a random story if not; every story after that is a
 * random one other than the one just shown.
 */
export function FadingVideo({
  sources,
  first,
  className,
  style,
}: {
  sources: readonly string[];
  first?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let frame = 0;
    let restart: ReturnType<typeof setTimeout> | undefined;
    let current = first ?? another(sources);
    let next = another(sources, current);
    // Holds the next story while the current one plays, so it is in the cache when its turn comes.
    const warm = document.createElement("video");
    warm.muted = true;
    warm.preload = "auto";

    const tick = () => {
      const { currentTime: t, duration: d } = video;
      if (d > 0 && !video.paused) {
        const fadeIn = Math.min(1, t / FADE);
        const fadeOut = Math.min(1, Math.max(0, (d - t) / FADE));
        video.style.opacity = String(Math.min(fadeIn, fadeOut));
      }
      frame = requestAnimationFrame(tick);
    };

    const show = (source: string) => {
      // The server already put `first` on the element; setting it again would restart the download.
      if (video.getAttribute("src") !== source) video.src = source;
      void video.play().catch(() => {});
    };

    const onPlaying = () => {
      if (warm.getAttribute("src") !== next) warm.src = next;
    };

    const onEnded = () => {
      video.style.opacity = "0";
      restart = setTimeout(() => {
        current = next;
        next = another(sources, current);
        show(current);
      }, 100);
    };

    video.style.opacity = "0";
    video.addEventListener("playing", onPlaying);
    video.addEventListener("ended", onEnded);
    show(current);
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(restart);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("ended", onEnded);
      warm.removeAttribute("src");
      warm.load();
    };
  }, [sources, first]);

  return (
    <video
      ref={ref}
      src={first}
      muted
      playsInline
      preload="auto"
      aria-hidden
      className={cn("pointer-events-none object-cover", className)}
      style={style}
    />
  );
}

/** The story the home page opens on: the balcony in Verona. */
export const openingStory = mediaUrl("/marketing/hero/verona.mp4");

/** Every story the background can show. Each is ten seconds, made for Plotra, and fades to white at the top. */
export const storyVideos = [
  openingStory,
  mediaUrl("/marketing/hero/valley.mp4"),
  mediaUrl("/marketing/hero/mountain-city.mp4"),
  mediaUrl("/marketing/hero/harbour.mp4"),
] as const;
