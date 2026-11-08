import { projectTypes, type ProjectType } from "@plotra/db/schema";
import type { IconName } from "@plotra/icons";

// The Cold Open (onboarding-plan.md 2.1, 2.2): the questions a new project
// starts from. The first three are the same for everyone. The fourth, "what are
// you making?", picks a track, and the track asks one or two more in that
// medium's own words. Plain data: the screen draws it (components/onboarding/
// cold-open.tsx) and `seedFromAnswers` (./seed.ts) turns the answers into a project.

export const trackIds = ["novel", "ttrpg", "screenplay", "other"] as const;
export type TrackId = (typeof trackIds)[number];

/** The track a project type starts on. Types without one of their own share "other". */
export const trackOf = (type: ProjectType): TrackId => (type === "novel" || type === "ttrpg" || type === "screenplay" ? type : "other");

/** What someone answered. Every field is optional: any question can be skipped. */
export type Answers = {
  /** Who the story is about. */
  who?: string;
  /** Where they are when it starts. */
  where?: string;
  /** What they are hiding, or what they want. */
  drive?: string;
  driveKind?: "secret" | "goal";
  type?: ProjectType;
  /** The track's own questions, by question id. A choice's typed-in "other" is under `<id>Text`. */
  extra?: Record<string, string>;
};

export const limits = { name: 80, drive: 400, long: 600 } as const;

type Base = {
  id: string;
  title: string | ((answers: Answers) => string);
  hint?: string;
  /** Left out when it returns false: a question about the character makes no sense without one. */
  when?: (answers: Answers) => boolean;
};
export type TextQuestion = Base & { kind: "text"; placeholder: string; maxLength: number; multiline?: boolean };
export type ChoiceQuestion = Base & {
  kind: "choice";
  options: Array<{
    value: string;
    label: string | ((answers: Answers) => string);
    description?: string;
    /** Choosing this one asks for a line of text as well. */
    input?: { placeholder: string; maxLength: number };
  }>;
};
export type Question = TextQuestion | ChoiceQuestion;

export const text = (value: string | ((answers: Answers) => string), answers: Answers) => (typeof value === "function" ? value(answers) : value);

export type Track = {
  id: TrackId;
  /** What the first document is called in the little graph beside the questions. */
  firstDocument: string;
  questions: Question[];
};

export const tracks: Record<TrackId, Track> = {
  novel: {
    id: "novel",
    firstDocument: "Chapter 1",
    questions: [
      {
        id: "scope",
        kind: "choice",
        title: "One book, or a series?",
        hint: "A series gets a first book you can mark reveals against. You can add books later either way.",
        options: [
          { value: "book", label: "One book" },
          { value: "series", label: "A series" },
        ],
      },
      {
        id: "pov",
        kind: "choice",
        title: "Whose eyes do we see it through?",
        when: (a) => Boolean(a.who),
        options: [
          { value: "same", label: (a) => a.who ?? "Them" },
          { value: "other", label: "Someone else", input: { placeholder: "Their name", maxLength: limits.name } },
        ],
      },
    ],
  },
  ttrpg: {
    id: "ttrpg",
    firstDocument: "Session 1 prep",
    questions: [
      {
        id: "players",
        kind: "text",
        title: "Who's at the table?",
        hint: "The player characters, separated by commas. Leave it empty if you don't know yet.",
        placeholder: "Kestrel Vane, Brother Ansel",
        maxLength: limits.long,
      },
      {
        id: "session",
        kind: "text",
        title: "What happens in session one?",
        hint: "A line or two is enough. It becomes the top of your prep.",
        placeholder: "The party arrives at the ford and is asked to find some missing sheep.",
        maxLength: limits.long,
        multiline: true,
      },
    ],
  },
  screenplay: {
    id: "screenplay",
    firstDocument: "Opening scene",
    questions: [
      {
        id: "form",
        kind: "choice",
        title: "A film, a pilot or a series?",
        options: [
          { value: "film", label: "A film" },
          { value: "pilot", label: "A pilot" },
          { value: "series", label: "A series", description: "Starts with episode 1, which you can mark reveals against." },
        ],
      },
      {
        id: "setting",
        kind: "choice",
        title: "Where does the first scene open?",
        hint: "It becomes the scene heading.",
        options: [
          { value: "INT.", label: "INT.", description: "Indoors" },
          { value: "EXT.", label: "EXT.", description: "Outdoors" },
        ],
      },
    ],
  },
  other: { id: "other", firstDocument: "First scene", questions: [] },
};

/** The kinds of project the Cold Open leads with, the two Plotra is tested for first; the rest are behind "Something else". */
export const leadTypes: Array<{ type: ProjectType; label: string; description: string; icon: IconName }> = [
  { type: "novel", label: "A novel", description: "Or a series of them.", icon: "book-2-bold-duotone" },
  { type: "ttrpg", label: "A tabletop campaign", description: "Sessions, NPCs and what the players don't know.", icon: "map-bold-duotone" },
];

export const otherTypes: ProjectType[] = projectTypes.filter((type) => !leadTypes.some((lead) => lead.type === type));

/** The track questions that apply, given what has been answered so far. */
export const trackQuestions = (answers: Answers): Question[] =>
  answers.type ? tracks[trackOf(answers.type)].questions.filter((q) => !q.when || q.when(answers)) : [];

// ---- Cleaning ---------------------------------------------------------------------

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "") || undefined;

/**
 * Answers as they arrive from the browser, made safe to build from: strings
 * only, trimmed and cut to length, an unknown type or choice dropped. The server
 * runs this on everything it is sent (lib/onboarding-actions.ts).
 */
export function cleanAnswers(input: unknown): Answers {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const type = projectTypes.find((t) => t === raw.type);
  const answers: Answers = {
    who: clean(raw.who, limits.name),
    where: clean(raw.where, limits.name),
    drive: clean(raw.drive, limits.drive),
    driveKind: raw.driveKind === "goal" ? "goal" : "secret",
    type,
  };
  const given = (raw.extra && typeof raw.extra === "object" ? raw.extra : {}) as Record<string, unknown>;
  const extra: Record<string, string> = {};
  for (const question of trackQuestions(answers)) {
    if (question.kind === "text") {
      const value = clean(given[question.id], question.maxLength);
      if (value) extra[question.id] = value;
      continue;
    }
    const option = question.options.find((o) => o.value === given[question.id]);
    if (!option) continue;
    extra[question.id] = option.value;
    const typed = option.input && clean(given[`${question.id}Text`], option.input.maxLength);
    if (typed) extra[`${question.id}Text`] = typed;
  }
  return { ...answers, extra };
}
