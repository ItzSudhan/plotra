"use server";

import { schema } from "@plotra/db";
import { and, eq, inArray, ne } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import * as Y from "yjs";
import { requireNodeAccess, requireProjectAccess } from "./access";
import { track } from "./analytics";
import { binderColumns, listNodes, withActions, type BinderNode } from "./binder";
import { requireSession } from "./data";
import { userDb } from "./db";
import { assertUnlocked } from "./editorial-guard";
import { detectImportFormat, importDialogue, linkSpeakers, MAX_IMPORT_SOURCE, type ImportResult, type ImportWarning } from "./interactive/import";
import { dialogueGraphFromUpdate, dialogueMaps, graphStrings, indexDialogue, stringIdPrefix, type DialogueGraph } from "./interactive/model";
import { logActivity } from "./notify";
import { rateLimit } from "./rate-limit";
import {
  MAX_CHAR_LIMIT,
  MAX_STRING_CATEGORY,
  MAX_STRING_CONTEXT,
  MAX_STRING_TEXT,
  MAX_STRINGS,
  stringKeyProblem,
  type ProjectString,
} from "./interactive/strings";
import { readOnly, transaction } from "./request-cache";

// Short-text fields and the project's string table (plan.md 2.8 "Interactive &
// branching narrative"). Short-text fields are rows of `string_entry`; dialogue
// lines keep their String IDs in the dialogue's own document and are read from
// its last synced snapshot.

const { node, project, stringEntry } = schema;

export type StringRow = {
  id: string;
  key: string;
  category: string;
  text: string;
  charLimit: number | null;
  context: string | null;
  nodeId: string | null;
  position: string;
};

const columns = {
  id: stringEntry.id,
  key: stringEntry.key,
  category: stringEntry.category,
  text: stringEntry.text,
  charLimit: stringEntry.charLimit,
  context: stringEntry.context,
  nodeId: stringEntry.nodeId,
  position: stringEntry.position,
};

const byPosition = (a: StringRow, b: StringRow) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0);

const cleanCategory = (category: string | undefined) => category?.trim().slice(0, MAX_STRING_CATEGORY) || "ui";

function cleanLimit(limit: number | null | undefined) {
  if (limit === null || limit === undefined || !Number.isFinite(limit) || limit < 1) return null;
  return Math.min(Math.floor(limit), MAX_CHAR_LIMIT);
}

/** The project's short-text fields, in order. A link to a note the user can't see is dropped. */
export async function listStrings(projectId: string): Promise<StringRow[]> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    const visible = new Set((await listNodes(projectId)).map((n) => n.id));
    const rows = await userDb((tx) => tx.select(columns).from(stringEntry).where(eq(stringEntry.projectId, projectId)));
    return rows.map((row) => (row.nodeId && !visible.has(row.nodeId) ? { ...row, nodeId: null } : row)).sort(byPosition);
  });
}

async function assertKeyFree(projectId: string, key: string, exceptId?: string) {
  const problem = stringKeyProblem(key);
  if (problem) throw new Error(problem);
  const [clash] = await userDb((tx) =>
    tx
      .select({ id: stringEntry.id })
      .from(stringEntry)
      .where(and(eq(stringEntry.projectId, projectId), eq(stringEntry.key, key), ...(exceptId ? [ne(stringEntry.id, exceptId)] : []))),
  );
  if (clash) throw new Error(`“${key}” is already another string's ID.`);
}

/** Adds a short-text field at the end of its category. Without a key it's `<category>.string_<n>`. */
export async function createString(
  projectId: string,
  input: { category?: string; key?: string; text?: string; charLimit?: number | null } = {},
): Promise<StringRow> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    const category = cleanCategory(input.category);
    const existing = await userDb((tx) =>
      tx.select({ key: stringEntry.key, position: stringEntry.position }).from(stringEntry).where(eq(stringEntry.projectId, projectId)),
    );
    if (existing.length >= MAX_STRINGS) throw new Error(`A project can hold up to ${MAX_STRINGS.toLocaleString("en")} strings.`);
    let key = input.key?.trim() ?? "";
    if (key) await assertKeyFree(projectId, key);
    else {
      const taken = new Set(existing.map((row) => row.key));
      const stem = category.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "string";
      for (let n = 1; !key || taken.has(key); n++) key = `${stem}.string_${n}`;
    }
    const last = existing.map((row) => row.position).sort().at(-1) ?? null;
    const [row] = await userDb((tx) =>
      tx
        .insert(stringEntry)
        .values({
          projectId,
          key,
          category,
          text: (input.text ?? "").slice(0, MAX_STRING_TEXT),
          charLimit: cleanLimit(input.charLimit),
          position: generateKeyBetween(last, null),
        })
        .returning(columns),
    );
    return row;
  });
}

