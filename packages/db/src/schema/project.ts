import { type AnyPgColumn, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

export const projectTypes = [
  "novel",
  "web_serial",
  "short_story",
  "screenplay",
  "stage_play",
  "comic",
  "game",
  "ttrpg",
  "podcast",
  "nonfiction",
  "franchise",
] as const;

export type ProjectType = (typeof projectTypes)[number];

export const projectType = pgEnum("project_type", projectTypes);

// Modules (plan.md 2.8): optional tool sets a project switches on. The project
// type picks the defaults (apps/app/lib/modules.ts); everything can be toggled.
export const moduleIds = [
  "world",
  "releases",
  "research",
  "editorial",
  "screenplay",
  "production",
  "interactive",
  "localization",
  "publishing",
  // The AI agent (plan.md 2.11 "Trust"): never a type's default, and only
  // offered once the workspace has switched AI on.
  "ai",
] as const;
export type ModuleId = (typeof moduleIds)[number];

/** How a document is laid out and typed: prose, or one of the script formats. */
export const scriptFormats = ["prose", "screenplay", "stageplay", "comic", "audio"] as const;
export type ScriptFormat = (typeof scriptFormats)[number];

/** One step of a project's editorial workflow (plan.md 2.8 "Review, editorial & approval"). */
export type WorkflowStage = {
  id: string;
  label: string;
  color: string;
  /** Content in this stage is read-only for everyone but approvers. */
  locked?: boolean;
  /** Entering this stage needs every required reviewer's approval. */
  approval?: boolean;
};

/** A colour label of the project's own: "Needs research", "Subplot", "Cut?". */
export type ProjectLabel = { id: string; name: string; color: string };

export type ProjectSettings = {
  /** Overrides of the project type's default modules. */
  modules?: Partial<Record<ModuleId, boolean>>;
  /** The format new scenes start in. */
  format?: ScriptFormat;
  /** The editorial workflow; absent means Draft → Revised → Final. */
  stages?: WorkflowStage[];
  /** Where reveals happen: main text, trailer, interview… */
  channels?: string[];
  /** Language the project is written in, and the ones it's translated into (BCP 47). */
  sourceLocale?: string;
  locales?: string[];
  citationStyle?: "apa" | "mla" | "chicago";
  /** How long the finished work should be, in words (the Stats view measures the project against it). */
  wordTarget?: number;
  /**
   * What this project calls the kinds of note, where it isn't the app's own
   * word: `{ chapter: "Session" }` (apps/app/lib/vocabulary.ts).
   */
  vocabulary?: Record<string, string>;
  /** Colour labels the project's notes can carry (`node.settings.label` holds a label's id). */
  labels?: ProjectLabel[];
  /** Offered in the workspace as a model for new projects: its structure is copied, not its text (apps/app/lib/template-actions.ts). */
  template?: boolean;
  /** The onboarding track the project was started on (apps/app/lib/onboarding/tracks.ts): what its author is making. */
  track?: string;
  /**
   * The setup everyone in the project starts from where they haven't chosen
   * their own (apps/app/lib/shell-defaults.ts): the page, the inspector, the
   * project home and the ribbon. Over the workspace's default, under each
   * person's own.
   */
  shellDefaults?: { editor?: Record<string, string>; inspector?: { split?: boolean; hidden?: string[]; order?: string[] }; home?: { hidden?: string[]; order?: string[] }; ribbon?: { pinned?: string[]; hidden?: string[]; all?: boolean; order?: string[] } };
  /** A note of the project's own that new notes of its kind start as a copy of, by kind (apps/app/lib/note-templates.ts). */
  noteTemplates?: Partial<Record<string, string>>;
  /**
   * Minutes between automatic versions of a note while it's being written
   * (apps/app/lib/versions.ts); 0 for none. Absent means every 30 minutes.
   */
  autoVersionMinutes?: number;
  /** The pages before the text in a compiled manuscript or an EPUB (apps/app/lib/io/front-matter.ts). */
  frontMatter?: { copyright?: string; dedication?: string; epigraph?: string; epigraphSource?: string };
};

export const project = pgTable(
  "project",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    type: projectType("type").default("novel").notNull(),
    description: text("description"),
    settings: jsonb("settings").$type<ProjectSettings>().default({}).notNull(),
    // A shared world bible (plan.md 2.8): another project whose entities this one can browse and link to.
    worldId: text("world_id").references((): AnyPgColumn => project.id, { onDelete: "set null" }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    uniqueIndex("project_organization_slug_idx").on(t.organizationId, t.slug),
    index("project_organization_id_idx").on(t.organizationId),
  ],
);
