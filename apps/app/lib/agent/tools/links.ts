import "server-only";
import { z } from "zod";
import { parseContext } from "../../doc-index";
import { getNodeLinks } from "../../knowledge-actions";
import { untrustedSource, wrapUntrusted } from "../untrusted";
import { asOfNote, defineTool, loadHorizon, loadProject, mention, noteRef, requireLive, type ToolFactory } from "./context";
import { plural } from "../../plural";

// Links between notes (plan.md 2.4): where a character, place or idea is
// mentioned, and what a note itself points at. Backlinks are how the agent
// finds every scene a character appears in without searching for their name.

const MAX_LINKS = 80;

export const linkTools: ToolFactory = ({ projectId, boundary }) => ({
  getLinks: defineTool({
    access: "read",
    description:
      "The notes that link to a note (backlinks, each with the sentence the link sits in) and the notes it links to. Use backlinks to find every scene that mentions a character, place or item.",
    inputSchema: z.object({
      nodeId: z.string().describe("The note's id."),
      asOfReleaseId: z.string().optional().describe("Only show what the audience knows once this release is out (ids from listReleases)."),
    }),
    run: async ({ nodeId, asOfReleaseId }) => {
      const project = await loadProject(projectId);
      const found = requireLive(project, nodeId);
      const asOf = await loadHorizon(projectId, project, asOfReleaseId);
      const visible = (id: string) => project.live(id) !== null && (!asOf || asOf.horizon.knows(id));
      if (!visible(found.id)) return { text: `${asOfNote(asOf)}"${found.title}" isn't revealed as of "${asOf?.release.title}".`, notes: [mention(found)] };
      // Checks access to the note itself, and leaves out links to and from notes the user can't see.
      const { backlinks, outgoing } = await getNodeLinks(projectId, nodeId);

      const incoming = backlinks.filter((l) => visible(l.sourceNodeId));
      const backLines = incoming.slice(0, MAX_LINKS).map((l) => {
        const source = project.live(l.sourceNodeId)!;
        // Under a horizon the sentence could come from a passage revealed later, so only the note is named.
        const sentence = asOf || !l.context
          ? ""
          : parseContext(l.context)
              .map((part) => ("text" in part ? part.text : `[[${part.alias ?? project.title(part.nodeId)}]]`))
              .join("");
        const from = untrustedSource(source);
        const shown = sentence && from ? wrapUntrusted(sentence, from, boundary) : sentence;
        return `- ${noteRef(source)}${l.kind === "embed" ? " (embeds it)" : l.kind === "property" ? " (in a property)" : ""}${shown ? `\n  ${shown}` : ""}`;
      });
      const targets = [...new Set(outgoing.map((l) => l.targetNodeId))].filter(visible);
      const outLines = targets.slice(0, MAX_LINKS).map((id) => `- ${noteRef(project.live(id)!)}`);

      const text = [
        `${asOfNote(asOf)}Links of ${noteRef(found)}`,
        `Linked from ${incoming.length} ${plural(incoming.length, "place")}:`,
        backLines.length ? backLines.join("\n") : "(nothing links here)",
        incoming.length > MAX_LINKS ? `… and ${incoming.length - MAX_LINKS} more.` : null,
        `Links to ${targets.length} ${plural(targets.length, "note")}:`,
        outLines.length ? outLines.join("\n") : "(it links to nothing)",
      ];
      const sources = [...new Set(incoming.map((l) => l.sourceNodeId))].map((id) => project.live(id)!);
      return { text: text.filter(Boolean).join("\n"), notes: [mention(found), ...sources.slice(0, 8).map(mention)] };
    },
  }),
});
