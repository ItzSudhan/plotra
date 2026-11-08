import "server-only";
import { schema } from "@plotra/db";
import { eq } from "drizzle-orm";
import { requestCache } from "./request-cache";
import { getNodeAccess, loadNodeAccess, type Action } from "./access";
import { userDb } from "./db";

const { node } = schema;

/** Everything about a node the binder and views need, without the document body. */
export const binderColumns = {
  id: node.id,
  parentId: node.parentId,
  kind: node.kind,
  title: node.title,
  aliases: node.aliases,
  position: node.position,
  status: node.status,
  entityTypeId: node.entityTypeId,
  canon: node.canon,
  revealReleaseId: node.revealReleaseId,
  revealChannel: node.revealChannel,
  layer: node.layer,
  synopsis: node.synopsis,
  tags: node.tags,
  contentTags: node.contentTags,
  properties: node.properties,
  settings: node.settings,
  headings: node.headings,
  wordCount: node.wordCount,
  updatedAt: node.updatedAt,
  deletedAt: node.deletedAt,
};

type NodeRow = Pick<typeof node.$inferSelect, keyof typeof binderColumns>;

/** A binder node plus what the current user may do with it. */
export type BinderNode = NodeRow & { actions: Action[] };

/** Attaches the user's actions, dropping rows they can't see. Pass `fresh` after creating nodes. */
export async function withActions(projectId: string, rows: NodeRow[], fresh = false): Promise<BinderNode[]> {
  const access = await (fresh ? loadNodeAccess : getNodeAccess)(projectId);
  return rows.flatMap((row) => {
    const a = access.get(row.id);
    return a ? [{ ...row, actions: [...a.actions] }] : [];
  });
}

/** Every node in the project the current user can see. */
export const listNodes = requestCache(async (projectId: string) =>
  withActions(
    projectId,
    (await userDb((tx) => tx.select(binderColumns).from(node).where(eq(node.projectId, projectId)))) as NodeRow[],
  ),
);
