"use client";

import { Icon } from "@plotra/icons";
import { cn } from "@plotra/ui/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/components/workspace/stores";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { deleteAgentTask, listAgentTasks, pauseAgentTask, undoAgentTask } from "@/lib/agent-actions";
import type { AgentTask } from "@/lib/agent/types";
import { errorText } from "@/lib/errors";
import { Tooltip } from "@plotra/ui/components/tooltip";
import { aiMessage, responseError } from "./response-error";

// Long jobs in the agent panel (plan.md Phase 9d): the list of steps the agent
// planned, started and paused by the writer. The browser drives it, one request
// per step (app/api/agent/task): closing the tab or losing the connection
// stops after the step in flight, and "Resume" picks up at the next one.

/**
 * Why a job can't be started on a model the browser calls (plan.md 2.11 "Local
 * model"): each step is run by the server, one request per step, and the
 * server can't reach a model on the writer's own machine.
 */
const LOCAL_JOBS = "Long jobs need a model the server can reach, and yours runs on your own machine. Ask for the steps in the chat instead, a few notes at a time, or choose another model in Settings → AI.";

const stepStatusLabel = { pending: "To do", running: "Running", done: "Done", failed: "Didn't work" } as const;

const statusIcon = { pending: "menu-dots-linear", running: "refresh-linear", done: "check-linear", failed: "danger-circle-linear" } as const;

