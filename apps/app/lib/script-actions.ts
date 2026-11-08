"use server";

import { schema } from "@plotra/db";
import { eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { requireNodeAccess, requireProjectAccess } from "./access";
import { binderColumns, withActions, type BinderNode } from "./binder";
import { valueToYdoc } from "./collab/ydoc";
import { requireSession } from "./data";
import { userDb } from "./db";
import { indexDocument, type DocNode } from "./doc-index";
import { fountainToOutline, parseFountain } from "./fountain";
import { transaction } from "./request-cache";

// Script formats (plan.md 2.3, 2.7): bringing a Fountain screenplay into the binder.

const { node, project } = schema;

// A feature screenplay is a few hundred kilobytes and a few hundred scenes.
const MAX_SOURCE = 900_000;
const MAX_NODES = 1500;
const MAX_TITLE = 200;
const MAX_SYNOPSIS = 2000;
const MAX_TITLE_PAGE = 4000;

/** Blocks get the ids the editor would give them, so outline entries and links are stable from the start. */
const withIds = (value: DocNode[]): DocNode[] => value.map((block) => ({ id: crypto.randomUUID().replace(/-/g, "").slice(0, 10), ...block }));

/**
 * Imports a Fountain file as a folder named after the script: a chapter per
 * section (`#`), a scene per scene heading, each a screenplay document that's
 * readable at once (its Yjs state and index are written here, not on first open).
 */
export async function importFountain(
  projectId: string,
  input: { parentId: string | null; position: string; fileName: string; source: string },
): Promise<BinderNode[]> {
  return transaction(async () => {
    const { user } = await requireSession();
    if (typeof input.source !== "string" || !input.source.trim()) throw new Error("That file is empty.");
    if (input.source.length > MAX_SOURCE) throw new Error("That file is too large to import.");
    if (!input.position || input.position.length > 256) throw new Error("Invalid position.");
    if (input.parentId) await requireNodeAccess(projectId, input.parentId, "edit");
    else await requireProjectAccess(projectId, "edit");

    const script = parseFountain(input.source);
    const fallback = String(input.fileName ?? "").replace(/\.[a-z0-9]+$/i, "").trim() || "Imported script";
    const outline = fountainToOutline(script, fallback);
    if (outline.length > MAX_NODES) throw new Error("That script has too many scenes to import in one go.");

    // The title page travels with the folder, for exporting the script again.
    const titlePage = JSON.stringify(script.titlePage);
    const ids = outline.map(() => crypto.randomUUID());
    const positions = new Map<number | null, string | null>();
    const rows = outline.map((entry, i): typeof node.$inferInsert => {
      const position = entry.parent === null ? input.position : generateKeyBetween(positions.get(entry.parent) ?? null, null);
      positions.set(entry.parent, position);
      const base = {
        id: ids[i],
        projectId,
        parentId: entry.parent === null ? input.parentId : ids[entry.parent],
        kind: entry.kind,
        title: entry.title.slice(0, MAX_TITLE) || "Untitled",
        position,
        synopsis: entry.synopsis?.slice(0, MAX_SYNOPSIS) || null,
        createdById: user.id,
      };
      if (entry.kind === "folder") {
        return { ...base, settings: titlePage.length > 2 && titlePage.length <= MAX_TITLE_PAGE ? { titlePage } : {} };
      }
      if (entry.kind !== "scene") return base;
      const value = withIds(entry.value ?? []);
      const index = indexDocument(value);
      return {
        ...base,
        settings: { format: "screenplay" },
        ydoc: valueToYdoc(value),
        text: index.text,
        wordCount: index.words,
        headings: index.headings,
        contentTags: index.tags,
      };
    });

    const inserted = await userDb(async (tx) => {
      const out = [];
      // Parents come before their children in the outline, so batches can go in order.
      for (let i = 0; i < rows.length; i += 50) out.push(...(await tx.insert(node).values(rows.slice(i, i + 50)).returning(binderColumns)));
      await tx.update(project).set({ updatedAt: new Date() }).where(eq(project.id, projectId));
      return out;
    });
    return withActions(projectId, inserted, true);
  });
}
