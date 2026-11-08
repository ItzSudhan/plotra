"use server";

import { schema } from "@plotra/db";
import {
  nodeKinds,
  propertyTypes,
  type NodeKind,
  type PropertyOptions,
  type PropertyType,
} from "@plotra/db/schema";
import { and, asc, eq, ilike, inArray, isNull, ne, or } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { getNodeAccess, getProjectAccess, requireNodeAccess, requireProjectAccess } from "./access";
import { requireSession } from "./data";
import { userDb } from "./db";
import { mentionPattern } from "./doc-index";
import { slugify } from "./slug";
import { defaultProperties } from "./templates";
import { readOnly, transaction } from "./request-cache";

const { node, link, propertyDef, layout, project, organization } = schema;

// ---- Previews ---------------------------------------------------------------

export type NodePreview = { title: string; kind: NodeKind; synopsis: string | null; excerpt: string; heading?: string };

const EXCERPT = 700;

/** What a link's hover card shows: the start of the note, or of one section. */
export async function getNodePreview(projectId: string, nodeId: string, heading?: string): Promise<NodePreview> {
  return readOnly(async () => {
    await requireNodeAccess(projectId, nodeId);
    const [row] = await userDb((tx) =>
      tx
        .select({ title: node.title, kind: node.kind, synopsis: node.synopsis, text: node.text })
        .from(node)
        .where(eq(node.id, nodeId)),
    );
    let lines = row.text.split("\n");
    if (heading) {
      const start = lines.findIndex((l) => l.trim().toLowerCase() === heading.trim().toLowerCase());
      if (start >= 0) lines = lines.slice(start + 1);
    }
    const text = lines.filter((l) => l.trim()).join("\n");
    return {
      title: row.title,
      kind: row.kind,
      synopsis: row.synopsis,
      excerpt: text.length > EXCERPT ? `${text.slice(0, EXCERPT)}…` : text,
      heading,
    };
  });
}

// ---- Links ------------------------------------------------------------------

export type Backlink = { sourceNodeId: string; kind: "wiki" | "embed" | "property"; context: string | null; targetHeading: string | null };
/**
 * A link into a world project's entry from a project that shares that world
 * (plan.md 2.8): from a note the world's own binder doesn't hold, so it comes
 * with its project and where to open it.
 */
export type WorldBacklink = Backlink & { sourceTitle: string; projectId: string; projectTitle: string; href: string };
export type OutgoingLink = { targetNodeId: string; kind: "wiki" | "embed" | "property"; targetHeading: string | null };

/** Backlinks and outgoing links of a note, both filtered to what the user can see. */
export async function getNodeLinks(projectId: string, nodeId: string) {
  return readOnly(async () => {
    await requireNodeAccess(projectId, nodeId);
    const access = await getNodeAccess(projectId);
    const [incoming, outgoing] = await userDb((tx) =>
      Promise.all([
        tx
          .select({ sourceNodeId: link.sourceNodeId, kind: link.kind, context: link.context, targetHeading: link.targetHeading })
          .from(link)
          .innerJoin(node, eq(node.id, link.sourceNodeId))
          .where(and(eq(link.targetNodeId, nodeId), isNull(node.deletedAt), ne(link.sourceNodeId, nodeId)))
          .orderBy(asc(node.title), asc(link.ordinal)),
        tx
          .select({ targetNodeId: link.targetNodeId, kind: link.kind, targetHeading: link.targetHeading })
          .from(link)
          .where(eq(link.sourceNodeId, nodeId))
          .orderBy(asc(link.ordinal)),
      ]),
    );
    return {
      backlinks: incoming.filter((l) => access.has(l.sourceNodeId)) as Backlink[],
      outgoing: outgoing.filter((l) => access.has(l.targetNodeId)) as OutgoingLink[],
      fromSharers: await sharerBacklinks(projectId, nodeId),
    };
  });
}

/**
 * Links into this note from projects that share this project as their world,
 * where the user can read the project the link is in. Empty for a project no
 * other shares.
 */
async function sharerBacklinks(projectId: string, nodeId: string): Promise<WorldBacklink[]> {
  const rows = await userDb((tx) =>
    tx
      .select({
        sourceNodeId: link.sourceNodeId,
        kind: link.kind,
        context: link.context,
        targetHeading: link.targetHeading,
        sourceTitle: node.title,
        projectId: project.id,
        projectTitle: project.title,
        projectSlug: project.slug,
        workspaceSlug: organization.slug,
      })
      .from(link)
      .innerJoin(node, eq(node.id, link.sourceNodeId))
      .innerJoin(project, eq(project.id, link.projectId))
      .innerJoin(organization, eq(organization.id, project.organizationId))
      // Row-level security leaves only links in projects the user can open; the world has to be this one.
      .where(and(eq(link.targetNodeId, nodeId), ne(link.projectId, projectId), eq(project.worldId, projectId), isNull(node.deletedAt)))
      .orderBy(asc(project.title), asc(node.title), asc(link.ordinal))
      .limit(200),
  );
  const readable = new Map<string, boolean>();
  const out: WorldBacklink[] = [];
  for (const { projectSlug, workspaceSlug, ...row } of rows) {
    if (!readable.has(row.projectId)) readable.set(row.projectId, Boolean((await getProjectAccess(row.projectId))?.actions.has("read")));
    if (!readable.get(row.projectId)) continue;
    out.push({ ...row, kind: row.kind as Backlink["kind"], href: `/w/${workspaceSlug}/p/${projectSlug}?open=${row.sourceNodeId}` });
  }
  return out;
}