export async function updateString(
  projectId: string,
  id: string,
  patch: {
    key?: string;
    category?: string;
    text?: string;
    charLimit?: number | null;
    context?: string | null;
    nodeId?: string | null;
    position?: string;
  },
): Promise<StringRow> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    const values: Partial<typeof stringEntry.$inferInsert> = {};
    if (patch.key !== undefined) {
      const key = patch.key.trim();
      await assertKeyFree(projectId, key, id);
      values.key = key;
    }
    if (patch.category !== undefined) values.category = cleanCategory(patch.category);
    if (patch.text !== undefined) values.text = patch.text.slice(0, MAX_STRING_TEXT);
    if (patch.charLimit !== undefined) values.charLimit = cleanLimit(patch.charLimit);
    if (patch.context !== undefined) values.context = patch.context?.trim().slice(0, MAX_STRING_CONTEXT) || null;
    if (patch.nodeId !== undefined) {
      if (patch.nodeId) await requireNodeAccess(projectId, patch.nodeId);
      values.nodeId = patch.nodeId || null;
    }
    if (patch.position !== undefined && patch.position && patch.position.length <= 256) values.position = patch.position;
    const [row] = await userDb((tx) =>
      Object.keys(values).length
        ? tx
            .update(stringEntry)
            .set(values)
            .where(and(eq(stringEntry.id, id), eq(stringEntry.projectId, projectId)))
            .returning(columns)
        : tx
            .select(columns)
            .from(stringEntry)
            .where(and(eq(stringEntry.id, id), eq(stringEntry.projectId, projectId))),
    );
    if (!row) throw new Error("That string no longer exists.");
    return row;
  });
}

export async function deleteString(projectId: string, id: string): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    await userDb((tx) => tx.delete(stringEntry).where(and(eq(stringEntry.id, id), eq(stringEntry.projectId, projectId))));
  });
}

/**
 * Every string in the project with its String ID: the short-text fields, then
 * each dialogue's lines and choices in reading order. For the CSV export and
 * for localization. Dialogues the user can't see, and ones in the trash, are
 * left out; a dialogue's lines are as of its last sync, a few seconds behind
 * anyone typing in it.
 */
export async function getProjectStrings(projectId: string): Promise<ProjectString[]> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    const nodes = await listNodes(projectId);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const trashed = (id: string) => {
      for (let n = byId.get(id); n; n = n.parentId ? byId.get(n.parentId) : undefined) if (n.deletedAt) return true;
      return false;
    };
    const dialogues = nodes
      .filter((n) => n.kind === "dialogue" && !trashed(n.id))
      .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : a.title.localeCompare(b.title)));
    const [rows, docs] = await userDb((tx) =>
      Promise.all([
        tx.select(columns).from(stringEntry).where(eq(stringEntry.projectId, projectId)),
        dialogues.length
          ? tx
              .select({ id: node.id, ydoc: node.ydoc })
              .from(node)
              .where(and(eq(node.projectId, projectId), inArray(node.id, dialogues.map((d) => d.id))))
          : Promise.resolve([]),
      ]),
    );

    const strings: ProjectString[] = rows.sort(byPosition).map((row) => ({
      key: row.key,
      text: row.text,
      speaker: "",
      source: "string",
      nodeId: row.nodeId && byId.has(row.nodeId) ? row.nodeId : null,
      charLimit: row.charLimit,
      context: row.context ?? "",
    }));

    const snapshots = new Map(docs.map((d) => [d.id, d.ydoc]));
    // Only speakers the user can see are named.
    const speakerName = (id: string) => byId.get(id)?.title;
    for (const dialogue of dialogues) {
      const snapshot = snapshots.get(dialogue.id);
      if (!snapshot?.length) continue;
      let lines;
      try {
        lines = graphStrings(dialogueGraphFromUpdate(snapshot), speakerName);
      } catch {
        // An unreadable snapshot shouldn't take the whole table down.
        continue;
      }
      for (const line of lines) {
        strings.push({
          key: line.id,
          text: line.text,
          speaker: line.speaker,
          source: "dialogue",
          nodeId: dialogue.id,
          charLimit: null,
          context: [dialogue.title, line.kind === "choice" ? "Choice" : "", line.context].filter(Boolean).join(" · "),
        });
      }
    }
    return strings;
  });
}

