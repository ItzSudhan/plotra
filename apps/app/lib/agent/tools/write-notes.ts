import "server-only";
import { schema } from "@plotra/db";
import { nodeKinds, type NodeKind } from "@plotra/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { createNode, updateNode } from "../../binder-actions";
import { userDb } from "../../db";
import { transaction } from "../../request-cache";
import { isDocumentKind } from "../../story";
import { lastPosition, positionAfter } from "../../tree";
import { createCommentThread } from "../../workflow-actions";
import { getWorld } from "../../world-actions";
import { recordChange } from "../changes";
import { documentLines, renderLine } from "../documents";
import { applyEdits, newBlockId, replaceAll, type BlockEdit, type EditOptions, type EditResult, type SuggestionStamp } from "../edits";
import { agentAuthor, editDocument, showPresence } from "../write";
import { cap, defineTool, loadProject, mention, noteRef, requireLive, type Project, type ToolContext, type ToolFactory } from "./context";
import { plural } from "../../plural";

// Writing what notes say (plan.md 2.11 "How it edits"). Text is addressed by
// block id, the ids readNote shows. In Suggest mode an edit to a note that
// already existed arrives as a suggestion (tracked changes the writer accepts
// or rejects); a note the run itself created is simply written, since there is
// nothing of the writer's in it to protect.

const { agentChange, comment } = schema;

const MAX_TEXT = 60_000;
const MAX_EDITS = 60;
const SHOWN = 4000;

// Branching dialogues are built in their own editor; everything else the agent can start.
const writableKinds = nodeKinds.filter((kind) => kind !== "dialogue") as [NodeKind, ...NodeKind[]];

/** Whether this run made the note: its text is then written directly, whatever the mode. */
async function createdByRun(context: ToolContext, nodeId: string): Promise<boolean> {
  const [row] = await userDb((tx) =>
    tx.select({ id: agentChange.id }).from(agentChange).where(and(eq(agentChange.runId, context.runId), eq(agentChange.nodeId, nodeId), eq(agentChange.action, "create"))).limit(1),
  );
  return Boolean(row);
}

/** Titles and aliases to note ids, for the `[[links]]` in what the agent writes. */
function linkResolver(project: Project): EditOptions["resolveLink"] {
  const byName = new Map<string, string>();
  for (const node of project.nodes) {
    if (!project.live(node.id)) continue;
    for (const name of [node.title, ...(node.aliases ?? [])]) {
      const key = name.trim().toLowerCase();
      if (key && !byName.has(key)) byName.set(key, node.id);
    }
  }
  return (title) => byName.get(title.trim().toLowerCase()) ?? null;
}

async function stampFor(context: ToolContext, nodeId: string): Promise<SuggestionStamp | null> {
  if (context.mode !== "suggest" || (await createdByRun(context, nodeId))) return null;
  return { id: newBlockId(), userId: agentAuthor(context.userId), createdAt: Date.now() };
}

/** Applies a change to a note's text and says what happened in words the model can use. */
async function write(context: ToolContext, project: Project, nodeId: string, change: (options: EditOptions) => (doc: Parameters<typeof applyEdits>[0]) => EditResult) {
  const found = requireLive(project, nodeId);
  if (!isDocumentKind(found.kind)) throw new Error(`"${found.title}" is a ${found.kind}, not a text document. Its contents are changed with the tools for that kind of board.`);
  const suggest = await stampFor(context, nodeId);
  const resolveLink = linkResolver(project);
  const edited = await editDocument(context, nodeId, (doc, defaults) => change({ suggest, resolveLink, ...defaults })(doc));
  const touched = new Set(edited.touched);
  const lines = documentLines(edited.value, project.title).filter((line) => line.id && touched.has(line.id)).map(renderLine);
  const how = suggest
    ? "Written as suggestions: the writer sees them as tracked changes and accepts or rejects them. Until then the note's text is unchanged, and reading it again shows the old text."
    : "Applied.";
  const problems = edited.problems.length ? `\nNot applied:\n${edited.problems.map((p) => `- ${p}`).join("\n")}` : "";
  if (!edited.touched.length) return { text: `Nothing was changed in ${noteRef(found)}.${problems}`, notes: [mention(found)] };
  const shown = suggest ? "" : `\nThe blocks as they are now:\n${cap(lines.join("\n"), SHOWN, "read the note for the rest.")}`;
  return { text: `${how} ${edited.touched.length} ${plural(edited.touched.length, "block")} of ${noteRef(found)}.${shown}${problems}`, notes: [mention(found)] };
}