function Job({ task, local, onChange, onRemove }: { task: AgentTask; local: boolean; onChange: (task: AgentTask) => void; onRemove: () => void }) {
  const { project, binder, openNode, refreshBinder, announce } = useWorkspace();
  const { index } = useStore(binder);
  const [open, setOpen] = useState(task.status !== "done");
  const [running, setRunning] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [pausing, setPausing] = useState(false);
  // Set by Pause: the loop stops asking for the next step.
  const halt = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const done = task.steps.filter((step) => step.status === "done").length;
  const started = task.steps.some((step) => step.runId);

  const run = useCallback(async () => {
    halt.current = false;
    setPausing(false);
    setRunning(true);
    try {
      for (let guard = 0; guard < task.steps.length + 2 && !halt.current; guard++) {
        request.current = new AbortController();
        const response = await fetch("/api/agent/task", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId: project.id, taskId: task.id }),
          signal: request.current.signal,
        });
        if (!response.ok) throw await responseError(response, "The job stopped with an error. Resume it to carry on.", { ai: true });
        const next = (await response.json()) as AgentTask;
        onChange(next);
        refreshBinder();
        announce();
        if (next.status !== "running") break;
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) toast.error(errorText(error, "The job stopped with an error. Resume it to carry on."));
    } finally {
      setRunning(false);
    }
  }, [announce, onChange, project.id, refreshBinder, task.id, task.steps.length]);

  const pause = () => {
    halt.current = true;
    setPausing(true);
    void pauseAgentTask(project.id, task.id).catch(() => {});
  };

  const undo = async () => {
    setUndoing(true);
    try {
      const result = await undoAgentTask(project.id, task.id);
      onChange({ ...task, status: "paused", steps: task.steps.map((step) => ({ id: step.id, title: step.title, prompt: step.prompt, status: "pending" })) });
      refreshBinder();
      announce();
      if (result.failed.length) toast.warning(`Undone, except ${result.failed.length}: ${result.failed[0]}`);
      else toast.success("Everything the job changed was undone.");
    } catch (error) {
      toast.error(errorText(error, "Couldn't undo that job."));
    } finally {
      setUndoing(false);
    }
  };

  const remove = async () => {
    onRemove();
    await deleteAgentTask(project.id, task.id).catch((error) => toast.error(errorText(error)));
  };

  const failed = task.steps.find((step) => step.status === "failed");
  return (
    <div className="grid gap-1.5 rounded-md border bg-card px-2.5 py-2 text-xs">
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-8 min-w-0 flex-1 items-center gap-1 rounded-md text-left">
          <Icon name={open ? "alt-arrow-down-linear" : "alt-arrow-right-linear"} className="size-3 shrink-0 text-faint" />
          <span className="truncate font-medium text-foreground">{task.title}</span>
          <span className="shrink-0 text-faint tabular-nums">
            <span className="sr-only">, steps done: </span>
            {done}/{task.steps.length}
          </span>
        </button>
        {running ? (
          <button type="button" onClick={pause} className="h-8 shrink-0 rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground">
            {pausing ? "Pausing…" : "Pause"}
          </button>
        ) : task.status !== "done" ? (
          <button type="button" onClick={() => void run()} disabled={undoing || local} aria-describedby={local ? `local-${task.id}` : undefined} className="h-8 shrink-0 rounded-md bg-foreground px-2.5 font-medium text-background hover:opacity-90 disabled:opacity-50">
            {started ? "Resume" : "Start"}
          </button>
        ) : (
          <span className="shrink-0 text-faint">Done</span>
        )}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={task.steps.length} aria-valuenow={done} aria-label={`${task.title}: steps done`}>
        <div className="h-full bg-teal transition-[width]" style={{ width: `${(done / Math.max(task.steps.length, 1)) * 100}%` }} />
      </div>
      {local && task.status !== "done" && (
        <p id={`local-${task.id}`} className="text-muted-foreground">
          {LOCAL_JOBS}
        </p>
      )}
      {failed?.error && !running && <p className="text-destructive">{aiMessage(0, failed.error, "That step didn't work. Resume the job to try it again.")}</p>}
      {open && (
        <>
          <ol className="grid gap-0.5">
            {task.steps.map((step) => {
              const node = step.nodeId ? index.byId.get(step.nodeId) : undefined;
              const state = running && step.status === "pending" && step === task.steps.find((s) => s.status !== "done") ? "running" : step.status;
              return (
                <li key={step.id} className="flex min-h-7 items-center gap-1.5 text-muted-foreground">
                  <Icon name={statusIcon[state]} aria-hidden className={cn("size-3.5 shrink-0", state === "running" && "animate-spin", state === "failed" ? "text-gold-ink" : "text-faint")} />
                  <span className="sr-only">{stepStatusLabel[state]}: </span>
                  <Tooltip content={step.prompt}>
                    {node && !node.deletedAt ? (
                      <button type="button" onClick={() => openNode(node.id, "tab")} className="min-w-0 truncate rounded text-left hover:text-foreground hover:underline">
                        {step.title}
                      </button>
                    ) : (
                      <span tabIndex={0} className="min-w-0 truncate rounded">
                        {step.title}
                      </span>
                    )}
                  </Tooltip>
                </li>
              );
            })}
          </ol>
          {!running && (
            <div className="flex justify-end gap-1.5 border-t pt-1.5">
              {started && (
                <button type="button" onClick={() => void undo()} disabled={undoing} className="flex h-8 items-center gap-1 rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50">
                  <Icon name="undo-left-round-linear" className="size-3.5" />
                  {undoing ? "Undoing…" : "Undo all"}
                </button>
              )}
              <button type="button" onClick={() => void remove()} className="h-8 rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground">
                Remove
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The current user's jobs in this project. `reload` changes when a chat answer lands, since that is where jobs are planned. */
export function Jobs({ reload, local }: { reload: number; /** The person's model is one their browser calls: a job can't be started on it. */ local: boolean }) {
  const { project } = useWorkspace();
  const [tasks, setTasks] = useState<AgentTask[]>([]);

  useEffect(() => {
    let cancelled = false;
    listAgentTasks(project.id)
      .then((found) => !cancelled && setTasks(found))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [project.id, reload]);

  // Finished jobs drop out of the way once there are newer ones.
  const shown = tasks.filter((task, i) => task.status !== "done" || i < 2).slice(0, 4);
  if (!shown.length) return null;
  return (
    <div className="grid shrink-0 gap-1.5 border-b border-sidebar-border p-2" role="region" aria-label="Long jobs">
      {shown.map((task) => (
        <Job
          key={task.id}
          task={task}
          local={local}
          onChange={(next) => setTasks((list) => list.map((t) => (t.id === next.id ? next : t)))}
          onRemove={() => setTasks((list) => list.filter((t) => t.id !== task.id))}
        />
      ))}
    </div>
  );
}