// ---- Importing a dialogue from Ink, Yarn Spinner or Twine (lib/interactive/import.ts) ----------

/** Parsing a story is real work, so imports are limited per person. */
const IMPORT_LIMIT = { limit: 30, windowSeconds: 600 };
const MAX_TITLE = 200;

export type DialogueImport = { graph: DialogueGraph; counter: number; warnings: ImportWarning[] };

/**
 * String IDs the project already uses: its short-text fields' keys and every
 * other dialogue's lines (as last synced), so an imported file's own ids don't
 * take one. `except`: the dialogue being replaced, whose ids are free to reuse.
 */
async function takenStringIds(projectId: string, except: string | null): Promise<Set<string>> {
  const [keys, dialogues] = await userDb((tx) =>
    Promise.all([
      tx.select({ key: stringEntry.key }).from(stringEntry).where(eq(stringEntry.projectId, projectId)),
      tx
        .select({ id: node.id, ydoc: node.ydoc })
        .from(node)
        .where(and(eq(node.projectId, projectId), eq(node.kind, "dialogue"), ...(except ? [ne(node.id, except)] : []))),
    ]),
  );
  const taken = new Set(keys.map((row) => row.key));
  for (const dialogue of dialogues) {
    if (!dialogue.ydoc?.length) continue;
    try {
      for (const n of Object.values(dialogueGraphFromUpdate(dialogue.ydoc).nodes)) if (n.sid) taken.add(n.sid);
    } catch {
      // An unreadable snapshot has no ids to protect.
    }
  }
  return taken;
}

/**
 * Reads the file, then links its speakers to the project's character notes
 * (by title or alias, when exactly one matches). Only notes the user can see,
 * and none in the trash, are candidates.
 */
async function readImport(projectId: string, fileName: string, source: string, prefix: string, taken: Set<string>, counter = 0): Promise<ImportResult> {
  if (typeof source !== "string" || !source.trim()) throw new Error("That file is empty.");
  if (source.length > MAX_IMPORT_SOURCE) throw new Error("That file is too large to import. Split it into several files.");
  const format = detectImportFormat(fileName, source);
  if (!format) throw new Error("Plotra can import Ink (.ink), Yarn Spinner (.yarn) and Twine (.twee, .tw, or a Twine 2 .html) files.");
  const result = importDialogue(source, format, { prefix, taken, counter });
  const nodes = await listNodes(projectId);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const trashed = (id: string) => {
    for (let n = byId.get(id); n; n = n.parentId ? byId.get(n.parentId) : undefined) if (n.deletedAt) return true;
    return false;
  };
  const characters = nodes.filter((n) => n.kind === "character" && !trashed(n.id)).map((n) => ({ id: n.id, title: n.title, aliases: n.aliases }));
  return { ...result, warnings: [...result.warnings, ...linkSpeakers(result.graph, characters)] };
}

const cleanFileName = (fileName: unknown) => String(fileName ?? "").split(/[/\\]/).at(-1)!.slice(0, 200);

/**
 * Imports an Ink, Yarn Spinner or Twine file as a new dialogue under
 * `parentId`, readable at once (its Yjs state and index are written here, not
 * on first open). Marked `settings.imported`: text from outside, to the agent
 * (lib/agent/untrusted.ts). What couldn't be imported comes back as warnings.
 */
