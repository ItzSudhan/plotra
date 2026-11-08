import "server-only";
import { db, schema } from "@plotra/db";
import type { EntityField, NodeKind, PropertyType, PropertyValue, ScriptFormat } from "@plotra/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { cache } from "react";
import { DEFAULT_CITATION_STYLE, formatInText, isCitationStyle, sourceFromNode, yearSuffixes, type CitationStyle, type Source } from "./citations";
import { ydocToValue } from "./collab/ydoc";
import type { DocNode } from "./doc-index";
import { nodeFormat } from "./modules";
import {
  audienceOf,
  audienceRows,
  everyone,
  type Audience,
  boardKinds,
  buildTree,
  hasCitations,
  isNodeId,
  isShareToken,
  liveRows,
  prepareValue,
  publicFilePath,
  publicPath,
  type PublicRow,
  type PublicTreeNode,
} from "./public-link";
import { r2Get } from "./r2";
import { checkRateLimit, clientIp } from "./rate-limit";
import { nodeKindMeta } from "./tree";
import { computeHorizon, type Horizon } from "./horizon";
import { filterBlocks } from "./io/model";
import { NEVER } from "./world";

// The read-only link (plan.md 2.9): everything the public reader at /p/<token>
// loads. Its reader has no account, so nothing here goes through `userDb` or
// row-level security: it uses the server's own connection, and the check is
// made here instead. Every query below is for the project the token resolved
// to; an id from the URL is only ever used together with that project's id.
//
// What a reader sees: the whole project as its members see it, minus the
// trash. There is no per-link choice of what to show (that would need a
// column), and the Share dialog says so.
//
// Nothing here writes, and nothing here is a server action.

const { attachment, entityType, node, project, propertyDef, release, shareLink } = schema;

/** Pages and images together, per address: far more than a person reads, far less than a scraper wants. */
const LIMIT = { limit: 300, windowSeconds: 60 };

export type PublicLink = {
  status: "ok";
  token: string;
  projectId: string;
  title: string;
  description: string | null;
  citationStyle: CitationStyle;
  /** The owner lets readers copy the project (lib/public-copy.ts). */
  allowCopy: boolean;
  /** The release the link shows the project as of, for "As of Session 5"; null when it shows everything. */
  asOf: { id: string; title: string } | null;
  canonOnly: boolean;
  /** What the link's audience may read (lib/public-link.ts `audienceOf`). */
  audience: Audience;
  /** Every note outside the trash. */
  rows: PublicRow[];
  byId: Map<string, PublicRow>;
  tree: PublicTreeNode[];
};

export type OpenedLink = PublicLink | { status: "missing" } | { status: "limited"; retryAfterSeconds: number };

/**
 * Resolves a token from the URL to its project. An unknown token and a link
 * that is switched off are the same answer, from the same query, so nobody
 * can tell a dead link from one that never existed. Memoized for the request,
 * so the layout, the page and its metadata count as one read.
 */
export const openPublicLink = cache(async (token: string): Promise<OpenedLink> => {
  if (!isShareToken(token)) return { status: "missing" };
  const { ok, retryAfterSeconds } = await checkRateLimit("public-read", await clientIp(), LIMIT);
  if (!ok) return { status: "limited", retryAfterSeconds };

  const [found] = await db
    .select({
      projectId: project.id,
      title: project.title,
      description: project.description,
      settings: project.settings,
      allowCopy: shareLink.allowCopy,
      horizonReleaseId: shareLink.horizonReleaseId,
      canonOnly: shareLink.canonOnly,
    })
    .from(shareLink)
    .innerJoin(project, eq(project.id, shareLink.projectId))
    .where(
      and(
        eq(shareLink.token, token),
        eq(shareLink.enabled, true),
        isNull(shareLink.blockedAt),
        // One of the project's links taken down after a report takes down every one of them.
        sql`not exists (select 1 from share_link taken where taken.project_id = ${shareLink.projectId} and taken.blocked_at is not null)`,
      ),
    )
    .limit(1);
  if (!found) return { status: "missing" };

  const all = await db
    .select({
      id: node.id,
      parentId: node.parentId,
      kind: node.kind,
      title: node.title,
      position: node.position,
      entityTypeId: node.entityTypeId,
      deletedAt: node.deletedAt,
      revealReleaseId: node.revealReleaseId,
      canon: node.canon,
    })
    .from(node)
    .where(eq(node.projectId, found.projectId));
  const live = liveRows(all);

  // A link for an audience that mustn't see what comes later: the project as of its release, and maybe only canon.
  let asOf: PublicLink["asOf"] = null;
  let horizon: Horizon | null = null;
  if (found.horizonReleaseId) {
    const releases = await db.select({ id: release.id, title: release.title, position: release.position, nodeId: release.nodeId }).from(release).where(eq(release.projectId, found.projectId));
    horizon = computeHorizon(live, releases, found.horizonReleaseId);
    const shownAs = releases.find((r) => r.id === found.horizonReleaseId);
    if (shownAs) asOf = { id: shownAs.id, title: shownAs.title };
  }
  const audience = horizon || found.canonOnly ? audienceOf(horizon, found.canonOnly, NEVER) : everyone;
  const rows = audience === everyone ? live : audienceRows(live, audience);

  return {
    status: "ok",
    token,
    projectId: found.projectId,
    title: found.title,
    description: found.description,
    citationStyle: isCitationStyle(found.settings.citationStyle) ? found.settings.citationStyle : DEFAULT_CITATION_STYLE,
    allowCopy: found.allowCopy,
    asOf,
    canonOnly: found.canonOnly,
    audience,
    rows,
    byId: new Map(rows.map((r) => [r.id, r])),
    tree: buildTree(rows),
  };
});

