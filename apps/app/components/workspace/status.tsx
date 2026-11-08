"use client";

import type { WorkflowStage } from "@plotra/db/schema";
import { cn } from "@plotra/ui/lib/utils";
import { stageOf } from "@/lib/stages";
import { useWorkspace } from "./workspace-provider";

// A note's status is a stage of the project's editorial workflow (lib/stages.ts).

/** The stage a status id stands for in this project. */
export function useStage(status: string): WorkflowStage {
  return stageOf(useWorkspace().stages, status);
}

/**
 * The coloured dot shown next to a note's status. With `title` (the default)
 * it also names the stage, on hover and to screen readers; without, the
 * stage's name is written beside it.
 */
export function StatusDot({ status, className, title = true }: { status: string; className?: string; title?: boolean }) {
  const stage = useStage(status);
  return (
    <span
      title={title ? stage.label : undefined}
      className={cn("relative inline-block size-1.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: stage.color }}
    >
      {title && <span className="sr-only">Status: {stage.label}</span>}
    </span>
  );
}
