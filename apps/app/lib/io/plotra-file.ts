import "server-only";
import { db, schema } from "@plotra/db";
import { and, eq, getTableColumns, getTableName, inArray, like } from "drizzle-orm";
import { getTableConfig, type PgColumn, type PgTable } from "drizzle-orm/pg-core";
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import * as Y from "yjs";
import journal from "@plotra/db/journal";
import { getProjectAccess, requireProjectAccess } from "../access";
import { requireSession, requireWorkspace } from "../data";
import { userDb, type Tx } from "../db";
import { fileSlug } from "../publish/html";
import { assertCanAddProject, assertStorage, limitsFor } from "../quotas";
import { r2Delete, r2Enabled, r2Get, r2Put } from "../r2";
import { slugify } from "../slug";

// A whole project in one file, `.plotra` (local-mode-plan.md, phase 6): export
// it from one Plotra (the cloud, or the desktop app's library) and import it
// into another, with nothing lost that is the writer's work.
//
// The file is a zip:
//   plotra.json               the manifest (format version, the schema's latest
//                             migration, when, which project and which world)
//   tables/<table>.json       the rows of each table, as Drizzle returns them:
//                             dates as ISO strings, bytes as {"$base64": …}
//   blobs/<table>/<id>.<col>  the big binary values, referenced from their row
//                             as {"$blob": "<path>"}: each note's Yjs document
//                             (`node.ydoc`), each version's snapshot and each
//                             attachment's bytes (read from object storage when
//                             they live there)
//
// Table by table (packages/db/src/schema):
//
// In, because they are the work:
//   project            the project itself (title, type, description, settings:
//                      modules, labels, workflow, vocabulary…), and the world
//                      project it shares (`worldId`) when there is one and the
//                      exporter can read it; imported as a new world, wired up.
//   node               every note, folder, board and world page, trashed ones
//                      too, with its Yjs document.
//   link, fact         the link and tagged-block indexes. Rebuilt from the text
//                      on every save, but carried so the copy is whole at once.
//   property_def, entity_type, calendar, release, plot_thread, scene_thread,
//   relationship, timeline_event, knowledge, setup_payoff, retcon
//                      the story tools: templates, world types, calendars,
//                      releases, the plot grid, the relationship map, timelines,
//                      who knows what, setups and payoffs, retcons.
//   version            version history, snapshots included.
//   comment_thread, comment
//                      notes on the text, anchored to it; whoever wrote them,
//                      they arrive as the importing person's.
//   questionnaire      the questions the writer prepared for beta readers.
//   attachment         pictures and clipped files, bytes included.
//   line_state, string_entry, translation, glossary_term
//                      recording sheets, short texts, translations, term base.
//
// Out, because they belong to people or to the server rather than the work:
//   project_member, share_link        who it's shared with, and its public link
//   review_rule, approval             required reviewers and their decisions: people of this workspace
//   questionnaire_response            readers' answers, one row per reader
//   chat_message                      people talking beside the page
//   layout                            one person's saved panel arrangements
//   agent_thread, agent_message, agent_task
//                                     one person's private conversations with the agent
//   agent_run, agent_change           the agent's run log and usage
//   activity, notification            the feed and people's notifications
//   writing_hour, writer_hour         writing statistics (per project, and one person's own)
//   event                             product analytics
//   webhook                           where this server tells others about the project, with its secrets
//   git_sync                          the GitHub repository it's kept in, with its token
// and everything outside a project: users, sessions, workspaces, members,
// invitations, API tokens, AI keys, preferences, billing, analytics events,
// rate limits.
//
// Ids. Import makes a new project: every row gets a fresh id. Foreign keys are
// rewritten through the old→new map; a reference to something not in the file
// becomes null (or drops the row, when it can't be null). Ids held elsewhere
// are rewritten too, wherever they are: in JSON columns (a `node`-typed
// property, settings), in text (a link's context carries its target's id, a
// translation's unit key is `<nodeId>:<blockId>`, an image's URL names its
// attachment) and inside the Yjs documents themselves (a wikilink, an embed
// or a citation names its target note; a canvas card, a map pin or a dialogue
// names a note or a file). The documents are rewritten in place, attribute by
// attribute, so every character keeps its Yjs identity and comment anchors
// (Yjs relative positions) still point where they did. People (createdById,
// authorId…) become the importing person.

