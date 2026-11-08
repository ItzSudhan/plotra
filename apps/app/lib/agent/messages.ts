import { convertToModelMessages, isToolUIPart, safeValidateUIMessages, type ModelMessage, type ToolSet } from "ai";
import type { AgentMode, AgentUIMessage } from "./types";

// How a conversation travels (plan.md 2.11 "Agent panel"): what the panel
// sends for one turn, and how stored messages become what a model is sent.
// Shared by the server's loop (lib/agent/run.ts) and the one that runs in the
// browser for a local model (lib/agent/local-loop.ts), so nothing here imports
// server code.

/**
 * The body of one turn's request. The server keeps the conversation: only the
 * new message travels (app/api/agent/route.ts), or the writer's answers to
 * what the last answer asked.
 */
export function turnBody(turn: { threadId: string; projectId: string; mode: AgentMode; trigger: "submit-message" | "regenerate-message"; messageId: string | undefined; messages: AgentUIMessage[] }) {
  const last = turn.messages.at(-1);
  const mine = last?.role === "user" ? last.parts : [];
  return {
    threadId: turn.threadId,
    projectId: turn.projectId,
    // The mode travels with each message. A run that carries on after a question keeps the mode it began in.
    mode: turn.mode,
    trigger: turn.trigger,
    messageId: turn.messageId,
    text: mine.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n"),
    mentions: mine.flatMap((part) => (part.type === "data-mentions" ? part.data.notes.map((n) => n.id) : [])),
    // Answers to what the last answer asked (the server ignores any it isn't waiting on).
    approvals:
      last?.role === "assistant"
        ? last.parts.flatMap((part) => (isToolUIPart(part) && part.state === "approval-responded" ? [{ id: part.approval.id, approved: part.approval.approved }] : []))
        : [],
  };
}

export type TurnBody = ReturnType<typeof turnBody>;

/**
 * Turns stored UI messages into what the model is sent. Messages that no
 * longer validate (a tool whose shape changed since they were saved) are
 * dropped rather than failing the run: the newest message always goes.
 */
export async function toModelMessages(messages: AgentUIMessage[], tools: ToolSet): Promise<ModelMessage[]> {
  const convert = (list: AgentUIMessage[]) =>
    convertToModelMessages<AgentUIMessage>(list, {
      tools,
      // A tool call cut off by "stop" has no result; the model can't be sent half a call.
      ignoreIncompleteToolCalls: true,
      convertDataPart: (part) =>
        part.type === "data-mentions" && part.data.notes.length
          ? { type: "text", text: `The user pointed at ${part.data.notes.length === 1 ? "this note" : "these notes"}: ${part.data.notes.map((n) => `${n.title} (id: ${n.id})`).join(", ")}.` }
          : undefined,
    });
  const checked = await safeValidateUIMessages<AgentUIMessage>({ messages, tools: tools as never });
  if (checked.success) return convert(checked.data);
  const last = messages.at(-1);
  return last ? convert([last]) : [];
}
