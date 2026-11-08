import "server-only";
import { z } from "zod";
import { requireProjectAccess } from "../../access";
import { getProjectLinks } from "../../knowledge-actions";
import { releaseOrder, revealMap } from "../../horizon";
import { checkContinuity, rules } from "../../continuity";
import { listChanges } from "../changes";
import { createTask, MAX_STEPS } from "../tasks";
import { loadContinuityInput } from "./continuity";
import { defineTool, loadProject, loadReleases, noteRef, type Project, type ToolFactory } from "./context";
import { plural } from "../../plural";

// Two tools about the run itself (plan.md Phase 9d): planning a long job as a
// saved list of steps, and checking what the run has written against the
// story's own rules before it says it is done.

/**
 * The story's own rules, on some notes: the continuity issues that involve
 * them, and links from them to something their release doesn't reveal yet.
 * Each part is null when it found nothing.
 */
export async function reviewNotes(projectId: string, project: Project, touched: string[]): Promise<{ continuity: string | null; spoilers: string | null; tracksReleases: boolean }> {
  const mine = new Set(touched);
  const input = await loadContinuityInput(projectId, project);
  const issues = checkContinuity(input).filter((issue) => issue.nodeIds.some((id) => mine.has(id)));
  const lines = issues.slice(0, 40).map((issue) => `- [${issue.severity}] ${rules[issue.rule].label}: ${issue.message}`);

  // Spoilers: a note you changed that links to something revealed in a later release than its own.
  const releases = await loadReleases(projectId);
  const order = releaseOrder(releases);
  const reveals = revealMap(project.nodes, releases);
  const releaseTitle = (id: string) => releases.find((r) => r.id === id)?.title ?? "a later release";
  const spoilers: string[] = [];
  if (releases.length) {
    for (const link of await getProjectLinks(projectId)) {
      if (!mine.has(link.source)) continue;
      const from = reveals.get(link.source);
      const to = reveals.get(link.target);
      const source = project.live(link.source);
      const target = project.live(link.target);
      if (!from || !source || !target) continue;
      if (!to) spoilers.push(`- ${noteRef(source)} (out in "${releaseTitle(from)}") links to ${noteRef(target)}, which no release reveals.`);
      else if ((order.get(to) ?? 0) > (order.get(from) ?? 0)) spoilers.push(`- ${noteRef(source)} (out in "${releaseTitle(from)}") links to ${noteRef(target)}, which isn't revealed until "${releaseTitle(to)}".`);
    }
  }
  return {
    continuity: lines.length ? `Continuity:\n${lines.join("\n")}${issues.length > 40 ? `\n… and ${issues.length - 40} more.` : ""}` : null,
    spoilers: spoilers.length ? `Revealed too early:\n${[...new Set(spoilers)].slice(0, 30).join("\n")}` : null,
    tracksReleases: releases.length > 0,
  };
}

export const taskTools: ToolFactory = (context) => {
  const { projectId, userId, runId } = context;
  return {
    reviewChanges: defineTool({
      access: "read",
      description:
        "Checks what you have written or changed in this run against the story's own rules: the continuity checks on the notes you touched, and whether a scene you wrote links to something the audience hasn't been shown yet by that scene's release. Call it after writing or changing scenes, and fix or report what it finds.",
      inputSchema: z.object({}),
      run: async () => {
        await requireProjectAccess(projectId);
        const project = await loadProject(projectId);
        const touched = [...new Set((await listChanges(runId)).map((change) => change.nodeId).filter((id): id is string => !!id))].filter((id) => project.live(id));
        if (!touched.length) return { text: "This run hasn't changed any notes.", notes: [] };
        const review = await reviewNotes(projectId, project, touched);
        const parts = [
          `Checked the ${touched.length} ${plural(touched.length, "note")} this run changed.`,
          review.continuity ?? "Continuity: nothing found. (The checks only read what is recorded: story dates, births and deaths, locations, links, plot threads, who-knows-what and setups.)",
          review.spoilers ?? (review.tracksReleases ? "Spoilers: nothing you wrote links to something revealed later." : null),
        ];
        return { text: parts.filter(Boolean).join("\n\n"), notes: [] };
      },
    }),

    // A step of a job can't plan another job.
    ...(context.inTask
      ? {}
      : {
          planTask: defineTool({
            access: "write",
            description: `Plans a long job as a list of steps the writer can read, start, pause and resume: drafting an act scene by scene, building a project from a premise, carrying one change through many chapters. Use it when the work is too much for one answer (more than about five notes to write). Each step runs later as its own request and sees only its own instructions plus the project, so write each \`prompt\` to stand alone: which note, what to write, what to keep in mind. At most ${MAX_STEPS} steps. Planning changes nothing: after calling it, tell the writer the plan is ready to start.`,
            inputSchema: z.object({
              title: z.string().min(1).max(160).describe("What the job is, in a few words."),
              steps: z
                .array(z.object({ title: z.string().min(1).max(160).describe("A few words, shown in the list."), prompt: z.string().min(1).max(4000).describe("The full instructions for this step.") }))
                .min(1)
                .max(MAX_STEPS),
            }),
            run: async ({ title, steps }) => {
              await requireProjectAccess(projectId, "edit");
              const task = await createTask({ projectId, userId, threadId: context.threadId ?? null, title, mode: context.mode, steps });
              return { text: `The job "${task.title}" is saved with ${task.steps.length} ${plural(task.steps.length, "step")} (job id: ${task.id}). It hasn't started: the writer starts it from the panel.`, notes: [] };
            },
          }),
        }),
  };
};