const {
  project,
  node,
  link,
  propertyDef,
  plotThread,
  sceneThread,
  relationship,
  calendar,
  timelineEvent,
  commentThread,
  comment,
  version,
  entityType,
  release,
  fact,
  knowledge,
  setupPayoff,
  retcon,
  questionnaire,
  attachment,
  lineState,
  stringEntry,
  translation,
  glossaryTerm,
} = schema;

/** The file format's version: a reader refuses a file of a later one. */
export const PLOTRA_FILE_VERSION = 1;
export const PLOTRA_EXTENSION = "plotra";

/** Tables carried, in the order they are written (what a row points at goes in before it). */
export const includedTables: PgTable[] = [
  entityType,
  calendar,
  propertyDef,
  release,
  node,
  version,
  link,
  fact,
  plotThread,
  sceneThread,
  relationship,
  timelineEvent,
  knowledge,
  setupPayoff,
  retcon,
  commentThread,
  comment,
  questionnaire,
  attachment,
  lineState,
  stringEntry,
  translation,
  glossaryTerm,
];

/** Project-scoped tables left out on purpose (see the top of this file). */
export const excludedTables = [
  "project_member",
  "share_link",
  "review_rule",
  "approval",
  "questionnaire_response",
  "chat_message",
  "layout",
  "agent_thread",
  "agent_message",
  "agent_task",
  "agent_run",
  "agent_change",
  "activity",
  "notification",
  "writing_hour",
  "writer_hour",
  "event",
  "webhook",
  "git_sync",
];

/** The schema's latest migration: a file from a newer schema than this server's isn't read. */
export const schemaMigration: string = journal.entries.at(-1)!.tag;
const knownMigrations = new Set(journal.entries.map((entry) => entry.tag));

export type PlotraManifest = {
  format: "plotra";
  version: number;
  migration: string;
  exportedAt: string;
  project: { id: string; title: string; type: string };
  /** The shared world that came along, if any. */
  world: { id: string; title: string; type: string } | null;
  /** Rows per table. */
  tables: Record<string, number>;
  /** Versions or files whose bytes couldn't be read when exporting, so were left out. */
  missing?: number;
};

type Row = Record<string, unknown>;
type BlobRef = { $blob: string };
type Base64 = { $base64: string };

const isBlobRef = (value: unknown): value is BlobRef => typeof value === "object" && value !== null && typeof (value as BlobRef).$blob === "string";
const isBase64 = (value: unknown): value is Base64 => typeof value === "object" && value !== null && typeof (value as Base64).$base64 === "string";

/** Stands in for a person in the file: who they were isn't carried, only that someone was. */
const SOMEONE = "someone";

// ---- Reading a table's shape -----------------------------------------------------------

type Shape = {
  name: string;
  columns: Record<string, PgColumn>;
  /** Columns that point at another row, by property name: the table they point at. */
  refs: Map<string, string>;
  /** Columns that point at a person. */
  people: Set<string>;
  hasId: boolean;
};

const shapes = new Map<PgTable, Shape>();

function shapeOf(table: PgTable): Shape {
  let shape = shapes.get(table);
  if (shape) return shape;
  const columns = getTableColumns(table) as Record<string, PgColumn>;
  const propOf = new Map(Object.entries(columns).map(([prop, column]) => [column, prop]));
  const refs = new Map<string, string>();
  const people = new Set<string>();
  for (const fk of getTableConfig(table).foreignKeys) {
    const reference = fk.reference();
    const prop = propOf.get(reference.columns[0] as PgColumn);
    if (!prop || reference.columns.length !== 1) continue;
    const target = getTableName(reference.foreignTable);
    if (target === "user") people.add(prop);
    else refs.set(prop, target);
  }
  shape = { name: getTableName(table), columns, refs, people, hasId: "id" in columns };
  shapes.set(table, shape);
  return shape;
}

const sqlType = (column: PgColumn) => column.getSQLType();

// ---- Rewriting ids ----------------------------------------------------------------------

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export type Remap = {
  /** A string with every old id in it replaced; the same string when there was none. */
  text(value: string): string;
  /** A JSON value with every old id in it (values and keys) replaced; the same reference when nothing changed. */
  json<T>(value: T): T;
};

