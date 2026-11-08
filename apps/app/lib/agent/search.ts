import "server-only";
import { schema } from "@plotra/db";
import { nodeSearchVector, type NodeKind } from "@plotra/db/schema";
import { sql } from "drizzle-orm";
import { requireProjectAccess } from "../access";
import { listNodes } from "../binder";
import { userDb } from "../db";
import { readOnly } from "../request-cache";
import { indexNodes, isTrashed } from "../tree";
import { HIT_END, HIT_START } from "./types";

// Project search (plan.md Phase 9a): Postgres full-text over titles, synopses
// and document text. It is the agent's main way to find things, and people get
// search out of it too (the command palette's "Search project").
//
// The query runs as the signed-in user under row-level security, and uses the
// same expression as the GIN index (`nodeSearchVector`).
//
// A caveat, measured against the dev database: as the owner role this query
// uses `node_search_idx`, but under row-level security it does not. Postgres
// only lets leakproof operators run ahead of a policy's check, and `@@` isn't
// one, so as `plotra_app` it reads the project's notes through
// `node_project_id_idx` and matches each of them. That is correct and fine for
// a project of a few hundred notes; a very large project would want a
// SECURITY DEFINER search function that does the membership check itself
// (a migration), so the index can be used.

const { node } = schema;

const HEADLINE = `StartSel=${HIT_START}, StopSel=${HIT_END}, MaxWords=26, MinWords=10, MaxFragments=2, FragmentDelimiter=" … "`;

const MAX_QUERY = 200;
const MAX_LIMIT = 50;

export type SearchHit = {
  id: string;
  title: string;
  kind: NodeKind;
  /** A passage around the match, with the matched words between HIT_START and HIT_END. */
  snippet: string;
  /** Higher is a better match; 0 for a hit on part of a title only. */
  rank: number;
};

type Row = { id: string; title: string; kind: NodeKind; snippet: string | null; rank: number | string };

/**
 * Notes matching `query`, best first. Web-search syntax: words are ANDed,
 * "quoted phrases" stay together, `or` and a leading `-` work. Trashed notes
 * (and what is inside a trashed folder) are left out.
 *
 * The caller has already checked that the user may read the project.
 */
export async function searchNodes(projectId: string, rawQuery: string, limit = 20): Promise<SearchHit[]> {
  const query = rawQuery.trim().slice(0, MAX_QUERY);
  if (!query) return [];
  const wanted = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);
  // A few spare rows, for hits that turn out to sit inside a trashed folder.
  const fetched = wanted + 10;
  const vector = nodeSearchVector(node);
  const tsquery = sql`websearch_to_tsquery('english', ${query})`;
  // Full-text search matches whole words. People also type the start of a
  // name ("Mar" for Mara), so titles and aliases are matched as plain text too.
  const like = `%${query.replace(/[%_\\]/g, "\\$&")}%`;

  // Two queries rather than one with an OR: the full-text one stays in the shape the GIN index
  // serves, and the plain-text one only looks at titles, never at the documents.
  const [matched, named] = await userDb((tx) =>
    Promise.all([
      tx.execute<Row>(sql`
        select hit.id, hit.title, hit.kind, hit.rank, ts_headline('english', hit.body, ${tsquery}, ${HEADLINE}) as snippet
        from (
          select ${node.id} as id, ${node.title} as title, ${node.kind} as kind, ${node.updatedAt} as updated_at,
            coalesce(nullif(${node.text}, ''), ${node.synopsis}, '') as body,
            ts_rank(${vector}, ${tsquery}) as rank
          from ${node}
          where ${node.projectId} = ${projectId} and ${node.deletedAt} is null and ${vector} @@ ${tsquery}
          order by rank desc, ${node.updatedAt} desc
          limit ${fetched}
        ) hit
        order by hit.rank desc, hit.updated_at desc`),
      tx.execute<Row>(sql`
        select ${node.id} as id, ${node.title} as title, ${node.kind} as kind, 0 as rank,
          left(coalesce(nullif(${node.text}, ''), ${node.synopsis}, ''), 200) as snippet
        from ${node}
        where ${node.projectId} = ${projectId} and ${node.deletedAt} is null
          and (${node.title} ilike ${like} or array_to_string(${node.aliases}, ' ') ilike ${like})
        order by ${node.updatedAt} desc
        limit ${fetched}`),
    ]),
  );
  // Full-text matches first, best first; then notes only matched by part of their name.
  const seen = new Set(matched.rows.map((row) => row.id));
  const rows = [...matched.rows, ...named.rows.filter((row) => !seen.has(row.id))];

  // A note inside a trashed folder isn't marked itself: the binder tells.
  const index = indexNodes(await listNodes(projectId));
  return rows
    .filter((row) => index.byId.has(row.id) && !isTrashed(index, row.id))
    .slice(0, wanted)
    .map((row) => ({ id: row.id, title: row.title, kind: row.kind, snippet: (row.snippet ?? "").replace(/\s+/g, " ").trim(), rank: Number(row.rank) }));
}

/** Project search for the workspace (lib/reads.ts): checks access itself, like any read. */
export async function searchProject(projectId: string, query: string): Promise<SearchHit[]> {
  return readOnly(async () => {
    await requireProjectAccess(projectId);
    if (typeof query !== "string") return [];
    return searchNodes(projectId, query, 30);
  });
}

/** A snippet without its highlight marks, for the model. */
export const plainSnippet = (snippet: string) => snippet.replaceAll(HIT_START, "").replaceAll(HIT_END, "");
