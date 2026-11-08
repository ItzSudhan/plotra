import "server-only";
import { z } from "zod";
import { requireProjectAccess } from "../../access";
import { plainSnippet, searchNodes } from "../search";
import { untrustedSource, wrapUntrusted } from "../untrusted";
import { asOfNote, defineTool, loadHorizon, loadProject, mention, type ToolFactory } from "./context";
import { plural } from "../../plural";

// Project search (lib/agent/search.ts): the agent's main way to find where
// something is mentioned, instead of reading the whole project.

export const searchTools: ToolFactory = ({ projectId, boundary }) => ({
  searchProject: defineTool({
    access: "read",
    description:
      'Full-text search over every note\'s title, synopsis and text. Returns the best matches with a passage around the match and each note\'s id. Words are ANDed; put a phrase in "quotes"; `or` and a leading `-` work. Search for names and distinctive words rather than whole questions.',
    inputSchema: z.object({
      query: z.string().min(1).max(200).describe("What to look for."),
      limit: z.number().int().min(1).max(30).optional().describe("How many results. Default 10."),
      asOfReleaseId: z.string().optional().describe("Only search what the audience knows once this release is out (ids from listReleases)."),
    }),
    run: async ({ query, limit = 10, asOfReleaseId }) => {
      await requireProjectAccess(projectId);
      const project = await loadProject(projectId);
      const asOf = await loadHorizon(projectId, project, asOfReleaseId);
      // Under a horizon some hits drop out, so ask for more than will be shown.
      const hits = (await searchNodes(projectId, query, asOf ? 50 : limit)).filter((hit) => !asOf || asOf.horizon.knows(hit.id)).slice(0, limit);
      if (!hits.length) return { text: `${asOfNote(asOf)}Nothing in the project matches "${query}". Try fewer or different words.`, notes: [] };

      const lines = hits.map((hit, i) => {
        const node = project.index.byId.get(hit.id);
        const source = node ? untrustedSource(node) : null;
        // A passage could include a block that is revealed later than its note, so under a horizon only the title is given.
        const passage = asOf ? "" : plainSnippet(hit.snippet);
        const shown = passage && source ? wrapUntrusted(passage, source, boundary) : passage;
        return `${i + 1}. [${hit.kind}] ${hit.title} (id: ${hit.id})${shown ? `\n${shown}` : ""}`;
      });
      return {
        text: `${asOfNote(asOf)}${hits.length} ${plural(hits.length, "result")} for "${query}":\n${lines.join("\n")}${asOf ? "\nRead a note with readNote (and the same asOfReleaseId) to see what it says." : ""}`,
        notes: hits.map(mention),
      };
    },
  }),
});
