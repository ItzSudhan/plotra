import type {
  CalendarDefinition,
  CanonStatus,
  KnowledgeLayer,
  NodeKind,
  NodeSettings,
  ProjectType,
  ReleaseKind,
  SetupKind,
  SetupStatus,
} from "@plotra/db/schema";
import type { RuleId } from "../continuity";
import type { ScriptElementType } from "../script";
import type { SampleId } from "./catalog";

// Sample projects (plan.md Phase 8 "Onboarding"): one per launch audience, so a
// new account opens something that shows what Plotra is for. A sample is plain
// data: notes refer to each other by `key`, and `build.ts` turns the keys into
// ids and the data into database rows. Nothing here does I/O.

/** A link to another note of the same sample, optionally shown as other text. */
export type SampleLink = { link: string; as?: string };
export type SampleInline = string | SampleLink;

export type SampleBlock = {
  type: "p" | "h2" | "h3" | "blockquote" | ScriptElementType;
  parts: SampleInline[];
  /** Block-level reveal: a release key, or "never" for something the audience is never told. */
  reveal?: string;
  layer?: KnowledgeLayer;
  canon?: CanonStatus;
};

/** A property value; `{ note }` and `{ notes }` point at other notes of the sample by key. */
export type SampleProperty = string | number | boolean | string[] | { note: string } | { notes: string[] };

export type SampleNote = {
  /** Unique within the sample; what links and references use. */
  key: string;
  kind: NodeKind;
  title: string;
  /** For an `entity`: the name of one of the default entity types ("Faction", "Object"…). */
  entityType?: string;
  aliases?: string[];
  synopsis?: string;
  /** Defaults to canon: a sample's world is established unless a note says otherwise. */
  canon?: CanonStatus;
  /** The release (by key) that reveals this note to the audience. */
  reveal?: string;
  layer?: KnowledgeLayer;
  properties?: Record<string, SampleProperty>;
  /** Board settings; `calendar: true` on a timeline points it at the sample's calendar. */
  settings?: NodeSettings;
  body?: SampleBlock[];
  children?: SampleNote[];
};

export type SampleRelease = {
  key: string;
  title: string;
  kind: ReleaseKind;
  /** ISO date, planned or actual. */
  date?: string;
  notes?: string;
  /** The folder this release ships: everything inside is revealed by it. */
  ships?: string;
};

export type SampleThread = {
  key: string;
  name: string;
  color: string;
  /** The scene that resolves it. */
  closedIn?: string;
  /** Plot grid cells: what happens to the thread in each scene. */
  cells: Array<{ scene: string; note: string }>;
};

export type Sample = {
  /** Its entry in the catalog (./catalog.ts), which is what the welcome screen shows. */
  id: SampleId;
  /** The new project's title and type. */
  title: string;
  type: ProjectType;
  logline: string;
  /** The note opened when the project is first opened. */
  open: string;
  /** A custom calendar for story dates; the Gregorian calendar when absent. */
  calendar?: { name: string; definition: CalendarDefinition };
  notes: SampleNote[];
  releases: SampleRelease[];
  threads: SampleThread[];
  relationships: Array<{ from: string; to: string; type: string; label?: string; directed?: boolean }>;
  /** Who knows which secret, and the scene they learn it in (absent: they knew all along). */
  knowledge: Array<{ character: string; secret: string; learnedIn?: string; layer?: KnowledgeLayer; note?: string }>;
  setups: Array<{ kind: SetupKind; title: string; setup: string; payoff?: string; status: SetupStatus; note?: string }>;
  /** Events on the sample's timeline (the note of kind `timeline`), dated in the sample's calendar. */
  events: Array<{ title: string; date: string; description?: string; about?: string; thread?: string }>;
  /**
   * What the Continuity view should report: the problems left in on purpose, so
   * opening it teaches something. The scratch test fails on anything else.
   */
  continuity: Array<{ rule: RuleId; notes: string[] }>;
};

/**
 * What `buildSample` needs: a sample, or a project put together from someone's
 * answers (lib/onboarding/tracks.ts), which has the same shape but isn't in the catalog.
 */
export type Seed = Omit<Sample, "id"> & { id: string };

// ---- Writing helpers ------------------------------------------------------------

/** A link to another note: `l("odran")`, or `l("odran", "the old keeper")` to show other text. */
export const l = (link: string, as?: string): SampleLink => ({ link, ...(as && { as }) });

export const p = (...parts: SampleInline[]): SampleBlock => ({ type: "p", parts });
export const h2 = (text: string): SampleBlock => ({ type: "h2", parts: [text] });
export const quote = (...parts: SampleInline[]): SampleBlock => ({ type: "blockquote", parts });
/** Tags a block with the release that reveals it ("never": the audience is never told). */
export const revealedIn = (release: string, block: SampleBlock): SampleBlock => ({ ...block, reveal: release });
