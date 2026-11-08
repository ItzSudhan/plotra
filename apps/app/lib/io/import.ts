import "server-only";
import { schema } from "@plotra/db";
import { eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { requireNodeAccess, requireProjectAccess } from "../access";
import { binderColumns, listNodes, withActions, type BinderNode } from "../binder";
import { valueToYdoc } from "../collab/ydoc";
import { requireSession } from "../data";
import { userDb } from "../db";
import { indexDocument, type DocNode } from "../doc-index";
import { indexNodes, isTrashed } from "../tree";
import { resolveLinks } from "./markdown";
import { swatches } from "../story";
import { linkFinder, type ImportThread, type OutlineEntry } from "./outline";
import { inferProperties, propertyValue } from "./properties";
import { isPendingPicture, pendingPath } from "./vault-pictures";
import { slugify } from "../slug";
import type { PropertyOptions, PropertyType } from "@plotra/db/schema";

// Bringing a manuscript in (plan.md 2.7): Markdown, DOCX and plain text files,
// or a whole folder of them (an Obsidian vault), become folders, chapters,
// scenes and notes. The files are read on the server
// (app/api/import, ./upload), cut up by ./outline, and written here in one
// transaction.

const { node, project, link, plotThread, sceneThread, propertyDef } = schema;

/** A picture of the vault the notes show, still to be uploaded (./vault-pictures.ts): where it is, and the notes it goes in. */
export type PendingPicture = { path: string; nodeIds: string[] };

/** Every picture in a value still waiting for its file. */
function pendingIn(value: DocNode[], out: Set<string>) {
  for (const n of value) {
    if (n.type === "img" && isPendingPicture(n.url)) out.add(pendingPath(n.url));
    if (n.children) pendingIn(n.children, out);
  }
}

/** Throws unless the user may add notes under `parentId` (or at the top of the project). Returns the project. */
export async function assertCanImport(projectId: string, parentId: string | null) {
  const { project: found } = parentId ? await requireNodeAccess(projectId, parentId, "edit") : await requireProjectAccess(projectId, "edit");
  return found;
}

/** Blocks get the ids the editor would give them, so outline entries and links are stable from the start. */
const withIds = (value: DocNode[]): DocNode[] => value.map((block) => ({ id: crypto.randomUUID().replace(/-/g, "").slice(0, 10), ...block }));

/**
 * Creates the outline's notes under `parentId`, each readable at once (its Yjs
 * state, text index and links are written here, not on first open). Must run
 * inside `transaction`. `[[links]]` point at notes of the same import first,
 * then at notes the project already has, by title or alias (`linkFinder`).
 * What is created is marked `settings.imported`: text from outside, to the
 * agent (lib/agent/untrusted.ts).
 */
export async function createImported(
  projectId: string,
  parentId: string | null,
  outline: OutlineEntry[],
  threads: ImportThread[] = [],
  options: { onPictures?: (pictures: PendingPicture[]) => void } = {},
): Promise<BinderNode[]> {
  const { user } = await requireSession();
  await assertCanImport(projectId, parentId);
  const existing = await listNodes(projectId);
  const index = indexNodes(existing);
  if (parentId && isTrashed(index, parentId)) throw new Error("That folder is in the trash.");

  const ids = outline.map(() => crypto.randomUUID());
  const live = existing.filter((n) => !isTrashed(index, n.id));
  const find = linkFinder(outline, ids, [...live.map((n): [string, string] => [n.title, n.id]), ...live.flatMap((n) => n.aliases.map((alias): [string, string] => [alias, n.id]))]);

  // Front matter fields become the project's properties for each kind of note that has them, typed from every value of the import.
  const defs = await importedPropertyDefs(projectId, outline);
  const picturesAt = new Map<string, string[]>();

  // New notes go after what's already there, in the order of the outline.
  const last = new Map<number | null, string | null>([[null, (index.children.get(parentId) ?? []).at(-1)?.position ?? null]]);
  const links: Array<typeof link.$inferInsert> = [];
  const rows = outline.map((entry, i): typeof node.$inferInsert => {
    const position = generateKeyBetween(last.get(entry.parent) ?? null, null);
    last.set(entry.parent, position);
    const base = {
      id: ids[i],
      projectId,
      parentId: entry.parent === null ? parentId : ids[entry.parent],
      kind: entry.kind,
      title: entry.title,
      tags: entry.tags,
      aliases: entry.aliases ?? [],
      ...(entry.synopsis && { synopsis: entry.synopsis }),
      position,
      createdById: user.id,
    };
    const kindDefs = entry.properties ? defs.get(entry.kind) : undefined;
    const properties = kindDefs
      ? Object.fromEntries(
          Object.entries(entry.properties!).flatMap(([source, raw]) => {
            const def = kindDefs.get(slugify(source) || "property");
            const value = def && propertyValue(def.type, raw, def.options, find);
            return def && value !== undefined ? [[def.key, value]] : [];
          }),
        )
      : {};
    if (Object.keys(properties).length) Object.assign(base, { properties });
    // A folder or chapter with no text of its own starts like any new one (the collab server seeds it).
    if (!entry.value.length) return base;
    const value = withIds(resolveLinks(entry.value, find));
    const pictures = new Set<string>();
    pendingIn(value, pictures);
    for (const path of pictures) picturesAt.set(path, [...(picturesAt.get(path) ?? []), ids[i]]);
    const indexed = indexDocument(value);
    indexed.links.forEach((l, ordinal) =>
      links.push({ projectId, sourceNodeId: ids[i], targetNodeId: l.targetNodeId, targetHeading: l.targetHeading, kind: l.kind, context: l.context, ordinal }),
    );
    return {
      ...base,
      settings: { imported: true },
      ydoc: valueToYdoc(value),
      text: indexed.text,
      wordCount: indexed.words,
      headings: indexed.headings,
      contentTags: indexed.tags,
    };
  });

  const inserted = await userDb(async (tx) => {
    const out = [];
    // Parents come before their children in the outline, so batches can go in order.
    for (let i = 0; i < rows.length; i += 50) out.push(...(await tx.insert(node).values(rows.slice(i, i + 50)).returning(binderColumns)));
    for (let i = 0; i < links.length; i += 200) await tx.insert(link).values(links.slice(i, i + 200));
    // Plot threads (a Plottr file's plotlines) and the scenes' cells in them.
    const cells = outline.flatMap((entry, i) => (entry.threads ?? []).map((cell) => ({ nodeId: ids[i], ...cell })));
    if (threads.length && cells.length) {
      const existing = await tx.select({ id: plotThread.id, name: plotThread.name, color: plotThread.color, position: plotThread.position }).from(plotThread).where(eq(plotThread.projectId, projectId));
      let last = existing.map((t) => t.position).sort().at(-1) ?? null;
      const used = existing.map((t) => t.color);
      const threadIds: string[] = [];
      for (const thread of threads) {
        const name = thread.name.trim().slice(0, 80) || "Thread";
        const same = existing.find((t) => t.name.toLowerCase() === name.toLowerCase());
        if (same) {
          threadIds.push(same.id);
          continue;
        }
        const color = thread.color && /^#[0-9a-f]{6}$/i.test(thread.color) ? thread.color : (swatches.find((c) => !used.includes(c)) ?? swatches[threadIds.length % swatches.length]);
        used.push(color);
        last = generateKeyBetween(last, null);
        const [row] = await tx.insert(plotThread).values({ projectId, name, color, position: last }).returning({ id: plotThread.id });
        threadIds.push(row.id);
      }
      const rows = cells.flatMap((cell) => (threadIds[cell.thread] ? [{ projectId, nodeId: cell.nodeId, threadId: threadIds[cell.thread], note: cell.note.slice(0, 4000) }] : []));
      for (let i = 0; i < rows.length; i += 200) await tx.insert(sceneThread).values(rows.slice(i, i + 200)).onConflictDoNothing();
    }
    if (defs.created.length) await tx.insert(propertyDef).values(defs.created).onConflictDoNothing();
    await tx.update(project).set({ updatedAt: new Date() }).where(eq(project.id, projectId));
    return out;
  });
  if (picturesAt.size) options.onPictures?.([...picturesAt].map(([path, nodeIds]) => ({ path, nodeIds })));
  return withActions(projectId, inserted, true);
}

type Def = { key: string; type: PropertyType; options: PropertyOptions };

/**
 * The property definitions the outline's front matter needs, by kind and key:
 * the project's own where it has one with that key (its type wins), and new
 * ones (in `created`, to insert with the notes) for the rest.
 */
async function importedPropertyDefs(projectId: string, outline: OutlineEntry[]): Promise<Map<string, Map<string, Def>> & { created: Array<typeof propertyDef.$inferInsert> }> {
  const out = Object.assign(new Map<string, Map<string, Def>>(), { created: [] as Array<typeof propertyDef.$inferInsert> });
  const kinds = [...new Set(outline.filter((entry) => entry.properties).map((entry) => entry.kind))];
  if (!kinds.length) return out;
  const existing = await userDb((tx) =>
    tx.select({ nodeKind: propertyDef.nodeKind, key: propertyDef.key, type: propertyDef.type, options: propertyDef.options, position: propertyDef.position }).from(propertyDef).where(eq(propertyDef.projectId, projectId)),
  );
  for (const kind of kinds) {
    const own = existing.filter((def) => def.nodeKind === kind);
    const byKey = new Map<string, Def>(own.map((def) => [def.key, def]));
    let position = own.map((def) => def.position).sort().at(-1) ?? null;
    for (const inferred of inferProperties(outline.filter((entry) => entry.kind === kind).map((entry) => entry.properties))) {
      if (byKey.has(inferred.key)) continue;
      position = generateKeyBetween(position, null);
      byKey.set(inferred.key, inferred);
      out.created.push({ projectId, nodeKind: kind, key: inferred.key, label: inferred.label, type: inferred.type, options: inferred.options, position });
    }
    out.set(kind, byKey);
  }
  return out;
}

