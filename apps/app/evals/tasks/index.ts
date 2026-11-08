import type { EvalTask } from "../score";
import { askTasks } from "./ask";
import { continuityTasks } from "./continuity";
import { editTasks } from "./edit";
import { injectionTasks } from "./injection";

// The eval set (plan.md Phase 9e): 22 tasks on the sample novel, and six
// prompt-injection tasks on the same project with a hostile fixture added.

export const tasks: EvalTask[] = [...askTasks, ...continuityTasks, ...editTasks, ...injectionTasks];

const ids = new Set<string>();
for (const task of tasks) {
  if (ids.has(task.id)) throw new Error(`Two eval tasks are called ${task.id}.`);
  ids.add(task.id);
}
