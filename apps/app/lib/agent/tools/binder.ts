import "server-only";
import { z } from "zod";
import { requireProjectAccess } from "../../access";
import { liveChildren, type BinderNode } from "../../tree";
import { asOfNote, defineTool, loadHorizon, loadProject, mention, requireLive, type ToolFactory } from "./context";

// The binder (plan.md 2.2): how the project is laid out. The agent starts
// here to see what exists and where, and to get the ids its other tools take.

const MAX_LINES = 250;
const SYNOPSIS = 140;

const oneLine = (text: string | null | undefined, max: number) => {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

/** One binder entry as a line the model can read and cite. */
export function outlineLine(node: BinderNode, depth: number, childCount: number): string {
  const parts = [`${"  ".repeat(depth)}- [${node.kind}] ${node.title} (id: ${node.id})`];
  if (node.wordCount) parts.push(`${node.wordCount} words`);
  if (node.status !== "draft") parts.push(`status ${node.status}`);
  if (node.canon !== "draft") parts.push(`canon ${node.canon}`);
  if (childCount) parts.push(`${childCount} inside`);
  const synopsis = oneLine(node.synopsis, SYNOPSIS);
  return parts.join(" · ") + (synopsis ? `\n${"  ".repeat(depth + 1)}${synopsis}` : "");
}

export const binderTools: ToolFactory = ({ projectId }) => ({
  binderOutline: defineTool({
    access: "read",
    description:
      "The project's binder as an outline: folders, chapters, scenes, characters, places and other notes, in reading order, each with its id, word count and synopsis. Start here to see what the project contains. Pass `under` to look inside one folder or chapter.",
    inputSchema: z.object({
      under: z.string().optional().describe("The id of a folder, chapter or note to list the contents of. Leave out for the whole project."),
      depth: z.number().int().min(1).max(8).optional().describe("How many levels down to list. Default 3."),
      asOfReleaseId: z.string().optional().describe("Only show what the audience knows once this release is out (ids from listReleases)."),
    }),
    run: async ({ under, depth = 3, asOfReleaseId }) => {
      await requireProjectAccess(projectId);
      const project = await loadProject(projectId);
      const asOf = await loadHorizon(projectId, project, asOfReleaseId);
      const root = under ? requireLive(project, under) : null;
      const shown = (node: BinderNode) => !asOf || asOf.horizon.shows(node.id);

      const lines: string[] = [];
      let skipped = 0;
      const walk = (parentId: string | null, level: number) => {
        for (const node of liveChildren(project.index, parentId).filter(shown)) {
          const children = liveChildren(project.index, node.id).filter(shown);
          if (lines.length >= MAX_LINES) {
            skipped++;
            continue;
          }
          // A folder shown only for what is inside it keeps its title, not its synopsis.
          lines.push(outlineLine(asOf && !asOf.horizon.knows(node.id) ? { ...node, synopsis: null } : node, level, children.length));
          if (level + 1 < depth) walk(node.id, level + 1);
        }
      };
      walk(root?.id ?? null, 0);

      const header = root ? `Inside "${root.title}" (id: ${root.id}):` : "The project's binder:";
      const footer = skipped ? `\n… ${skipped} more entries not shown. Pass \`under\` with a folder's id to see inside it.` : "";
      return {
        text: `${asOfNote(asOf)}${header}\n${lines.length ? lines.join("\n") : "(empty)"}${footer}`,
        // Linking every entry of an outline would bury the ones that matter.
        notes: root ? [mention(root)] : [],
      };
    },
  }),
});
