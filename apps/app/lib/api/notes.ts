import "server-only";
import { schema } from "@plotra/db";
import type { NodeKind, NodeStatus, ProjectSettings } from "@plotra/db/schema";
import { eq } from "drizzle-orm";
import * as Y from "yjs";
import { requireNodeAccess, requireProjectAccess } from "../access";
import { fetchRoomState, postRoomUpdate } from "../agent/collab-service";
import { loadDocument } from "../agent/documents";
import { applyEdits, blockIds, ensureBlockIds, replaceAll, restoreValue, textToBlocks, type EditOptions } from "../agent/edits";
import { searchNodes, plainSnippet } from "../agent/search";
import { listNodes } from "../binder";
import { trashNode, updateNode } from "../binder-actions";
import { roomName } from "../collab/rooms";
import { syncRoomState } from "../collab/sync";
import { ydocToValue } from "../collab/ydoc";
import { requireSession } from "../data";
import { userDb } from "../db";
import { indexDocument } from "../doc-index";
import { assertUnlocked } from "../editorial-guard";
import { createImported } from "../io/import";
import { markdownToValue, valueToMarkdown } from "../io/markdown";
import { nodeFormat } from "../modules";
import { assertStorage } from "../quotas";
import { readOnly, transaction } from "../request-cache";
import { isDocumentKind } from "../story";
import { indexNodes, isTrashed, type BinderNode } from "../tree";
import { insertVersion, makeRoom } from "../versions";
import { ApiError } from "./handler";
import { planUpdate } from "./note-update";

// What the API and the MCP server can do with a person's projects
// (beat-the-competitors.md step 9). Each function checks access the way the
// app does, as whoever the token belongs to; the routes in app/api/v1 and the
// tools in lib/api/mcp.ts only turn requests into calls and results into JSON.

const { node, organization, project } = schema;

export const MAX_MARKDOWN = 200_000;
// What can be made through the API: the kinds an import makes, which are text.
export const creatableKinds = ["folder", "chapter", "scene", "note", "character", "location"] as const;
export type CreatableKind = (typeof creatableKinds)[number];
export const createableKindsText = creatableKinds.join(", ");

export type ApiProject = { id: string; slug: string; title: string; type: string; workspaceId: string; workspaceName: string | null; workspaceSlug: string | null; updatedAt: Date };

export type ApiNote = {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
  synopsis: string | null;
  tags: string[];
  aliases: string[];
  status: string | null;
  wordCount: number;
  updatedAt: Date;
  canEdit: boolean;
};

const toNote = (n: BinderNode): ApiNote => ({
  id: n.id,
  parentId: n.parentId,
  kind: n.kind,
  title: n.title,
  synopsis: n.synopsis,
  tags: n.tags,
  aliases: n.aliases,
  status: n.status,
  wordCount: n.wordCount,
  updatedAt: n.updatedAt,
  canEdit: n.actions.includes("edit"),
});

/** Every project the person can open: their workspaces' and the ones shared with them. With its settings, for deciding which modules it has. */
export async function listApiProjects(options: { withSettings: true }): Promise<(ApiProject & { settings: ProjectSettings })[]>;
export async function listApiProjects(): Promise<ApiProject[]>;
export async function listApiProjects(options?: { withSettings: true }): Promise<ApiProject[]> {
  return readOnly(async () => {
    // Row-level security already limits this to what they can see.
    const rows = await userDb((tx) =>
      tx
        .select({
          id: project.id,
          slug: project.slug,
          title: project.title,
          type: project.type,
          workspaceId: project.organizationId,
          workspaceName: organization.name,
          workspaceSlug: organization.slug,
          updatedAt: project.updatedAt,
          settings: project.settings,
        })
        .from(project)
        .leftJoin(organization, eq(organization.id, project.organizationId))
        .orderBy(project.title),
    );
    return options?.withSettings
      ? rows
      : rows.map((p) => ({ id: p.id, slug: p.slug, title: p.title, type: p.type, workspaceId: p.workspaceId, workspaceName: p.workspaceName, workspaceSlug: p.workspaceSlug, updatedAt: p.updatedAt }));
  });
}

/** The project's notes in binder order, without the trash. */
export async function listApiNotes(projectId: string): Promise<ApiNote[]> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    const index = indexNodes(await listNodes(projectId));
    const out: ApiNote[] = [];
    const walk = (parentId: string | null) => {
      for (const child of index.children.get(parentId) ?? []) {
        if (child.deletedAt) continue;
        out.push(toNote(child));
        walk(child.id);
      }
    };
    walk(null);
    return out;
  });
}

