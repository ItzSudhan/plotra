import "server-only";
import { z } from "zod";
import { requireProjectAccess } from "../../access";
import { formatDate, formatDuration, gregorian, parseDuration, parseStoryDate, type Calendar } from "../../calendar";
import { relationshipMeta } from "../../story";
import { getStory, getTimelineEvents } from "../../story-actions";
import { flatten } from "../../tree";
import { asOfNote, defineTool, loadHorizon, loadProject, mention, noteRef, requireLive, type ToolFactory } from "./context";
import { plural } from "../../plural";

// Story time and who is what to whom (plan.md 2.5): the timeline (standalone
// events, and scenes placed by their "story date") and the relationship map.

const MAX_ROWS = 200;

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

export const storyTools: ToolFactory = ({ projectId }) => ({
  getTimeline: defineTool({
    access: "read",
    description:
      "The story's chronology: every scene that has a story date, and the standalone events of a timeline, in the order they happen (which may differ from the order they are told in). Without `timelineId` it uses the project's first timeline, or the plain calendar when there is none.",
    inputSchema: z.object({
      timelineId: z.string().optional().describe("The id of a timeline note (kind `timeline` in the binder), for its own events and calendar."),
      asOfReleaseId: z.string().optional().describe("Only show what the audience knows once this release is out (ids from listReleases)."),
    }),
    run: async ({ timelineId, asOfReleaseId }) => {
      await requireProjectAccess(projectId);
      const project = await loadProject(projectId);
      const asOf = await loadHorizon(projectId, project, asOfReleaseId);
      const live = flatten(project.index);
      const timelines = live.filter((n) => n.kind === "timeline");
      const timeline = timelineId ? requireLive(project, timelineId) : timelines[0];
      if (timeline && timeline.kind !== "timeline") throw new Error(`"${timeline.title}" isn't a timeline. Timelines in this project: ${timelines.map(noteRef).join(", ") || "none"}.`);

      const story = await getStory(projectId);
      const calendars: Calendar[] = [gregorian, ...story.calendars];
      const calendar = calendars.find((c) => c.id === timeline?.settings.calendarId) ?? gregorian;
      const known = (id: string) => !asOf || asOf.horizon.knows(id);

      type Row = { at: number; end: number | null; label: string; order: number };
      const rows: Row[] = [];
      const undated: string[] = [];
      live.forEach((n, order) => {
        if (n.kind !== "scene" || !known(n.id)) return;
        const date = parseStoryDate(calendar, str(n.properties["story-date"]));
        if (date === null) {
          if (str(n.properties["story-date"])) undated.push(`${n.title} ("${str(n.properties["story-date"])}" can't be read in this calendar)`);
          return;
        }
        const duration = parseDuration(calendar, str(n.properties.duration));
        rows.push({ at: date, end: duration ? date + duration : null, label: `[scene] ${noteRef(n)}`, order });
      });
      // Standalone events aren't notes, so they have no reveal of their own: under a horizon only those tied to a known note are shown.
      const events = timeline ? await getTimelineEvents(projectId, timeline.id) : [];
      for (const event of events) {
        if (asOf && !(event.nodeId && known(event.nodeId))) continue;
        const linked = event.nodeId ? project.live(event.nodeId) : null;
        const detail = [linked && `about ${noteRef(linked)}`, event.lane && `lane ${event.lane}`, event.description?.replace(/\s+/g, " ").slice(0, 200)].filter(Boolean).join(" · ");
        rows.push({ at: event.start, end: event.end, label: `[event] ${event.title} (event id: ${event.id})${detail ? ` · ${detail}` : ""}`, order: Number.MAX_SAFE_INTEGER });
      }
      rows.sort((a, b) => a.at - b.at || a.order - b.order);

      const lines = rows.slice(0, MAX_ROWS).map((row) => {
        const span = row.end !== null && row.end > row.at ? ` (${formatDuration(calendar, row.end - row.at)})` : "";
        return `- ${formatDate(calendar, row.at)}${span}: ${row.label}`;
      });
      const text = [
        `${asOfNote(asOf)}Chronology${timeline ? ` on ${noteRef(timeline)}` : ""}, calendar: ${calendar.name}.`,
        lines.length ? lines.join("\n") : "(No scene has a story date, and there are no events.)",
        rows.length > MAX_ROWS ? `… and ${rows.length - MAX_ROWS} later entries.` : null,
        undated.length ? `Dates that couldn't be read: ${undated.slice(0, 20).join("; ")}` : null,
        timelines.length > 1 ? `Other timelines: ${timelines.filter((t) => t.id !== timeline?.id).map(noteRef).join(", ")}` : null,
      ];
      return { text: text.filter(Boolean).join("\n"), notes: timeline ? [mention(timeline)] : [] };
    },
  }),

  getRelationships: defineTool({
    access: "read",
    description:
      "The relationship map: who is an ally, rival, parent, mentor… of whom. Pass a character's id for their relationships only, or leave it out for the whole map.",
    inputSchema: z.object({
      nodeId: z.string().optional().describe("A character's (or any note's) id, to list only their relationships."),
      asOfReleaseId: z.string().optional().describe("Only show what the audience knows once this release is out (ids from listReleases)."),
    }),
    run: async ({ nodeId, asOfReleaseId }) => {
      await requireProjectAccess(projectId);
      const project = await loadProject(projectId);
      const asOf = await loadHorizon(projectId, project, asOfReleaseId);
      const focus = nodeId ? requireLive(project, nodeId) : null;
      const visible = (id: string) => project.live(id) !== null && (!asOf || asOf.horizon.knows(id));
      const { relationships } = await getStory(projectId);
      const shown = relationships.filter(
        (r) => visible(r.fromNodeId) && visible(r.toNodeId) && (!focus || r.fromNodeId === focus.id || r.toNodeId === focus.id),
      );
      if (!shown.length) return { text: `${asOfNote(asOf)}No relationships recorded${focus ? ` for "${focus.title}"` : ""}.`, notes: focus ? [mention(focus)] : [] };

      const lines = shown.slice(0, MAX_ROWS).map((r) => {
        const from = project.live(r.fromNodeId)!;
        const to = project.live(r.toNodeId)!;
        const type = relationshipMeta(r.type).label;
        const arrow = r.directed ? "→" : "↔";
        return `- ${noteRef(from)} ${arrow} ${noteRef(to)}: ${type}${r.label ? ` (${r.label})` : ""} · relationship id: ${r.id}`;
      });
      const people = [...new Set(shown.flatMap((r) => [r.fromNodeId, r.toNodeId]))].map((id) => project.live(id)!);
      return {
        text: `${asOfNote(asOf)}${shown.length} ${plural(shown.length, "relationship")}${focus ? ` of "${focus.title}"` : ""} (→ is one-way: the first is that to the second):\n${lines.join("\n")}`,
        notes: focus ? [mention(focus)] : people.length <= 8 ? people.map(mention) : [],
      };
    },
  }),
});