export async function importDialogueFile(
  projectId: string,
  input: { parentId: string | null; position: string; fileName: string; source: string },
): Promise<{ nodes: BinderNode[]; warnings: ImportWarning[] }> {
  return transaction(async () => {
    const { user } = await requireSession();
    if (!input.position || typeof input.position !== "string" || input.position.length > 256) throw new Error("Invalid position.");
    const { project: found } = input.parentId ? await requireNodeAccess(projectId, input.parentId, "edit") : await requireProjectAccess(projectId, "edit");
    if (input.parentId) {
      const [parent] = await userDb((tx) => tx.select({ deletedAt: node.deletedAt }).from(node).where(eq(node.id, input.parentId!)));
      if (parent?.deletedAt) throw new Error("That folder is in the trash.");
    }
    await rateLimit("dialogue-import", user.id, IMPORT_LIMIT);
    const fileName = cleanFileName(input.fileName);
    const id = crypto.randomUUID();
    const result = await readImport(projectId, fileName, input.source, stringIdPrefix(id), await takenStringIds(projectId, null));

    const doc = new Y.Doc();
    const maps = dialogueMaps(doc);
    doc.transact(() => {
      for (const [key, value] of Object.entries(result.graph.nodes)) maps.nodes.set(key, value);
      for (const [key, value] of Object.entries(result.graph.edges)) maps.edges.set(key, value);
      for (const [key, value] of Object.entries(result.graph.variables)) maps.variables.set(key, value);
      maps.meta.set("counter", result.counter);
    });
    const ydoc = Y.encodeStateAsUpdate(doc);
    const index = indexDialogue(doc);
    doc.destroy();

    const title = (result.title ?? fileName.replace(/\.[a-z0-9]+$/i, "")).replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) || "Imported dialogue";
    const inserted = await userDb(async (tx) => {
      const rows = await tx
        .insert(node)
        .values({
          id,
          projectId,
          parentId: input.parentId,
          kind: "dialogue",
          title,
          position: input.position,
          createdById: user.id,
          settings: { imported: true },
          ydoc,
          text: index.text,
          wordCount: index.words,
          headings: index.headings,
          contentTags: index.tags,
        })
        .returning(binderColumns);
      await tx.update(project).set({ updatedAt: new Date() }).where(eq(project.id, projectId));
      return rows;
    });
    await logActivity(projectId, "note_created", { nodeId: id, payload: { title } });
    // Which format and how much; never a title or a word of it.
    await track("imported", {
      userId: user.id,
      workspaceId: found.organizationId,
      projectId,
      properties: { format: `dialogue-${result.format}`, files: 1, notes: 1, cards: Object.keys(result.graph.nodes).length, warnings: result.warnings.length },
    });
    return { nodes: await withActions(projectId, inserted, true), warnings: result.warnings };
  });
}

/**
 * Reads an Ink, Yarn Spinner or Twine file for replacing an open dialogue's
 * content. The editor puts the cards in its live doc (after asking), so
 * everyone who has it open sees them at once; here the file is read, the
 * dialogue's access and editorial lock checked, and the dialogue marked as
 * holding imported text. `counter`: the highest string number the open
 * dialogue has handed out, so new ids don't reuse one.
 */
export async function importDialogueInto(projectId: string, nodeId: string, input: { fileName: string; source: string; counter?: number }): Promise<DialogueImport> {
  return transaction(async () => {
    const { user } = await requireSession();
    await requireNodeAccess(projectId, nodeId, "edit");
    const [row] = await userDb((tx) =>
      tx
        .select({ kind: node.kind, deletedAt: node.deletedAt, settings: node.settings })
        .from(node)
        .where(and(eq(node.id, nodeId), eq(node.projectId, projectId))),
    );
    if (!row || row.kind !== "dialogue") throw new Error("Only a dialogue can take an imported dialogue.");
    if (row.deletedAt) throw new Error("That dialogue is in the trash.");
    await assertUnlocked(projectId, nodeId);
    await rateLimit("dialogue-import", user.id, IMPORT_LIMIT);
    const counter = Number.isInteger(input.counter) && input.counter! >= 0 ? Math.min(input.counter!, 10_000_000) : 0;
    const result = await readImport(projectId, cleanFileName(input.fileName), input.source, stringIdPrefix(nodeId), await takenStringIds(projectId, nodeId), counter);
    if (row.settings?.imported !== true) {
      await userDb((tx) =>
        tx
          .update(node)
          .set({ settings: { ...row.settings, imported: true } })
          .where(eq(node.id, nodeId)),
      );
    }
    return { graph: result.graph, counter: result.counter, warnings: result.warnings };
  });
}
