import "server-only";
import { schema } from "@plotra/db";
import type { AgentMode, AgentTaskStep } from "@plotra/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { userDb } from "../db";
import type { AgentTask } from "./types";

// Long jobs (plan.md Phase 9d): drafting an act, building a project from a
// premise. A job is a saved list of steps, and each step is one request of its
// own (app/api/agent/task). A dropped connection or a function that ran out of
// time loses at most the step it was on: the list is in the database, and
// running the job again picks up at the first step that isn't done.

const { agentTask } = schema;

export const MAX_STEPS = 40;

const columns = {
  id: agentTask.id,
  title: agentTask.title,
  mode: agentTask.mode,
  status: agentTask.status,
  steps: agentTask.steps,
  updatedAt: agentTask.updatedAt,
};

/** Saves a new job. It doesn't start by itself: the writer reads the list and starts it. */
export async function createTask(input: { projectId: string; userId: string; threadId: string | null; title: string; mode: AgentMode; steps: Array<{ title: string; prompt: string }> }): Promise<AgentTask> {
  const steps: AgentTaskStep[] = input.steps.slice(0, MAX_STEPS).map((step) => ({
    id: crypto.randomUUID(),
    title: step.title.trim().slice(0, 160) || "Step",
    prompt: step.prompt.trim().slice(0, 4000),
    status: "pending",
  }));
  const [row] = await userDb((tx) =>
    tx
      .insert(agentTask)
      // A job never runs in Ask: it exists to write.
      .values({ projectId: input.projectId, userId: input.userId, threadId: input.threadId, title: input.title.trim().slice(0, 160) || "Job", mode: input.mode === "ask" ? "suggest" : input.mode, steps })
      .returning(columns),
  );
  return row;
}

/** The current user's jobs in a project, newest first. Row-level security keeps them to their own. */
export async function listTasks(projectId: string): Promise<AgentTask[]> {
  return userDb((tx) => tx.select(columns).from(agentTask).where(eq(agentTask.projectId, projectId)).orderBy(desc(agentTask.updatedAt)).limit(20));
}

export async function loadTask(projectId: string, taskId: string): Promise<AgentTask | null> {
  const [row] = await userDb((tx) => tx.select(columns).from(agentTask).where(and(eq(agentTask.id, taskId), eq(agentTask.projectId, projectId))).limit(1));
  return row ?? null;
}

export async function saveTask(task: Pick<AgentTask, "id" | "status" | "steps">): Promise<void> {
  await userDb((tx) => tx.update(agentTask).set({ status: task.status, steps: task.steps }).where(eq(agentTask.id, task.id)));
}

export async function deleteTask(projectId: string, taskId: string): Promise<void> {
  await userDb((tx) => tx.delete(agentTask).where(and(eq(agentTask.id, taskId), eq(agentTask.projectId, projectId))));
}

/** The step to run next: the first that isn't done. A step left "running" by a request that died is run again. */
export const nextStep = (task: Pick<AgentTask, "steps">) => task.steps.find((step) => step.status !== "done") ?? null;

/** What the model is told for one step: the job, what is done, and this step alone. */
export function stepPrompt(task: Pick<AgentTask, "title" | "steps">, step: AgentTaskStep, titleOf: (nodeId: string) => string | null): string {
  const position = task.steps.findIndex((s) => s.id === step.id);
  const done = task.steps
    .slice(0, position)
    .filter((s) => s.status === "done")
    .map((s) => `- ${s.title}${s.nodeId && titleOf(s.nodeId) ? ` (in the note "${titleOf(s.nodeId)}", id: ${s.nodeId})` : ""}`);
  const ahead = task.steps.slice(position + 1).map((s) => `- ${s.title}`);
  return [
    `You are carrying out a long job, one step per request: "${task.title}". This is step ${position + 1} of ${task.steps.length}.`,
    done.length ? `Already done:\n${done.join("\n")}` : null,
    ahead.length ? `Still to come, in later requests (don't do these now):\n${ahead.join("\n")}` : null,
    `This step: ${step.title}\n${step.prompt}`,
    step.status === "running" || step.status === "failed" ? "This step was started before and interrupted. Look at what already exists (binderOutline, readNote) and carry on from there instead of doing it twice." : null,
    "Do this step and nothing else. The writer approved this list, so create and change what the step needs without asking. When it is done, check it with reviewChanges, then say in one or two sentences what you did.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
