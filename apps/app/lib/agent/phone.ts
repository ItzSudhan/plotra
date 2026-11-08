import { getToolName, isToolUIPart } from "ai";
import { approvalVerb, stepLabel } from "./tool-labels";
import type { AgentMode, AgentUIMessage, AiState, Mention, ToolResult } from "./types";

// The agent's conversation as the phone app shows it (app/api/mobile/agent):
// the web panel's message, already read, so the phone doesn't have to know
// the AI SDK's message parts. Text, one line per tool step in the panel's own
// words (lib/agent/tool-labels.ts), the notes used, and the changes the run
// is waiting for a yes on. Pure, so it can be tested.

export type PhoneStep = { type: "step"; id: string; text: string; nodeId: string | null; state: "running" | "waiting" | "done" | "failed" | "denied"; error: string | null };
export type PhoneItem = { type: "text"; text: string } | PhoneStep;
export type PhoneApproval = { id: string; text: string; nodeId: string | null };

export type PhoneAgentMessage = {
  id: string;
  role: "user" | "assistant";
  items: PhoneItem[];
  /** Notes the writer pointed at with @. */
  mentions: Mention[];
  /** Notes the answer's tool calls drew on, without repeats. */
  used: Mention[];
  /** Changes waiting for the writer's yes or no, and why it asks. */
  approvals: PhoneApproval[];
  approvalReason: string | null;
  runId: string | null;
  mode: AgentMode | null;
  tokens: { in: number; out: number } | null;
};

type Part = AgentUIMessage["parts"][number];
type ToolPart = Extract<Part, { toolCallId: string }>;

const inputOf = (part: ToolPart) => (part.input && typeof part.input === "object" ? part.input : {}) as Record<string, unknown>;

function step(part: ToolPart): PhoneStep {
  const label = stepLabel(getToolName(part));
  const subject = label.subject?.(inputOf(part)) ?? null;
  const denied = part.state === "output-denied" || (part.state === "approval-responded" && part.approval.approved === false);
  const state: PhoneStep["state"] = denied
    ? "denied"
    : part.state === "output-error"
      ? "failed"
      : part.state === "output-available"
        ? "done"
        : part.state === "approval-requested"
          ? "waiting"
          : "running";
  const verb = state === "running" || state === "waiting" ? label.doing : label.done;
  return {
    type: "step",
    id: part.toolCallId,
    text: subject?.text && !subject.nodeId ? `${verb} ${subject.text}` : verb,
    nodeId: subject?.nodeId ?? null,
    state,
    error: part.state === "output-error" ? (part.errorText ?? null) : null,
  };
}

export function toPhoneMessage(message: AgentUIMessage): PhoneAgentMessage {
  const items: PhoneItem[] = [];
  const mentions: Mention[] = [];
  const used = new Map<string, Mention>();
  const approvals: PhoneApproval[] = [];
  const reasons = new Set<string>();
  for (const part of message.parts) {
    if (part.type === "text") {
      if (part.text.trim()) items.push({ type: "text", text: part.text });
    } else if (part.type === "data-mentions") {
      mentions.push(...part.data.notes);
    } else if (isToolUIPart(part)) {
      const tool = part as ToolPart;
      items.push(step(tool));
      if (tool.state === "output-available") {
        const output = tool.output as Partial<ToolResult> | undefined;
        for (const note of Array.isArray(output?.notes) ? output.notes : []) if (note?.id && !used.has(note.id)) used.set(note.id, note);
      }
      if (tool.state === "approval-requested" && !tool.approval.isAutomatic) {
        const name = getToolName(tool);
        const subject = stepLabel(name).subject?.(inputOf(tool)) ?? null;
        approvals.push({ id: tool.approval.id, text: `${approvalVerb[name] ?? stepLabel(name).doing}${subject?.text && !subject.nodeId ? ` ${subject.text}` : ""}`, nodeId: subject?.nodeId ?? null });
        if (tool.approval.requestReason) reasons.add(tool.approval.requestReason);
      }
    }
  }
  const meta = message.metadata ?? {};
  return {
    id: message.id,
    role: message.role === "user" ? "user" : "assistant",
    items,
    mentions,
    used: [...used.values()],
    approvals,
    approvalReason: reasons.size === 1 ? [...reasons][0] : null,
    runId: meta.runId ?? null,
    mode: meta.mode ?? null,
    tokens: meta.inputTokens !== undefined && meta.outputTokens !== undefined ? { in: meta.inputTokens, out: meta.outputTokens } : null,
  };
}

/** Whether the phone can ask the AI here, and if not, why, in words for the writer. */
export type PhoneAi =
  | { on: true; modelSource: AiState["modelSource"] }
  | { on: false; reason: "server" | "promise" | "workspace" | "project" | "edit" | "own-machine" | "no-model"; message: string };

export function phoneAi(state: AiState): PhoneAi {
  if (state.forbidden === "server") return { on: false, reason: "server", message: "AI isn't available on this Plotra server." };
  if (state.forbidden === "workspace") return { on: false, reason: "promise", message: "This workspace has promised no AI, so there's no AI in its projects." };
  if (!state.workspaceEnabled)
    return { on: false, reason: "workspace", message: "AI is off for this workspace. It stays off until a workspace owner turns it on, on the web: Workspace settings → AI." };
  if (!state.projectEnabled)
    return { on: false, reason: "project", message: "AI is off for this project. Someone who manages it can turn it on, on the web: Project settings → Tools → AI agent." };
  // Both switches are on by here, so what's left of `enabled` is the right to edit.
  if (!state.enabled) return { on: false, reason: "edit", message: "Only people who can edit this project can use AI in it." };
  if (state.browserModel)
    return {
      on: false,
      reason: "own-machine",
      message: "Your AI model runs on your own computer, so only that computer's browser can reach it. Ask it from the web there, or pick a model from an AI company in Settings → AI.",
    };
  if (!state.hasModel)
    return {
      on: false,
      reason: "no-model",
      message: "Plotra's AI uses your own account with an AI company, such as Anthropic, OpenAI or OpenRouter. Add your key on the web, in Settings → AI, then come back here.",
    };
  return { on: true, modelSource: state.modelSource };
}
