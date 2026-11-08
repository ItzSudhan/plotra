import "server-only";
import type { AgentMode } from "@plotra/db/schema";
import type { ToolApprovalStatus } from "ai";
import { readOnly } from "../request-cache";
import { notesTouched } from "./changes";
import type { AgentTool } from "./tools";
import type { AgentUIMessage } from "./types";

// When the agent has to ask first (plan.md 2.11 "Modes").
//
// - Suggest: text edits arrive as suggestions, so they need no asking: the
//   writer accepts or rejects them in the document. Everything else that would
//   change the project is put to the writer before it happens.
// - Auto: changes apply straight away, except moving something to the trash,
//   changing what is canon, and going past a handful of notes in one run.
//
// Asking is the AI SDK's tool approval: the run stops with a request, the
// writer answers in the panel, and the next request carries on from there.

/** How many notes an Auto run may change before it asks once whether to go on. */
export const HANDFUL = 5;

/** Marks the "more than a handful" request, so its approval can be found again on the next request. */
export const BULK_REASON = "This run has already changed several notes. Let it carry on?";

/**
 * Tools whose changes the writer reviews where they land, in any mode:
 * suggestions, comments, and a planned job (a list they read and start).
 */
const reviewedInPlace = new Set(["editNote", "writeNote", "commentOnNote", "planTask"]);

/** Always asked about, in Auto too. */
const alwaysAsk: Record<string, string> = {
  trashNote: "Moving a note to the trash.",
  setCanon: "Changing what is canon.",
};

export type ApprovalContext = {
  mode: AgentMode;
  runId: string;
  /** The writer already said yes to going past a handful of notes in this answer. */
  bulkApproved: boolean;
  /**
   * A step of a long job: nobody is there to answer, and starting the job was
   * the writer's yes to its list. What is always asked about is refused instead.
   */
  inTask?: boolean;
};

/**
 * What one call needs before it may run, by the rules above. The whole rule,
 * with nothing remembered between calls: the server's own loop wraps it
 * (`approvalPolicy`), and the endpoint that runs tools for a loop in the
 * browser asks it afresh for every call (lib/agent/local-run.ts). `touched`
 * is for tests; left out, the run's changes are counted in the database.
 */
export async function approvalFor(
  context: ApprovalContext,
  toolName: string,
  built: Pick<AgentTool, "access"> | undefined,
  touched: (runId: string) => Promise<number> = (runId) => readOnly(() => notesTouched(runId)),
): Promise<ToolApprovalStatus> {
  if (!built || built.access !== "write") return undefined;
  if (alwaysAsk[toolName]) {
    if (context.inTask) return { type: "denied", reason: "A long job doesn't move notes to the trash or change what is canon. Leave it, and tell the writer what you would have done." };
    return { type: "user-approval", reason: alwaysAsk[toolName] };
  }
  if (context.inTask) return undefined;
  if (context.mode === "suggest") {
    return reviewedInPlace.has(toolName) ? undefined : { type: "user-approval", reason: "Suggest mode: this changes the project's structure, so it waits for you." };
  }
  if (context.bulkApproved) return undefined;
  // Read fresh each time: the count grows as the run goes.
  if ((await touched(context.runId)) < HANDFUL) return undefined;
  return { type: "user-approval", reason: BULK_REASON };
}

/** The approval rule for one run, in the shape `streamText` takes. */
export function approvalPolicy(context: ApprovalContext, tools: Record<string, unknown>) {
  let bulkAsked = false;
  return async ({ toolCall }: { toolCall: { toolName: string } }): Promise<ToolApprovalStatus> => {
    const status = await approvalFor({ ...context, bulkApproved: context.bulkApproved || bulkAsked }, toolCall.toolName, tools[toolCall.toolName] as AgentTool | undefined);
    // Asked once; the calls made in the same step ride on that answer.
    if (typeof status === "object" && status.type === "user-approval" && status.reason === BULK_REASON) bulkAsked = true;
    return status;
  };
}

export type ToolPart = { type: string; toolName?: string; toolCallId?: string; state?: string; input?: unknown; approval?: { id: string; approved?: boolean; reason?: string; requestReason?: string } };

/** The tool calls of a stored answer, as plain parts. */
export const toolParts = (message: AgentUIMessage | undefined) => ((message?.parts ?? []) as ToolPart[]).filter((part) => part.type.startsWith("tool-") || part.type === "dynamic-tool");

/** Whether the writer has already approved a bulk request in this answer. */
export function bulkApprovedIn(message: AgentUIMessage | undefined): boolean {
  return toolParts(message).some((part) => part.approval?.approved === true && part.approval.requestReason === BULK_REASON);
}

/** The ids of the approval requests an answer is still waiting on. */
export function pendingApprovals(message: AgentUIMessage | undefined): string[] {
  return message?.role === "assistant" ? toolParts(message).flatMap((part) => (part.state === "approval-requested" && part.approval ? [part.approval.id] : [])) : [];
}

/**
 * Writes the writer's answers into the stored message, which is where the
 * model reads them from on the next request. A request with no answer counts
 * as "no" (`fallbackReason` says why): a run never waits on an unanswered
 * question once the conversation has moved on.
 */
export function answerApprovals(message: AgentUIMessage, answers: ReadonlyMap<string, boolean>, fallbackReason: string): AgentUIMessage {
  const parts = (message.parts as ToolPart[]).map((part) => {
    if (part.state !== "approval-requested" || !part.approval) return part;
    const approved = answers.get(part.approval.id);
    return {
      ...part,
      state: "approval-responded",
      approval: { ...part.approval, approved: approved === true, ...(approved === undefined && { reason: fallbackReason }) },
    };
  });
  return { ...message, parts: parts as AgentUIMessage["parts"] };
}
