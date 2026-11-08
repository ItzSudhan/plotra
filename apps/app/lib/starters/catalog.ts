import type { ProjectType } from "@plotra/db/schema";
import type { IconName } from "@plotra/icons";

// Starter templates: a new project that comes with a structure but no
// writing. Acts, chapters, sessions or routes, each with a line on what it's
// for, plus the planning notes that kind of writer usually keeps. One or more
// for each kind of writer. What the new-project dialog and the Cold Open show;
// the structures themselves are in ./starters.ts, so the browser gets only
// these lines.

export const audiences = [
  { id: "novel", label: "Novelists" },
  { id: "screen", label: "Screen & stage" },
  { id: "game", label: "Game writers" },
  { id: "tabletop", label: "Game masters" },
  { id: "comic", label: "Comics" },
  { id: "audio", label: "Audio" },
  { id: "nonfiction", label: "Non-fiction" },
  { id: "world", label: "Worldbuilders" },
] as const;

export type AudienceId = (typeof audiences)[number]["id"];

export type StarterCard = {
  id: string;
  audience: AudienceId;
  type: ProjectType;
  label: string;
  description: string;
  icon: IconName;
};

export const starterCatalog = [
  {
    id: "three-act-novel",
    audience: "novel",
    type: "novel",
    label: "Three-act novel",
    description: "Eleven chapters across three acts, from the ordinary world to the resolution, plus a premise page.",
    icon: "book-2-bold-duotone",
  },
  {
    id: "beat-sheet-novel",
    audience: "novel",
    type: "novel",
    label: "Fifteen-beat outline",
    description: "The beat sheet screenwriters use, one chapter per beat: catalyst, midpoint, dark night and the rest.",
    icon: "list-check-bold-duotone",
  },
  {
    id: "mystery-novel",
    audience: "novel",
    type: "novel",
    label: "Mystery",
    description: "The crime as it happened, a cast of suspects, clues to plant and pay off, and the reveal.",
    icon: "magnifer-bold-duotone",
  },
  {
    id: "romance-novel",
    audience: "novel",
    type: "novel",
    label: "Romance",
    description: "Two leads and the beats of their relationship, from the meeting to the grand gesture.",
    icon: "heart-bold-duotone",
  },
  {
    id: "novel-series",
    audience: "novel",
    type: "novel",
    label: "Book series",
    description: "A series bible, Book 1 outlined, Book 2 waiting, and each book set up as a release for spoilers.",
    icon: "notebook-bookmark-bold-duotone",
  },
  {
    id: "short-story",
    audience: "novel",
    type: "short_story",
    label: "Short story",
    description: "Five scenes from the hook to the last line, and a page for the story in one sentence.",
    icon: "document-text-bold-duotone",
  },
  {
    id: "web-serial",
    audience: "novel",
    type: "web_serial",
    label: "Web serial",
    description: "Arc one in six chapters, each a release, with a posting schedule and a page of hooks.",
    icon: "notes-bold-duotone",
  },
  {
    id: "feature-film",
    audience: "screen",
    type: "screenplay",
    label: "Feature film",
    description: "Three acts in eight sequences, written as screenplay pages, with a treatment to start from.",
    icon: "clapperboard-text-bold-duotone",
  },
  {
    id: "tv-pilot",
    audience: "screen",
    type: "screenplay",
    label: "TV pilot",
    description: "Teaser, four acts and a tag, plus a series bible for the season and the episodes after it.",
    icon: "tv-bold-duotone",
  },
  {
    id: "stage-play",
    audience: "screen",
    type: "stage_play",
    label: "Two-act play",
    description: "Two acts of scenes in stage-play format, with a page for the cast, the set and the running time.",
    icon: "masks-bold-duotone",
  },
  {
    id: "branching-game",
    audience: "game",
    type: "game",
    label: "Branching narrative",
    description: "A prologue, a hub, two branches and three endings, with a narrative design doc and a branch map.",
    icon: "gamepad-bold-duotone",
  },
  {
    id: "quest-rpg",
    audience: "game",
    type: "game",
    label: "Quest-driven RPG",
    description: "A main quest in stages, side quests to fill in, factions, and a codex of lore entries.",
    icon: "target-bold-duotone",
  },
  {
    id: "visual-novel",
    audience: "game",
    type: "game",
    label: "Visual novel",
    description: "A common route that splits into character routes, each with its own endings, and a page of flags.",
    icon: "chat-round-dots-bold-duotone",
  },
  {
    id: "ttrpg-campaign-starter",
    audience: "tabletop",
    type: "ttrpg",
    label: "Campaign",
    description: "A pitch, session zero, three sessions of prep, and factions, with each session as a release.",
    icon: "map-bold-duotone",
  },
  {
    id: "one-shot",
    audience: "tabletop",
    type: "ttrpg",
    label: "One-shot adventure",
    description: "A five-room adventure for a single evening, with pre-made characters for the table.",
    icon: "flag-bold-duotone",
  },
  {
    id: "comic-issue",
    audience: "comic",
    type: "comic",
    label: "Comic issue",
    description: "A 22-page issue in five sections, written as comic script, with a series pitch.",
    icon: "gallery-wide-bold-duotone",
  },
  {
    id: "audio-drama",
    audience: "audio",
    type: "podcast",
    label: "Audio drama season",
    description: "A season of four episodes in audio script, each a release, with a season bible.",
    icon: "microphone-3-bold-duotone",
  },
  {
    id: "interview-podcast",
    audience: "audio",
    type: "podcast",
    label: "Interview podcast",
    description: "A show format page and a first episode: cold open, intro, the interview segments and the outro.",
    icon: "podcast-bold-duotone",
  },
  {
    id: "nonfiction-book",
    audience: "nonfiction",
    type: "nonfiction",
    label: "Non-fiction book",
    description: "A book proposal, an introduction, three parts of chapters and a conclusion, with sources kept apart.",
    icon: "library-bold-duotone",
  },
  {
    id: "memoir",
    audience: "nonfiction",
    type: "nonfiction",
    label: "Memoir",
    description: "Chapters by period of your life, a page for what the book is really about, and the people in it.",
    icon: "user-heart-bold-duotone",
  },
  {
    id: "story-bible",
    audience: "world",
    type: "franchise",
    label: "Story bible",
    description: "A world overview, canon rules, a timeline, factions, people and places, and a folder for each story set in it.",
    icon: "planet-bold-duotone",
  },
] as const satisfies readonly StarterCard[];

export type StarterId = (typeof starterCatalog)[number]["id"];

export const isStarterId = (id: string): id is StarterId => starterCatalog.some((s) => s.id === id);

/** The audience whose starters are shown first for a project type. */
export const audienceOf = (type: ProjectType): AudienceId =>
  starterCatalog.find((s) => s.type === type)?.audience ?? "novel";
