import "./env";
import { mock } from "bun:test";
import { schema } from "@plotra/db";
import type { NodeProperties } from "@plotra/db/schema";
import { Column, getTableColumns, is, Param, SQL, StringChunk, type Table } from "drizzle-orm";
import { notFound } from "next/navigation";
import * as Y from "yjs";
import * as realAccess from "@/lib/access";
import * as realChanges from "@/lib/agent/changes";
import * as realDocuments from "@/lib/agent/documents";
import { ensureBlockIds } from "@/lib/agent/edits";
import * as realSearch from "@/lib/agent/search";
import * as realTasks from "@/lib/agent/tasks";
import { HIT_END, HIT_START } from "@/lib/agent/types";
import * as realWrite from "@/lib/agent/write";
import * as realBinder from "@/lib/binder";
import * as realBinderActions from "@/lib/binder-actions";
import { valueToYdoc, ydocToValue } from "@/lib/collab/ydoc";
import * as realDb from "@/lib/db";
import * as realKnowledge from "@/lib/knowledge-actions";
import { isDocumentKind } from "@/lib/story";
import * as realStory from "@/lib/story-actions";
import { indexNodes, isTrashed } from "@/lib/tree";
import * as realWorkflow from "@/lib/workflow-actions";
import { defaultChannels } from "@/lib/world";
import * as realWorld from "@/lib/world-actions";
import { without, type EvalProject, type StoredNode } from "./project";

// The seam between the agent and the database, for the evals.
//
// The agent's tools (lib/agent/tools) are thin wrappers around the app's own
// server functions, and those need a signed-in user and Postgres. Here the
// server functions the tools call are replaced by ones that read and write an
// in-memory project (./project.ts). Everything above that line is the real
// code and runs unchanged: the tools with their names, descriptions and input
// schemas, how they render notes and wrap untrusted text, the spoiler horizon,
// the continuity checks, the block edits and suggestion marks, the approval
// rules, the system prompt and the run loop.
//
// Each stub is typed as the function it replaces, so a signature that changes
// in lib/ fails the typecheck here instead of drifting quietly. What is NOT
// exercised is everything below the line: sessions, `can()`, row-level
// security, quotas, editorial locks, the collab worker and Postgres full-text
// search. evals/README.md says what that means for the results.

let current: EvalProject | null = null;

/** Points the stubs at a project. One task runs at a time. */
export function setProject(project: EvalProject | null): void {
  current = project;
}

function project(projectId?: string): EvalProject {
  if (!current) throw new Error("No eval project is in use: call setProject() first.");
  // A tool given another project's id finds nothing, as it would under row-level security.
  if (projectId !== undefined && projectId !== current.projectId) notFound();
  return current;
}

const binderNode = (node: StoredNode): realBinder.BinderNode => ({ ...without(node, "projectId", "text", "content"), actions: [...node.actions] });

function requireNode(p: EvalProject, nodeId: string): StoredNode {
  const found = p.find(nodeId);
  if (!found) notFound();
  return found;
}

const access = (p: EvalProject) => ({
  project: { id: p.projectId, organizationId: p.workspaceId, title: p.title, type: p.type, settings: {} },
  actions: new Set(realAccess.actions),
});

// ---- lib/db: the few queries tools make themselves ----------------------------------------------
//
// A tiny stand-in for a transaction: `select(fields).from(table).where(…)`
// over the project's rows, understanding only `eq`, `and` and `inArray`.
// Anything else throws, so a new kind of query in a tool is noticed.

type Row = Record<string, unknown>;

function tableRows(p: EvalProject, table: Table): Row[] {
  const { release, member, projectMember, user, node, agentChange, comment } = schema;
  if (table === release) return p.releases.map((r) => ({ ...r, projectId: p.projectId }));
  // The writer and the other editor are members of the workspace; the guest is not.
  if (table === member) return [p.writer, p.editor].map((person) => ({ userId: person.id, organizationId: p.workspaceId, role: "member" }));
  if (table === projectMember) return [{ userId: p.guest.id, projectId: p.projectId, role: "commenter" }];
  if (table === user) return [p.writer, p.editor, p.guest];
  if (table === node) return p.nodes;
  if (table === agentChange) return p.changes;
  if (table === comment) return p.comments.flatMap((thread) => thread.comments.map((c) => ({ ...c, threadId: thread.id })));
  throw new Error("The eval project doesn't hold that table: add it to evals/harness/stubs.ts.");
}