/** One note with its text as Markdown. Boards (canvases, timelines, dialogues) have no text. */
export async function readApiNote(projectId: string, nodeId: string): Promise<ApiNote & { markdown: string | null }> {
  return readOnly(async () => {
    await requireNodeAccess(projectId, nodeId);
    const index = indexNodes(await listNodes(projectId));
    const found = index.byId.get(nodeId);
    if (!found || isTrashed(index, nodeId)) throw new ApiError(404, "Not found.");
    if (!isDocumentKind(found.kind)) return { ...toNote(found), markdown: null };
    const value = await loadDocument(projectId, nodeId);
    const titleOf = (id: string) => {
      const target = index.byId.get(id);
      return target && !isTrashed(index, id) ? target.title : undefined;
    };
    return { ...toNote(found), markdown: valueToMarkdown(value, { titleOf }) };
  });
}

export type ApiHit = { id: string; title: string; kind: NodeKind; snippet: string };

/** Full-text search, best first. Web-search syntax: "quoted phrases", or, -word. */
export async function searchApiNotes(projectId: string, query: string, limit = 20): Promise<ApiHit[]> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    const hits = await searchNodes(projectId, query, limit);
    return hits.map((h) => ({ id: h.id, title: h.title, kind: h.kind, snippet: plainSnippet(h.snippet) }));
  });
}

export type NewNote = { title: string; kind?: string; parentId?: string | null; markdown?: string; tags?: string[]; synopsis?: string };

/** Makes a note from Markdown, under `parentId` or at the end of the project. `[[Links]]` find notes by title. */
export async function createApiNote(projectId: string, input: NewNote): Promise<ApiNote> {
  const kind = (input.kind ?? "note") as CreatableKind;
  if (!creatableKinds.includes(kind)) throw new ApiError(400, `kind must be one of: ${creatableKinds.join(", ")}.`);
  if (typeof input.title !== "string" || !input.title.trim()) throw new ApiError(400, "Give the note a title.");
  const markdown = typeof input.markdown === "string" ? input.markdown : "";
  if (markdown.length > MAX_MARKDOWN) throw new ApiError(413, "That's too much text for one note.");
  const tags = Array.isArray(input.tags) ? input.tags.filter((t): t is string => typeof t === "string").slice(0, 50) : [];
  const [created] = await transaction(() =>
    createImported(projectId, input.parentId ?? null, [
      { parent: null, kind, title: input.title.trim().slice(0, 200), tags, value: markdown.trim() ? markdownToValue(markdown) : [], ...(typeof input.synopsis === "string" && input.synopsis.trim() && { synopsis: input.synopsis.trim().slice(0, 2000) }) },
    ]),
  );
  if (!created) throw new ApiError(500, "The note wasn't made.");
  return toNote(created);
}

export type NotePatch = { title?: string; synopsis?: string | null; tags?: string[]; aliases?: string[]; status?: string };

/** Changes what's known about a note: its title, synopsis, tags, aliases or status. */
export async function updateApiNote(projectId: string, nodeId: string, patch: NotePatch): Promise<ApiNote> {
  const clean: Parameters<typeof updateNode>[2] = {};
  if (patch.title !== undefined) {
    if (typeof patch.title !== "string" || !patch.title.trim()) throw new ApiError(400, "title must be text.");
    clean.title = patch.title;
  }
  if (patch.synopsis !== undefined) clean.synopsis = typeof patch.synopsis === "string" ? patch.synopsis : null;
  if (patch.tags !== undefined) clean.tags = Array.isArray(patch.tags) ? patch.tags.filter((t): t is string => typeof t === "string") : [];
  if (patch.aliases !== undefined) clean.aliases = Array.isArray(patch.aliases) ? patch.aliases.filter((t): t is string => typeof t === "string") : [];
  if (patch.status !== undefined) clean.status = String(patch.status) as NodeStatus;
  return toNote(await updateNode(projectId, nodeId, clean));
}

/** Moves a note to the trash, where it can be restored from in the app. */
export async function trashApiNote(projectId: string, nodeId: string): Promise<ApiNote> {
  return toNote(await trashNode(projectId, nodeId));
}

export type TextChange = { mode: "append" | "replace" | "update"; markdown: string; suggest?: boolean };

