import "server-only";
import { schema } from "@plotra/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireNodeAccess } from "../../access";
import { userDb } from "../../db";
import { isDocumentKind } from "../../story";
import { ancestors } from "../../tree";
import { listComments } from "../../workflow-actions";
import { documentLines, loadDocument, paginate, renderLine } from "../documents";
import { untrustedSource, wrapUntrusted } from "../untrusted";
import { asOfNote, defineTool, loadHorizon, loadProject, mention, requireLive, type ToolFactory } from "./context";

// Reading what a note says (plan.md 2.11 "It looks things up with tools").
// Text comes back one block per line with the block's id in front, which is
// how edits will be addressed (Phase 9c), and in pages so a long chapter
// doesn't fill the model's context at once.

const PAGE = 6000;
// Bodies are cut before they're wrapped, so an untrusted block is never left without its end mark.
const MAX_COMMENT = 1500;
const MAX_THREADS = 30;

const { member, node, projectMember } = schema;

/**
 * Who may edit the project, as far as the current user can see: the
 * workspace's members and the people the project is shared with as editors.
 * A comment from anyone else is untrusted (lib/agent/untrusted.ts).
 */
async function editorIds(projectId: string, workspaceId: string): Promise<Set<string>> {
  const [members, shared] = await userDb((tx) =>
    Promise.all([
      tx.select({ userId: member.userId }).from(member).where(eq(member.organizationId, workspaceId)),
      tx.select({ userId: projectMember.userId }).from(projectMember).where(and(eq(projectMember.projectId, projectId), eq(projectMember.role, "editor"))),
    ]),
  );
  return new Set([...members, ...shared].map((row) => row.userId).filter((id): id is string => typeof id === "string"));
}

export const noteTools: ToolFactory = ({ projectId, userId, boundary }) => ({
  readNote: defineTool({
    access: "read",
    description:
      "Reads a note's text: a scene, chapter, character page, research note or any other document. Each block is one line starting with its block id in [brackets]. Long notes come in pages: ask for the next `page` when the result says there is more.",
    inputSchema: z.object({
      nodeId: z.string().describe("The note's id (from binderOutline, searchProject or another tool)."),
      page: z.number().int().min(1).optional().describe("Which page of a long note. Default 1."),
      asOfReleaseId: z.string().optional().describe("Only show what the audience knows once this release is out (ids from listReleases)."),
    }),
    run: async ({ nodeId, page = 1, asOfReleaseId }) => {
      await requireNodeAccess(projectId, nodeId);
      const project = await loadProject(projectId);
      const found = requireLive(project, nodeId);
      const asOf = await loadHorizon(projectId, project, asOfReleaseId);
      const where = ancestors(project.index, found.id).map((a) => a.title).join(" / ");
      const header = `${asOfNote(asOf)}[${found.kind}] ${found.title} (id: ${found.id})${where ? ` · in ${where}` : ""}`;

      if (asOf && !asOf.horizon.knows(found.id)) {
        return { text: `${header}\nThis note isn't revealed as of "${asOf.release.title}", so its text isn't shown.`, notes: [mention(found)] };
      }

      const source = untrustedSource(found);
      let lines: string[];
      if (isDocumentKind(found.kind)) {
        const value = await loadDocument(projectId, found.id);
        lines = documentLines(value, project.title, (tags) => !asOf || asOf.horizon.knowsBlock(tags?.reveal)).map(renderLine);
      } else {
        // Boards (canvas, timeline, dialogue) aren't text documents: what they hold is kept as plain text for search.
        const [row] = await userDb((tx) => tx.select({ text: node.text }).from(node).where(eq(node.id, found.id)).limit(1));
        lines = (row?.text ?? "").split("\n").filter((line) => line.trim());
        if (found.kind === "timeline") lines.unshift("(A timeline: use getTimeline for its events with their dates.)");
      }
      if (!lines.length) return { text: `${header}\n(This note has no text yet.)${found.synopsis ? `\nSynopsis: ${found.synopsis}` : ""}`, notes: [mention(found)] };

      const pages = paginate(lines, PAGE);
      const index = Math.min(page, pages.length) - 1;
      const body = pages[index].join("\n");
      const paging = pages.length > 1 ? ` · page ${index + 1} of ${pages.length}` : "";
      const more = index + 1 < pages.length ? `\n(More follows: call readNote again with page ${index + 2}.)` : "";
      return {
        text: `${header}${paging}\n${source ? wrapUntrusted(body, source, boundary) : body}${more}`,
        notes: [mention(found)],
      };
    },
  }),

  readComments: defineTool({
    access: "read",
    description: "The comment threads on a note: what was quoted, who said what, and whether the thread is resolved. One-click reactions are left out.",
    inputSchema: z.object({
      nodeId: z.string().describe("The note's id."),
      includeResolved: z.boolean().optional().describe("Also show resolved threads. Default false."),
    }),
    run: async ({ nodeId, includeResolved = false }) => {
      const { project: found } = await requireNodeAccess(projectId, nodeId);
      const project = await loadProject(projectId);
      const note = requireLive(project, nodeId);
      const threads = (await listComments(projectId, nodeId)).filter((t) => !t.reaction && (includeResolved || !t.resolvedAt));
      if (!threads.length) return { text: `No ${includeResolved ? "" : "open "}comments on "${note.title}".`, notes: [mention(note)] };

      const editors = await editorIds(projectId, found.organizationId);
      const authorIds = [...new Set(threads.flatMap((t) => t.comments.map((c) => c.authorId)).filter((id): id is string => !!id))];
      const names = new Map(
        authorIds.length
          ? (await userDb((tx) => tx.select({ id: schema.user.id, name: schema.user.name }).from(schema.user).where(inArray(schema.user.id, authorIds)).orderBy(asc(schema.user.name)))).map(
              (u) => [u.id, u.name] as const,
            )
          : [],
      );

      const blocks = threads.slice(0, MAX_THREADS).map((thread, i) => {
        const lines = thread.comments.map((c) => {
          const who = c.authorId === userId ? "You" : c.authorId ? (names.get(c.authorId) ?? "Someone") : "Someone who has left";
          // What a reader or a guest wrote is material, never instructions.
          const trusted = c.authorId !== null && editors.has(c.authorId);
          const body = c.body.length > MAX_COMMENT ? `${c.body.slice(0, MAX_COMMENT)}…` : c.body;
          return `${who}: ${trusted ? body : wrapUntrusted(body, "comment from a reader", boundary)}`;
        });
        const quote = thread.quote ? ` on "${thread.quote.replace(/\s+/g, " ").slice(0, 200)}"` : "";
        return `${i + 1}. ${thread.resolvedAt ? "(resolved) " : ""}Thread${quote}\n${lines.join("\n")}`;
      });
      const more = threads.length > MAX_THREADS ? `\n\n… ${threads.length - MAX_THREADS} more threads not shown.` : "";
      return { text: `Comments on "${note.title}" (id: ${note.id}):\n${blocks.join("\n\n")}${more}`, notes: [mention(note)] };
    },
  }),
});
