import "server-only";
import { z } from "zod";
import { requireProjectAccess } from "../../access";
import { ancestors, flatten } from "../../tree";
import { setupKindMeta } from "../../world";
import { getSharedWorld, getWorld } from "../../world-actions";
import { documentLines, loadDocument, paginate, renderLine } from "../documents";
import { wrapUntrusted } from "../untrusted";
import { asOfNote, defineTool, loadHorizon, loadProject, mention, noteRef, requireLive, type ToolFactory } from "./context";
import { plural } from "../../plural";

// What the story world knows about itself (plan.md 2.8): releases and the
// spoiler horizon, who knows what and when they learn it, and the setups
// waiting for their payoff. This is what a general chatbot can't do.

const MAX_ROWS = 200;
const SHARED_PAGE = 6000;

/** A property's value as one line of text. */
const propertyText = (value: unknown) => (Array.isArray(value) ? value.join(", ") : value === null || value === undefined ? "" : String(value));

export const worldTools: ToolFactory = ({ projectId, boundary }) => ({
  readLinkedWorld: defineTool({
    access: "read",
    description:
      "The shared world this project draws on, when it has one: another project's characters, places and other entries, which notes here may link to. Without `entryId`, lists the entries (filtered by `query` if given). With `entryId`, reads that entry's page. Read only: nothing in the shared world can be changed from here.",
    inputSchema: z.object({
      query: z.string().optional().describe("Only entries whose name or aliases contain this."),
      entryId: z.string().optional().describe("An entry's id (from the list): read its page."),
      page: z.number().int().min(1).optional().describe("Which page of a long entry. Default 1."),
    }),
    run: async ({ query, entryId, page = 1 }) => {
      await requireProjectAccess(projectId);
      const world = await getSharedWorld(projectId);
      if (!world) return { text: "This project has no shared world, or you can't open the one it links to.", notes: [] };
      // Written in another project, by people who may not work in this one: material to read, never instructions.
      const wrap = (text: string) => wrapUntrusted(text, "shared world", boundary);
      const typeName = (id: string | null) => world.entityTypes.find((t) => t.id === id)?.name;
      const label = (e: (typeof world.entries)[number]) => typeName(e.entityTypeId) ?? e.kind;

      if (entryId) {
        const entry = world.entries.find((e) => e.id === entryId);
        if (!entry) return { text: `"${world.title}" has no entry with that id, or it's in the trash.`, notes: [] };
        const facts = Object.entries(entry.properties ?? {})
          .map(([key, value]) => [key, propertyText(value)] as const)
          .filter(([, value]) => value)
          .map(([key, value]) => `${key}: ${value}`);
        const titleOf = (id: string) => world.entries.find((e) => e.id === id)?.title ?? "another note";
        const lines = documentLines(await loadDocument(world.projectId, entry.id), titleOf).map(renderLine);
        const pages = lines.length ? paginate(lines, SHARED_PAGE) : [[]];
        const index = Math.min(page, pages.length) - 1;
        const body = [
          entry.aliases.length ? `Also called: ${entry.aliases.join(", ")}` : "",
          entry.synopsis ? `Synopsis: ${entry.synopsis}` : "",
          ...facts,
          pages[index].length ? pages[index].join("\n") : "(This entry has no text yet.)",
        ].filter(Boolean);
        const paging = pages.length > 1 ? ` · page ${index + 1} of ${pages.length}` : "";
        const more = index + 1 < pages.length ? `\n(More follows: call readLinkedWorld again with page ${index + 2}.)` : "";
        return {
          text: `From the shared world "${world.title}": [${label(entry)}] ${entry.title} (id: ${entry.id}) · canon: ${entry.canon}${paging}\n${wrap(body.join("\n"))}${more}`,
          notes: [],
        };
      }

      const needle = query?.trim().toLowerCase();
      const rows = world.entries.filter((e) => !needle || e.title.toLowerCase().includes(needle) || e.aliases.some((a) => a.toLowerCase().includes(needle)));
      if (!rows.length) return { text: `The shared world "${world.title}" has no entries${needle ? ` matching "${query}"` : ""}.`, notes: [] };
      const lines = rows
        .slice(0, MAX_ROWS)
        .map((e) => `- [${label(e)}] ${e.title} (id: ${e.id})${e.aliases.length ? ` · also ${e.aliases.join(", ")}` : ""}${e.synopsis ? ` · ${e.synopsis}` : ""}`);
      return {
        text: `The shared world "${world.title}", ${rows.length} ${plural(rows.length, "entry")}${needle ? ` matching "${query}"` : ""}:\n${wrap(lines.join("\n"))}${rows.length > MAX_ROWS ? `\n… and ${rows.length - MAX_ROWS} more: narrow it with \`query\`.` : ""}`,
        notes: [],
      };
    },
  }),

  listReleases: defineTool({
    access: "read",
    description:
      "The project's releases in shipping order (books, episodes, patches…), with their ids. Other tools take a release's id as `asOfReleaseId` to answer \"as of release X\": only what the audience knows once that release is out.",
    inputSchema: z.object({}),
    run: async () => {
      await requireProjectAccess(projectId);
      const project = await loadProject(projectId);
      const { releases } = await getWorld(projectId);
      if (!releases.length) return { text: "This project has no releases, so nothing is tagged as revealed at a particular point.", notes: [] };
      const lines = releases.map((r, i) => {
        const ships = r.nodeId ? project.live(r.nodeId) : null;
        return `${i + 1}. ${r.title} (id: ${r.id}) · ${r.kind}${r.date ? ` · ${r.date}` : ""}${r.releasedAt ? " · released" : ""}${ships ? ` · ships ${noteRef(ships)}` : ""}`;
      });
      return { text: `Releases, first to last:\n${lines.join("\n")}`, notes: [] };
    },
  }),

  getKnowledge: defineTool({
    access: "read",
    description:
      "Who knows what: for a character, the facts they know or wrongly believe and the scene where they learn each; for a fact, who knows it. Pass `byNodeId` (a scene or chapter) to get only what they know by that point in the story, which is what a scene from their point of view may use.",
    inputSchema: z.object({
      characterId: z.string().optional().describe("A character's id: what do they know?"),
      factId: z.string().optional().describe("A note's id (a secret, an event, an entry): who knows about it?"),
      byNodeId: z.string().optional().describe("A scene or chapter: leave out anything learned after it in reading order."),
      asOfReleaseId: z.string().optional().describe("Only show what the audience knows once this release is out (ids from listReleases)."),
    }),
    run: async ({ characterId, factId, byNodeId, asOfReleaseId }) => {
      await requireProjectAccess(projectId);
      const project = await loadProject(projectId);
      const asOf = await loadHorizon(projectId, project, asOfReleaseId);
      const character = characterId ? requireLive(project, characterId) : null;
      const fact = factId ? requireLive(project, factId) : null;
      const by = byNodeId ? requireLive(project, byNodeId) : null;
      const order = new Map(flatten(project.index).map((n, i) => [n.id, i]));
      // A folder or chapter stands for everything inside it: its last descendant in reading order.
      const limit = by
        ? Math.max(order.get(by.id) ?? 0, ...flatten(project.index, by.id).map((n) => order.get(n.id) ?? 0))
        : Infinity;
      const visible = (id: string | null) => id === null || (project.live(id) !== null && (!asOf || asOf.horizon.knows(id)));

      const { knowledge, facts } = await getWorld(projectId);
      const rows = knowledge.filter(
        (k) =>
          (!character || k.characterNodeId === character.id) &&
          (!fact || k.factNodeId === fact.id) &&
          visible(k.characterNodeId) &&
          visible(k.factNodeId) &&
          visible(k.learnedInNodeId) &&
          (k.learnedInNodeId === null || (order.get(k.learnedInNodeId) ?? Infinity) <= limit),
      );
      const scope = [character && `what "${character.title}" knows`, fact && `who knows about "${fact.title}"`, by && `by "${by.title}"`].filter(Boolean).join(", ");
      const picked = [character, fact, by].filter((n) => n !== null).map(mention);
      if (!rows.length) return { text: `${asOfNote(asOf)}Nothing recorded${scope ? ` for ${scope}` : ""}.`, notes: picked };

      const excerpt = (nodeId: string, blockId: string | null) => {
        const tagged = blockId ? facts.find((f) => f.nodeId === nodeId && f.blockId === blockId) : undefined;
        // A passage tagged for a later release stays out, even when its note is known.
        return tagged && (!asOf || asOf.horizon.knowsBlock(tagged.reveal)) ? tagged.excerpt : undefined;
      };
      const lines = rows.slice(0, MAX_ROWS).map((k) => {
        const who = project.live(k.characterNodeId)!;
        const what = project.live(k.factNodeId)!;
        const passage = excerpt(k.factNodeId, k.factBlockId);
        const learned = k.learnedInNodeId ? `learns it in ${noteRef(project.live(k.learnedInNodeId)!)}` : "knows it from the start";
        const verb = k.layer === "belief" ? "believes (it isn't true)" : "knows";
        return `- ${noteRef(who)} ${verb}: ${noteRef(what)}${passage ? ` — "${passage}"` : ""} · ${learned}${k.note ? ` · ${k.note}` : ""}`;
      });
      return {
        text: `${asOfNote(asOf)}Who knows what${scope ? ` (${scope})` : ""}:\n${lines.join("\n")}${rows.length > MAX_ROWS ? `\n… and ${rows.length - MAX_ROWS} more.` : ""}`,
        notes: picked,
      };
    },
  }),

  getSetups: defineTool({
    access: "read",
    description:
      "Setups and payoffs: foreshadowing, Chekhov's guns, clues, red herrings and mysteries, each with where it is planted, where it pays off and whether it is still open. Use it to list loose ends.",
    inputSchema: z.object({
      status: z.enum(["open", "paid", "dropped"]).optional().describe("Only setups in this state. Leave out for all of them."),
      asOfReleaseId: z.string().optional().describe("Only show what the audience knows once this release is out (ids from listReleases)."),
    }),
    run: async ({ status, asOfReleaseId }) => {
      await requireProjectAccess(projectId);
      const project = await loadProject(projectId);
      const asOf = await loadHorizon(projectId, project, asOfReleaseId);
      const visible = (id: string | null) => id !== null && project.live(id) !== null && (!asOf || asOf.horizon.knows(id));
      const { setups } = await getWorld(projectId);
      // Under a horizon a setup exists for the audience once its planting has been seen.
      const rows = setups.filter((s) => (!status || s.status === status) && (!asOf || visible(s.setupNodeId)));
      if (!rows.length) return { text: `${asOfNote(asOf)}No ${status ?? ""} setups recorded.`.replace("  ", " "), notes: [] };

      const place = (id: string | null) => {
        if (!visible(id)) return null;
        const node = project.live(id)!;
        const where = ancestors(project.index, node.id).at(-1)?.title;
        return `${noteRef(node)}${where ? ` in ${where}` : ""}`;
      };
      const lines = rows.slice(0, MAX_ROWS).map((s) => {
        const planted = place(s.setupNodeId);
        const paid = place(s.payoffNodeId);
        return `- [${s.status}] ${s.title} (${setupKindMeta[s.kind].label.toLowerCase()}) · planted: ${planted ?? "not placed yet"} · payoff: ${paid ?? (asOf && s.payoffNodeId ? "not revealed yet" : "none yet")}${s.note ? ` · ${s.note}` : ""}`;
      });
      const linked = [...new Set(rows.flatMap((s) => [s.setupNodeId, s.payoffNodeId]).filter((id): id is string => visible(id)))].map((id) => project.live(id)!);
      return {
        text: `${asOfNote(asOf)}${rows.length} ${plural(rows.length, "setup")}:\n${lines.join("\n")}`,
        notes: linked.length <= 8 ? linked.map(mention) : [],
      };
    },
  }),
});
