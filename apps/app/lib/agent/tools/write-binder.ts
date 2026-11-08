import "server-only";
import { canonStatuses } from "@plotra/db/schema";
import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";
import { moveNode, setNodeProperties, trashNode, updateNode } from "../../binder-actions";
import { isDescendant, lastPosition, liveChildren, positionAfter } from "../../tree";
import { setNodeCanon } from "../../world-actions";
import { recordChange } from "../changes";
import { defineTool, loadProject, mention, noteRef, requireLive, type ToolFactory } from "./context";
import { plural } from "../../plural";

// Changing the binder and what notes are, rather than what they say (plan.md
// 2.11 "Edit": reorganise the binder; fill in properties, tags, canon). Each
// tool is the server action the app's own UI calls, plus a row in the run's
// list of changes holding what was there before, for "Undo run".
//
// Not here, on purpose (plan.md 2.11 "Never given to the agent"): deleting for
// good and emptying the trash, sharing and members, settings, keys, publishing.
// There is no tool for any of them, so no prompt can reach them.

export const binderWriteTools: ToolFactory = (context) => {
  const { projectId } = context;
  return {
    updateNote: defineTool({
      access: "write",
      description: "Changes what a note is called and how it is described: its title, synopsis, status (a stage of the project's workflow), tags and aliases. Only what you pass changes.",
      inputSchema: z.object({
        nodeId: z.string().describe("The note's id."),
        title: z.string().min(1).max(200).optional(),
        synopsis: z.string().max(2000).nullable().optional().describe("One or two sentences. Null clears it."),
        status: z.string().optional().describe("The id of a workflow stage, as getNote shows it."),
        tags: z.array(z.string()).max(50).optional().describe("The full list of tags the note should have afterwards."),
        aliases: z.array(z.string()).max(50).optional().describe("Other names the note is known by, the full list."),
      }),
      run: async ({ nodeId, ...patch }) => {
        const project = await loadProject(projectId);
        const found = requireLive(project, nodeId);
        const keys = (Object.keys(patch) as Array<keyof typeof patch>).filter((key) => patch[key] !== undefined);
        if (!keys.length) throw new Error("Pass at least one thing to change.");
        const before = Object.fromEntries(keys.map((key) => [key, found[key] ?? null]));
        const updated = await updateNode(projectId, nodeId, {
          ...(patch.title !== undefined && { title: patch.title }),
          ...(patch.synopsis !== undefined && { synopsis: patch.synopsis }),
          ...(patch.status !== undefined && { status: patch.status }),
          ...(patch.tags !== undefined && { tags: patch.tags }),
          ...(patch.aliases !== undefined && { aliases: patch.aliases }),
        });
        const what = patch.title !== undefined && updated.title !== found.title ? `Renamed ${found.title} to ${updated.title}` : `Changed the ${keys.join(", ")} of ${updated.title}`;
        await recordChange(context, { action: "update", nodeId, before, summary: what });
        return { text: `${what}. ${noteRef(updated)}`, notes: [mention(updated)] };
      },
    }),

    setProperties: defineTool({
      access: "write",
      description:
        "Sets the typed properties of a note: a scene's point of view, story-date and duration; a character's age and role; the fields of a world-bible entry. Use the keys getNote shows for that kind of note. A value of null clears a property. Properties that point at other notes take note ids.",
      inputSchema: z.object({
        nodeId: z.string().describe("The note's id."),
        values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])).describe("Property key to its new value."),
      }),
      run: async ({ nodeId, values }) => {
        const project = await loadProject(projectId);
        const found = requireLive(project, nodeId);
        const keys = Object.keys(values);
        if (!keys.length) throw new Error("Pass at least one property.");
        const old = Object.fromEntries(keys.map((key) => [key, found.properties[key] ?? null]));
        const updated = await setNodeProperties(projectId, nodeId, values);
        await recordChange(context, { action: "properties", nodeId, before: { values: old }, summary: `Set ${keys.join(", ")} on ${found.title}` });
        return { text: `Set ${keys.join(", ")} on ${noteRef(updated)}.`, notes: [mention(updated)] };
      },
    }),

    moveNote: defineTool({
      access: "write",
      description: "Moves a note (with everything inside it) to another folder or chapter, or to another place among its siblings.",
      inputSchema: z.object({
        nodeId: z.string().describe("The note to move."),
        parentId: z.string().nullable().describe("The folder or chapter to move it into. Null for the top level."),
        afterId: z.string().optional().describe("Put it directly after this note, which must be in the destination. Leave out to put it last; pass `first` to put it first."),
      }),
      run: async ({ nodeId, parentId, afterId }) => {
        const project = await loadProject(projectId);
        const found = requireLive(project, nodeId);
        const parent = parentId ? requireLive(project, parentId) : null;
        if (parent && (parent.id === found.id || isDescendant(project.index, parent.id, found.id))) throw new Error("A note can't be moved inside itself.");
        const siblings = liveChildren(project.index, parent?.id ?? null).filter((n) => n.id !== found.id);
        let position: string;
        if (afterId === "first") position = generateKeyBetween(null, siblings[0]?.position ?? null);
        else if (afterId) {
          const after = requireLive(project, afterId);
          if (after.parentId !== (parent?.id ?? null)) throw new Error("`afterId` has to be a note in the destination.");
          position = positionAfter(project.index, after.id);
        } else position = lastPosition(project.index, parent?.id ?? null);
        const moved = await moveNode(projectId, nodeId, { parentId: parent?.id ?? null, position });
        await recordChange(context, {
          action: "move",
          nodeId,
          before: { parentId: found.parentId, position: found.position },
          summary: `Moved ${found.title} ${parent ? `into ${parent.title}` : "to the top level"}`,
        });
        return { text: `Moved ${noteRef(moved)} ${parent ? `into ${noteRef(parent)}` : "to the top level"}.`, notes: [mention(moved)] };
      },
    }),

    trashNote: defineTool({
      access: "write",
      description: "Moves a note, and everything inside it, to the trash. The writer can restore it from there. Always asks the writer first.",
      inputSchema: z.object({ nodeId: z.string().describe("The note to move to the trash.") }),
      run: async ({ nodeId }) => {
        const project = await loadProject(projectId);
        const found = requireLive(project, nodeId);
        const inside = liveChildren(project.index, found.id).length;
        await trashNode(projectId, nodeId);
        await recordChange(context, { action: "trash", nodeId, summary: `Moved ${found.title} to the trash` });
        return { text: `Moved "${found.title}" to the trash${inside ? `, with the ${inside} ${plural(inside, "note")} directly inside it` : ""}.`, notes: [] };
      },
    }),

    setCanon: defineTool({
      access: "write",
      description:
        "Sets a note's canon status: canon, draft, speculative, retconned or non_canon. Retconning needs a reason (what changed and why) and keeps the old text as a version. Changing what is canon always asks the writer first.",
      inputSchema: z.object({
        nodeId: z.string().describe("The note's id."),
        canon: z.enum(canonStatuses),
        reason: z.string().max(500).optional().describe("Required for `retconned`: what changed and why."),
        releaseId: z.string().optional().describe("For a retcon: the release it happens in (ids from listReleases)."),
      }),
      run: async ({ nodeId, canon, reason, releaseId }) => {
        const project = await loadProject(projectId);
        const found = requireLive(project, nodeId);
        const updated = await setNodeCanon(projectId, nodeId, { canon, reason, releaseId });
        await recordChange(context, { action: "canon", nodeId, before: { canon: found.canon }, summary: `Marked ${found.title} as ${canon.replace(/_/g, " ")}` });
        return { text: `${noteRef(updated)} is now ${canon.replace(/_/g, " ")} (it was ${found.canon.replace(/_/g, " ")}).`, notes: [mention(updated)] };
      },
    }),
  };
};