export type UnlinkedMention = { sourceNodeId: string; before: string; match: string; after: string };

/** Places where the note's title or an alias appears as plain text, not linked (plan.md 2.4). */
export async function getUnlinkedMentions(projectId: string, nodeId: string): Promise<UnlinkedMention[]> {
  return readOnly(async () => {
    await requireNodeAccess(projectId, nodeId);
    const access = await getNodeAccess(projectId);
    const [target] = await userDb((tx) =>
      tx.select({ title: node.title, aliases: node.aliases }).from(node).where(eq(node.id, nodeId)),
    );
    const names = [target.title, ...target.aliases];
    const pattern = mentionPattern(names);
    if (!pattern) return [];

    const candidates = await userDb((tx) =>
      tx
        .select({ id: node.id, text: node.text })
        .from(node)
        .where(
          and(
            eq(node.projectId, projectId),
            ne(node.id, nodeId),
            isNull(node.deletedAt),
            or(...names.filter((n) => n.trim().length >= 2).map((n) => ilike(node.text, `%${n.replace(/[%_\\]/g, "\\$&")}%`))),
          ),
        )
        .limit(200),
    );

    const mentions: UnlinkedMention[] = [];
    for (const candidate of candidates) {
      if (!access.has(candidate.id)) continue;
      for (const match of candidate.text.matchAll(pattern)) {
        const start = match.index;
        const end = start + match[0].length;
        mentions.push({
          sourceNodeId: candidate.id,
          before: candidate.text.slice(Math.max(0, start - 60), start).replace(/^[\s\S]*\n/, ""),
          match: match[0],
          after: candidate.text.slice(end, end + 60).replace(/\n[\s\S]*$/, ""),
        });
        if (mentions.length >= 100) return mentions;
      }
    }
    return mentions;
  });
}

/** Every link in the project the user can see both ends of, for the graph. */
export async function getProjectLinks(projectId: string) {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    const access = await getNodeAccess(projectId);
    const rows = await userDb((tx) =>
      tx
        .select({ source: link.sourceNodeId, target: link.targetNodeId, kind: link.kind })
        .from(link)
        .where(eq(link.projectId, projectId)),
    );
    return rows.filter((l) => access.has(l.source) && access.has(l.target));
  });
}

// ---- Property definitions (templates per kind) --------------------------------

export type PropertyDef = {
  id: string;
  nodeKind: NodeKind;
  key: string;
  label: string;
  type: PropertyType;
  options: PropertyOptions;
  position: string;
};

const defColumns = {
  id: propertyDef.id,
  nodeKind: propertyDef.nodeKind,
  key: propertyDef.key,
  label: propertyDef.label,
  type: propertyDef.type,
  options: propertyDef.options,
  position: propertyDef.position,
};

export async function listPropertyDefs(projectId: string): Promise<PropertyDef[]> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    return userDb((tx) => tx.select(defColumns).from(propertyDef).where(eq(propertyDef.projectId, projectId)));
  });
}

/** Gives a project the default templates the first time it's opened. */
export async function ensureDefaultPropertyDefs(projectId: string): Promise<PropertyDef[]> {
  await requireProjectAccess(projectId);
  return userDb(async (tx) => {
    const existing = await tx.select(defColumns).from(propertyDef).where(eq(propertyDef.projectId, projectId));
    if (existing.length) return existing;
    const rows = Object.entries(defaultProperties).flatMap(([kind, props]) => {
      let position: string | null = null;
      return props!.map((p) => {
        position = generateKeyBetween(position, null);
        return { projectId, nodeKind: kind as NodeKind, key: p.key, label: p.label, type: p.type, options: p.options ?? {}, position };
      });
    });
    return tx.insert(propertyDef).values(rows).onConflictDoNothing().returning(defColumns);
  });
}

function cleanOptions(type: PropertyType, options: PropertyOptions = {}): PropertyOptions {
  const out: PropertyOptions = {};
  if (type === "select" || type === "multi_select") {
    out.choices = [...new Set((options.choices ?? []).map((c) => c.trim().slice(0, 80)).filter(Boolean))].slice(0, 100);
  }
  if (type === "node") {
    out.nodeKinds = (options.nodeKinds ?? []).filter((k) => nodeKinds.includes(k as NodeKind));
    out.multiple = Boolean(options.multiple);
  }
  return out;
}

