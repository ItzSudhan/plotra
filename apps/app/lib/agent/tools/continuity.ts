import "server-only";
import { z } from "zod";
import { requireProjectAccess } from "../../access";
import { formatDate, gregorian, type Calendar } from "../../calendar";
import { buildSheet, checkContinuity, rules, type ContinuityInput, type Issue } from "../../continuity";
import { getProjectLinks } from "../../knowledge-actions";
import { getStory } from "../../story-actions";
import { flatten } from "../../tree";
import { getWorld } from "../../world-actions";
import { defineTool, loadProject, mention, noteRef, requireLive, type Project, type ToolFactory } from "./context";
import { plural } from "../../plural";

// The rule-based continuity checks (lib/continuity.ts) and the per-character
// continuity sheet, run on the server from the same data the Continuity view
// gathers in the browser. Rule-based, so the same answer every time: the
// agent reports what the rules found, it doesn't guess.

/**
 * Everything the checks read (see `useContinuityInput` in
 * components/views/continuity-view.tsx). Story dates are read in the calendar
 * the project's first timeline uses, or the Gregorian one. Exported for the
 * editing agent, which re-runs the checks on what it touched (plan.md 2.11).
 */
export async function loadContinuityInput(projectId: string, project: Project): Promise<ContinuityInput> {
  const [story, world, links] = await Promise.all([getStory(projectId), getWorld(projectId), getProjectLinks(projectId)]);
  const live = flatten(project.index);
  const calendars: Calendar[] = [gregorian, ...story.calendars];
  const chosen = live.find((n) => n.kind === "timeline" && typeof n.settings.calendarId === "string")?.settings.calendarId;
  return {
    nodes: live,
    links,
    threads: story.threads,
    cells: story.cells,
    knowledge: world.knowledge,
    setups: world.setups,
    relationships: story.relationships,
    calendar: calendars.find((c) => c.id === chosen) ?? gregorian,
  };
}

const MAX_ISSUES = 80;

export const continuityTools: ToolFactory = ({ projectId }) => ({
  checkContinuity: defineTool({
    access: "read",
    description:
      "Runs the project's rule-based continuity checks and returns what they found: a character appearing after their death or before their birth, an age that doesn't match the timeline, someone in two places at once, a resolved plot thread picked up again, a point-of-view character knowing something before they learn it, a payoff before its setup, setups still open, canon scenes relying on something that isn't canon. Pass `nodeId` for the issues involving one note.",
    inputSchema: z.object({
      nodeId: z.string().optional().describe("Only issues that involve this note (a scene, a character…)."),
      severity: z.enum(["error", "warning", "info"]).optional().describe("Only issues of this severity."),
    }),
    run: async ({ nodeId, severity }) => {
      await requireProjectAccess(projectId);
      const project = await loadProject(projectId);
      const focus = nodeId ? requireLive(project, nodeId) : null;
      const input = await loadContinuityInput(projectId, project);
      const all = checkContinuity(input);
      const issues = all.filter((issue: Issue) => (!focus || issue.nodeIds.includes(focus.id)) && (!severity || issue.severity === severity));
      const scope = `${focus ? ` involving "${focus.title}"` : ""}${severity ? ` of severity ${severity}` : ""}`;
      if (!issues.length) {
        return {
          text: `The continuity checks found nothing${scope}. They only read what is recorded: story dates, birth and death dates, locations, links, plot threads, who-knows-what and setups. (Calendar: ${input.calendar.name}.)`,
          notes: focus ? [mention(focus)] : [],
        };
      }
      const lines = issues.slice(0, MAX_ISSUES).map((issue) => {
        const where = issue.nodeIds.map((id) => project.live(id)).filter((n) => n !== null).map(noteRef).join("; ");
        return `- [${issue.severity}] ${rules[issue.rule].label}: ${issue.message}${where ? `\n  Notes: ${where}` : ""}`;
      });
      const first = [...new Set(issues.map((issue) => issue.nodeIds[0]))].map((id) => project.live(id)).filter((n) => n !== null);
      return {
        text: `${issues.length} ${plural(issues.length, "continuity issue")}${scope} (calendar: ${input.calendar.name}):\n${lines.join("\n")}${issues.length > MAX_ISSUES ? `\n… and ${issues.length - MAX_ISSUES} more.` : ""}`,
        notes: first.slice(0, 8).map(mention),
      };
    },
  }),

  characterSheet: defineTool({
    access: "read",
    description:
      "A character's continuity sheet: when they were born and died, every scene they are in (in story order when the scenes are dated) with their age and where they are, what they learn in each scene, what they knew from the start, and their relationships.",
    inputSchema: z.object({ characterId: z.string().describe("The character's id.") }),
    run: async ({ characterId }) => {
      await requireProjectAccess(projectId);
      const project = await loadProject(projectId);
      const character = requireLive(project, characterId);
      const input = await loadContinuityInput(projectId, project);
      const sheet = character.kind === "character" ? buildSheet(input, character.id) : null;
      if (!sheet) return { text: `"${character.title}" isn't a character, so it has no continuity sheet.`, notes: [mention(character)] };
      const cal = input.calendar;
      const knows = (list: Array<{ factNodeId: string; layer: string; note: string | null }>) =>
        list.map((k) => `${project.title(k.factNodeId)}${k.layer === "belief" ? " (a false belief)" : ""}${k.note ? `: ${k.note}` : ""}`).join("; ");
      const rows = sheet.rows.map((row) => {
        const parts = [
          row.date !== null ? formatDate(cal, row.date) : "undated",
          row.age !== null ? `age ${row.age}` : null,
          row.locationId ? `at ${project.title(row.locationId)}` : null,
          row.pov ? "point of view" : null,
          row.learns.length ? `learns: ${knows(row.learns)}` : null,
        ];
        return `- ${project.title(row.sceneId)} (id: ${row.sceneId}) · ${parts.filter(Boolean).join(" · ")}`;
      });
      const text = [
        `Continuity sheet of ${noteRef(character)} (calendar: ${cal.name})`,
        `Born: ${sheet.born !== null ? formatDate(cal, sheet.born) : "not recorded"} · Died: ${sheet.died !== null ? formatDate(cal, sheet.died) : "not recorded"}`,
        sheet.knownFromStart.length ? `Knows from the start: ${knows(sheet.knownFromStart)}` : null,
        sheet.relationships.length
          ? `Relationships: ${sheet.relationships.map((r) => `${r.label || r.type} ${r.directed ? (r.outgoing ? "of" : "from") : "with"} ${project.title(r.otherId)}`).join("; ")}`
          : null,
        `Scenes (${sheet.chronological ? "in story order" : "in reading order: not every scene is dated"}):`,
        rows.length ? rows.join("\n") : "(appears in no scene yet)",
      ];
      return { text: text.filter(Boolean).join("\n"), notes: [mention(character)] };
    },
  }),
});
