import type { ModuleId } from "@plotra/db/schema";
import { sampleCatalog } from "../samples/catalog";
import { trackIds, type TrackId } from "./tracks";

// The "Getting started" checklist (onboarding-plan.md 2.3): five things a new
// project's author can do, chosen by the project's track. It is an ordinary
// checklist, not a game: nothing is locked, and a step is ticked because the
// person did the thing, never because they pressed "Next". Plain data; the
// card that shows it and the detection are in components/onboarding.

export const stepIds = [
  "write",
  "link",
  "graph",
  "secret",
  "horizon",
  "gm-note",
  "wiki",
  "corkboard",
  "beats",
  "fountain",
  // A sample's try-out (onboarding-plan.md 2.4).
  "try-report",
  "try-scene",
  "try-fix",
  "try-clear",
] as const;
export type StepId = (typeof stepIds)[number];

export const isStepId = (id: unknown): id is StepId => stepIds.includes(id as StepId);

export type Step = {
  id: StepId;
  label: string;
  /** One or two sentences: where the thing is and what it is for. Shown when the step is opened. */
  how: string;
  /** The control to point at: the `data-guide` of a ribbon button. */
  guide?: string;
  /**
   * The module the step needs. While it is off the step offers to switch it on,
   * and is left out for someone who can't (see `checklistFor`).
   */
  module?: ModuleId;
};

const write: Step = { id: "write", label: "Write your first 50 words", how: "Click into the page and type. Everything saves as you go." };
const link: Step = {
  id: "link",
  label: "Link two notes",
  how: "Type [[ anywhere in your text and pick a character, a place or any other note. The link works both ways: the Links tab on the right lists everything that points at the open note.",
};
const graph: Step = { id: "graph", label: "See your story as a graph", how: "Open Graph from the ribbon on the left. Every note is a dot, and every link you make is a line between two of them.", guide: "graph" };
const secret: Step = {
  id: "secret",
  label: "Record a secret and who knows it",
  how: "Open Secrets & setups, in the ribbon or under More, and add who knows what, and the scene they learn it in. It is how you catch “how does she know that?” before a reader does.",
  guide: "knowledge",
  module: "releases",
};
const horizon = (label: string, how: string): Step => ({ id: "horizon", label, how, guide: "roadmap", module: "releases" });

const tracks: Record<TrackId, Step[]> = {
  novel: [
    write,
    link,
    graph,
    secret,
    horizon(
      "Set what readers know as of a book",
      "Open Release roadmap, in the ribbon or under More, add a book if there isn't one, and choose it under “World as of”. Everything revealed later dims out of the binder, the codex and the read view.",
    ),
  ],
  ttrpg: [
    write,
    link,
    {
      id: "gm-note",
      label: "Write a line only you can see",
      how: "Put the cursor in a paragraph, open the command palette and run “Tag block”, then set its reveal to never. Players are never shown it, in the app or in an exported wiki.",
      guide: "palette",
      module: "releases",
    },
    horizon(
      "See what your players know",
      "Open Release roadmap, in the ribbon or under More, and choose a session under “World as of”. What the table hasn't seen yet dims out, GM-only lines included.",
    ),
    {
      id: "wiki",
      label: "Export a wiki for your players",
      how: "Open Publish, in the ribbon or under More, and save the public wiki. It holds only what has been revealed, so it is safe to hand to the table.",
      guide: "publish",
      module: "publishing",
    },
  ],
  screenplay: [
    write,
    link,
    { id: "corkboard", label: "Lay your scenes out as cards", how: "Open Corkboard, in the ribbon or under More. Each scene is a card with its synopsis; drag them to reorder the script.", guide: "corkboard" },
    {
      id: "beats",
      label: "Start from a beat sheet",
      how: "Open the command palette and run “New beat sheet”. Pick a structure and its beats are added to the binder as scenes to fill in.",
      guide: "palette",
    },
    {
      id: "fountain",
      label: "Export to Fountain",
      how: "Open the command palette and run “Export as Fountain”. The file opens in any screenwriting app.",
      guide: "palette",
      module: "screenplay",
    },
  ],
  // The other types share the novel's steps; the ones their modules don't have are left out below.
  other: [],
};
tracks.other = tracks.novel;

/** The view a step is about, when it is about one: finishing the step pins it to the ribbon (lib/ribbon.ts). */
export const stepView: Partial<Record<StepId, string>> = { graph: "graph", secret: "knowledge", horizon: "roadmap", wiki: "publish", corkboard: "corkboard" };

const isTrackId = (id: unknown): id is TrackId => trackIds.includes(id as TrackId);

// ---- A sample's try-out ------------------------------------------------------------

/** The track of a project made from a sample (lib/sample-actions.ts): "sample:romeo-and-juliet". */
export const sampleTrack = (sampleId: string) => `sample:${sampleId}`;
const sampleOf = (track: string | undefined) => sampleCatalog.find((sample) => track === sampleTrack(sample.id));

/**
 * A sample ships with one mistake left in on purpose. Its checklist is finding
 * and fixing it, which shows what the continuity checks are for better than a
 * page of text would, and then the spoiler horizon, the other thing a sample
 * is there to show.
 */
const tryout = ({ problem, fix }: { problem: string; fix: string }): Step[] => [
  { id: "try-report", label: "Open Continuity and read the report", how: `Open Continuity, in the ribbon on the left. ${problem}`, guide: "continuity", module: "world" },
  { id: "try-scene", label: "Go to the scene it names", how: "In the report, click the scene's name. It opens beside the report.", module: "world" },
  { id: "try-fix", label: "Fix the line", how: fix, module: "world" },
  { id: "try-clear", label: "Check again", how: "Back in Continuity, press “Check again”. The problem is gone from the report.", guide: "continuity", module: "world" },
  horizon(
    "See the world as of an earlier release",
    "Open Release roadmap, in the ribbon, and choose an earlier release under “World as of”. Everything revealed after it dims out of the binder, the codex and the read view.",
  ),
];

export type Checklist = { title: string; steps: Step[]; finished: string };

/**
 * The checklist of a project, or null when it has none. A project started
 * from the Cold Open has a track (`settings.track`) and gets "Getting
 * started"; one made from a sample gets that sample's try-out.
 */
export function checklistFor(track: string | undefined, modules: ReadonlySet<ModuleId>): Checklist | null {
  // `modules`: the ones that are on, plus, for someone who manages the project, the ones they could switch on.
  const available = (steps: Step[]) => steps.filter((step) => !step.module || modules.has(step.module));
  const sample = sampleOf(track);
  if (sample) {
    return {
      title: "Try it: fix the mistake",
      steps: available(tryout(sample.tryout)),
      finished: "That is what the checks are for. The sample is yours to keep exploring, or start a project of your own.",
    };
  }
  if (!isTrackId(track)) return null;
  return { title: "Getting started", steps: available(tracks[track]), finished: "That's the basics. Everything else is in the ribbon and under More when you want it." };
}

/** The steps of a project's checklist, or null when it has none. */
export const stepsFor = (track: string | undefined, modules: ReadonlySet<ModuleId>): Step[] | null => checklistFor(track, modules)?.steps ?? null;

/** Whether a track's checklist is a sample's try-out: it is closed on its own, apart from "Getting started". */
export const isTryout = (track: string | undefined) => sampleOf(track) !== undefined;

/** Words in one note that count as having started writing. */
export const WORDS_TO_START = 50;