/** The property a column is stored under in our rows: its key in the table definition. */
function keyOf(column: Column): string {
  const found = Object.entries(getTableColumns(column.table)).find(([, c]) => c === column);
  if (!found) throw new Error("Unknown column in an eval query.");
  return found[0];
}

type Token = string | Column | Param | Token[];

function tokens(sql: SQL): Token[] {
  const out: Token[] = [];
  for (const chunk of sql.queryChunks as unknown[]) {
    if (is(chunk, SQL)) out.push(...tokens(chunk));
    else if (is(chunk, StringChunk)) out.push(...chunk.value);
    else if (is(chunk, Column) || is(chunk, Param)) out.push(chunk);
    else if (Array.isArray(chunk)) out.push(chunk.map((item) => item as Token));
    else if (chunk !== undefined) throw new Error("The eval project can't read this query: add it to evals/harness/stubs.ts.");
  }
  return out.filter((token) => token !== "" && token !== "(" && token !== ")");
}

function predicate(where: SQL | undefined): (row: Row) => boolean {
  if (!where) return () => true;
  const clauses: Array<(row: Row) => boolean> = [];
  const list = tokens(where);
  for (let i = 0; i < list.length; i += 4) {
    const [column, operator, value, joiner] = list.slice(i, i + 4);
    if (!is(column, Column) || (joiner !== undefined && joiner !== " and ")) throw new Error("The eval project can't read this query: add it to evals/harness/stubs.ts.");
    const key = keyOf(column);
    if (operator === " = " && is(value, Param)) clauses.push((row) => row[key] === value.value);
    else if (operator === " in " && Array.isArray(value)) {
      const wanted = new Set(value.map((item) => (is(item, Param) ? item.value : item)));
      clauses.push((row) => wanted.has(row[key]));
    } else throw new Error("The eval project can't read this query: add it to evals/harness/stubs.ts.");
  }
  return (row) => clauses.every((clause) => clause(row));
}

