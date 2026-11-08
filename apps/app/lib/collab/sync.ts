import "server-only";
import { db, schema } from "@plotra/db";
import { and, eq, inArray, ne } from "drizzle-orm";
import * as Y from "yjs";
import { trackOnce } from "../analytics";
import { indexCanvas } from "../canvas";
import { indexDocument, type DocIndex } from "../doc-index";
import { indexDialogue } from "../interactive/model";
import { nodeFormat } from "../modules";
import { isDocumentKind } from "../story";
import { autoVersion } from "../versions";
import { gitSyncSoon } from "../git-sync";
import { emitWebhook } from "../webhooks";
import { parseRoom } from "./rooms";
import { seedUpdate, starterBody } from "./seed";
import { valueToYdoc, ydocToValue } from "./ydoc";

// Trusted callbacks from the collab server (apps/collab). They run on the owner
// connection, outside row-level security, and are guarded by COLLAB_SECRET.

const { node, link, project, fact } = schema;

// A scene counts as written once it has about a paragraph in it (plan.md 1 "Product analytics").
const FIRST_SCENE_WORDS = 50;

export function isCollabServer(request: Request) {
  const secret = process.env.COLLAB_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * The starting state for a room the collab server has never stored: the last
 * snapshot in Postgres, else the Phase 1 JSON content (or a template), else an
 * empty paragraph. Null for unknown rooms.
 */
export async function loadRoomState(room: string): Promise<Uint8Array | null> {
  const parsed = parseRoom(room);
  if (!parsed || parsed.kind === "presence") return null;
  const [row] = await db
    .select({ ydoc: node.ydoc, content: node.content, kind: node.kind, settings: node.settings })
    .from(node)
    .where(eq(node.id, parsed.id));
  if (!row) return null;
  if (row.ydoc?.length) return row.ydoc;
  // Boards start empty: a canvas fills its maps as cards are added.
  if (!isDocumentKind(row.kind)) return Y.encodeStateAsUpdate(new Y.Doc());
  if (Array.isArray(row.content)) return valueToYdoc(row.content as never);
  // Same bytes the creating browser seeded itself with (see ./seed).
  return seedUpdate(room, starterBody(row.kind, nodeFormat(row.settings)));
}

/**
 * Stores a snapshot pushed by the collab server and rebuilds everything derived
 * from it: text, word count, headings, inline tags and the link index.
 */
export async function syncRoomState(room: string, update: Uint8Array): Promise<boolean> {
  const parsed = parseRoom(room);
  if (!parsed || parsed.kind === "presence") return false;
  const synced = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ projectId: node.projectId, kind: node.kind, wordCount: node.wordCount, createdById: node.createdById })
      .from(node)
      .where(eq(node.id, parsed.id));
    if (!row) return false;
    const index = row.kind === "canvas" ? canvasIndex(update) : row.kind === "dialogue" ? dialogueIndex(update) : indexDocument(ydocToValue(update));
    await tx
      .update(node)
      .set({
        ydoc: update,
        text: index.text,
        wordCount: index.words,
        headings: index.headings,
        contentTags: index.tags,
      })
      .where(eq(node.id, parsed.id));
    const [touched] = await tx.update(project).set({ updatedAt: new Date() }).where(eq(project.id, row.projectId)).returning({ workspaceId: project.organizationId });

    // Only link to nodes that exist in the same project, or in the world it shares, so a
    // character page there lists the notes here that mention it.
    const targets = [...new Set(index.links.map((l) => l.targetNodeId))];
    const [own] = targets.length ? await tx.select({ worldId: project.worldId }).from(project).where(eq(project.id, row.projectId)) : [];
    const projects = own?.worldId ? [row.projectId, own.worldId] : [row.projectId];
    const valid = new Set(
      targets.length
        ? (
            await tx
              .select({ id: node.id })
              .from(node)
              .where(and(inArray(node.projectId, projects), inArray(node.id, targets)))
          ).map((r) => r.id)
        : [],
    );
    await tx.delete(link).where(and(eq(link.sourceNodeId, parsed.id), ne(link.kind, "property")));
    const rows = index.links
      .filter((l) => valid.has(l.targetNodeId))
      .map((l, ordinal) => ({
        projectId: row.projectId,
        sourceNodeId: parsed.id,
        targetNodeId: l.targetNodeId,
        targetHeading: l.targetHeading,
        kind: l.kind,
        context: l.context,
        ordinal,
      }));
    if (rows.length) await tx.insert(link).values(rows);

    // Tagged blocks (canon, reveals, claims), for the roadmap and sources views.
    await tx.delete(fact).where(eq(fact.nodeId, parsed.id));
    if (index.facts.length) {
      await tx.insert(fact).values(
        index.facts.map((f, ordinal) => ({
          projectId: row.projectId,
          nodeId: parsed.id,
          blockId: f.blockId,
          ordinal,
          excerpt: f.excerpt,
          canon: f.canon ?? null,
          reveal: f.reveal ?? null,
          channel: f.channel ?? null,
          layer: f.layer ?? null,
          claim: f.claim ?? null,
          claimSourceId: f.claimSource ?? null,
        })),
      );
    }
    // "First scene written" (plan.md 1 "Product analytics"), decided from the row
    // this sync reads anyway: a scene that had fewer words than a paragraph and
    // now has more. Every other sync, and every later one of the same scene,
    // stops here without a query. Sample scenes arrive already written, so
    // opening one doesn't count.
    const wroteScene = row.kind === "scene" && row.wordCount < FIRST_SCENE_WORDS && index.words >= FIRST_SCENE_WORDS ? row.createdById : null;
    // Words gained or lost by this save, for the writing stats. Boards aren't prose, so they don't count.
    return { projectId: row.projectId, words: index.words, wroteScene, workspaceId: touched?.workspaceId ?? null };
  });
  if (!synced) return false;
  // Once per person: the scene's author, since a sync doesn't say who typed.
  if (synced.wroteScene) await trackOnce("first_scene_written", { userId: synced.wroteScene, workspaceId: synced.workspaceId, projectId: synced.projectId });
  // Writing statistics aren't taken from here: a save doesn't say what was typed and what pasted or restored (lib/stats-actions.ts).
  // Webhooks hear of it, at most every few minutes a note, without who typed: a save doesn't say (lib/webhooks.ts).
  await emitWebhook(synced.projectId, "note.updated", { nodeId: parsed.id, data: { words: synced.words } });
  // A project synced to GitHub gets the change a few minutes later (lib/git-sync.ts).
  await gitSyncSoon(synced.projectId);
  // Every so often, keep a snapshot for version history (plan.md 2.6).
  await autoVersion(synced.projectId, parsed.id, update, synced.words).catch((error) =>
    console.error(`auto version for ${room} failed`, error),
  );
  return true;
}

function canvasIndex(update: Uint8Array): DocIndex {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  const index = indexCanvas(doc);
  doc.destroy();
  return index;
}

function dialogueIndex(update: Uint8Array): DocIndex {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  const index = indexDialogue(doc);
  doc.destroy();
  return index;
}
