import type { IconName } from "@plotra/icons";
import type { ProjectType } from "@plotra/db/schema";

export const projectTypeMeta: Record<ProjectType, { label: string; icon: IconName }> = {
  novel: { label: "Novel / series", icon: "book-2-bold-duotone" },
  web_serial: { label: "Web serial", icon: "notes-bold-duotone" },
  short_story: { label: "Short story", icon: "document-text-bold-duotone" },
  screenplay: { label: "Screenplay / TV", icon: "clapperboard-text-bold-duotone" },
  stage_play: { label: "Stage play", icon: "masks-bold-duotone" },
  comic: { label: "Comic / manga", icon: "gallery-wide-bold-duotone" },
  game: { label: "Game / interactive", icon: "gamepad-bold-duotone" },
  ttrpg: { label: "Tabletop RPG", icon: "map-bold-duotone" },
  podcast: { label: "Podcast / audio drama", icon: "microphone-3-bold-duotone" },
  nonfiction: { label: "Non-fiction / research", icon: "library-bold-duotone" },
  franchise: { label: "Franchise / IP bible", icon: "planet-bold-duotone" },
};
