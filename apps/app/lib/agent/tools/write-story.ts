import "server-only";
import { knowledgeLayers, setupKinds } from "@plotra/db/schema";
import { z } from "zod";
import { requireProjectAccess } from "../../access";
import { gregorian, parseDuration, parseStoryDate, type Calendar } from "../../calendar";
import { canvasMaps, type CardData } from "../../canvas";
import { relationshipTypes } from "../../story";
import {
  createRelationship,
  createThread,
  createTimelineEvent,
  deleteRelationship,
  deleteTimelineEvent,
  getStory,
  getTimelineEvents,
  setSceneThread,
  updateRelationship,
  updateTimelineEvent,
} from "../../story-actions";
import { createKnowledge, createSetup } from "../../world-actions";
import { recordChange } from "../changes";
import { newBlockId } from "../edits";
import { editBoard } from "../write";
import { defineTool, loadProject, mention, noteRef, requireLive, type ToolFactory } from "./context";
import { plural } from "../../plural";

// The story tools the agent can fill in (plan.md 2.11 "Edit": plot-grid cells,
// relationships, timeline events and storyboard cards; who knows what and
// setups). Like every write tool: the app's own server action, then a row in
// the run's list of changes with what was there before.

const CARD_GAP = 40;
const CARD_W = 240;
const CARD_H = 140;

