"use server";

import { schema } from "@plotra/db";
import type { NodeProperties } from "@plotra/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { getNodeAccess, requireNodeAccess, requireProjectAccess } from "./access";
import { binderColumns, withActions, type BinderNode } from "./binder";
import { researchKeys } from "./citations";
import { clipPage, clippedAuthors } from "./clip";
import { valueToYdoc } from "./collab/ydoc";
import { requireSession } from "./data";
import { userDb, type Tx } from "./db";
import { indexDocument, type DocNode } from "./doc-index";
import type { PropertyDef } from "./knowledge-actions";
import { enabledModules } from "./modules";
import { r2Delete } from "./r2";
import { rateLimit } from "./rate-limit";
import { readOnly, transaction } from "./request-cache";
import { defaultProperties } from "./templates";

// Research & sources (plan.md 2.8): the bibliography fields of research notes,
// web clipping, and the files attached to a source. Uploads and downloads go
// through /api/files, since a server action isn't the place for megabytes.

const { node, propertyDef, attachment } = schema;

const defColumns = {
  id: propertyDef.id,
  nodeKind: propertyDef.nodeKind,
  key: propertyDef.key,
  label: propertyDef.label,
  type: propertyDef.type,
  options: propertyDef.options,
  position: propertyDef.position,
};

/** Adds the research template's missing properties, each slotted in where the template has it. */
async function addResearchDefs(tx: Tx, projectId: string): Promise<PropertyDef[]> {
  const template = defaultProperties.research ?? [];
  const all = await tx.select({ nodeKind: propertyDef.nodeKind, key: propertyDef.key, position: propertyDef.position }).from(propertyDef).where(eq(propertyDef.projectId, projectId));
  // Only projects that already have their templates: a fresh one gets them all
  // from `defaultProperties` (ensureDefaultPropertyDefs), and only while it has none.
  if (!all.length) return [];
  const existing = all.filter((d) => d.nodeKind === "research");
  // The Type field marks a project whose research notes already have their
  // bibliography fields: anything missing after that was removed on purpose.
  if (existing.some((d) => d.key === researchKeys.type)) return [];
  const have = new Map(existing.map((d) => [d.key, d.position]));
  const last = existing.map((d) => d.position).sort().at(-1) ?? null;
  let lower: string | null = null;
  const rows = [];
  for (const [i, p] of template.entries()) {
    const at = have.get(p.key);
    if (at !== undefined) {
      lower = at;
      continue;
    }
    // Between the template neighbours that exist; at the end if they've been reordered.
    let upper: string | null = template.slice(i + 1).map((next) => have.get(next.key)).find((pos) => pos !== undefined) ?? null;
    if (lower !== null && upper !== null && lower >= upper) {
      lower = last !== null && last > lower ? last : lower;
      upper = null;
    }
    lower = generateKeyBetween(lower, upper);
    rows.push({ projectId, nodeKind: "research" as const, key: p.key, label: p.label, type: p.type, options: p.options ?? {}, position: lower });
  }
  if (!rows.length) return [];
  return tx.insert(propertyDef).values(rows).onConflictDoNothing().returning(defColumns);
}

/**
 * Gives an existing project's research notes their bibliography fields (type,
 * authors, publisher…) once the Research module is on. Adds nothing for people
 * who can't edit the project. Returns the properties it `added` and every
 * property research notes now have (`defs`), for a client whose copy is older.
 */
export async function ensureResearchDefaults(projectId: string): Promise<{ added: PropertyDef[]; defs: PropertyDef[] }> {
  const { project: found, actions } = await requireProjectAccess(projectId);
  const wanted = actions.has("edit") && enabledModules(found.type, found.settings).has("research");
  return userDb(async (tx) => {
    const added = wanted ? await addResearchDefs(tx, projectId) : [];
    const defs = await tx
      .select(defColumns)
      .from(propertyDef)
      .where(and(eq(propertyDef.projectId, projectId), eq(propertyDef.nodeKind, "research")));
    return { added, defs };
  });
}

// ---- Clipping a web page --------------------------------------------------------------