/** Rewrites old ids to new ones wherever they appear: a whole string, or inside one (`<nodeId>:<blockId>`, a URL). */
export function remapper(ids: ReadonlyMap<string, string>): Remap {
  const text = (value: string): string => {
    const exact = ids.get(value);
    if (exact !== undefined) return exact;
    if (value.length < 36) return value;
    return value.replace(UUID, (id) => ids.get(id) ?? ids.get(id.toLowerCase()) ?? id);
  };
  const json = <T>(value: T): T => {
    if (typeof value === "string") return text(value) as T;
    if (Array.isArray(value)) {
      let changed = false;
      const out = value.map((item) => {
        const next = json(item);
        if (next !== item) changed = true;
        return next;
      });
      return (changed ? out : value) as T;
    }
    if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
      let changed = false;
      const out: Row = {};
      for (const [key, item] of Object.entries(value as Row)) {
        const nextKey = text(key);
        const next = json(item);
        if (nextKey !== key || next !== item) changed = true;
        out[nextKey] = next;
      }
      return (changed ? out : value) as T;
    }
    return value;
  };
  return { text, json };
}

/**
 * A Yjs state with every old id in it replaced, made as edits on top of the
 * same document: a document's elements (`content`, a Y.XmlText as Plate keeps
 * it) carry their properties as attributes and its text its marks as format
 * attributes; a canvas or dialogue is maps of plain objects. Text itself is
 * left alone, so every character keeps its identity. Returns the same bytes
 * when nothing needed changing.
 */
export function rewriteYdoc(state: Uint8Array, remap: Remap): Uint8Array {
  if (!state.length) return state;
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  let changed = false;

  const walk = (type: Y.AbstractType<unknown>): void => {
    if (type instanceof Y.XmlText || type instanceof Y.Text) {
      if (type instanceof Y.XmlText) {
        for (const [key, value] of Object.entries(type.getAttributes() as Row)) {
          const next = remap.json(value);
          if (next !== value) {
            type.setAttribute(key, next as never);
            changed = true;
          }
        }
      }
      let offset = 0;
      for (const op of type.toDelta() as Array<{ insert: unknown; attributes?: Row }>) {
        const length = typeof op.insert === "string" ? op.insert.length : 1;
        if (op.insert instanceof Y.AbstractType) walk(op.insert);
        if (op.attributes) {
          const next = remap.json(op.attributes);
          if (next !== op.attributes) {
            type.format(offset, length, next);
            changed = true;
          }
        }
        offset += length;
      }
    } else if (type instanceof Y.Map) {
      for (const [key, value] of [...type.entries()] as Array<[string, unknown]>) {
        if (value instanceof Y.AbstractType) {
          walk(value);
          continue;
        }
        const nextKey = remap.text(key);
        const next = remap.json(value);
        if (nextKey !== key) {
          type.delete(key);
          type.set(nextKey, next);
          changed = true;
        } else if (next !== value) {
          type.set(key, next);
          changed = true;
        }
      }
    } else if (type instanceof Y.Array) {
      const items = type.toArray() as unknown[];
      items.forEach((value, i) => {
        if (value instanceof Y.AbstractType) return walk(value);
        const next = remap.json(value);
        if (next !== value) {
          type.delete(i, 1);
          type.insert(i, [next]);
          changed = true;
        }
      });
    } else if (type instanceof Y.XmlElement || type instanceof Y.XmlFragment) {
      if (type instanceof Y.XmlElement) {
        for (const [key, value] of Object.entries(type.getAttributes() as Row)) {
          const next = remap.json(value);
          if (next !== value) {
            type.setAttribute(key, next as never);
            changed = true;
          }
        }
      }
      for (const child of type.toArray()) walk(child as Y.AbstractType<unknown>);
    }
  };

  doc.transact(() => {
    for (const [name, root] of [...doc.share.entries()]) {
      // A root is typed by whoever asks for it first: a document's is the text Plate edits; a board's are maps.
      if (name === "content") walk(doc.get("content", Y.XmlText) as Y.AbstractType<unknown>);
      else if (root._start === null && root._map.size) walk(doc.getMap(name) as Y.AbstractType<unknown>);
    }
  });
  const out = changed ? Y.encodeStateAsUpdate(doc) : state;
  doc.destroy();
  return out;
}

