import "server-only";
import { schema } from "@plotra/db";
import type { NodeKind, ProjectSettings } from "@plotra/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { valueToYdoc, ydocToValue } from "./collab/ydoc";
import { userDb } from "./db";
import { indexDocument, type DocNode } from "./doc-index";
import { rejectSuggestions } from "./io/model";
import { isDocumentKind } from "./story";

// Note templates of a project's own (beat-the-competitors.md, part 2, item 9):
// a note its managers chose as the template for its kind
// (`settings.noteTemplates`, by kind), whose text and fields every new note of
// that kind starts with. Copied on the server when the note is made, so the
// new note's document exists before anyone opens it: the browser doesn't seed
// one of its own (components/workspace/workspace-provider.tsx `create`), and
// nothing has to be merged.

const { node } = schema;

/** A copy carries its own blocks: no block ids (the editor gives new ones), no pending suggestions, no comment marks. */
function fresh(value: DocNode[]): DocNode[] {
  const strip = (n: DocNode): DocNode => {
    const out: DocNode = {};
    for (const [key, v] of Object.entries(n)) {
      if (key === "id" || key === "children" || key.startsWith("comment") || key.startsWith("suggestion")) continue;
      out[key] = v;
    }
    if (n.children) out.children = n.children.map(strip);
    return out;
  };
  return rejectSuggestions(value).map(strip);
}

/** What a new note of `kind` starts with in this project: its template's text, fields and tags; null when it has none. */
export async function fromTemplate(projectId: string, settings: ProjectSettings, kind: NodeKind) {
  const templateId = settings.noteTemplates?.[kind];
  if (!templateId || !isDocumentKind(kind) || kind === "folder") return null;
  const [row] = await userDb((tx) =>
    tx
      .select({ ydoc: node.ydoc, content: node.content, kind: node.kind, properties: node.properties, tags: node.tags })
      .from(node)
      .where(and(eq(node.id, templateId), eq(node.projectId, projectId), isNull(node.deletedAt)))
      .limit(1),
  );
  if (!row || row.kind !== kind) return null;
  let value: DocNode[];
  try {
    value = row.ydoc?.length ? ydocToValue(row.ydoc) : Array.isArray(row.content) ? (row.content as DocNode[]) : [];
  } catch {
    return null;
  }
  const body = fresh(value);
  if (!body.length) return null;
  const indexed = indexDocument(body);
  return {
    ydoc: valueToYdoc(body),
    text: indexed.text,
    wordCount: indexed.words,
    headings: indexed.headings,
    contentTags: indexed.tags,
    properties: row.properties,
    tags: row.tags,
  };
}