async function assertCanClipInto(projectId: string, parentId: string | null) {
  if (!parentId) {
    await requireProjectAccess(projectId, "edit");
    return;
  }
  await requireNodeAccess(projectId, parentId, "edit");
  const [parent] = await userDb((tx) => tx.select({ deletedAt: node.deletedAt }).from(node).where(eq(node.id, parentId)));
  if (parent?.deletedAt) throw new Error("That folder is in the trash.");
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Fetches a web page and files it as a research note: its title and whatever
 * the page says about itself (author, site, date) as bibliography fields, and
 * its readable text as the body. The note is readable at once: the document is
 * stored with it rather than seeded by the collab server.
 */
export async function clipWebPage(projectId: string, url: string, parentId: string | null = null): Promise<BinderNode> {
  if (typeof url !== "string" || !url.trim() || url.length > 2000) throw new Error("That doesn't look like a web address.");
  // Checked before fetching, and in a scope of its own: the fetch can take
  // seconds, and a database transaction shouldn't sit open while it does.
  await readOnly(async () => {
    await assertCanClipInto(projectId, parentId);
    // Each clip is a fetch of someone else's site and seconds of function time
    // (plan.md 8.2). Sixty an hour is more than a research session comes to.
    const { user: me } = await requireSession();
    await rateLimit("clip", me.id, { limit: 60, windowSeconds: 3600 });
  });
  // Only addresses on the public web are fetched (lib/clip.ts).
  const page = await clipPage(url);

  const properties: NodeProperties = {};
  const set = (key: string, value: string) => {
    if (value) properties[key] = value.slice(0, 2000);
  };
  set(researchKeys.type, page.journal ? "Article" : "Website");
  set(researchKeys.authors, clippedAuthors(page));
  set(researchKeys.container, page.journal || page.site);
  set(researchKeys.publisher, page.publisher);
  set(researchKeys.year, page.published);
  set(researchKeys.volume, page.volume);
  set(researchKeys.pages, page.pages);
  set(researchKeys.url, page.url);
  set(researchKeys.accessed, today());
  set(researchKeys.identifier, page.doi);

  const value: DocNode[] = [
    {
      type: "p",
      children: [{ text: "Clipped from " }, { type: "a", url: page.url, children: [{ text: page.site || page.url }] }, { text: ` on ${today()}.` }],
    },
    ...page.blocks,
    ...(page.truncated ? [{ type: "p", children: [{ text: "The page was longer than a clip can hold; the rest is at the source.", italic: true }] }] : []),
    { type: "p", children: [{ text: "" }] },
  ];
  const index = indexDocument(value);

  return transaction(async () => {
    const { user } = await requireSession();
    await assertCanClipInto(projectId, parentId);
    const row = await userDb(async (tx) => {
      // Clipped fields need their properties to exist, whatever the page that loaded the project did.
      await addResearchDefs(tx, projectId);
      const siblings = await tx
        .select({ position: node.position })
        .from(node)
        .where(and(eq(node.projectId, projectId), parentId ? eq(node.parentId, parentId) : isNull(node.parentId)));
      // Positions compare as plain strings, not with the database's collation.
      const lastPosition = siblings.map((s) => s.position).sort().at(-1) ?? null;
      const [created] = await tx
        .insert(node)
        .values({
          projectId,
          parentId,
          kind: "research",
          title: page.title,
          position: generateKeyBetween(lastPosition, null),
          synopsis: page.description || null,
          properties,
          ydoc: valueToYdoc(value),
          text: index.text,
          wordCount: index.words,
          headings: index.headings,
          contentTags: index.tags,
          createdById: user.id,
        })
        .returning(binderColumns);
      await tx.update(schema.project).set({ updatedAt: new Date() }).where(eq(schema.project.id, projectId));
      return created;
    });
    const [clipped] = await withActions(projectId, [row as Parameters<typeof withActions>[1][number]], true);
    if (!clipped) throw new Error("That note is no longer visible to you.");
    return clipped;
  });
}

// ---- Attachments -----------------------------------------------------------------------

export type AttachmentRow = { id: string; nodeId: string; name: string; contentType: string; size: number; createdAt: Date };

/** Every file attached to a note the user can see, newest first. The bytes are served by /api/files/<id>. */
export async function listAttachments(projectId: string): Promise<AttachmentRow[]> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    const access = await getNodeAccess(projectId);
    const rows = await userDb((tx) =>
      tx
        .select({
          id: attachment.id,
          nodeId: attachment.nodeId,
          name: attachment.name,
          contentType: attachment.contentType,
          size: attachment.size,
          createdAt: attachment.createdAt,
        })
        .from(attachment)
        .where(eq(attachment.projectId, projectId))
        .orderBy(desc(attachment.createdAt)),
    );
    return rows.filter((r) => access.has(r.nodeId));
  });
}

/** Removes a file from its note. Needs `edit` on the note. */
export async function deleteAttachment(projectId: string, attachmentId: string): Promise<void> {
  const key = await transaction(async () => {
    const [row] = await userDb((tx) =>
      tx
        .select({ nodeId: attachment.nodeId, r2Key: attachment.r2Key })
        .from(attachment)
        .where(and(eq(attachment.id, attachmentId), eq(attachment.projectId, projectId))),
    );
    if (!row) throw new Error("That file no longer exists.");
    await requireNodeAccess(projectId, row.nodeId, "edit");
    await userDb((tx) => tx.delete(attachment).where(eq(attachment.id, attachmentId)));
    return row.r2Key;
  });
  // Only once the row is gone for good: a stored object without a row is harmless, the reverse is a broken file.
  if (key) await r2Delete([key]);
}