function fakeTx(p: EvalProject) {
  return {
    select(fields: Record<string, Column>) {
      let rows: Row[] = [];
      const pick = (row: Row) => Object.fromEntries(Object.entries(fields).map(([name, column]) => [name, row[keyOf(column)] ?? null]));
      const query = {
        from(table: Table) {
          rows = tableRows(p, table);
          return query;
        },
        where(condition: SQL | undefined) {
          rows = rows.filter(predicate(condition));
          return query;
        },
        orderBy: () => query,
        limit(count: number) {
          rows = rows.slice(0, count);
          return query;
        },
        then<T>(resolve: (value: Row[]) => T, reject?: (reason: unknown) => T) {
          return Promise.resolve(rows.map(pick)).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

const userDb = (async (fn: (tx: realDb.Tx) => Promise<unknown>) => fn(fakeTx(project()) as unknown as realDb.Tx)) as typeof realDb.userDb;

// ---- lib/access, lib/binder -----------------------------------------------------------------------

const requireProjectAccess = (async (projectId: string) => access(project(projectId))) as unknown as typeof realAccess.requireProjectAccess;

const requireNodeAccess = (async (projectId: string, nodeId: string) => {
  const p = project(projectId);
  requireNode(p, nodeId);
  return { project: access(p).project, access: { actions: access(p).actions } };
}) as unknown as typeof realAccess.requireNodeAccess;

const loadNodeAccess: typeof realAccess.loadNodeAccess = async (projectId) => {
  const p = project(projectId);
  return new Map(p.nodes.map((n) => [n.id, { actions: access(p).actions }]));
};

const listNodes = (async (projectId: string) => project(projectId).nodes.map(binderNode)) as typeof realBinder.listNodes;

// ---- Reads ------------------------------------------------------------------------------------------

const getWorld: typeof realWorld.getWorld = async (projectId) => {
  const p = project(projectId);
  const byPosition = <T extends { position: string }>(rows: T[]) => [...rows].sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
  return { entityTypes: byPosition(p.entityTypes), releases: byPosition(p.releases), facts: p.facts, knowledge: p.knowledge, setups: p.setups, channels: defaultChannels };
};

const getStory: typeof realStory.getStory = async (projectId) => {
  const p = project(projectId);
  return { threads: p.threads, cells: p.cells, relationships: p.relationships, calendars: p.calendars };
};

const getTimelineEvents: typeof realStory.getTimelineEvents = async (projectId, timelineId) =>
  project(projectId)
    .events.filter((event) => event.timelineNodeId === timelineId)
    .map((event) => without(event, "timelineNodeId"))
    .sort((a, b) => a.start - b.start);

const listPropertyDefs: typeof realKnowledge.listPropertyDefs = async (projectId) => project(projectId).propertyDefs;

const getNodeLinks = (async (projectId: string, nodeId: string) => {
  const p = project(projectId);
  requireNode(p, nodeId);
  const live = new Set(p.nodes.filter((n) => !n.deletedAt).map((n) => n.id));
  return {
    backlinks: p.links
      .filter((l) => l.targetNodeId === nodeId && l.sourceNodeId !== nodeId && live.has(l.sourceNodeId))
      .sort((a, b) => p.titleOf(a.sourceNodeId).localeCompare(p.titleOf(b.sourceNodeId)) || a.ordinal - b.ordinal)
      .map((l) => ({ sourceNodeId: l.sourceNodeId, kind: l.kind, context: l.context, targetHeading: l.targetHeading })),
    outgoing: p.links.filter((l) => l.sourceNodeId === nodeId).map((l) => ({ targetNodeId: l.targetNodeId, kind: l.kind, targetHeading: l.targetHeading })),
  };
}) as typeof realKnowledge.getNodeLinks;

const getProjectLinks = (async (projectId: string) => project(projectId).links.map((l) => ({ source: l.sourceNodeId, target: l.targetNodeId, kind: l.kind }))) as typeof realKnowledge.getProjectLinks;

const listComments: typeof realWorkflow.listComments = async (projectId, nodeId) =>
  project(projectId)
    .comments.filter((thread) => thread.nodeId === nodeId)
    .map((thread) => without(thread, "nodeId"));

const loadDocument: typeof realDocuments.loadDocument = async (projectId, nodeId) => {
  const shared = current?.sharedWorld;
  if (shared && projectId === shared.world.projectId) return shared.pages.get(nodeId) ?? notFound();
  return requireNode(project(projectId), nodeId).content ?? [];
};

const getSharedWorld: typeof realWorld.getSharedWorld = async (projectId) => project(projectId).sharedWorld?.world ?? null;

// Postgres full-text search, roughly: every word has to be in the note (a
// crude stem stands in for the English dictionary), "quoted phrases" stay
// together, `-word` excludes, `or` splits alternatives; titles and aliases
// also match as plain text. Good enough to find a name or a distinctive word,
// which is what the tool's description tells the model to search for.
const stem = (word: string) => word.toLowerCase().replace(/(?:'s|ies|ing|ed|es|s)$/, "");
const wordsOf = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

const searchNodes: typeof realSearch.searchNodes = async (projectId, rawQuery, limit = 20) => {
  const p = project(projectId);
  const query = rawQuery.trim().slice(0, 200);
  if (!query) return [];
  const alternatives = query.split(/\s+or\s+/i).map((part) => {
    const phrases = [...part.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase());
    const rest = part.replace(/"[^"]*"/g, " ").split(/\s+/).filter(Boolean);
    return { phrases, need: rest.filter((w) => !w.startsWith("-")).flatMap(wordsOf).map(stem).filter(Boolean), not: rest.filter((w) => w.startsWith("-")).flatMap(wordsOf).map(stem) };
  });
  const index = indexNodes(p.nodes.map(binderNode));
  const hits = p.nodes.flatMap((n) => {
    if (isTrashed(index, n.id)) return [];
    const body = n.text || n.synopsis || "";
    const haystack = `${n.title}\n${n.synopsis ?? ""}\n${n.text}`;
    const stems = wordsOf(haystack).map(stem);
    const counts = new Map<string, number>();
    for (const s of stems) counts.set(s, (counts.get(s) ?? 0) + 1);
    const matched = alternatives.find(
      (alt) => (alt.need.length || alt.phrases.length) && alt.need.every((w) => counts.has(w)) && alt.phrases.every((phrase) => haystack.toLowerCase().includes(phrase)) && !alt.not.some((w) => counts.has(w)),
    );
    const named = [n.title, ...n.aliases].some((name) => name.toLowerCase().includes(query.toLowerCase()));
    if (!matched && !named) return [];
    const wanted = new Set(matched?.need ?? []);
    const words = body.replace(/\s+/g, " ").trim().split(" ");
    const first = Math.max(0, words.findIndex((w) => wanted.has(stem(w.replace(/[^\p{L}\p{N}']/gu, "")))));
    const snippet = words
      .slice(Math.max(0, first - 8), first + 18)
      .map((w) => (wanted.has(stem(w.replace(/[^\p{L}\p{N}']/gu, ""))) ? `${HIT_START}${w}${HIT_END}` : w))
      .join(" ");
    const rank = matched ? matched.need.reduce((sum, w) => sum + (counts.get(w) ?? 0), 0) / Math.sqrt(stems.length + 1) + (named ? 1 : 0) : 0;
    return [{ id: n.id, title: n.title, kind: n.kind, snippet, rank }];
  });
  return hits.sort((a, b) => b.rank - a.rank).slice(0, Math.min(Math.max(1, Math.floor(limit)), 50));
};

// ---- Writes -----------------------------------------------------------------------------------------

/** What `requireWritable` checks (lib/agent/write.ts), less locks and permissions. */
function writable(p: EvalProject, nodeId: string): StoredNode {
  const found = p.find(nodeId);
  if (!found) throw new Error("That note no longer exists.");
  if (found.deletedAt) throw new Error("That note is in the trash.");
  return found;
}

/**
 * `editDocument` without the collab worker: the note's document becomes a
 * Y.Doc, the real edit code (lib/agent/edits.ts) changes it, and the result is
 * stored and indexed the way a content sync would. The first change a run
 * makes to a note records the checkpoint row, as the real one does.
 */
const editDocument: typeof realWrite.editDocument = async (context, nodeId, change) => {
  const p = project(context.projectId);
  const found = writable(p, nodeId);
  if (!isDocumentKind(found.kind)) throw new Error("That is a board, not a text document: its text can't be edited this way.");
  const doc = new Y.Doc();
  Y.applyUpdate(doc, valueToYdoc(found.content ?? []));
  ensureBlockIds(doc);
  const before = JSON.stringify(ydocToValue(Y.encodeStateAsUpdate(doc)));
  const result = change(doc, { defaultType: "p" });
  const value = ydocToValue(Y.encodeStateAsUpdate(doc));
  doc.destroy();
  if (JSON.stringify(value) !== before) {
    if (!p.changes.some((c) => c.runId === context.runId && c.nodeId === nodeId && c.action === "content")) {
      p.changes.push({ id: p.newId(), runId: context.runId, action: "content", nodeId, before: null, beforeVersionId: p.newId(), summary: `Edited the text of ${found.title}` });
    }
    p.setContent(nodeId, value);
  }
  return { ...result, value };
};

const editBoard = (async (context: realWrite.WriteContext, nodeId: string, change: (doc: Y.Doc) => unknown) => {
  const p = project(context.projectId);
  const found = writable(p, nodeId);
  if (isDocumentKind(found.kind)) throw new Error("That note is a text document, not a board.");
  const doc = new Y.Doc();
  const saved = p.boards.get(nodeId);
  if (saved) Y.applyUpdate(doc, saved);
  const result = change(doc);
  p.boards.set(nodeId, Y.encodeStateAsUpdate(doc));
  doc.destroy();
  return result;
}) as typeof realWrite.editBoard;

const recordChange: typeof realChanges.recordChange = async (context, change) => {
  const p = project(context.projectId);
  p.changes.push({ id: p.newId(), runId: context.runId, action: change.action, nodeId: change.nodeId ?? null, before: change.before ?? null, beforeVersionId: change.beforeVersionId ?? null, summary: change.summary.slice(0, 300) });
};

const listChanges: typeof realChanges.listChanges = async (runId) => project().changes.filter((c) => c.runId === runId);

const notesTouched: typeof realChanges.notesTouched = async (runId) => new Set(project().changes.filter((c) => c.runId === runId && c.nodeId).map((c) => c.nodeId)).size;

const createNode: typeof realBinderActions.createNode = async (projectId, input) => {
  const p = project(projectId);
  if (input.parentId) writable(p, input.parentId);
  return binderNode(p.addNote({ parentId: input.parentId, kind: input.kind, title: input.title.trim().slice(0, 200) || "Untitled", position: input.position, entityTypeId: input.kind === "entity" ? (input.entityTypeId ?? null) : null }));
};

const updateNode: typeof realBinderActions.updateNode = async (projectId, nodeId, patch) => {
  const found = writable(project(projectId), nodeId);
  if (patch.title !== undefined) found.title = patch.title.trim().slice(0, 200) || found.title;
  if (patch.synopsis !== undefined) found.synopsis = patch.synopsis;
  if (patch.status !== undefined) found.status = patch.status;
  if (patch.tags !== undefined) found.tags = patch.tags;
  if (patch.aliases !== undefined) found.aliases = patch.aliases;
  found.updatedAt = new Date();
  return binderNode(found);
};

const setNodeProperties: typeof realBinderActions.setNodeProperties = async (projectId, nodeId, patch) => {
  const p = project(projectId);
  const found = writable(p, nodeId);
  // The keys a note may have come from its kind's template, or from its type's schema: the real action refuses any other.
  const type = found.kind === "entity" ? p.entityTypes.find((t) => t.id === found.entityTypeId) : undefined;
  const allowed = new Set((type ? type.schema : p.propertyDefs.filter((def) => def.nodeKind === found.kind)).map((field) => field.key));
  const next: NodeProperties = { ...found.properties };
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) throw new Error(`“${key}” isn't a property of this kind of note.`);
    if (value === null || value === "") delete next[key];
    else next[key] = value as NodeProperties[string];
  }
  p.setProperties(nodeId, next);
  return binderNode(found);
};

const moveNode: typeof realBinderActions.moveNode = async (projectId, nodeId, to) => {
  const found = writable(project(projectId), nodeId);
  found.parentId = to.parentId;
  found.position = to.position;
  return binderNode(found);
};

const trashNode: typeof realBinderActions.trashNode = async (projectId, nodeId) => {
  const found = writable(project(projectId), nodeId);
  found.deletedAt = new Date();
  return binderNode(found);
};

const setNodeCanon: typeof realWorld.setNodeCanon = async (projectId, nodeId, input) => {
  const found = writable(project(projectId), nodeId);
  if (input.canon === "retconned" && !input.reason?.trim()) throw new Error("A retcon needs a reason: what changed and why.");
  found.canon = input.canon;
  return binderNode(found);
};

const createKnowledge: typeof realWorld.createKnowledge = async (projectId, input) => {
  const p = project(projectId);
  const row = { id: p.newId(), characterNodeId: input.characterNodeId, factNodeId: input.factNodeId, factBlockId: input.factBlockId ?? null, learnedInNodeId: input.learnedInNodeId ?? null, layer: input.layer ?? ("truth" as const), note: input.note ?? null };
  p.knowledge.push(row);
  return row;
};

const createSetup: typeof realWorld.createSetup = async (projectId, input = {}) => {
  const p = project(projectId);
  const row = {
    id: p.newId(),
    kind: input.kind ?? ("foreshadowing" as const),
    title: input.title?.trim() || "Setup",
    setupNodeId: input.setupNodeId ?? null,
    setupBlockId: input.setupBlockId ?? null,
    payoffNodeId: input.payoffNodeId ?? null,
    payoffBlockId: input.payoffBlockId ?? null,
    status: input.status ?? ("open" as const),
    note: input.note ?? null,
  };
  p.setups.push(row);
  return row;
};

const createThread: typeof realStory.createThread = async (projectId, input) => {
  const p = project(projectId);
  const row = { id: p.newId(), name: input.name?.trim() || `Thread ${p.threads.length + 1}`, color: input.color ?? "#868e96", position: `${p.threads.at(-1)?.position ?? "a"}V`, closedNodeId: null };
  p.threads.push(row);
  return row;
};

const setSceneThread: typeof realStory.setSceneThread = async (projectId, nodeId, threadId, note) => {
  const p = project(projectId);
  p.cells = p.cells.filter((cell) => !(cell.nodeId === nodeId && cell.threadId === threadId));
  if (note !== null) p.cells.push({ nodeId, threadId, note });
};

const createRelationship: typeof realStory.createRelationship = async (projectId, input) => {
  const p = project(projectId);
  if (input.fromNodeId === input.toNodeId) throw new Error("A character can't have a relationship with themselves here.");
  const row = { id: p.newId(), fromNodeId: input.fromNodeId, toNodeId: input.toNodeId, type: input.type, label: input.label ?? null, directed: input.directed ?? false };
  p.relationships.push(row);
  return row;
};

const updateRelationship: typeof realStory.updateRelationship = async (projectId, id, patch) => {
  const row = project(projectId).relationships.find((r) => r.id === id);
  if (!row) throw new Error("That relationship no longer exists.");
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.label !== undefined) row.label = patch.label;
  if (patch.directed !== undefined) row.directed = patch.directed;
  return row;
};

const deleteRelationship: typeof realStory.deleteRelationship = async (projectId, id) => {
  const p = project(projectId);
  p.relationships = p.relationships.filter((r) => r.id !== id);
};

const createTimelineEvent: typeof realStory.createTimelineEvent = async (projectId, timelineId, input) => {
  const p = project(projectId);
  const row = { id: p.newId(), timelineNodeId: timelineId, nodeId: input.nodeId ?? null, title: input.title?.trim() || "Event", description: input.description ?? null, start: input.start, end: input.end ?? null, lane: input.lane ?? null, color: input.color ?? null };
  p.events.push(row);
  return without(row, "timelineNodeId");
};

const updateTimelineEvent: typeof realStory.updateTimelineEvent = async (projectId, timelineId, id, patch) => {
  const row = project(projectId).events.find((event) => event.id === id && event.timelineNodeId === timelineId);
  if (!row) throw new Error("That event no longer exists.");
  Object.assign(row, Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)));
  return without(row, "timelineNodeId");
};

const deleteTimelineEvent: typeof realStory.deleteTimelineEvent = async (projectId, timelineId, id) => {
  const p = project(projectId);
  p.events = p.events.filter((event) => !(event.id === id && event.timelineNodeId === timelineId));
};

/** Comments are stored under the person who ran the agent, as in the app. */
const createCommentThread: typeof realWorkflow.createCommentThread = async (projectId, nodeId, input) => {
  const p = project(projectId);
  writable(p, nodeId);
  return { id: p.comment(nodeId, p.writer, input.body, input.quote ?? null).id };
};

const createTask: typeof realTasks.createTask = async (input) => {
  const p = project(input.projectId);
  const task = {
    id: p.newId(),
    title: input.title.trim().slice(0, 160) || "Job",
    mode: input.mode === "ask" ? ("suggest" as const) : input.mode,
    status: "pending" as const,
    steps: input.steps.slice(0, realTasks.MAX_STEPS).map((step) => ({ id: p.newId(), title: step.title.trim().slice(0, 160) || "Step", prompt: step.prompt.trim().slice(0, 4000), status: "pending" as const })),
    updatedAt: new Date(),
  };
  p.tasks.push(task);
  return task;
};

// ---- Putting them in place ----------------------------------------------------------------------------

// Bun replaces a module for everything that imports it, including the modules
// already loaded above: the tools pick these up through their own imports.
mock.module("@/lib/db", () => ({ ...realDb, userDb }));
mock.module("@/lib/access", () => ({ ...realAccess, requireProjectAccess, requireNodeAccess, loadNodeAccess, getNodeAccess: loadNodeAccess }));
mock.module("@/lib/binder", () => ({ ...realBinder, listNodes }));
mock.module("@/lib/world-actions", () => ({ ...realWorld, getWorld, getSharedWorld, setNodeCanon, createKnowledge, createSetup }));
mock.module("@/lib/story-actions", () => ({
  ...realStory,
  getStory,
  getTimelineEvents,
  createThread,
  setSceneThread,
  createRelationship,
  updateRelationship,
  deleteRelationship,
  createTimelineEvent,
  updateTimelineEvent,
  deleteTimelineEvent,
}));
mock.module("@/lib/knowledge-actions", () => ({ ...realKnowledge, listPropertyDefs, getNodeLinks, getProjectLinks }));
mock.module("@/lib/workflow-actions", () => ({ ...realWorkflow, listComments, createCommentThread }));
mock.module("@/lib/binder-actions", () => ({ ...realBinderActions, createNode, updateNode, setNodeProperties, moveNode, trashNode }));
mock.module("@/lib/agent/search", () => ({ ...realSearch, searchNodes }));
mock.module("@/lib/agent/documents", () => ({ ...realDocuments, loadDocument }));
mock.module("@/lib/agent/write", () => ({ ...realWrite, editDocument, editBoard, showPresence: async () => {}, clearPresence: async () => {} }));
mock.module("@/lib/agent/changes", () => ({ ...realChanges, recordChange, listChanges, notesTouched }));
mock.module("@/lib/agent/tasks", () => ({ ...realTasks, createTask }));