// ---- Export --------------------------------------------------------------------------------

/** Where a binary value goes in the zip. */
const blobPath = (table: string, id: string, column: string) => `blobs/${table}/${id}.${column}`;

/** A row as the file keeps it: dates as text, people as "someone", bytes as a blob or base64. */
function writeRow(shape: Shape, row: Row, files: Zippable, blobs: Record<string, Uint8Array | null> = {}): Row {
  const out: Row = {};
  for (const [prop, column] of Object.entries(shape.columns)) {
    let value = row[prop];
    if (prop in blobs) {
      const bytes = blobs[prop];
      if (bytes?.length) {
        const path = blobPath(shape.name, String(row.id), prop);
        files[path] = [bytes, { level: 0 }];
        value = { $blob: path } satisfies BlobRef;
      } else value = null;
    } else if (shape.people.has(prop)) value = value == null ? null : SOMEONE;
    else if (value instanceof Date) value = value.toISOString();
    else if (value instanceof Uint8Array) value = { $base64: Buffer.from(value).toString("base64") } satisfies Base64;
    else if (sqlType(column) === "bytea" && value != null) value = null;
    out[prop] = value ?? null;
  }
  return out;
}

/** A version's snapshot or a file's bytes, wherever they are kept; null when they can't be read. */
async function bytesOf(inline: Uint8Array | null, key: string | null): Promise<Uint8Array | null> {
  if (inline?.length) return inline;
  if (!key || !r2Enabled()) return null;
  return r2Get(key).catch(() => null);
}

/** What a `.plotra` file is made of: the rows of its projects, and of every table it carries. */
type Collected = { projects: Row[]; tables: Array<{ table: PgTable; rows: Row[] }> };

/** Zips collected rows into a `.plotra` file, with the bytes of versions and files beside them. */
async function packPlotraFile(mainId: string, worldId: string | null, { projects, tables }: Collected): Promise<{ name: string; type: string; data: Uint8Array }> {
  const main = projects.find((p) => p.id === mainId)!;
  const files: Zippable = {};
  const counts: Record<string, number> = {};
  let missing = 0;
  const projectShape = shapeOf(project);
  files["tables/project.json"] = strToU8(JSON.stringify(projects.map((row) => writeRow(projectShape, row, files))));
  counts.project = projects.length;

  for (const { table, rows } of tables) {
    const shape = shapeOf(table);
    const written: Row[] = [];
    for (const row of rows) {
      if (table === node) {
        written.push(writeRow(shape, row, files, { ydoc: row.ydoc as Uint8Array | null }));
      } else if (table === version || table === attachment) {
        const column = table === version ? "snapshot" : "data";
        const bytes = await bytesOf(row[column] as Uint8Array | null, row.r2Key as string | null);
        // A snapshot or file whose bytes are gone stays out rather than stop the export.
        if (!bytes) {
          missing++;
          continue;
        }
        written.push({ ...writeRow(shape, row, files, { [column]: bytes }), r2Key: null });
      } else written.push(writeRow(shape, row, files));
    }
    files[`tables/${shape.name}.json`] = strToU8(JSON.stringify(written));
    counts[shape.name] = written.length;
  }

  const world = worldId ? projects.find((p) => p.id === worldId) : undefined;
  const manifest: PlotraManifest = {
    format: "plotra",
    version: PLOTRA_FILE_VERSION,
    migration: schemaMigration,
    exportedAt: new Date().toISOString(),
    project: { id: mainId, title: String(main.title), type: String(main.type) },
    world: world ? { id: String(world.id), title: String(world.title), type: String(world.type) } : null,
    tables: counts,
    ...(missing > 0 && { missing }),
  };
  files["plotra.json"] = strToU8(JSON.stringify(manifest, null, 2));
  return { name: `${fileSlug(String(main.title))}.${PLOTRA_EXTENSION}`, type: "application/zip", data: zipSync(files, { level: 6 }) };
}

/**
 * The project as a `.plotra` file. For anyone who can read the project, as
 * every export is (plan.md 8.1); its world comes along when they can read that
 * too. Run inside `readOnly`.
 */
