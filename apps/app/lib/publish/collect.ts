import "server-only";
import { schema } from "@plotra/db";
import type { ProjectSettings, ProjectType } from "@plotra/db/schema";
import { inArray } from "drizzle-orm";
import { requireNodeAccess, requireProjectAccess } from "../access";
import { listNodes } from "../binder";
import { ydocToValue } from "../collab/ydoc";
import { requireSession } from "../data";
import { userDb } from "../db";
import type { BlockTags, DocNode } from "../doc-index";
import { bibliography, bibliographyTitle, DEFAULT_CITATION_STYLE, formatInText, runsToHtml, runsToText, sourceFromNode } from "../citations";
import { computeHorizon, releaseOrder, revealMap, type Horizon } from "../horizon";
import { getProjectLinks, listPropertyDefs, type PropertyDef } from "../knowledge-actions";
import { getStory, type StoryData } from "../story-actions";
import { flatten, indexNodes, type BinderNode, type NodeIndex } from "../tree";
import { getWorld, type EntityTypeRow, type ReleaseRow } from "../world-actions";
import { NEVER } from "../world";

// Gathers what an export needs (plan.md 2.8 "Publishing outputs"), as the
// person exporting sees it: only notes they can read, filtered by the spoiler
// horizon and canon status they chose.

const { node } = schema;

export type PublishOptions = {
  /** Export only this folder (and what's inside). */
  rootId?: string | null;
  /** Leave out what the audience doesn't know yet at this release. */
  horizonId?: string | null;
  /** Leave out notes and passages that aren't canon. */
  canonOnly?: boolean;
};

export type Collected = {
  project: { id: string; title: string; description: string | null; type: ProjectType; settings: ProjectSettings };
  author: string;
  index: NodeIndex;
  root: BinderNode | undefined;
  /** Live notes in reading order, under the root if one was chosen. Not yet filtered by `includes`. */
  ordered: BinderNode[];
  entityTypes: EntityTypeRow[];
  propertyDefs: PropertyDef[];
  releases: ReleaseRow[];
  /** The release the export is "as of", when a horizon was chosen. */
  asOf: ReleaseRow | undefined;
  story: StoryData;
  links: Array<{ source: string; target: string; kind: string }>;
  /** Whether a note passes the horizon and canon filters. */
  includes: (n: BinderNode) => boolean;
  /** Whether some release reveals the note (always true for projects that don't track releases). */
  revealed: (n: BinderNode) => boolean;
  /** Whether a block with these tags passes them. */
  showBlock: (tags: BlockTags | null) => boolean;
  /** Loads the documents of these notes (as last synced). */
  bodies: (ids: string[]) => Promise<Map<string, DocNode[]>>;
  /** The in-text form of a citation, in the project's style. Remembers what was cited. */
  cite: (nodeId: string, locator?: string) => string;
  /** The reference list of everything cited so far, as HTML paragraphs with its heading; empty when nothing was. */
  references: () => { heading: string; html: string } | null;
};

export async function collect(projectId: string, options: PublishOptions = {}): Promise<Collected> {
  const { user } = await requireSession();
  const { project: found } = await requireProjectAccess(projectId);
  if (options.rootId) await requireNodeAccess(projectId, options.rootId);

  const [nodes, world, propertyDefs, story, links] = await Promise.all([
    listNodes(projectId),
    getWorld(projectId),
    listPropertyDefs(projectId),
    getStory(projectId),
    getProjectLinks(projectId),
  ]);
  const index = indexNodes(nodes);
  const root = options.rootId ? index.byId.get(options.rootId) : undefined;
  const ordered = root ? [root, ...flatten(index, root.id)] : flatten(index);

  const horizon: Horizon | null = options.horizonId ? computeHorizon(nodes, world.releases, options.horizonId) : null;
  if (options.horizonId && !horizon) throw new Error("That release no longer exists.");
  // With releases defined, "revealed" means some release reveals it; with none, the project doesn't track reveals.
  const tracked = world.releases.length > 0;
  const revealedBy = revealMap(nodes, world.releases);
  const order = releaseOrder(world.releases);

  const style = found.settings.citationStyle ?? DEFAULT_CITATION_STYLE;
  const cited = new Set<string>();
  const sourceOf = (id: string) => {
    const source = index.byId.get(id);
    return source && !source.deletedAt ? sourceFromNode(source) : null;
  };

  return {
    project: { id: found.id, title: found.title, description: found.description, type: found.type, settings: found.settings },
    author: user.name,
    index,
    root,
    ordered,
    entityTypes: world.entityTypes,
    propertyDefs,
    releases: world.releases,
    asOf: options.horizonId ? world.releases.find((r) => r.id === options.horizonId) : undefined,
    story,
    links,
    includes: (n) => {
      if (options.canonOnly && n.canon !== "canon") return false;
      if (horizon) return horizon.knows(n.id);
      return true;
    },
    showBlock: (tags) => {
      if (!tags) return true;
      if (options.canonOnly && tags.canon && tags.canon !== "canon") return false;
      if (tags.reveal === NEVER) return false;
      if (horizon) return horizon.knowsBlock(tags.reveal);
      // No horizon: a passage tagged for a release that no longer exists stays out, to be safe.
      return !tags.reveal || order.has(tags.reveal);
    },
    bodies: async (ids) => {
      const out = new Map<string, DocNode[]>();
      // In batches: a long manuscript is hundreds of documents.
      for (let i = 0; i < ids.length; i += 100) {
        const rows = await userDb((tx) =>
          tx
            .select({ id: node.id, ydoc: node.ydoc, content: node.content })
            .from(node)
            .where(inArray(node.id, ids.slice(i, i + 100))),
        );
        for (const row of rows) {
          out.set(row.id, row.ydoc?.length ? ydocToValue(row.ydoc) : Array.isArray(row.content) ? (row.content as DocNode[]) : []);
        }
      }
      return out;
    },
    revealed: (n) => !tracked || revealedBy.has(n.id),
    cite: (nodeId, locator) => {
      const source = sourceOf(nodeId);
      if (!source) return "";
      cited.add(nodeId);
      return runsToText(formatInText(source, style, { locator }));
    },
    references: () => {
      const sources = [...cited].map(sourceOf).filter((s) => s !== null);
      if (!sources.length) return null;
      return { heading: bibliographyTitle[style], html: bibliography(sources, style).map((entry) => `<p class="reference">${runsToHtml(entry.runs)}</p>`).join("\n") };
    },
  };
}
