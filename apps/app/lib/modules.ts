import {
  moduleIds,
  scriptFormats,
  type ModuleId,
  type NodeSettings,
  type ProjectSettings,
  type ProjectType,
  type ScriptFormat,
} from "@plotra/db/schema";
import type { IconName } from "@plotra/icons";

// Project types and modules (plan.md 2.8). A type is a preset: it picks which
// modules start switched on and the format new scenes are written in. Modules
// gate views, commands and inspector sections, so a novelist doesn't see game
// tools and a studio doesn't miss them.

export const moduleMeta: Record<ModuleId, { label: string; description: string; icon: IconName }> = {
  world: {
    label: "World bible",
    description: "Custom entity types, canon status, retcon history and continuity sheets.",
    icon: "earth-linear",
  },
  releases: {
    label: "Releases & reveals",
    description: "Books, episodes or patches; what each reveals; “world as of release X”; who knows what; foreshadowing.",
    icon: "rocket-linear",
  },
  research: {
    label: "Research & sources",
    description: "Citations and a bibliography, clipped pages and files, fact-check status per claim.",
    icon: "square-academic-cap-linear",
  },
  editorial: {
    label: "Review & editorial",
    description: "Your own status workflow, required reviewers, locked content, beta readers and a changelog per release.",
    icon: "clipboard-check-linear",
  },
  screenplay: {
    label: "Script formats",
    description: "Screenplay, stage play, comic and audio script elements with industry formatting and Fountain.",
    icon: "clapperboard-text-linear",
  },
  production: {
    label: "Production",
    description: "Script breakdowns, recording sheets with line status, and shot lists from storyboards.",
    icon: "video-frame-linear",
  },
  interactive: {
    label: "Interactive narrative",
    description: "Branching dialogue, quests, short strings with limits, and Ink / Yarn / Twine export.",
    icon: "gamepad-linear",
  },
  localization: {
    label: "Localization",
    description: "Side-by-side translation, a glossary, CSV and XLIFF for translators, subtitles.",
    icon: "translation-linear",
  },
  publishing: {
    label: "Publishing",
    description: "EPUB, manuscript and script formats, a series bible, and a spoiler-safe public wiki.",
    icon: "export-linear",
  },
  ai: {
    label: "AI agent",
    description: "Ask questions about the project and rewrite or continue text, on each person's own model. Notes the agent reads are sent to the provider that person chose.",
    icon: "magic-stick-3-linear",
  },
};

/**
 * Modules a project can only have once something outside it allows them: the
 * AI agent needs the workspace's switch (plan.md 2.11 "Trust"). They are
 * never part of a type's defaults.
 */
export const optInModules: ReadonlySet<ModuleId> = new Set<ModuleId>(["ai"]);

/**
 * The modules each project type is for (plan.md 2.8 "Project types & modules"):
 * what it is offered first, and what a sample of that type has on. A new
 * project starts with fewer (`typeModules`).
 */
export const suggestedModules: Record<ProjectType, ModuleId[]> = {
  novel: ["world", "releases", "editorial", "publishing"],
  web_serial: ["releases", "publishing"],
  short_story: ["editorial", "publishing"],
  screenplay: ["screenplay", "production", "releases", "publishing"],
  stage_play: ["screenplay", "publishing"],
  comic: ["screenplay", "production", "publishing"],
  game: ["world", "interactive", "localization", "releases"],
  ttrpg: ["world", "releases", "publishing"],
  podcast: ["screenplay", "production", "releases"],
  nonfiction: ["research", "editorial", "publishing"],
  franchise: moduleIds.filter((id) => !optInModules.has(id)),
};

/**
 * The modules a new project starts with (onboarding-plan.md 3): only what the
 * type can't be written without. A script needs its format, a game its
 * dialogue, a campaign the split between what the GM and the players know.
 * Everything else is offered when it becomes useful, one module at a time
 * (components/onboarding/module-prompt.tsx), so a new project isn't twenty
 * views wide on its first day.
 */
export const typeModules: Record<ProjectType, ModuleId[]> = {
  novel: [],
  web_serial: [],
  short_story: [],
  screenplay: ["screenplay"],
  stage_play: ["screenplay"],
  comic: ["screenplay"],
  game: ["interactive"],
  ttrpg: ["world", "releases"],
  podcast: ["screenplay"],
  nonfiction: ["research"],
  franchise: ["world"],
};

/** Every module a type is for, switched on: the settings of a sample, which is there to show them. */
export const allSuggested = (type: ProjectType): Partial<Record<ModuleId, boolean>> => Object.fromEntries(suggestedModules[type].map((id) => [id, true]));

/** The format a new scene starts in, unless the project says otherwise. */
export const typeFormat: Record<ProjectType, ScriptFormat> = {
  novel: "prose",
  web_serial: "prose",
  short_story: "prose",
  screenplay: "screenplay",
  stage_play: "stageplay",
  comic: "comic",
  game: "prose",
  ttrpg: "prose",
  podcast: "audio",
  nonfiction: "prose",
  franchise: "prose",
};

/** What a release is called by default for each type. */
export const typeReleaseKind: Record<ProjectType, string> = {
  novel: "book",
  web_serial: "chapter",
  short_story: "other",
  screenplay: "episode",
  stage_play: "other",
  comic: "issue",
  game: "patch",
  ttrpg: "session",
  podcast: "episode",
  nonfiction: "book",
  franchise: "book",
};

export function enabledModules(type: ProjectType, settings: ProjectSettings | null | undefined): Set<ModuleId> {
  const on = new Set<ModuleId>(typeModules[type] ?? []);
  for (const id of moduleIds) {
    const override = settings?.modules?.[id];
    if (override === true) on.add(id);
    else if (override === false) on.delete(id);
  }
  return on;
}

export const hasModule = (type: ProjectType, settings: ProjectSettings | null | undefined, id: ModuleId) =>
  enabledModules(type, settings).has(id);

export const defaultFormat = (type: ProjectType, settings: ProjectSettings | null | undefined): ScriptFormat =>
  settings?.format ?? typeFormat[type] ?? "prose";

export const formatMeta: Record<ScriptFormat, { label: string; description: string }> = {
  prose: { label: "Prose", description: "Paragraphs, headings and lists." },
  screenplay: { label: "Screenplay", description: "Scene headings, action, character, dialogue, transitions." },
  stageplay: { label: "Stage play", description: "Acts and scenes, stage directions, character and dialogue." },
  comic: { label: "Comic script", description: "Pages and panels with captions, dialogue and SFX." },
  audio: { label: "Audio script", description: "Character lines with delivery notes, sound and music cues." },
};

/** The format a note is written in (`node.settings.format`); prose unless set. */
export function nodeFormat(settings: NodeSettings | null | undefined): ScriptFormat {
  const format = settings?.format;
  return typeof format === "string" && (scriptFormats as readonly string[]).includes(format) ? (format as ScriptFormat) : "prose";
}