export type PublicProperty = {
  label: string;
  /** Plain text, or for a property that points at notes, the ones a reader can open. */
  text?: string;
  links?: Array<{ href: string; title: string }>;
  url?: string;
};

export type PublicNote = {
  id: string;
  kind: NodeKind;
  /** "Character", "Scene", or the name of a custom world-bible type. */
  kindLabel: string;
  title: string;
  synopsis: string | null;
  tags: string[];
  properties: PublicProperty[];
  /** A canvas, timeline or dialogue: shown as a placeholder. */
  board: boolean;
  format: ScriptFormat;
  value: DocNode[];
  /** What the note holds in the binder, for folders and chapters. */
  children: Array<{ id: string; kind: NodeKind; title: string }>;
};

type Field = { key: string; label: string; type: PropertyType };

const safeUrl = (value: unknown) => (typeof value === "string" && /^https?:\/\//i.test(value.trim()) ? value.trim() : null);

function property(def: Field, value: PropertyValue | undefined, link: PublicLink): PublicProperty | null {
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) return null;
  if (def.type === "checkbox") return { label: def.label, text: value ? "Yes" : "No" };
  if (def.type === "node") {
    // Notes in the trash, or in another project, leave no trace: not even a name.
    const links = (Array.isArray(value) ? value : [String(value)]).flatMap((id) => {
      const target = link.byId.get(id);
      return target ? [{ href: publicPath(link.token, target.id), title: target.title }] : [];
    });
    return links.length ? { label: def.label, links } : null;
  }
  if (def.type === "url") {
    const url = safeUrl(value);
    return url ? { label: def.label, url } : null;
  }
  return { label: def.label, text: Array.isArray(value) ? value.join(", ") : String(value) };
}

/** The project's sources, for writing out citations. Only loaded for a note that cites something. */
async function loadSources(link: PublicLink) {
  const rows = await db
    .select({ id: node.id, title: node.title, properties: node.properties })
    .from(node)
    .where(and(eq(node.projectId, link.projectId), eq(node.kind, "research")));
  const sources = rows.filter((r) => link.byId.has(r.id)).map(sourceFromNode);
  return { byId: new Map<string, Source>(sources.map((s) => [s.id, s])), suffixes: yearSuffixes(sources) };
}

/**
 * One note of the linked project, ready to render. Null when the id isn't a
 * live note of that project: someone else's note, a trashed one and a made-up
 * id all look the same to the reader.
 */