/**
 * Writes a note's text through the collab server, so anyone with it open sees
 * the change at once and nothing they're typing is lost. `append` adds to the
 * end; `replace` rewrites the whole note, keeping what was there as a version
 * first; `update` does the same but keeps every block whose Markdown is
 * unchanged as it was, comments and all (lib/api/note-update.ts). With
 * `suggest` the change arrives as tracked changes to accept or reject.
 */
export async function writeApiNoteText(projectId: string, nodeId: string, change: TextChange): Promise<{ markdown: string }> {
  if (change.mode !== "append" && change.mode !== "replace" && change.mode !== "update") throw new ApiError(400, 'mode must be "append", "replace" or "update".');
  if (change.mode === "update" && change.suggest) throw new ApiError(400, 'suggest works with "append" and "replace".');
  if (typeof change.markdown !== "string") throw new ApiError(400, "markdown must be text.");
  if (change.markdown.length > MAX_MARKDOWN) throw new ApiError(413, "That's too much text for one note.");
  const { user } = await requireSession();

  const { format, index } = await readOnly(async () => {
    await requireNodeAccess(projectId, nodeId, "edit");
    await assertUnlocked(projectId, nodeId);
    const index = indexNodes(await listNodes(projectId));
    const found = index.byId.get(nodeId);
    if (!found || isTrashed(index, nodeId)) throw new ApiError(404, "Not found.");
    if (!isDocumentKind(found.kind)) throw new ApiError(400, `That's a ${found.kind}, not a text document.`);
    const [row] = await userDb((tx) => tx.select({ settings: node.settings }).from(node).where(eq(node.id, nodeId)).limit(1));
    return { format: nodeFormat(row?.settings), index };
  });

  const byName = new Map<string, string>();
  for (const n of index.byId.values()) {
    if (isTrashed(index, n.id)) continue;
    for (const name of [n.title, ...n.aliases]) if (name.trim() && !byName.has(name.trim().toLowerCase())) byName.set(name.trim().toLowerCase(), n.id);
  }
  const options: EditOptions = {
    suggest: change.suggest ? { id: crypto.randomUUID().replace(/-/g, "").slice(0, 10), userId: user.id, createdAt: Date.now() } : null,
    resolveLink: (title) => byName.get(title.trim().toLowerCase()) ?? null,
    defaultType: format === "prose" ? "p" : "action",
  };

  const room = roomName({ kind: "node", id: nodeId });
  const state = await fetchRoomState(room);
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, state);
    const before = Y.encodeStateVector(doc);
    ensureBlockIds(doc);
    if (change.mode !== "append" && !change.suggest) await keepVersion(projectId, nodeId, user.id, state);
    const titleOf = (id: string) => index.byId.get(id)?.title;
    if (change.mode === "update") {
      const current = ydocToValue(Y.encodeStateAsUpdate(doc));
      const known = blockIds(doc);
      restoreValue(doc, planUpdate(current, change.markdown, (block) => valueToMarkdown([block], { titleOf }), (text) => textToBlocks(text, options, known)));
    } else {
      const result = change.mode === "append" ? applyEdits(doc, [{ op: "insert", after: "end", text: change.markdown }], options) : replaceAll(doc, change.markdown, options);
      if (result.problems.length) throw new ApiError(400, result.problems.join(" "));
    }
    const update = Y.encodeStateAsUpdate(doc, before);
    // Two bytes is an update that changes nothing.
    if (update.length > 2) {
      await postRoomUpdate(room, update);
      await syncRoomState(room, Y.encodeStateAsUpdate(doc));
    }
    return { markdown: valueToMarkdown(ydocToValue(Y.encodeStateAsUpdate(doc)), { titleOf }) };
  } finally {
    doc.destroy();
  }
}

/** What the note said before a replace, in its history. */
async function keepVersion(projectId: string, nodeId: string, userId: string, state: Uint8Array) {
  await transaction(async () => {
    const [owner] = await userDb((tx) => tx.select({ workspaceId: project.organizationId }).from(project).where(eq(project.id, projectId)).limit(1));
    if (!owner) throw new ApiError(404, "Not found.");
    await makeRoom(owner.workspaceId, state.length);
    await assertStorage(owner.workspaceId, state.length);
    let words = 0;
    try {
      words = indexDocument(ydocToValue(state)).words;
    } catch {}
    await userDb((tx) => insertVersion(tx, { projectId, nodeId, name: "Before an API change", auto: false, state, wordCount: words, createdById: userId }));
  });
}