export async function createPropertyDef(
  projectId: string,
  input: { nodeKind: NodeKind; label: string; type: PropertyType; options?: PropertyOptions },
): Promise<PropertyDef> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    if (!nodeKinds.includes(input.nodeKind)) throw new Error("Unknown node kind.");
    if (!propertyTypes.includes(input.type)) throw new Error("Unknown property type.");
    const label = input.label.trim().slice(0, 60);
    if (!label) throw new Error("Give the property a name.");
    return userDb(async (tx) => {
      const siblings = await tx
        .select({ key: propertyDef.key, position: propertyDef.position })
        .from(propertyDef)
        .where(and(eq(propertyDef.projectId, projectId), eq(propertyDef.nodeKind, input.nodeKind)));
      const base = slugify(label) || "property";
      let key = base;
      for (let n = 2; siblings.some((s) => s.key === key); n++) key = `${base}-${n}`;
      const last = siblings.map((s) => s.position).sort().at(-1) ?? null;
      const [row] = await tx
        .insert(propertyDef)
        .values({
          projectId,
          nodeKind: input.nodeKind,
          key,
          label,
          type: input.type,
          options: cleanOptions(input.type, input.options),
          position: generateKeyBetween(last, null),
        })
        .returning(defColumns);
      return row;
    });
  });
}

export async function updatePropertyDef(
  projectId: string,
  id: string,
  patch: { label?: string; options?: PropertyOptions; position?: string },
): Promise<PropertyDef> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    return userDb(async (tx) => {
      const [current] = await tx.select(defColumns).from(propertyDef).where(and(eq(propertyDef.id, id), eq(propertyDef.projectId, projectId)));
      if (!current) throw new Error("That property no longer exists.");
      const values: Partial<typeof propertyDef.$inferInsert> = {};
      if (patch.label !== undefined) values.label = patch.label.trim().slice(0, 60) || current.label;
      if (patch.options !== undefined) values.options = cleanOptions(current.type, patch.options);
      if (patch.position !== undefined && patch.position.length <= 256) values.position = patch.position;
      const [row] = await tx.update(propertyDef).set(values).where(eq(propertyDef.id, id)).returning(defColumns);
      return row;
    });
  });
}

/** Removes a property from a kind's template. Values stay on notes (hidden) in case it's re-added. */
export async function deletePropertyDef(projectId: string, id: string): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId, "edit");
    await userDb(async (tx) => {
      const [def] = await tx
        .delete(propertyDef)
        .where(and(eq(propertyDef.id, id), eq(propertyDef.projectId, projectId)))
        .returning({ key: propertyDef.key, kind: propertyDef.nodeKind, type: propertyDef.type });
      if (def?.type === "node") {
        const ids = (
          await tx.select({ id: node.id }).from(node).where(and(eq(node.projectId, projectId), eq(node.kind, def.kind)))
        ).map((r) => r.id);
        if (ids.length) {
          await tx
            .delete(link)
            .where(and(eq(link.kind, "property"), eq(link.context, def.key), inArray(link.sourceNodeId, ids)));
        }
      }
    });
  });
}

// ---- Saved layouts --------------------------------------------------------------

export type SavedLayout = { id: string; name: string; updatedAt: Date };

export async function listLayouts(projectId: string): Promise<SavedLayout[]> {
  return readOnly(async () => {
    const { user } = await requireSession();
    await requireProjectAccess(projectId);
    return userDb((tx) =>
      tx
        .select({ id: layout.id, name: layout.name, updatedAt: layout.updatedAt })
        .from(layout)
        .where(and(eq(layout.projectId, projectId), eq(layout.userId, user.id)))
        .orderBy(asc(layout.name)),
    );
  });
}

const MAX_LAYOUT_BYTES = 200_000;

/** Saves the current pane arrangement under a name, replacing one with the same name. */
export async function saveLayout(projectId: string, name: string, state: unknown): Promise<SavedLayout> {
  return transaction(async () => {
    const { user } = await requireSession();
    await requireProjectAccess(projectId);
    const clean = name.trim().slice(0, 60);
    if (!clean) throw new Error("Name the layout.");
    if (JSON.stringify(state ?? null).length > MAX_LAYOUT_BYTES) throw new Error("That layout is too large to save.");
    const [row] = await userDb((tx) =>
      tx
        .insert(layout)
        .values({ userId: user.id, projectId, name: clean, state: state as object })
        .onConflictDoUpdate({ target: [layout.userId, layout.projectId, layout.name], set: { state: state as object, updatedAt: new Date() } })
        .returning({ id: layout.id, name: layout.name, updatedAt: layout.updatedAt }),
    );
    return row;
  });
}

export async function getLayout(projectId: string, id: string): Promise<unknown> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    const [row] = await userDb((tx) =>
      tx.select({ state: layout.state }).from(layout).where(and(eq(layout.id, id), eq(layout.projectId, projectId))),
    );
    if (!row) throw new Error("That layout no longer exists.");
    return row.state;
  });
}

export async function deleteLayout(projectId: string, id: string): Promise<void> {
  return transaction(async () => {
    await requireProjectAccess(projectId);
    await userDb((tx) => tx.delete(layout).where(and(eq(layout.id, id), eq(layout.projectId, projectId))));
  });
}
