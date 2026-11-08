import { dialog, shell, type BrowserWindow } from "electron";
import type { Problem } from "./messages";

/**
 * Shows a problem: the plain headline and next step first, the technical part
 * only when asked for ("Show details"), with the log file a click away.
 */
export async function showProblem(problem: Problem, parent?: BrowserWindow | null): Promise<void> {
  const hasDetails = Boolean(problem.detail || problem.log);
  const options = {
    type: "warning" as const,
    message: problem.title,
    detail: problem.message,
    buttons: hasDetails ? ["OK", "Show details"] : ["OK"],
    defaultId: 0,
    cancelId: 0,
  };
  const { response } = parent && !parent.isDestroyed() ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
  if (response !== 1) return;

  const more = [problem.detail, problem.log && `Log file: ${problem.log}`].filter(Boolean).join("\n\n");
  const second = await dialog.showMessageBox({
    type: "info",
    message: "Details",
    detail: more,
    buttons: problem.log ? ["OK", "Show log"] : ["OK"],
    defaultId: 0,
    cancelId: 0,
  });
  if (second.response === 1 && problem.log) shell.showItemInFolder(problem.log);
}
