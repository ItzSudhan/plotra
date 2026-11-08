import type { StaticImageData } from "next/image";
import campaign from "./campaign-notes-your-players-cant-spoil.webp";
import plotHoles from "./how-to-avoid-plot-holes.webp";
import coWrite from "./how-to-co-write-a-novel.webp";
import timeline from "./how-to-make-a-story-timeline.webp";
import outline from "./how-to-outline-a-novel.webp";
import betaReaders from "./how-to-work-with-beta-readers.webp";
import bible from "./how-to-write-a-story-bible.webp";

// The illustration at the head of each post, by slug, with what it shows for
// anyone who can't see it. A post without one here falls back to its drawing
// (components/blog/art.tsx), which is also what its link card uses.
export const covers: Record<string, { src: StaticImageData; alt: string }> = {
  "campaign-notes-your-players-cant-spoil": {
    src: campaign,
    alt: "A fantasy map on a table, half hidden behind a game master's screen, with dice and tokens beside it",
  },
  "how-to-avoid-plot-holes": {
    src: plotHoles,
    alt: "Coloured threads running through a stack of manuscript pages, and tweezers lifting one that has snapped",
  },
  "how-to-co-write-a-novel": {
    src: coWrite,
    alt: "Two hands, one with an orange pen and one with a violet pen, writing on the same page between two cups of coffee",
  },
  "how-to-make-a-story-timeline": {
    src: timeline,
    alt: "A long paper timeline with three coloured lanes and pins, a ruler and a pencil beside it",
  },
  "how-to-outline-a-novel": {
    src: outline,
    alt: "Scene cards pinned in rows on a corkboard, some joined by red string, one lifted from its place",
  },
  "how-to-work-with-beta-readers": {
    src: betaReaders,
    alt: "A printed manuscript page covered in margin notes in several inks, with sticky flags along its edge",
  },
  "how-to-write-a-story-bible": {
    src: bible,
    alt: "An open tabbed binder linked by thin lines to cards for a place, a character and an object",
  },
};