export const storyWriteTools: ToolFactory = (context) => {
  const { projectId } = context;

  /** The calendar a timeline counts in. */
  const calendarOf = async (calendarId: unknown): Promise<Calendar> => {
    const { calendars } = await getStory(projectId);
    return [gregorian, ...calendars].find((c) => c.id === calendarId) ?? gregorian;
  };

  return {
    listPlotThreads: defineTool({
      access: "read",
      description: "The project's plot threads (the rows of the plot grid), each with its id and the scenes it runs through with what happens to it there.",
      inputSchema: z.object({}),
      run: async () => {
        await requireProjectAccess(projectId);
        const project = await loadProject(projectId);
        const { threads, cells } = await getStory(projectId);
        if (!threads.length) return { text: "No plot threads yet.", notes: [] };
        const lines = threads.map((thread) => {
          const scenes = cells
            .filter((cell) => cell.threadId === thread.id && project.live(cell.nodeId))
            .map((cell) => `  - ${noteRef(project.live(cell.nodeId)!)}${cell.note ? `: ${cell.note}` : ""}`);
          const closed = thread.closedNodeId && project.live(thread.closedNodeId) ? ` · resolved in ${project.title(thread.closedNodeId)}` : "";
          return `- ${thread.name} (thread id: ${thread.id})${closed}${scenes.length ? `\n${scenes.join("\n")}` : ""}`;
        });
        return { text: `Plot threads:\n${lines.join("\n")}`, notes: [] };
      },
    }),

    createPlotThread: defineTool({
      access: "write",
      description: "Adds a plot thread (a row of the plot grid): a storyline that runs through several scenes.",
      inputSchema: z.object({ name: z.string().min(1).max(120) }),
      run: async ({ name }) => {
        const thread = await createThread(projectId, { name });
        await recordChange(context, { action: "thread-create", before: { id: thread.id }, summary: `Added the plot thread ${thread.name}` });
        return { text: `Added the plot thread "${thread.name}" (thread id: ${thread.id}).`, notes: [] };
      },
    }),

    setPlotGridCell: defineTool({
      access: "write",
      description: "Fills a cell of the plot grid: what happens to a plot thread in a scene. An empty note keeps the scene in the thread without saying more; `remove` takes the scene out of the thread.",
      inputSchema: z.object({
        sceneId: z.string().describe("The scene's id."),
        threadId: z.string().describe("The thread's id (from listPlotThreads)."),
        note: z.string().max(1000).optional().describe("What happens to the thread in this scene."),
        remove: z.boolean().optional().describe("Take the scene out of the thread."),
      }),
      run: async ({ sceneId, threadId, note, remove }) => {
        const project = await loadProject(projectId);
        const scene = requireLive(project, sceneId);
        const { threads, cells } = await getStory(projectId);
        const thread = threads.find((t) => t.id === threadId);
        if (!thread) throw new Error(`No plot thread with id ${threadId}. Use listPlotThreads.`);
        const old = cells.find((cell) => cell.nodeId === sceneId && cell.threadId === threadId);
        await setSceneThread(projectId, sceneId, threadId, remove ? null : (note ?? ""));
        await recordChange(context, {
          action: "scene-thread",
          nodeId: sceneId,
          before: { threadId, note: old ? old.note : null },
          summary: remove ? `Took ${scene.title} out of the thread ${thread.name}` : `Set what happens to ${thread.name} in ${scene.title}`,
        });
        return { text: remove ? `Took ${noteRef(scene)} out of "${thread.name}".` : `Set the cell for "${thread.name}" in ${noteRef(scene)}.`, notes: [mention(scene)] };
      },
    }),

    setRelationship: defineTool({
      access: "write",
      description: `Adds a relationship between two characters to the relationship map, or changes one (pass its relationshipId, from getRelationships). Types: ${relationshipTypes.map((t) => t.id).join(", ")}, or a word of your own.`,
      inputSchema: z.object({
        relationshipId: z.string().optional().describe("To change an existing relationship instead of adding one."),
        fromId: z.string().optional().describe("The first character's id. Needed when adding."),
        toId: z.string().optional().describe("The second character's id. Needed when adding."),
        type: z.string().min(1).max(60).optional(),
        label: z.string().max(120).nullable().optional().describe("A few words on the edge: \"raised her\", \"owes him a debt\"."),
        directed: z.boolean().optional().describe("True when it only runs one way: the first is that to the second."),
      }),
      run: async ({ relationshipId, fromId, toId, type, label, directed }) => {
        const project = await loadProject(projectId);
        if (relationshipId) {
          const old = (await getStory(projectId)).relationships.find((r) => r.id === relationshipId);
          if (!old) throw new Error(`No relationship with id ${relationshipId}. Use getRelationships.`);
          const updated = await updateRelationship(projectId, relationshipId, { ...(type && { type }), ...(label !== undefined && { label }), ...(directed !== undefined && { directed }) });
          await recordChange(context, {
            action: "relationship-update",
            nodeId: old.fromNodeId,
            before: { id: old.id, type: old.type, label: old.label, directed: old.directed },
            summary: `Changed the relationship between ${project.title(old.fromNodeId)} and ${project.title(old.toNodeId)}`,
          });
          return { text: `Changed the relationship (${updated.type}) between ${project.title(old.fromNodeId)} and ${project.title(old.toNodeId)}.`, notes: [] };
        }
        if (!fromId || !toId || !type) throw new Error("Adding a relationship needs fromId, toId and type.");
        const from = requireLive(project, fromId);
        const to = requireLive(project, toId);
        const made = await createRelationship(projectId, { fromNodeId: from.id, toNodeId: to.id, type, label, directed });
        await recordChange(context, { action: "relationship-create", nodeId: from.id, before: { id: made.id }, summary: `Added a relationship between ${from.title} and ${to.title}` });
        return { text: `Added: ${noteRef(from)} ${made.directed ? "→" : "↔"} ${noteRef(to)}: ${made.type} (relationship id: ${made.id}).`, notes: [mention(from), mention(to)] };
      },
    }),

    removeRelationship: defineTool({
      access: "write",
      description: "Removes a relationship from the relationship map.",
      inputSchema: z.object({ relationshipId: z.string().describe("From getRelationships.") }),
      run: async ({ relationshipId }) => {
        const project = await loadProject(projectId);
        const old = (await getStory(projectId)).relationships.find((r) => r.id === relationshipId);
        if (!old) throw new Error(`No relationship with id ${relationshipId}. Use getRelationships.`);
        await deleteRelationship(projectId, relationshipId);
        await recordChange(context, {
          action: "relationship-delete",
          nodeId: old.fromNodeId,
          before: { fromNodeId: old.fromNodeId, toNodeId: old.toNodeId, type: old.type, label: old.label, directed: old.directed },
          summary: `Removed the relationship between ${project.title(old.fromNodeId)} and ${project.title(old.toNodeId)}`,
        });
        return { text: `Removed the relationship between ${project.title(old.fromNodeId)} and ${project.title(old.toNodeId)}.`, notes: [] };
      },
    }),

    setTimelineEvent: defineTool({
      access: "write",
      description:
        "Adds a standalone event to a timeline, changes one (pass its eventId, from getTimeline) or removes it. Dates are written in the timeline's own calendar, as getTimeline shows them: `YYYY-MM-DD` or `YYYY-MM-DD HH:mm`. Scenes are not events: a scene moves on the timeline by setting its `story-date` property (setProperties).",
      inputSchema: z.object({
        timelineId: z.string().describe("The timeline note's id."),
        eventId: z.string().optional().describe("To change or remove an existing event."),
        remove: z.boolean().optional(),
        title: z.string().min(1).max(160).optional(),
        description: z.string().max(1000).nullable().optional(),
        date: z.string().optional().describe("When it starts."),
        duration: z.string().optional().describe("How long it lasts, as the calendar writes durations: `2 days`, `3 hours`."),
        lane: z.string().max(80).nullable().optional().describe("The lane to put it in."),
        aboutId: z.string().nullable().optional().describe("The note this event is about (a character, a place, a scene)."),
      }),
      run: async ({ timelineId, eventId, remove, title, description, date, duration, lane, aboutId }) => {
        const project = await loadProject(projectId);
        const timeline = requireLive(project, timelineId);
        if (timeline.kind !== "timeline") throw new Error(`"${timeline.title}" isn't a timeline.`);
        const calendar = await calendarOf(timeline.settings.calendarId);
        const start = date === undefined ? undefined : parseStoryDate(calendar, date);
        if (start === null) throw new Error(`"${date}" can't be read as a date in the ${calendar.name} calendar. Write it as YYYY-MM-DD.`);
        const length = duration ? parseDuration(calendar, duration) : null;
        if (duration && length === null) throw new Error(`"${duration}" can't be read as a duration.`);
        const about = aboutId ? requireLive(project, aboutId) : null;

        if (eventId) {
          const old = (await getTimelineEvents(projectId, timelineId)).find((event) => event.id === eventId);
          if (!old) throw new Error(`No event with id ${eventId} on this timeline. Use getTimeline.`);
          const values = { title: old.title, description: old.description, start: old.start, end: old.end, lane: old.lane, color: old.color, nodeId: old.nodeId };
          if (remove) {
            await deleteTimelineEvent(projectId, timelineId, eventId);
            await recordChange(context, { action: "event-delete", nodeId: timelineId, before: { timelineId, values }, summary: `Removed the event ${old.title} from ${timeline.title}` });
            return { text: `Removed the event "${old.title}".`, notes: [mention(timeline)] };
          }
          const from = start ?? old.start;
          await updateTimelineEvent(projectId, timelineId, eventId, {
            ...(title !== undefined && { title }),
            ...(description !== undefined && { description }),
            ...(start !== undefined && { start }),
            ...(length !== null ? { end: from + length } : start !== undefined && old.end !== null ? { end: start + (old.end - old.start) } : {}),
            ...(lane !== undefined && { lane }),
            ...(aboutId !== undefined && { nodeId: about?.id ?? null }),
          });
          await recordChange(context, { action: "event-update", nodeId: timelineId, before: { timelineId, id: eventId, values }, summary: `Changed the event ${old.title} on ${timeline.title}` });
          return { text: `Changed the event "${title ?? old.title}" on ${noteRef(timeline)}.`, notes: [mention(timeline)] };
        }

        if (start === undefined || !title) throw new Error("A new event needs a title and a date.");
        const made = await createTimelineEvent(projectId, timelineId, { title, description, start, end: length !== null ? start + length : null, lane, nodeId: about?.id ?? null });
        await recordChange(context, { action: "event-create", nodeId: timelineId, before: { timelineId, id: made.id }, summary: `Added the event ${made.title} to ${timeline.title}` });
        return { text: `Added the event "${made.title}" (event id: ${made.id}) to ${noteRef(timeline)}.`, notes: [mention(timeline)] };
      },
    }),

    addCanvasCards: defineTool({
      access: "write",
      description:
        "Adds cards to a canvas (storyboard): a card that shows a note (a scene, a character), or a card of free text. They are laid out in a row below what is already there, for the writer to arrange.",
      inputSchema: z.object({
        canvasId: z.string().describe("The canvas note's id."),
        cards: z
          .array(z.object({ noteId: z.string().optional().describe("The note the card shows."), text: z.string().max(2000).optional().describe("For a text card: what it says.") }))
          .min(1)
          .max(40),
      }),
      run: async ({ canvasId, cards }) => {
        const project = await loadProject(projectId);
        const canvas = requireLive(project, canvasId);
        if (canvas.kind !== "canvas") throw new Error(`"${canvas.title}" isn't a canvas.`);
        const wanted = cards.map((card): Omit<CardData, "x" | "y"> => {
          if (card.noteId) return { type: "note", nodeId: requireLive(project, card.noteId).id };
          if (!card.text?.trim()) throw new Error("A card needs a noteId or text.");
          return { type: "text", text: card.text.trim() };
        });
        const ids = await editBoard(context, canvasId, (doc) => {
          const map = canvasMaps(doc).cards;
          // Below the lowest card there is, so nothing lands on top of the writer's layout.
          let bottom = 0;
          let left = 0;
          let any = false;
          map.forEach((card) => {
            if (card.parentId) return;
            bottom = Math.max(bottom, card.y + (card.h ?? CARD_H));
            left = any ? Math.min(left, card.x) : card.x;
            any = true;
          });
          const added: string[] = [];
          doc.transact(() => {
            wanted.forEach((card, i) => {
              const id = newBlockId();
              map.set(id, { ...card, x: left + i * (CARD_W + CARD_GAP), y: any ? bottom + CARD_GAP : 0, w: CARD_W, h: CARD_H });
              added.push(id);
            });
          });
          return added;
        });
        await recordChange(context, { action: "cards-add", nodeId: canvasId, before: { cardIds: ids }, summary: `Added ${ids.length} ${plural(ids.length, "card")} to ${canvas.title}` });
        return { text: `Added ${ids.length} ${plural(ids.length, "card")} to ${noteRef(canvas)}.`, notes: [mention(canvas)] };
      },
    }),

    recordKnowledge: defineTool({
      access: "write",
      description:
        "Records that a character knows something, and the scene they learn it in: the who-knows-what tracking the continuity checks read. The fact is a note (a secret, an event, a character's true identity).",
      inputSchema: z.object({
        characterId: z.string().describe("Who knows."),
        factId: z.string().describe("The note that holds what they know."),
        learnedInId: z.string().optional().describe("The scene they learn it in. Leave out when they know it from the start."),
        layer: z.enum(knowledgeLayers).optional().describe("`belief` for something they believe that isn't true."),
        note: z.string().max(500).optional(),
      }),
      run: async ({ characterId, factId, learnedInId, layer, note }) => {
        const project = await loadProject(projectId);
        const character = requireLive(project, characterId);
        const fact = requireLive(project, factId);
        const scene = learnedInId ? requireLive(project, learnedInId) : null;
        const made = await createKnowledge(projectId, { characterNodeId: character.id, factNodeId: fact.id, learnedInNodeId: scene?.id ?? null, ...(layer && { layer }), ...(note && { note }) });
        await recordChange(context, { action: "knowledge-create", nodeId: character.id, before: { id: made.id }, summary: `Recorded that ${character.title} knows ${fact.title}` });
        return { text: `Recorded: ${noteRef(character)} knows ${noteRef(fact)}${scene ? `, from ${noteRef(scene)}` : " from the start"}.`, notes: [mention(character), mention(fact)] };
      },
    }),

    recordSetup: defineTool({
      access: "write",
      description: "Records a setup to be paid off later (a Chekhov's gun, a clue, a promise to the reader, a red herring), with the scene that plants it and, if there is one, the scene that pays it off.",
      inputSchema: z.object({
        title: z.string().min(1).max(160).describe("What is set up, in a few words."),
        kind: z.enum(setupKinds).optional(),
        setupId: z.string().optional().describe("The note (usually a scene) that plants it."),
        payoffId: z.string().optional().describe("The note that pays it off, when there is one."),
        note: z.string().max(500).optional(),
      }),
      run: async ({ title, kind, setupId, payoffId, note }) => {
        const project = await loadProject(projectId);
        const setup = setupId ? requireLive(project, setupId) : null;
        const payoff = payoffId ? requireLive(project, payoffId) : null;
        const made = await createSetup(projectId, { title, ...(kind && { kind }), setupNodeId: setup?.id ?? null, payoffNodeId: payoff?.id ?? null, ...(payoff && { status: "paid" as const }), ...(note && { note }) });
        await recordChange(context, { action: "setup-create", nodeId: setup?.id ?? null, before: { id: made.id }, summary: `Recorded the setup ${made.title}` });
        return { text: `Recorded the setup "${made.title}"${setup ? `, planted in ${noteRef(setup)}` : ""}${payoff ? `, paid off in ${noteRef(payoff)}` : " (still open)"}.`, notes: [setup, payoff].filter((n) => n !== null).map(mention) };
      },
    }),
  };
};
