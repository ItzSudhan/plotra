import { unstable_rethrow } from "next/navigation";
import { requireAi } from "@/lib/agent/availability";
import { loadBrief } from "@/lib/agent/brief";
import { listChanges, versionRunResults } from "@/lib/agent/changes";
import { describeModelError, modelFor, modelLabel } from "@/lib/agent/providers";
import { runTaskStep } from "@/lib/agent/run";
import { limitRuns, startRun } from "@/lib/agent/runs";
import { loadTask, nextStep, saveTask, stepPrompt } from "@/lib/agent/tasks";
import { UUID } from "@/lib/agent/threads";
import { newBoundary } from "@/lib/agent/untrusted";
import { clearPresence, showPresence } from "@/lib/agent/write";
import { listNodes } from "@/lib/binder";
import { requireSession } from "@/lib/data";
import { publicMessage } from "@/lib/errors";
import { readOnly, transaction } from "@/lib/request-cache";

// POST /api/agent/task: runs the next step of a long job (lib/agent/tasks.ts)
// and answers with the job as it stands afterwards. One step per request, so
// no step outlives a function's time limit and a dropped connection costs one
// step at most. The panel calls it again until the job is done or paused.

export const maxDuration = 300;

const fail = (message: string, status = 400) => new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("Not found", 404);
  let body: { projectId?: unknown; taskId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail("Bad request");
  }
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const taskId = typeof body.taskId === "string" && UUID.test(body.taskId) ? body.taskId : "";
  if (!projectId || !taskId) return fail("Bad request");

  try {
    const prepared = await readOnly(async () => {
      const { user } = await requireSession();
      const { access, settings } = await requireAi(projectId);
      const task = await loadTask(projectId, taskId);
      if (!task) throw new Error("That job no longer exists.");
      const step = nextStep(task);
      if (!step) return { user, access, settings, task, step: null, brief: null, titles: new Map<string, string>() };
      await limitRuns(user.id, "task");
      const titles = new Map((await listNodes(projectId)).map((n) => [n.id, n.title]));
      return { user, access, settings, task, step, brief: await loadBrief(projectId), titles };
    });
    const { user, access, settings, task, step, brief, titles } = prepared;
    if (!step) {
      if (task.status !== "done") await transaction(() => saveTask({ ...task, status: "done" }));
      return Response.json({ ...task, status: "done" }, { headers: { "cache-control": "no-store" } });
    }

    const project = access.project;
    const label = modelLabel(settings, "agent");
    const run = await startRun({ workspaceId: project.organizationId, projectId, threadId: null, userId: user.id, kind: "task", mode: task.mode, model: label, hosted: settings.source === "hosted" });
    const context = { projectId, userId: user.id, userName: user.name, runId: run.id, mode: task.mode, boundary: newBoundary(), inTask: true };
    const instruction = stepPrompt(task, step, (id) => titles.get(id) ?? null);

    const mark = async (patch: Partial<typeof step>, status: typeof task.status) => {
      const steps = task.steps.map((s) => (s.id === step.id ? { ...s, ...patch } : s));
      task.steps = steps;
      task.status = status;
      await transaction(() => saveTask(task));
    };
    await mark({ status: "running", runId: run.id, error: undefined }, "running");
    void showPresence(context, null);

    let failure: string | null = null;
    try {
      const done = await runTaskStep({
        model: modelFor(settings, "agent"),
        mode: task.mode,
        context,
        prompt: { projectTitle: project.title, projectType: project.type, userName: user.name, brief },
        instruction,
        abortSignal: request.signal,
      });
      await run.finish("done", done.usage);
    } catch (error) {
      failure = request.signal.aborted ? "Stopped." : describeModelError(error);
      await run.finish(request.signal.aborted ? "stopped" : "failed", undefined, failure);
    }

    // The note the step made or changed, to open from the list.
    const changed = await readOnly(() => listChanges(run.id)).catch(() => []);
    const nodeId = changed.find((c) => c.action === "create" && c.nodeId)?.nodeId ?? changed.find((c) => c.nodeId)?.nodeId ?? undefined;
    try {
      await clearPresence(context, await versionRunResults(context));
    } catch (cause) {
      console.error("[plotra] couldn't close a job step's changes", cause);
    }

    // Paused while this step ran: it finished, and the job stays paused.
    const paused = (await readOnly(() => loadTask(projectId, taskId)).catch(() => null))?.status === "paused";
    if (failure) await mark({ status: "failed", error: failure.slice(0, 300), ...(nodeId && { nodeId }) }, "paused");
    else await mark({ status: "done", ...(nodeId && { nodeId }) }, !nextStep(task) ? "done" : paused ? "paused" : "running");
    return Response.json(task, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    try {
      unstable_rethrow(error);
    } catch {
      return fail("Sign in again to use AI here.", 401);
    }
    return fail(publicMessage(error));
  }
}