export async function buildPlotraFile(projectId: string): Promise<{ name: string; type: string; data: Uint8Array }> {
  const { project: main } = await requireProjectAccess(projectId);
  const worldId = main.worldId && main.worldId !== main.id && (await getProjectAccess(main.worldId)) ? main.worldId : null;
  const projectIds = worldId ? [worldId, main.id] : [main.id];

  const collected = await userDb(async (tx) => {
    const projects = (await tx.select().from(project).where(inArray(project.id, projectIds))) as Row[];
    const tables: Collected["tables"] = [];
    for (const table of includedTables) {
      const projectColumn = shapeOf(table).columns.projectId;
      tables.push({ table, rows: (await tx.select().from(table).where(inArray(projectColumn, projectIds))) as Row[] });
    }
    return { projects, tables };
  });
  return packPlotraFile(main.id, worldId, collected);
}

/**
 * Tables a public copy leaves out, beyond what every file does: the history
 * of the work and the talk around it, which the public reader never shows.
 */
const leftOutOfPublicCopy = new Set<PgTable>([version, commentThread, comment, questionnaire]);

/** Notes outside the trash: not deleted, and nothing above them deleted either. */
function liveNotes(rows: Row[]): Row[] {
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const verdict = new Map<string, boolean>();
  const live = (id: string, depth = 0): boolean => {
    const known = verdict.get(id);
    if (known !== undefined) return known;
    const row = byId.get(id);
    // The depth guard only matters for a damaged tree with a cycle.
    const ok = !!row && !row.deletedAt && depth < 200 && (row.parentId == null || live(String(row.parentId), depth + 1));
    verdict.set(id, ok);
    return ok;
  };
  return rows.filter((row) => live(String(row.id)));
}

/**
 * The project behind a public link as a `.plotra` file, for a reader to copy
 * into a workspace of their own (lib/public-copy-actions.ts). It holds what
 * the link shows, the notes outside the trash, and the story tools around
 * them (types, templates, calendars, releases, the plot grid, relationships,
 * timelines, who knows what), with the pictures and files of those notes. Not
 * version history, comments, beta readers' questions or the trash; not the
 * world project, which the link doesn't show; and not the template mark.
 *
 * No access check: the caller has checked the link. Reads with the server's
 * own connection, as the public reader does (lib/public-read.ts).
 */
export async function buildPublicCopyFile(projectId: string): Promise<{ name: string; type: string; data: Uint8Array }> {
  const [source] = (await db.select().from(project).where(eq(project.id, projectId)).limit(1)) as Row[];
  if (!source) throw new Error("That project isn't there any more.");
  const settings = { ...((source.settings as Row | null) ?? {}) };
  delete settings.template;
  const projects = [{ ...source, worldId: null, settings }];

  const tables: Collected["tables"] = [];
  let live = new Set<string>();
  for (const table of includedTables) {
    if (leftOutOfPublicCopy.has(table)) continue;
    let rows = (await db.select().from(table).where(eq(shapeOf(table).columns.projectId, projectId))) as Row[];
    if (table === node) {
      rows = liveNotes(rows);
      live = new Set(rows.map((row) => String(row.id)));
    }
    // Rows pointing at a note left out are dropped, or lose the pointer, on import; files go here, so their bytes aren't read.
    if (table === attachment) rows = rows.filter((row) => live.has(String(row.nodeId)));
    tables.push({ table, rows });
  }
  return packPlotraFile(projectId, null, { projects, tables });
}

// ---- Reading a file --------------------------------------------------------------------------

/** The largest `.plotra` file taken (less on Vercel, whose functions take 4.5 MB: lib/quotas.ts `functionBodyCap`). */
export const MAX_PLOTRA_BYTES = 1024 * 1024 * 1024;
/** What a `.plotra` file may unpack to: a novel with its pictures, not a zip bomb. */
export const MAX_PLOTRA_UNPACKED_BYTES = 2048 * 1024 * 1024;

export type PlotraFile = {
  manifest: PlotraManifest;
  /** Rows by table name. */
  tables: Map<string, Row[]>;
  blob(path: string): Uint8Array | null;
};

const notPlotra = () => new Error("That isn't a Plotra project file (.plotra).");

