"use client";

import { cn } from "@plotra/ui/lib/utils";
import { useEffect, useRef } from "react";

// The painted stories from the top of plotra.ink, so signing in reads as the
// next page of the site. This is apps/web's FadingVideo: each story fades in
// over its first 0.5s and out over its last, and the next one, never the one
// just shown, takes its place. The files are the site's own, copied to
// public/scenes so a self-hosted instance has them too.

const FADE = 0.5;

/** The story the pages open on: the harbour under the lighthouse. */
const opening = "/scenes/harbour.mp4";

const stories = [opening, "/scenes/verona.mp4", "/scenes/valley.mp4", "/scenes/mountain-city.mp4"] as const;

const another = (current: string) => {
  const rest = stories.filter((story) => story !== current);
  return rest[Math.floor(Math.random() * rest.length)];
};

export function StoryScene({ className }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let frame = 0;
    let restart: ReturnType<typeof setTimeout> | undefined;
    let current: string = opening;
    let next = another(current);
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
      // The server already put the opening story on the element; setting it again would restart the download.
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
        next = another(current);
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
  }, []);

  return (
    <video
      ref={ref}
      src={opening}
      muted
      playsInline
      preload="auto"
      aria-hidden
      className={cn("pointer-events-none object-cover", className)}
      // Hidden until it plays, so the first frame doesn't show before the fade.
      style={{ opacity: 0 }}
    />
  );
}
