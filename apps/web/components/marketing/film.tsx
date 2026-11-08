import { mediaUrl } from "@/lib/site";
import { FilmPlayer, TourVideo } from "./film-player";
import { Reveal } from "./reveal";

// The films made in promo/films, one for each /for and /compare page: a 30-second one that
// plays muted on its own under the hero, and a long one, with sound, behind a button. Until a
// page has its own long film, the button plays the launch trailer (video/), the full tour.
// Videos are served from media.plotra.ink in production (mediaUrl); posters are small files
// on the site itself.

/** The 30-second films that exist, by name: for-<audience> and vs-<comparison>. */
const films = new Set<string>([
  "for-novelists",
  "for-worldbuilders",
  "for-co-writers",
  "for-game-masters",
  "for-obsidian-users",
  "for-self-hosters",
  "for-web-serial-writers",
  "vs-campfire",
  "vs-ellipsus",
  "vs-google-docs",
  "vs-legendkeeper",
  "vs-obsidian",
  "vs-plottr",
  "vs-scrivener",
  "vs-world-anvil",
]);

/**
 * The long films that are up, by the same name, with their length. Each is <name>-long.mp4, made
 * by promo/films/<name>-long. They're on R2 only, not in git (they're big): public/ has their posters.
 */
const longFilms = new Map<string, string>([
  ["for-novelists", "2:00"],
  ["for-worldbuilders", "2:02"],
  ["for-co-writers", "1:48"],
  ["for-game-masters", "1:56"],
  ["for-obsidian-users", "1:58"],
  ["for-self-hosters", "1:48"],
  ["for-web-serial-writers", "1:50"],
  ["vs-campfire", "1:56"],
]);

/** The launch trailer: two and a half minutes of the whole app. */
export const trailer = {
  src: mediaUrl("/press/plotra-launch-trailer.mp4"),
  poster: "/press/plotra-trailer-poster.png",
  length: "2:30",
};

/** "See it in 30 seconds": the film for this page, if it has one, and the long one after it. */
export function Film({ name, label }: { name: string; label: string }) {
  if (!films.has(name)) return null;
  const length = longFilms.get(name);
  const long = length
    ? { src: mediaUrl(`/videos/${name}-long.mp4`), poster: `/videos/${name}-long.jpg`, label: `${label}, the full film`, length }
    : { ...trailer, label: "The Plotra tour: two and a half minutes of the whole app" };
  return (
    <Reveal className="mx-auto mt-16 max-w-5xl px-4 sm:mt-20">
      <p className="text-center text-[11px] uppercase tracking-[0.2em] text-gray">See it in 30 seconds</p>
      <FilmPlayer short={mediaUrl(`/videos/${name}.mp4`)} poster={`/videos/${name}.jpg`} label={label} long={long} />
    </Reveal>
  );
}

/** The launch trailer as a section of its own, for the home page. */
export function Tour({ className }: { className?: string }) {
  return (
    <Reveal className={`mx-auto max-w-5xl px-4 ${className ?? ""}`}>
      <p className="text-center text-[11px] uppercase tracking-[0.2em] text-gray">The whole app in {trailer.length}</p>
      <TourVideo src={trailer.src} poster={trailer.poster} label="The Plotra tour: two and a half minutes of the whole app" />
    </Reveal>
  );
}
