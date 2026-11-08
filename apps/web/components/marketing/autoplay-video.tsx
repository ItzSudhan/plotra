"use client";

import { useEffect, useRef } from "react";

/**
 * A muted, looping video that plays while it is on screen and pauses when it scrolls
 * away. Browsers only allow autoplay when muted; the controls stay so a reader can
 * pause, scrub or unmute. Readers who ask for reduced motion get it paused, with play.
 */
export function AutoplayVideo(props: Omit<React.ComponentProps<"video">, "ref" | "autoPlay" | "muted" | "loop">) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.4 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return <video ref={ref} muted loop playsInline {...props} />;
}
