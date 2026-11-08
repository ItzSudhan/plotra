import "server-only";
import type { AgentMode } from "@plotra/db/schema";
import type { ToolSet } from "ai";
import { binderTools } from "./binder";
import { continuityTools } from "./continuity";
import { readOnly } from "../../request-cache";
import { listChanges } from "../changes";
import type { ToolResult } from "../types";
import { loadProject, type AgentTool, type ToolContext, type ToolFactory } from "./context";
import { entityTools } from "./entities";
import { linkTools } from "./links";
import { noteTools } from "./notes";
import { searchTools } from "./search";
import { storyTools } from "./story";
import { reviewNotes, taskTools } from "./tasks";
import { worldTools } from "./world";
import { binderWriteTools } from "./write-binder";
import { noteWriteTools } from "./write-notes";
import { storyWriteTools } from "./write-story";

export type { AgentTool, ToolContext, ToolFactory } from "./context";

// Where the agent's tools are registered (plan.md 2.11 "How it edits").
//
// One file per area, each exporting a `ToolFactory`; add a factory to
// `factories` and its tools exist. Every tool says whether it reads or writes
// (`access`), and that alone decides which modes may use it: there is no
// second list to keep in step.
//
// To add a tool: `defineTool({ access, description, inputSchema, run })` in an
// area file (tools/context.ts), and a line for it in lib/agent/tool-labels.ts
// so the panel can say what the step did.

const factories: ToolFactory[] = [
  binderTools,
  searchTools,
  noteTools,
  entityTools,
  linkTools,
  storyTools,
  worldTools,
  continuityTools,
  noteWriteTools,
  binderWriteTools,
  storyWriteTools,
  taskTools,
];

/** Every tool, built for one run, whatever its access. */
export function allTools(context: ToolContext): Record<string, AgentTool> {
  const tools: Record<string, AgentTool> = {};
  for (const factory of factories) {
    for (const [name, built] of Object.entries(factory(context))) {
      if (tools[name]) throw new Error(`Two agent tools are called ${name}.`);
      tools[name] = name === "planTask" ? built : checkedAfterWrite(built, context);
    }
  }
  return tools;
}

type Execute = (input: never, options: never) => Promise<ToolResult>;

/**
 * Checks each change against the story's rules as it lands (plan.md 2.11
 * "reviewChanges"). The prompt asks the model to call reviewChanges when it is
 * done, but nothing makes it; this does the same check on the notes each write
 * just changed, and puts what it finds in that write's result, where the model
 * reads it before its next step. Nothing found adds nothing.
 */
function checkedAfterWrite(built: AgentTool, context: ToolContext): AgentTool {
  const execute = built.execute as Execute | undefined;
  if (built.access !== "write" || !execute) return built;
  return Object.assign(Object.create(Object.getPrototypeOf(built)), built, {
    execute: async (input: never, options: never) => {
      const before = new Set((await readOnly(() => listChanges(context.runId))).map((change) => change.id));
      const result = await execute(input, options);
      try {
        const found = await readOnly(async () => {
          const changed = (await listChanges(context.runId)).filter((change) => !before.has(change.id) && change.nodeId).map((change) => change.nodeId!);
          if (!changed.length) return null;
          const project = await loadProject(context.projectId);
          const live = [...new Set(changed)].filter((id) => project.live(id));
          if (!live.length) return null;
          const review = await reviewNotes(context.projectId, project, live);
          const parts = [review.continuity, review.spoilers].filter(Boolean);
          return parts.length ? parts.join("\n\n") : null;
        });
        return found ? { ...result, text: `${result.text}\n\nChecked what this changed against the story's rules. Fix it, or tell the writer what you left and why:\n${found}` } : result;
      } catch (error) {
        // The write itself went through; a check that fails is left to reviewChanges.
        console.error("[plotra] couldn't check an agent change", error);
        return result;
      }
    },
  }) as AgentTool;
}

/** Which modes may change the project. Ask may not (plan.md 2.11 "Modes"). */
export const modeWrites: Record<AgentMode, boolean> = { ask: false, suggest: true, auto: true };

/**
 * The tools a run may use. Ask gets the tools that only read; Suggest and Auto
 * also get the ones that write. This is the only
 * place that decision is made: a tool left out here can't be called, whatever
 * the model asks for.
 */
export function toolsFor(mode: AgentMode, context: ToolContext): ToolSet {
  const allowed = Object.entries(allTools(context)).filter(([, built]) => built.access === "read" || modeWrites[mode]);
  return Object.fromEntries(allowed) as ToolSet;
}

/** The names of the tools a mode gets, with their access: for tests and the run log. */
export function toolAccess(mode: AgentMode, context: ToolContext): Record<string, "read" | "write"> {
  return Object.fromEntries(Object.entries(toolsFor(mode, context)).map(([name, built]) => [name, (built as unknown as AgentTool).access]));
}