const editSchema = z.object({
  op: z.enum(["replace", "insert", "delete"]).describe("replace: rewrite one block. insert: add new blocks. delete: remove one block."),
  blockId: z.string().optional().describe("For replace and delete: the id of the block, as readNote shows it in [brackets]."),
  after: z.string().optional().describe("For insert: the id of the block to insert after, or `start` or `end` of the note."),
  text: z
    .string()
    .max(MAX_TEXT)
    .optional()
    .describe("For replace and insert: the text, one block per line, without block ids. Markdown marks work: `## ` heading, `- ` list item, `> ` quote, **bold**, *italic*, [[Note title]] links."),
});

export const noteWriteTools: ToolFactory = (context) => {
  const { projectId } = context;
  return {
    editNote: defineTool({
      access: "write",
      description:
        "Changes parts of a note's text by block id: rewrite a block, insert blocks after one, or delete one. Read the note first (readNote) to get the ids. Use this for anything smaller than rewriting the whole note: it leaves the rest untouched.",
      inputSchema: z.object({
        nodeId: z.string().describe("The note's id."),
        edits: z.array(editSchema).min(1).max(MAX_EDITS).describe("The edits, applied in order."),
      }),
      run: async ({ nodeId, edits }) => {
        const project = await loadProject(projectId);
        const parsed: BlockEdit[] = edits.map((edit) => {
          if (edit.op === "delete") {
            if (!edit.blockId) throw new Error("A delete needs the blockId to remove.");
            return { op: "delete", blockId: edit.blockId };
          }
          if (!edit.text?.trim()) throw new Error(`A ${edit.op} needs text.`);
          if (edit.op === "replace") {
            if (!edit.blockId) throw new Error("A replace needs the blockId to rewrite.");
            return { op: "replace", blockId: edit.blockId, text: edit.text };
          }
          return { op: "insert", after: edit.after?.trim() || "end", text: edit.text };
        });
        return write(context, project, nodeId, (options) => (doc) => applyEdits(doc, parsed, options));
      },
    }),

    writeNote: defineTool({
      access: "write",
      description:
        "Writes a note's text: `append` adds to the end (drafting a scene, continuing one), `replace` rewrites the whole note. One block per line; Markdown marks work (`## ` heading, `- ` list item, **bold**, *italic*, [[Note title]] links). For a change to part of a note, use editNote instead.",
      inputSchema: z.object({
        nodeId: z.string().describe("The note's id."),
        text: z.string().min(1).max(MAX_TEXT).describe("The text to write, one block (paragraph, heading, line of dialogue) per line."),
        how: z.enum(["append", "replace"]).describe("append: add after what is there. replace: the note says only this afterwards."),
      }),
      run: async ({ nodeId, text, how }) => {
        const project = await loadProject(projectId);
        return write(context, project, nodeId, (options) => (doc) => (how === "replace" ? replaceAll(doc, text, options) : applyEdits(doc, [{ op: "insert", after: "end", text }], options)));
      },
    }),

    createNote: defineTool({
      access: "write",
      // Two transactions: the note has to exist for everyone before the collab server can be asked for its document.
      scoped: false,
      description:
        "Creates a note in the binder: a folder, chapter, scene, character, location, research note, plain note, a world-bible entry (`entity`, with the name of its type), a canvas or a timeline. Pass `text` to write its body in the same step. Returns the new note's id.",
      inputSchema: z.object({
        kind: z.enum(writableKinds).describe("What kind of note."),
        title: z.string().min(1).max(200),
        parentId: z.string().optional().describe("The folder or chapter to put it in. Leave out for the top level."),
        afterId: z.string().optional().describe("Put it directly after this sibling. Leave out to put it last."),
        synopsis: z.string().max(2000).optional().describe("One or two sentences on what it is or what happens in it."),
        entityType: z.string().optional().describe("For kind `entity`: the name of the world-bible type (Faction, Object, Species… see listEntities)."),
        text: z.string().max(MAX_TEXT).optional().describe("The body, one block per line. Not for canvases and timelines."),
      }),
      run: async ({ kind, title, parentId, afterId, synopsis, entityType, text }) => {
        const created = await transaction(async () => {
          const project = await loadProject(projectId);
          const parent = parentId ? requireLive(project, parentId) : null;
          const after = afterId ? requireLive(project, afterId) : null;
          if (after && after.parentId !== (parent?.id ?? null)) throw new Error("`afterId` has to be a note in the same folder as the new one.");
          let entityTypeId: string | null = null;
          if (kind === "entity") {
            const wanted = entityType?.trim().toLowerCase();
            const types = (await getWorld(projectId)).entityTypes;
            const type = types.find((t) => t.name.toLowerCase() === wanted || t.plural.toLowerCase() === wanted);
            if (!type) throw new Error(`An entity needs one of the project's types: ${types.map((t) => t.name).join(", ") || "(none yet)"}.`);
            entityTypeId = type.id;
          }
          const row = await createNode(projectId, {
            parentId: parent?.id ?? null,
            kind,
            title,
            position: after ? positionAfter(project.index, after.id) : lastPosition(project.index, parent?.id ?? null),
            entityTypeId,
          });
          if (synopsis?.trim()) await updateNode(projectId, row.id, { synopsis });
          await recordChange(context, { action: "create", nodeId: row.id, summary: `Created the ${kind} ${row.title}` });
          return row;
        });
        void showPresence(context, created.id);
        let wrote = "";
        if (text?.trim() && isDocumentKind(kind)) {
          try {
            await transaction(async () => {
              const project = await loadProject(projectId);
              await editDocument(context, created.id, (doc, defaults) => replaceAll(doc, text, { suggest: null, resolveLink: linkResolver(project), ...defaults }));
            });
            wrote = " Its text is written.";
          } catch (error) {
            wrote = ` Its text was NOT written (${error instanceof Error ? error.message : "an error"}): write it with writeNote.`;
          }
        }
        return { text: `Created ${noteRef(created)} [${kind}].${wrote}`, notes: [mention(created)] };
      },
    }),

    commentOnNote: defineTool({
      access: "write",
      description:
        "Leaves a comment on a note, the way an editor would: on a passage (quote the words it is about) or on the note as a whole. Use it for remarks and questions the writer should decide on, rather than changing the text.",
      inputSchema: z.object({
        nodeId: z.string().describe("The note's id."),
        body: z.string().min(1).max(4000).describe("The comment."),
        quote: z.string().max(400).optional().describe("The exact words of the passage the comment is about. Leave out for a comment on the whole note."),
      }),
      run: async ({ nodeId, body, quote }) => {
        const project = await loadProject(projectId);
        const found = requireLive(project, nodeId);
        // Comments are stored under the person's name; the prefix says who actually wrote it.
        const thread = await createCommentThread(projectId, nodeId, { anchor: null, quote: quote?.trim() || null, body: `AI: ${body}` });
        const [first] = await userDb((tx) => tx.select({ id: comment.id }).from(comment).where(eq(comment.threadId, thread.id)).limit(1));
        await recordChange(context, { action: "comment", nodeId, before: { commentId: first?.id ?? "" }, summary: `Commented on ${found.title}` });
        return { text: `Commented on ${noteRef(found)}.`, notes: [mention(found)] };
      },
    }),
  };
};