/** Opens a `.plotra` file and checks it's one this server can read. Throws a message for the person otherwise. */
export function readPlotraFile(bytes: Uint8Array, maxUnpacked = MAX_PLOTRA_UNPACKED_BYTES): PlotraFile {
  let entries: Record<string, Uint8Array>;
  let unpacked = 0;
  try {
    entries = unzipSync(bytes, {
      filter: (file) => {
        unpacked += file.originalSize;
        if (unpacked > maxUnpacked) throw new Error("too large");
        return file.name === "plotra.json" || file.name.startsWith("tables/") || file.name.startsWith("blobs/");
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "too large") throw new Error("That project file is too large to import here.");
    throw notPlotra();
  }
  if (!entries["plotra.json"]) throw notPlotra();
  let manifest: PlotraManifest;
  try {
    manifest = JSON.parse(strFromU8(entries["plotra.json"])) as PlotraManifest;
  } catch {
    throw notPlotra();
  }
  if (manifest?.format !== "plotra" || typeof manifest.project?.id !== "string") throw notPlotra();
  if (typeof manifest.version !== "number" || manifest.version > PLOTRA_FILE_VERSION || (manifest.migration && !knownMigrations.has(manifest.migration))) {
    throw new Error("That project file was made by a newer Plotra. Update Plotra, then import it again.");
  }
  const tables = new Map<string, Row[]>();
  for (const [path, data] of Object.entries(entries)) {
    const match = /^tables\/([a-z_]+)\.json$/.exec(path);
    if (!match) continue;
    try {
      const rows = JSON.parse(strFromU8(data)) as unknown;
      if (!Array.isArray(rows)) throw notPlotra();
      tables.set(match[1], rows.filter((row): row is Row => typeof row === "object" && row !== null && !Array.isArray(row)));
    } catch {
      throw new Error(`That project file is damaged (${match[1]}).`);
    }
  }
  if (!tables.get("project")?.some((row) => row.id === manifest.project.id)) throw notPlotra();
  return { manifest, tables, blob: (path) => entries[path] ?? null };
}

// ---- Import --------------------------------------------------------------------------------

/** A value from the file in the shape its column takes. */
function readValue(column: PgColumn, value: unknown, file: PlotraFile): unknown {
  if (value === null || value === undefined) return value;
  const type = sqlType(column);
  if (type.startsWith("timestamp")) {
    const date = typeof value === "string" || typeof value === "number" ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : undefined;
  }
  if (type === "bytea") {
    if (isBlobRef(value)) return file.blob(value.$blob);
    if (isBase64(value)) return new Uint8Array(Buffer.from(value.$base64, "base64"));
    return null;
  }
  return value;
}

type Prepared = { table: PgTable; rows: Row[] };
/** A key pointing at a row that goes in after its own (a release's folder), set once both exist. */
type Deferred = { table: PgTable; id: string; column: string; target: string; old: string };

/** Rows of `table` ready to insert (fresh ids, keys rewritten), and updates for keys that point forward. */
function prepareTable(
  table: PgTable,
  source: Row[],
  context: {
    file: PlotraFile;
    ids: Map<string, string>;
    remap: Remap;
    userId: string;
    /** Old ids of rows already going in, by table. */
    present: Map<string, Set<string>>;
    /** Tables written later than this one. */
    later: Set<string>;
    deferred: Deferred[];
  },
): Row[] {
  const shape = shapeOf(table);
  const { ids, remap, present, file } = context;
  // A table that points at itself (a note's parent) can point at any of its own rows.
  if (shape.hasId) present.set(shape.name, new Set(source.map((row) => String(row.id))));
  const kept: Row[] = [];
  const keptIds = new Set<string>();
  rows: for (const row of source) {
    const out: Row = {};
    for (const [prop, column] of Object.entries(shape.columns)) {
      let value = readValue(column, row[prop], file);
      if (value === undefined) continue;
      if (prop === "id" && shape.hasId) value = ids.get(String(value));
      else if (shape.people.has(prop)) value = value === null ? null : context.userId;
      else if (shape.refs.has(prop)) {
        if (value !== null) {
          const target = shape.refs.get(prop)!;
          const old = String(value);
          const mapped = present.get(target)?.has(old) || context.later.has(target) ? ids.get(old) : undefined;
          if (mapped && context.later.has(target) && target !== shape.name) {
            // Points at a row that goes in later (a release's folder): set once that row exists.
            context.deferred.push({ table, id: ids.get(String(row.id))!, column: prop, target, old });
            value = null;
          } else value = mapped ?? null;
        }
        if (value === null && column.notNull) continue rows;
      } else value = remap.json(value);
      out[prop] = value;
    }
    if (shape.hasId) {
      if (!out.id) continue;
      keptIds.add(String(row.id));
    }
    kept.push(out);
  }
  if (shape.hasId) present.set(shape.name, keptIds);
  return kept;
}

/** Notes ordered so every parent goes in before its children. */
function parentsFirst(rows: Row[]): Row[] {
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const depth = new Map<string, number>();
  const depthOf = (row: Row, seen = new Set<string>()): number => {
    const id = String(row.id);
    const known = depth.get(id);
    if (known !== undefined) return known;
    const parent = row.parentId ? byId.get(String(row.parentId)) : undefined;
    if (!parent || seen.has(id)) {
      // A cycle can only come from a damaged file: break it at the top.
      if (parent) row.parentId = null;
      depth.set(id, 0);
      return 0;
    }
    seen.add(id);
    const d = depthOf(parent, seen) + 1;
    depth.set(id, d);
    return d;
  };
  return [...rows].sort((a, b) => depthOf(a) - depthOf(b));
}

async function uniqueSlug(tx: Tx, workspaceId: string, title: string, taken: Set<string>) {
  const base = slugify(title) || "untitled";
  for (const row of await tx.select({ slug: project.slug }).from(project).where(and(eq(project.organizationId, workspaceId), like(project.slug, `${base}%`)))) taken.add(row.slug);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

/** Throws unless the workspace has room for `adding` more projects. */
async function assertProjectRoom(workspaceId: string, adding: number) {
  await assertCanAddProject(workspaceId);
  if (adding < 2) return;
  const { projects: limit } = await limitsFor(workspaceId);
  if (limit === null) return;
  const count = await db.$count(project, eq(project.organizationId, workspaceId));
  if (count + adding > limit) throw new Error(`This project comes with its world, which makes two projects, and the workspace has room for ${Math.max(0, limit - count)}.`);
}

export type ImportedProject = { projectId: string; workspaceId: string; slug: string; href: string; worldId: string | null; notes: number };

/**
 * Creates a new project in the workspace from a `.plotra` file, and a new
 * world beside it when the file carries one. For members of the workspace,
 * counted against its project and storage limits; all of it is written in one
 * transaction as the signed-in person, under row-level security. Version
 * snapshots and files go to object storage when it's configured (as new ones
 * do: lib/versions.ts, app/api/files/store.ts) and into Postgres otherwise.
 */
export async function importPlotraFile(workspaceSlug: string, bytes: Uint8Array): Promise<ImportedProject> {
  const { user } = await requireSession();
  // 404s for anyone who isn't a member of the workspace.
  const workspace = await requireWorkspace(workspaceSlug);
  const file = readPlotraFile(bytes);
  const mainId = file.manifest.project.id;

  const sourceProjects = file.tables.get("project")!;
  const mainRow = sourceProjects.find((row) => row.id === mainId)!;
  const worldOld = typeof mainRow.worldId === "string" && mainRow.worldId !== mainId ? mainRow.worldId : null;
  const worldRow = worldOld ? sourceProjects.find((row) => row.id === worldOld) : undefined;
  const projectIds = new Set([mainId, ...(worldRow ? [worldOld!] : [])]);
  await assertProjectRoom(workspace.id, projectIds.size);

  // Every id in the file gets a fresh one.
  const ids = new Map<string, string>();
  for (const id of projectIds) ids.set(id, crypto.randomUUID());
  for (const table of includedTables) {
    if (!shapeOf(table).hasId) continue;
    for (const row of file.tables.get(shapeOf(table).name) ?? []) if (typeof row.id === "string" && !ids.has(row.id)) ids.set(row.id, crypto.randomUUID());
  }
  const remap = remapper(ids);

  const present = new Map<string, Set<string>>([["project", projectIds]]);
  const later = new Set(includedTables.map((table) => shapeOf(table).name));
  const deferred: Deferred[] = [];
  const prepared: Prepared[] = [];
  for (const table of includedTables) {
    const name = shapeOf(table).name;
    later.delete(name);
    let source = (file.tables.get(name) ?? []).filter((row) => projectIds.has(String(row.projectId)));
    if (table === node) source = parentsFirst(source);
    // A snapshot or a file is nothing without its bytes.
    if (table === version) source = source.filter((row) => isBlobRef(row.snapshot) && file.blob(row.snapshot.$blob)?.length);
    if (table === attachment) source = source.filter((row) => isBlobRef(row.data) && file.blob(row.data.$blob));
    prepared.push({ table, rows: prepareTable(table, source, { file, ids, remap, userId: user.id, present, later, deferred }) });
  }

  // Documents and snapshots name notes and files by id inside them too.
  let storing = 0;
  for (const { table, rows } of prepared) {
    for (const row of rows) {
      if (table === node && row.ydoc instanceof Uint8Array) row.ydoc = rewriteYdoc(row.ydoc, remap);
      if (table === version) {
        const state = rewriteYdoc(row.snapshot as Uint8Array, remap);
        row.snapshot = state;
        row.size = state.length;
        storing += state.length;
      }
      if (table === attachment) {
        const data = row.data as Uint8Array;
        row.size = data.length;
        storing += data.length;
      }
    }
  }
  if (storing) await assertStorage(workspace.id, storing);

  // Snapshots and files go where new ones would. Object storage isn't part of the transaction: what was put there is taken away again if it fails.
  const stored: string[] = [];
  const toStorage = r2Enabled();
  const put = async (key: string, data: Uint8Array, type?: string) => {
    await r2Put(key, data, type);
    stored.push(key);
  };

  try {
    for (const { table, rows } of prepared) {
      if (table !== version && table !== attachment) continue;
      for (const row of rows) {
        const projectId = String(row.projectId);
        if (table === version) {
          const key = `versions/${projectId}/${row.id}.ydoc`;
          if (toStorage) await put(key, row.snapshot as Uint8Array);
          Object.assign(row, toStorage ? { snapshot: null, r2Key: key } : { r2Key: null });
        } else {
          const key = `attachments/${projectId}/${row.id}`;
          if (toStorage) await put(key, row.data as Uint8Array, String(row.contentType || "application/octet-stream"));
          Object.assign(row, toStorage ? { data: null, r2Key: key } : { r2Key: null });
        }
      }
    }

    const newMain = ids.get(mainId)!;
    const newWorld = worldRow ? ids.get(worldOld!)! : null;
    const slug = await userDb(async (tx) => {
      const taken = new Set<string>();
      const projectRow = (row: Row, id: string, worldId: string | null) => {
        const { settings, description, type, title, createdAt } = row;
        return {
          id,
          organizationId: workspace.id,
          title: String(title || "Untitled").slice(0, 120),
          type: type as typeof project.$inferInsert.type,
          description: typeof description === "string" ? description : null,
          settings: settings && typeof settings === "object" ? remap.json(settings as Row) : {},
          worldId,
          createdById: user.id,
          ...(typeof createdAt === "string" && !Number.isNaN(Date.parse(createdAt)) && { createdAt: new Date(createdAt) }),
        };
      };
      // The world first, so the project can point at it.
      if (worldRow && newWorld) await tx.insert(project).values({ ...projectRow(worldRow, newWorld, null), slug: await uniqueSlug(tx, workspace.id, String(worldRow.title || "World"), taken) });
      const slug = await uniqueSlug(tx, workspace.id, String(mainRow.title || "Untitled"), taken);
      await tx.insert(project).values({ ...projectRow(mainRow, newMain, newWorld), slug });

      for (const { table, rows } of prepared) {
        const batch = table === version || table === attachment || table === node ? 20 : 200;
        for (let i = 0; i < rows.length; i += batch) await tx.insert(table).values(rows.slice(i, i + batch) as never);
      }
      for (const update of deferred) {
        if (!present.get(update.target)?.has(update.old)) continue;
        await tx
          .update(update.table)
          .set({ [update.column]: ids.get(update.old) } as never)
          .where(eq(shapeOf(update.table).columns.id, update.id));
      }
      return slug;
    });
    return {
      projectId: newMain,
      workspaceId: workspace.id,
      slug,
      href: `/w/${workspace.slug}/p/${slug}`,
      worldId: newWorld,
      notes: prepared.find((p) => p.table === node)?.rows.filter((row) => row.projectId === newMain).length ?? 0,
    };
  } catch (error) {
    await r2Delete(stored);
    throw error;
  }
}
