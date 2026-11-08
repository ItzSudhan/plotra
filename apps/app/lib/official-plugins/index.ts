// Plotra's own plugins: written by the Plotra team against the same API as
// anyone's (lib/plugins.ts), shipped with the app rather than kept in the
// database, so every server and the desktop app has them, offline too. The
// store lists them first (lib/plugin-store-source.ts), and installing one
// copies its code into the person's plugins like any other, marked with its
// slug (`user_plugin.official_slug`) so a newer version here shows as an
// update. To change one, raise its `@version` and add a line to `notes`.

import type { PluginAccess } from "@plotra/db/schema";
import { readPluginHeader } from "../plugins";
import type { PluginCategory } from "../plugin-store";
import { code as charactersCsv } from "./characters-csv";
import { code as dailyWordGoal } from "./daily-word-goal";
import { code as manuscriptMarkdown } from "./manuscript-markdown";
import { code as nameGenerator } from "./name-generator";
import { code as progressByStatus } from "./progress-by-status";
import { code as repeatedWords } from "./repeated-words";
import { code as tagsOverview } from "./tags-overview";
import { code as unmentionedCharacters } from "./unmentioned-characters";
import { code as wordCountByChapter } from "./word-count-by-chapter";

/** Who the store says made them. */
export const OFFICIAL_AUTHOR = "Plotra";

type Source = {
  slug: string;
  category: PluginCategory;
  summary: string;
  about: string;
  code: string;
  /** When this version came out, and what changed in it. */
  released: string;
  notes: string;
};

export type OfficialPlugin = Source & { name: string; version: string; access: PluginAccess; releaseId: string; releasedAt: Date };

const sources: Source[] = [
  {
    slug: "word-count-by-chapter",
    category: "stats",
    summary: "Words in each chapter, with its scenes, in a panel that keeps up as you write.",
    about: "Opens as a panel beside your writing: the project's total, and each chapter with its scenes as a bar, longest to scale. Click a chapter to open it. It updates by itself as you write, add or move scenes.\n\nIt only reads your notes.",
    code: wordCountByChapter,
    released: "2026-11-08",
    notes: "First version.",
  },
  {
    slug: "daily-word-goal",
    category: "stats",
    summary: "Set a word goal for each day and see how far you are, with the last two weeks and your streak.",
    about: "Today's words are counted from what the project had when you first opened it that day, so it works however you write: new scenes, long edits, or both. A message tells you when you reach your goal. The panel shows today's progress, your goal (change it there), the last 14 days and how many days in a row you've reached it.\n\nYour goal is the same in every project; each project keeps its own count. Deleting text counts against the day.\n\nIt only reads your notes. What it remembers is kept in its own storage, for you alone.",
    code: dailyWordGoal,
    released: "2026-11-08",
    notes: "First version.",
  },
  {
    slug: "manuscript-markdown",
    category: "export",
    summary: "Your chapters and scenes, in binder order, as one Markdown file to edit or convert anywhere.",
    about: "Adds Export as Manuscript (Markdown) to All commands. Each chapter becomes a heading with its own text, and its scenes follow with a scene break (* * *) between them. Folders, notes, characters and other world entries are left out.\n\nMarkdown opens in any text editor, and tools like Pandoc turn it into Word, EPUB or PDF.\n\nIt only reads your notes.",
    code: manuscriptMarkdown,
    released: "2026-11-08",
    notes: "First version.",
  },
  {
    slug: "characters-csv",
    category: "export",
    summary: "Your characters and locations as a spreadsheet: name, aliases, tags, status and synopsis.",
    about: "Adds Export as Characters and places (CSV) to All commands. The file opens in Excel, Numbers or Google Sheets, one row per character or location.\n\nIt only reads your notes.",
    code: charactersCsv,
    released: "2026-11-08",
    notes: "First version.",
  },
  {
    slug: "repeated-words",
    category: "writing",
    summary: "The words and phrases you lean on in the note you have open, and the filler words to cut.",
    about: "A panel that reads the chapter, scene or note in front of you and lists the words you use most (leaving out ones like “the” and “said”), phrases of three words that repeat, and filler words such as “just”, “really” and “suddenly”. It follows you as you switch notes, and updates when you save.\n\nIt only reads your notes.",
    code: repeatedWords,
    released: "2026-11-08",
    notes: "First version.",
  },
  {
    slug: "name-generator",
    category: "worlds",
    summary: "Names for characters in a few styles, made up on the spot. Add one to your characters in a click.",
    about: "A panel of twelve names at a time, in the style you pick: soft and lyrical, hard and stern, old and rustic, or everyday modern. Ask for more as often as you like. Add as character makes a character note with that name and opens it.\n\nIt can add notes, which is why it asks to change them. It changes nothing else.",
    code: nameGenerator,
    released: "2026-11-08",
    notes: "First version.",
  },
  {
    slug: "characters-in-the-story",
    category: "worlds",
    summary: "Which characters appear in how many chapters and scenes, and which never do.",
    about: "A panel that looks up every character by name and aliases, and counts the chapters and scenes that mention them: the ones never mentioned first, then the rest from fewest scenes up. Good for spotting someone you forgot about. Click a name to open them.\n\nA name that's also an everyday word, like Hope or Will, can be counted more than it should.\n\nIt only reads your notes.",
    code: unmentionedCharacters,
    released: "2026-11-08",
    notes: "First version.",
  },
  {
    slug: "tags-overview",
    category: "panels",
    summary: "Every tag in the project with how often it's used. Pick one to see its notes.",
    about: "A panel with all your tags, most used first. Pick a tag to list the notes that have it, and click one to open it. It updates as you tag.\n\nIt only reads your notes.",
    code: tagsOverview,
    released: "2026-11-08",
    notes: "First version.",
  },
  {
    slug: "progress-by-status",
    category: "stats",
    summary: "How much of your draft is at each stage, by chapters, scenes and words.",
    about: "A panel that adds up your chapters and scenes by their status (draft, revised, final, or your own stages), with a bar for the whole book and a table of counts. It updates as you change statuses.\n\nIt only reads your notes.",
    code: progressByStatus,
    released: "2026-11-08",
    notes: "First version.",
  },
];

export const officialPlugins: OfficialPlugin[] = sources.map((source) => {
  const header = readPluginHeader(source.code);
  return {
    ...source,
    name: header.name,
    version: header.version,
    access: header.access,
    releaseId: officialReleaseId(source.slug, header.version),
    releasedAt: new Date(`${source.released}T00:00:00Z`),
  };
});

/** What stands for an official plugin's release, where a store plugin has a release row: its slug and version. */
export function officialReleaseId(slug: string, version: string) {
  return `official:${slug}@${version}`;
}

export const officialPlugin = (slug: unknown): OfficialPlugin | undefined => (typeof slug === "string" ? officialPlugins.find((p) => p.slug === slug.toLowerCase()) : undefined);

/** Whether a slug is one of Plotra's own, which nobody else may publish under. */
export const isOfficialSlug = (slug: string) => officialPlugins.some((p) => p.slug === slug);
