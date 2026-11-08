"use client";

import { useState } from "react";
import { AutoplayVideo } from "./autoplay-video";

const frame =
  "aspect-video w-full rounded-[20px] border border-hairline bg-canvas shadow-[0_30px_60px_-30px_rgb(0_0_0/0.25)] sm:rounded-[28px]";

/**
 * A page's short film, playing muted on its own, with a button under it that swaps in the
 * long one: from the start, with sound, played once.
 */
export function FilmPlayer({
  short,
  poster,
  label,
  long,
}: {
  short: string;
  poster: string;
  label: string;
  long: { src: string; poster: string; label: string; length: string };
}) {
  const [full, setFull] = useState(false);

  return (
    <>
      {full ? (
        <video
          key="long"
          controls
          autoPlay
          playsInline
          preload="auto"
          poster={long.poster}
          aria-label={long.label}
          className={`mt-5 ${frame} bg-black`}
        >
          <source src={long.src} type="video/mp4" />
        </video>
      ) : (
        <AutoplayVideo key="short" controls preload="metadata" poster={poster} aria-label={label} className={`mt-5 ${frame}`}>
          <source src={short} type="video/mp4" />
        </AutoplayVideo>
      )}
      <div className="mt-5 flex justify-center">
        <button
          type="button"
          onClick={() => setFull((f) => !f)}
          className="inline-flex items-center gap-2 rounded-full border border-hairline bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:border-black/20"
        >
          {full ? (
            "Back to the 30-second film"
          ) : (
            <>
              <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
                <path d="M4 2.5v11l9-5.5z" />
              </svg>
              Watch the full tour, with sound · {long.length}
            </>
          )}
        </button>
      </div>
    </>
  );
}

/** A long film that plays only when asked: with sound, and nothing loaded until then. */
export function TourVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  return (
    <video controls playsInline preload="none" poster={poster} aria-label={label} className={`mt-5 ${frame} bg-black`}>
      <source src={src} type="video/mp4" />
    </video>
  );
}