export async function loadPublicNote(link: PublicLink, nodeId: string): Promise<PublicNote | null> {
  if (!isNodeId(nodeId)) return null;
  const row = link.byId.get(nodeId);
  if (!row) return null;
  // A note shown only because something the audience knows is inside it: its title and what it holds, nothing of its own.
  const withheld = !link.audience.knows(row);
  const board = boardKinds.includes(row.kind);

  const [found] = await db
    .select({
      synopsis: node.synopsis,
      tags: node.tags,
      properties: node.properties,
      settings: node.settings,
      // A board's Yjs doc is cards and edges, not text: it is never read here.
      ...(board ? {} : { ydoc: node.ydoc, content: node.content }),
    })
    .from(node)
    .where(and(eq(node.id, row.id), eq(node.projectId, link.projectId)))
    .limit(1);
  if (!found) return null;

  // The properties a member sees on the note: the custom type's fields for a
  // world-bible page, the project's template for every other kind.
  let fields: Field[] = [];
  let kindLabel = nodeKindMeta[row.kind].label;
  if (row.kind === "entity") {
    const [type] = row.entityTypeId
      ? await db
          .select({ name: entityType.name, schema: entityType.schema })
          .from(entityType)
          .where(and(eq(entityType.id, row.entityTypeId), eq(entityType.projectId, link.projectId)))
          .limit(1)
      : [];
    if (type) {
      kindLabel = type.name;
      fields = (type.schema as EntityField[]).map((f) => ({ key: f.key, label: f.label, type: f.type }));
    }
  } else {
    const defs = await db
      .select({ key: propertyDef.key, label: propertyDef.label, type: propertyDef.type, position: propertyDef.position })
      .from(propertyDef)
      .where(and(eq(propertyDef.projectId, link.projectId), eq(propertyDef.nodeKind, row.kind)));
    fields = defs.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
  }
  const properties = withheld ? [] : fields.flatMap((def) => property(def, found.properties[def.key], link) ?? []);

  let stored: DocNode[] = [];
  if (!board && !withheld) {
    const { ydoc, content } = found as { ydoc?: Uint8Array | null; content?: unknown };
    try {
      stored = ydoc?.length ? ydocToValue(ydoc) : Array.isArray(content) ? (content as DocNode[]) : [];
    } catch {
      // A snapshot that can't be read shows as an empty note rather than an error page.
      stored = [];
    }
    // Passages tagged for a later release, or "never", or not canon on a canon-only link, aren't the audience's.
    if (link.audience !== everyone) stored = filterBlocks(stored, link.audience.showBlock);
  }
  const sources = hasCitations(stored) ? await loadSources(link) : null;
  const value = prepareValue(stored, {
    linkFor: (id) => {
      const target = link.byId.get(id);
      return target ? { href: publicPath(link.token, target.id), title: target.title } : null;
    },
    cite: (id, locator) => {
      const source = sources?.byId.get(id);
      if (!source) return null;
      return formatInText(source, link.citationStyle, { locator, suffix: sources?.suffixes.get(id) }).map((run) =>
        run.italic ? { text: run.text, italic: true } : { text: run.text },
      );
    },
    fileHref: (fileId) => publicFilePath(link.token, fileId),
  });

  const findChildren = (nodes: PublicTreeNode[]): PublicTreeNode[] | null => {
    for (const n of nodes) {
      if (n.id === row.id) return n.children;
      const inside = findChildren(n.children);
      if (inside) return inside;
    }
    return null;
  };

  return {
    id: row.id,
    kind: row.kind,
    kindLabel,
    title: row.title,
    synopsis: withheld ? null : found.synopsis,
    tags: withheld ? [] : found.tags,
    properties,
    board,
    format: nodeFormat(found.settings),
    value,
    children: (findChildren(link.tree) ?? []).map((c) => ({ id: c.id, kind: c.kind, title: c.title })),
  };
}

/** Image types served in place, as /api/files does: never SVG, which can carry script. */
const imageTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

/**
 * An image stored in the linked project, for notes that show one. Only
 * images, and only ones attached to a note outside the trash; other files
 * (PDFs, clippings) are not part of what the link shows.
 */
export async function loadPublicImage(link: PublicLink, fileId: string): Promise<{ contentType: string; bytes: Uint8Array } | null> {
  if (!isNodeId(fileId)) return null;
  const [row] = await db
    .select({ nodeId: attachment.nodeId, contentType: attachment.contentType, r2Key: attachment.r2Key })
    .from(attachment)
    .where(and(eq(attachment.id, fileId), eq(attachment.projectId, link.projectId)))
    .limit(1);
  if (!row || !link.byId.has(row.nodeId) || !imageTypes.has(row.contentType)) return null;
  if (row.r2Key) return { contentType: row.contentType, bytes: await r2Get(row.r2Key) };
  const [inline] = await db
    .select({ data: attachment.data })
    .from(attachment)
    .where(and(eq(attachment.id, fileId), eq(attachment.projectId, link.projectId)))
    .limit(1);
  return inline?.data ? { contentType: row.contentType, bytes: inline.data } : null;
}
